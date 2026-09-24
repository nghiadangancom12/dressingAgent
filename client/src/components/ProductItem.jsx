import { useState } from 'react';

export default function ProductItem({ item, onCompare }) {
  const typeLabels = {
    top: '👕 Áo',
    bottom: '👖 Quần',
    shoes: '👟 Giày',
    accessory: '🎒 Phụ kiện',
    dress: '👗 Đầm',
    outerwear: '🧥 Áo khoác',
  };

  // Skirts come back typed as "bottom"; don't label a skirt "Quần"
  const isSkirtOrDress = /váy|đầm/i.test(item.name || '');
  const typeLabel = isSkirtOrDress ? '👗 Váy' : (typeLabels[item.type] || `🏷️ ${item.type}`);
  const isExisting = item.is_existing;

  // Try each suggested product's photo in turn; a dead image link shouldn't leave an empty box
  const thumbnails = isExisting ? [] : (item.products || []).map((p) => p.image).filter(Boolean);
  const [thumbIndex, setThumbIndex] = useState(0);
  const thumbnail = thumbnails[thumbIndex];

  return (
    <div className={`product-item ${isExisting ? 'product-item-existing' : ''}`}>
      {isExisting && (
        <div className="existing-badge">✅ Đồ đang có</div>
      )}

      {thumbnail && (
        <div className="product-item-thumb-wrapper">
          <img
            key={thumbnail}
            src={thumbnail}
            alt={item.name}
            className="product-item-thumb"
            onError={() => setThumbIndex((i) => i + 1)}
          />
        </div>
      )}

      <div className="product-item-type">{typeLabel}</div>
      <div className="product-item-name">{item.name}</div>
      <div className="product-item-desc">{item.description}</div>

      {!isExisting && (
        <div className="product-item-price">
          ~{item.budget_range} VND
        </div>
      )}

      {/* Product links or search fallback */}
      {!isExisting && (
        <div className="product-links-area">
          {item.products && item.products.length > 0 ? (
            <>
              <div className="product-links">
                {item.products.map((product, i) => {
                  const platformClass = product.source?.toLowerCase() || '';
                  return (
                    <a
                      key={i}
                      href={product.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`product-link ${platformClass}`}
                      title={product.overBudget ? `${product.name} — vượt tầm giá` : product.name}
                    >
                      {product.icon || '🔗'} {product.source}
                      {product.isSpecific && <span className="link-specific">↗</span>}
                    </a>
                  );
                })}
              </div>

              {/* Compare price button */}
              <button
                className="compare-price-btn"
                onClick={() => onCompare?.()}
                title="So sánh giá giữa các sàn"
              >
                💹 So sánh giá
              </button>
            </>
          ) : (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
              Tìm trên Shopee/Lazada: "{item.search_query_vi || item.search_query}"
            </span>
          )}
        </div>
      )}
    </div>
  );
}
