import { useEffect } from 'react';

const PLATFORM_COLORS = {
  Shopee: '#EE4D2D',
  Lazada: '#0F146D',
  Tiki: '#1A94FF',
  Coolmate: '#0052CC',
  Routine: '#111827',
  Yody: '#f59e0b',
  'Đông Hải': '#854d0e',
};

export default function PriceCompareModal({ item, onClose }) {
  // Close on Escape key
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  if (!item) return null;

  const products = item.products || [];

  // Find cheapest by priceValue
  const minPrice = Math.min(
    ...products.map((p) => p.priceValue ?? Infinity)
  );
  const hasPriceData = products.some((p) => p.priceValue != null);
  const allOverBudget = products.length > 0 && products.every((p) => p.overBudget);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <div className="modal-title">💹 So sánh giá & Nơi mua</div>
            <div className="modal-subtitle">{item.name}</div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Budget range */}
        <div className="modal-budget">
          <span>💰 Tầm giá AI gợi ý:</span>
          <strong> ~{item.budget_range} VND</strong>
        </div>

        {allOverBudget && (
          <div className="modal-over-budget">
            ⚠️ Chưa tìm thấy sản phẩm phù hợp trong tầm giá này — đây là các lựa chọn rẻ nhất hiện có.
          </div>
        )}

        {/* Platform table */}
        <div className="compare-table">
          {products.map((product, i) => {
            const isCheapest = hasPriceData && product.priceValue === minPrice && minPrice !== Infinity;
            const platformColor = product.color || PLATFORM_COLORS[product.source] || '#7c3aed';
            return (
              <div key={i} className={`compare-row ${isCheapest ? 'cheapest' : ''}`}>
                {/* Platform badge */}
                <div className="compare-platform">
                  <span className="compare-platform-icon">{product.icon || '🛍️'}</span>
                  <span className="compare-platform-name">{product.source}</span>
                  {isCheapest && <span className="cheapest-badge">🏷️ Rẻ nhất</span>}
                  {product.overBudget && <span className="over-budget-badge">⚠️ Vượt tầm giá</span>}
                </div>

                {/* Thumbnail */}
                {product.image && (
                  <img src={product.image} alt={product.name} className="compare-thumb" />
                )}

                {/* Product info */}
                <div className="compare-info">
                  <div className="compare-product-name">{product.name}</div>
                  <div className="compare-price" style={{ color: isCheapest ? '#10b981' : 'var(--accent-secondary)' }}>
                    {product.price !== 'Xem trên sàn' ? product.price : '—'}
                  </div>
                </div>

                {/* Buy button */}
                <a
                  href={product.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="compare-buy-btn"
                  style={{ background: platformColor }}
                >
                  Mua ngay →
                </a>
              </div>
            );
          })}

          {products.length === 0 && (
            <div className="compare-empty">Không có dữ liệu giá cho sản phẩm này.</div>
          )}
        </div>

        <div className="modal-note">
          💡 Tất cả link đều dẫn trực tiếp đến sản phẩm cụ thể để đặt mua (không dẫn đến trang tìm kiếm).
        </div>
      </div>
    </div>
  );
}
