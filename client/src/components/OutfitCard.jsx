import { useState } from 'react';
import ProductItem from './ProductItem';
import PriceCompareModal from './PriceCompareModal';

export default function OutfitCard({ outfit, index, isFavorited, onToggleFavorite }) {
  const [compareItem, setCompareItem] = useState(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);

  const totalFormatted = outfit.total_estimated
    ? Number(outfit.total_estimated).toLocaleString('vi-VN')
    : '—';

  const handleFavorite = () => {
    onToggleFavorite?.(outfit);
  };

  const generatedImage = outfit.generatedImage || null;

  return (
    <>
      <div className="outfit-card">
        {/* Generated Outfit Image */}
        {generatedImage && (
          <div className="outfit-generated-image">
            <div
              className={`outfit-image-container ${imageLoaded ? 'loaded' : ''}`}
              onClick={() => setShowFullImage(true)}
            >
              {!imageLoaded && !imageError && (
                <div className="outfit-image-skeleton">
                  <div className="skeleton-shimmer" />
                  <span>🎨 Đang tải ảnh phối đồ...</span>
                </div>
              )}
              {imageError ? (
                <div className="outfit-image-error">
                  <span>⚠️ Không thể tải ảnh</span>
                </div>
              ) : (
                <img
                  src={generatedImage}
                  alt={`Outfit: ${outfit.name}`}
                  className="outfit-generated-img"
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageError(true)}
                  style={{ display: imageLoaded ? 'block' : 'none' }}
                />
              )}
              {imageLoaded && (
                <div className="outfit-image-badge" title="Ảnh AI tạo từ ảnh thật của các món đồ trong set">
                  {outfit.usedPerson ? '🧍 Mặc thử trên ảnh của bạn' : '🎨 AI Lookbook'}
                </div>
              )}
            </div>
            <div className="outfit-image-caption-sub">
              💡 {outfit.usedReferences > 0
                ? 'Ảnh AI tạo từ ảnh thật của các sản phẩm trong set — chi tiết nhỏ có thể khác bản gốc'
                : 'Ảnh AI mô phỏng cách phối dựa trên màu & kiểu dáng các món đồ trong set'}
            </div>
          </div>
        )}

        {/* Generating indicator (when image is being generated) */}
        {!generatedImage && outfit.imageError && (
          <div className="outfit-image-note">
            <span>💡 Ảnh phối đồ: {outfit.imageError}</span>
          </div>
        )}

        {/* Header */}
        <div className="outfit-card-header">
          <div style={{ flex: 1 }}>
            <div className="outfit-card-title">
              ✨ Outfit {index + 1}: {outfit.name}
            </div>
            <div className="outfit-card-desc">{outfit.description}</div>
            <div className="outfit-tags">
              {outfit.style_tags?.map((tag, i) => (
                <span key={i} className="outfit-tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="outfit-card-actions">
            <div className="outfit-card-price">
              💰 {totalFormatted}₫
            </div>
            {/* Favorite button */}
            <button
              className={`favorite-btn ${isFavorited ? 'favorited' : ''}`}
              onClick={handleFavorite}
              title={isFavorited ? 'Xóa khỏi yêu thích' : 'Lưu yêu thích'}
            >
              {isFavorited ? '❤️' : '🤍'}
            </button>
          </div>
        </div>

        {/* Body - Items Grid */}
        <div className="outfit-card-body">
          <div className="outfit-items-grid">
            {outfit.items?.map((item, i) => (
              <ProductItem
                key={i}
                item={item}
                onCompare={() => setCompareItem(item)}
              />
            ))}
          </div>
        </div>

        {/* Footer - Styling Tips */}
        {outfit.styling_tips && (
          <div className="outfit-card-footer">
            <span className="tip-icon">💡</span>
            <span>{outfit.styling_tips}</span>
          </div>
        )}
      </div>

      {/* Price Compare Modal */}
      {compareItem && (
        <PriceCompareModal
          item={compareItem}
          onClose={() => setCompareItem(null)}
        />
      )}

      {/* Full Image Modal */}
      {showFullImage && generatedImage && (
        <div className="image-modal-overlay" onClick={() => setShowFullImage(false)}>
          <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="image-modal-close" onClick={() => setShowFullImage(false)}>✕</button>
            <img src={generatedImage} alt={`Outfit: ${outfit.name}`} className="image-modal-img" />
            <div className="image-modal-caption">
              🎨 {outfit.name} — AI Generated Outfit Preview
            </div>
          </div>
        </div>
      )}
    </>
  );
}
