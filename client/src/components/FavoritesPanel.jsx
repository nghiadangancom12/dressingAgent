import { useState } from 'react';
import PriceCompareModal from './PriceCompareModal';

export default function FavoritesPanel({ favorites, onRemoveFavorite, onViewInChat }) {
  const [expandedId, setExpandedId] = useState(null);
  const [compareItem, setCompareItem] = useState(null);

  if (favorites.length === 0) {
    return (
      <div className="favorites-empty">
        <div className="favorites-empty-icon">🤍</div>
        <p>Chưa có outfit yêu thích</p>
        <span>Nhấn ❤️ trên outfit để lưu lại</span>
      </div>
    );
  }

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <>
      <div className="favorites-list">
        {favorites.map((outfit, i) => {
          const id = outfit.savedId || i;
          const isExpanded = expandedId === id;

          return (
            <div key={id} className={`favorite-card ${isExpanded ? 'expanded' : ''}`}>
              <div className="favorite-item" onClick={() => toggleExpand(id)}>
                <div className="favorite-item-info">
                  <div className="favorite-item-name">✨ {outfit.name}</div>
                  <div className="favorite-item-meta">
                    {outfit.style_tags?.slice(0, 2).map((tag, j) => (
                      <span key={j} className="favorite-tag">{tag}</span>
                    ))}
                  </div>
                  <div className="favorite-item-price">
                    💰 {outfit.total_estimated
                      ? Number(outfit.total_estimated).toLocaleString('vi-VN') + '₫'
                      : '—'}
                  </div>
                </div>

                <div className="favorite-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="favorite-expand-btn"
                    onClick={() => toggleExpand(id)}
                    title={isExpanded ? 'Thu gọn' : 'Xem chi tiết'}
                  >
                    {isExpanded ? '▲' : '▼'}
                  </button>
                  <button
                    className="favorite-remove-btn"
                    onClick={() => onRemoveFavorite(outfit.savedId)}
                    title="Xóa khỏi yêu thích"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="favorite-expanded-content">
                  <div className="favorite-items-list">
                    {outfit.items?.map((item, idx) => (
                      <div key={idx} className="favorite-subitem">
                        <div className="favorite-subitem-header">
                          <span className="favorite-subitem-name">
                            {item.is_existing ? '✅ ' : '• '}{item.name}
                          </span>
                          {!item.is_existing && item.budget_range && (
                            <span className="favorite-subitem-price">~{item.budget_range}₫</span>
                          )}
                        </div>

                        {!item.is_existing && item.products && item.products.length > 0 && (
                          <div className="favorite-subitem-links">
                            {item.products.map((p, pIdx) => (
                              <a
                                key={pIdx}
                                href={p.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="favorite-product-link"
                                title={p.name}
                              >
                                {p.icon} {p.source} {p.isSpecific && '↗'}
                              </a>
                            ))}
                            <button
                              className="favorite-compare-btn"
                              onClick={() => setCompareItem(item)}
                              title="So sánh giá"
                            >
                              💹 Giá
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {onViewInChat && (
                    <button
                      className="favorite-open-chat-btn"
                      onClick={() => onViewInChat(outfit)}
                    >
                      💬 Xem lại trong chat
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {compareItem && (
        <PriceCompareModal
          item={compareItem}
          onClose={() => setCompareItem(null)}
        />
      )}
    </>
  );
}
