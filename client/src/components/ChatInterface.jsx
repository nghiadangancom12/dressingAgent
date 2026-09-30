import { useState, useRef, useEffect } from 'react';
import OutfitCard from './OutfitCard';
import WelcomeScreen from './WelcomeScreen';

const PROFILE_MODE_LABELS = {
  full: 'Lookbook mặc thử trên ảnh toàn thân của bạn',
  face: 'Lookbook với gương mặt & số đo của bạn',
};

export default function ChatInterface({ messages, isLoading, onSendMessage, favorites, onToggleFavorite, profile, onOpenProfile }) {
  const [input, setInput] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if ((!trimmed && !imageFile) || isLoading) return;
    onSendMessage(trimmed, imageFile);
    setInput('');
    setImageFile(null);
    setImagePreview(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
    // Reset file input so same file can be re-selected
    e.target.value = '';
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /**
   * Simple markdown-like rendering for AI responses.
   * Handles bold (**text**), line breaks, and basic structure.
   */
  const renderMessageContent = (text) => {
    if (!text) return null;

    const lines = text.split('\n');
    const elements = [];
    let key = 0;

    for (const line of lines) {
      if (line.trim() === '') {
        elements.push(<br key={key++} />);
        continue;
      }

      if (line.trim() === '---' || line.trim() === '***') {
        elements.push(<hr key={key++} />);
        continue;
      }

      // Process inline formatting
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      const formatted = parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return part;
      });

      elements.push(
        <p key={key++} style={{ marginBottom: '4px' }}>
          {formatted}
        </p>
      );
    }

    return elements;
  };

  return (
    <>
      {/* Chat Messages */}
      <div className="chat-area">
        <div className="chat-messages">
          {messages.length === 0 ? (
            <WelcomeScreen
              onSuggestionClick={(text) => onSendMessage(text, null)}
              onUploadClick={() => fileInputRef.current?.click()}
              onProfileClick={onOpenProfile}
            />
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`message ${msg.role}`}>
                <div className="message-avatar">
                  {msg.role === 'assistant' ? '👗' : '👤'}
                </div>
                <div className="message-content">
                  <div className="message-bubble">
                    {/* Show attached image in user messages */}
                    {msg.imagePreview && (
                      <img
                        src={msg.imagePreview}
                        alt="Ảnh đã gửi"
                        className="message-image"
                      />
                    )}
                    {renderMessageContent(msg.content)}
                  </div>

                  {/* Outfit Cards */}
                  {msg.outfits && msg.outfits.length > 0 && (
                    <div className="outfit-cards">
                      {/* Size Suggestion */}
                      {msg.size_suggestion && (
                        <div className="size-badge">
                          <span style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
                            📏 Size gợi ý:
                          </span>
                          {msg.size_suggestion.top && (
                            <div className="size-badge-item">
                              <span className="size-badge-label">Áo</span>
                              <span className="size-badge-value">{msg.size_suggestion.top}</span>
                            </div>
                          )}
                          {msg.size_suggestion.bottom && (
                            <div className="size-badge-item">
                              <span className="size-badge-label">Quần</span>
                              <span className="size-badge-value">{msg.size_suggestion.bottom}</span>
                            </div>
                          )}
                          {msg.size_suggestion.shoe && (
                            <div className="size-badge-item">
                              <span className="size-badge-label">Giày</span>
                              <span className="size-badge-value">{msg.size_suggestion.shoe}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {msg.outfits.map((outfit, j) => {
                        const favId = outfit.savedId || `${i}-${j}`;
                        const isFavorited = favorites?.some(f => f.savedId === favId);
                        return (
                          <OutfitCard
                            key={j}
                            outfit={outfit}
                            index={j}
                            isFavorited={isFavorited}
                            onToggleFavorite={(o) => {
                              const withId = { ...o, savedId: favId };
                              onToggleFavorite?.(withId);
                            }}
                          />
                        );
                      })}
                    </div>
                  )}

                  <div className="message-time">{formatTime(msg.timestamp)}</div>
                </div>
              </div>
            )))}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="message assistant">
              <div className="message-avatar">👗</div>
              <div className="message-content">
                <div className="message-bubble">
                  <div className="loading-indicator">
                    <div className="loading-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <span className="loading-text">
                      Đang tìm kiếm và phối đồ cho bạn...
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="input-area">
        <div className="input-container">
          {/* Active profile */}
          {profile?.mode !== 'none' && profile?.image && (
            <button className="profile-chip" onClick={onOpenProfile} title="Đổi ảnh & số đo">
              <img src={profile.image} alt="" className="profile-chip-thumb" />
              <span>{PROFILE_MODE_LABELS[profile.mode]}</span>
              <span className="profile-chip-edit">Sửa</span>
            </button>
          )}

          {/* Image Preview */}
          {imagePreview && (
            <div className="image-preview-area">
              <img src={imagePreview} alt="Preview" className="image-preview-thumb" />
              <div className="image-preview-info">
                <span>📸 {imageFile?.name}</span>
                <span className="image-preview-hint">AI sẽ phân tích và gợi ý đồ phối thêm</span>
              </div>
              <button className="image-remove-btn" onClick={removeImage} title="Xóa ảnh">✕</button>
            </div>
          )}

          <div className="input-wrapper">
            {/* Image Upload Button */}
            <button
              className="upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              title="Upload ảnh quần áo để AI phối thêm"
            >
              📸
            </button>
            {/* Profile Button */}
            <button
              className={`upload-btn ${profile?.mode !== 'none' && profile?.image ? 'upload-btn-active' : ''}`}
              onClick={onOpenProfile}
              disabled={isLoading}
              title="Ảnh & số đo của tôi — mặc thử lookbook lên chính bạn"
            >
              🧍
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleImageSelect}
            />

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={imageFile ? 'Thêm mô tả (phong cách, ngân sách...)' : 'Mô tả phong cách, ngân sách, số đo của bạn...'}
              rows={1}
              disabled={isLoading}
            />
            <button
              className="send-btn"
              onClick={handleSubmit}
              disabled={(!input.trim() && !imageFile) || isLoading}
              title="Gửi"
            >
              ➤
            </button>
          </div>
          <div className="input-hint">
            Enter để gửi · Shift + Enter để xuống dòng · 📸 upload ảnh quần áo · 🧍 ảnh & số đo của bạn
          </div>
        </div>
      </div>
    </>
  );
}
