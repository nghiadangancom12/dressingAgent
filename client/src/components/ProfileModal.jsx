import { useState, useRef } from 'react';
import { EMPTY_PROFILE, resizeImageToDataUrl } from '../services/profile';

const MODES = [
  {
    id: 'none',
    icon: '👕',
    title: 'Không dùng ảnh',
    desc: 'AI dùng người mẫu, vẫn theo số đo nếu bạn nhập',
  },
  {
    id: 'full',
    icon: '🧍',
    title: 'Ảnh toàn thân',
    desc: 'Giống bạn nhất: giữ mặt, dáng và tỉ lệ cơ thể',
  },
  {
    id: 'face',
    icon: '🙂',
    title: 'Ảnh gương mặt + số đo',
    desc: 'Lấy mặt từ ảnh, dựng dáng người theo chiều cao và cân nặng',
  },
];

const PHOTO_TIPS = {
  full: 'Ảnh đứng thẳng, thấy rõ từ đầu đến chân, đủ sáng, mặc đồ gọn gàng.',
  face: 'Ảnh chính diện, rõ mặt, không đeo kính râm hay khẩu trang.',
};

export default function ProfileModal({ profile, onSave, onClose }) {
  const [draft, setDraft] = useState({ ...EMPTY_PROFILE, ...profile });
  const [photoError, setPhotoError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef(null);

  const update = (patch) => setDraft((prev) => ({ ...prev, ...patch }));

  const needsPhoto = draft.mode !== 'none';
  const needsMeasurements = draft.mode === 'face';
  const missingPhoto = needsPhoto && !draft.image;
  const missingMeasurements = needsMeasurements && (!draft.height || !draft.weight);
  const canSave = !missingPhoto && !missingMeasurements && !isProcessing;

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setPhotoError('Vui lòng chọn file ảnh.');
      return;
    }
    setPhotoError('');
    setIsProcessing(true);
    try {
      update({ image: await resizeImageToDataUrl(file) });
    } catch (err) {
      setPhotoError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      ...draft,
      // Keep the photo only while a photo mode is selected
      image: draft.mode === 'none' ? null : draft.image,
    });
  };

  return (
    <div className="profile-modal-overlay" onClick={onClose}>
      <div className="profile-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Ảnh và số đo của tôi">
        <div className="profile-modal-header">
          <h3>🧍 Ảnh & số đo của tôi</h3>
          <button className="profile-modal-close" onClick={onClose} title="Đóng">✕</button>
        </div>

        <p className="profile-modal-intro">
          Chọn cách AI tạo ảnh lookbook: mặc thử đồ lên chính bạn hoặc dùng người mẫu.
        </p>

        <div className="profile-mode-list">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={`profile-mode ${draft.mode === m.id ? 'active' : ''}`}
              onClick={() => update({ mode: m.id })}
            >
              <span className="profile-mode-icon">{m.icon}</span>
              <span className="profile-mode-text">
                <strong>{m.title}</strong>
                <span>{m.desc}</span>
              </span>
            </button>
          ))}
        </div>

        {needsPhoto && (
          <div className="profile-photo-section">
            {draft.image ? (
              <div className="profile-photo-preview">
                <img src={draft.image} alt="Ảnh của bạn" />
                <div className="profile-photo-actions">
                  <button className="profile-btn-secondary" onClick={() => fileInputRef.current?.click()}>
                    Đổi ảnh
                  </button>
                  <button className="profile-btn-secondary" onClick={() => update({ image: null })}>
                    Xóa ảnh
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="profile-photo-drop"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
              >
                {isProcessing ? 'Đang xử lý ảnh...' : `📷 Chọn ${draft.mode === 'full' ? 'ảnh toàn thân' : 'ảnh gương mặt'}`}
              </button>
            )}
            <div className="profile-hint">💡 {PHOTO_TIPS[draft.mode]}</div>
            {photoError && <div className="profile-error">{photoError}</div>}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={handlePhotoSelect}
            />
          </div>
        )}

        <div className="profile-fields">
          <label className="profile-field">
            <span>Giới tính</span>
            <select value={draft.gender} onChange={(e) => update({ gender: e.target.value })}>
              <option value="">Không chọn</option>
              <option value="male">Nam</option>
              <option value="female">Nữ</option>
            </select>
          </label>
          <label className="profile-field">
            <span>Chiều cao (cm){needsMeasurements && ' *'}</span>
            <input
              type="number"
              inputMode="numeric"
              min="100"
              max="230"
              placeholder="VD: 170"
              value={draft.height}
              onChange={(e) => update({ height: e.target.value })}
            />
          </label>
          <label className="profile-field">
            <span>Cân nặng (kg){needsMeasurements && ' *'}</span>
            <input
              type="number"
              inputMode="numeric"
              min="30"
              max="250"
              placeholder="VD: 65"
              value={draft.weight}
              onChange={(e) => update({ weight: e.target.value })}
            />
          </label>
        </div>

        <div className="profile-privacy">
          🔒 Ảnh chỉ lưu trên trình duyệt này. Khi phối đồ, ảnh được gửi tới dịch vụ AI của Alibaba (DashScope) để tạo lookbook.
        </div>

        <div className="profile-modal-footer">
          <button
            className="profile-btn-secondary"
            onClick={() => onSave({ ...EMPTY_PROFILE })}
          >
            Xóa hồ sơ
          </button>
          <button className="profile-btn-primary" onClick={handleSave} disabled={!canSave}>
            {missingPhoto ? 'Hãy chọn ảnh' : missingMeasurements ? 'Nhập chiều cao & cân nặng' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}
