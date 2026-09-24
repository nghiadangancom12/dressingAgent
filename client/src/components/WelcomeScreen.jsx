export default function WelcomeScreen({ onSuggestionClick, onUploadClick, onProfileClick }) {
  const suggestions = [
    {
      emoji: '📸',
      text: 'Upload ảnh quần áo đang có để AI gợi ý đồ phối thêm',
      isUpload: true,
    },
    {
      emoji: '🧍',
      text: 'Thêm ảnh của bạn để AI mặc thử lookbook lên chính bạn',
      isProfile: true,
    },
    {
      emoji: '🇯🇵',
      text: 'Tôi có 500k, muốn phối đồ kiểu Nhật Bản, cao 1m8 nặng 70kg',
    },
    {
      emoji: '🇰🇷',
      text: 'Gợi ý outfit Hàn Quốc cho nữ, ngân sách 800k, đi hẹn hò',
    },
    {
      emoji: '👔',
      text: 'Set đồ công sở cho nam, cao 1m75, 65kg, budget 1 triệu',
    },
    {
      emoji: '🏖️',
      text: 'Đồ đi biển mùa hè, phong cách thoải mái, dưới 600k',
    },
  ];

  return (
    <div className="welcome-screen">
      <div className="welcome-icon">👗</div>
      <h2 className="welcome-title">Fashion AI Agent</h2>
      <p className="welcome-subtitle">
        Xin chào! Tôi là trợ lý thời trang AI. Hãy cho tôi biết ngân sách,
        phong cách yêu thích, và số đo của bạn — hoặc tải lên ảnh trang phục có sẵn để phối thêm! ✨
      </p>
      <div className="suggestion-grid">
        {suggestions.map((s, i) => (
          <button
            key={i}
            className={`suggestion-chip ${s.isUpload || s.isProfile ? 'suggestion-chip-upload' : ''}`}
            onClick={() => {
              if (s.isUpload && onUploadClick) {
                onUploadClick();
              } else if (s.isProfile && onProfileClick) {
                onProfileClick();
              } else {
                onSuggestionClick(s.text);
              }
            }}
          >
            <span className="chip-emoji">{s.emoji}</span>
            {s.text}
          </button>
        ))}
      </div>
    </div>
  );
}
