import { useState, useEffect } from 'react';
import ChatInterface from './components/ChatInterface';
import FavoritesPanel from './components/FavoritesPanel';
import ProfileModal from './components/ProfileModal';
import { sendMessage, sendMessageWithImage } from './services/api';
import { loadProfile, saveProfile, clearProfile, hasProfile, toApiProfile } from './services/profile';
import './index.css';

const FAVORITES_KEY = 'fashion_ai_favorites';

function loadFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveFavorites(favs) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

function App() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [sidebarTab, setSidebarTab] = useState('history'); // 'history' | 'favorites'
  const [favorites, setFavorites] = useState(loadFavorites);
  const [profile, setProfile] = useState(loadProfile);
  const [profileOpen, setProfileOpen] = useState(false);

  const hasMessages = messages.length > 0;

  // Persist favorites to localStorage
  useEffect(() => {
    saveFavorites(favorites);
  }, [favorites]);

  const handleToggleFavorite = (outfit) => {
    setFavorites((prev) => {
      const exists = prev.some((f) => f.savedId === outfit.savedId);
      if (exists) {
        return prev.filter((f) => f.savedId !== outfit.savedId);
      } else {
        return [{ ...outfit, savedAt: Date.now() }, ...prev];
      }
    });
  };

  const handleSaveProfile = (next) => {
    setProfile(next);
    setProfileOpen(false);
    if (!hasProfile(next)) {
      clearProfile();
    } else if (!saveProfile(next)) {
      console.warn('Profile could not be persisted; it will last for this session only');
    }
  };

  const handleRemoveFavorite = (savedId) => {
    setFavorites((prev) => prev.filter((f) => f.savedId !== savedId));
  };

  const handleSendMessage = async (text, imageFile) => {
    const userMsg = {
      role: 'user',
      content: text || (imageFile ? '📸 [Ảnh quần áo]' : ''),
      imagePreview: imageFile ? URL.createObjectURL(imageFile) : null,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // Save to conversation history on first message
    if (messages.length === 0) {
      const convId = Date.now();
      const title = text
        ? (text.length > 40 ? text.slice(0, 40) + '...' : text)
        : '📸 Phối đồ từ ảnh';
      const newConv = { id: convId, title, timestamp: Date.now() };
      setConversations((prev) => [newConv, ...prev]);
      setActiveConv(convId);
    }

    try {
      const history = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      let response;
      if (imageFile) {
        response = await sendMessageWithImage(text, history, imageFile, toApiProfile(profile));
      } else {
        response = await sendMessage(text, history, toApiProfile(profile));
      }

      const assistantMsg = {
        role: 'assistant',
        content: response.message,
        outfits: response.outfits || null,
        size_suggestion: response.size_suggestion || null,
        analyzed_item: response.analyzed_item || null,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      console.error('Error:', error);
      const errorMsg = {
        role: 'assistant',
        content: `⚠️ Xin lỗi, đã xảy ra lỗi: ${error.message}. Vui lòng thử lại!`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setActiveConv(null);
    setSidebarOpen(false);
  };

  const handleViewFavoriteInChat = (outfit) => {
    const assistantMsg = {
      role: 'assistant',
      content: `Đây là outfit yêu thích của bạn: **${outfit.name}** ✨`,
      outfits: [outfit],
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setSidebarOpen(false);
  };

  return (
    <div className="app">
      {/* Mobile Overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Mobile Menu Button */}
      <button
        className="mobile-menu-btn"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        ☰
      </button>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">👗</div>
            <div className="sidebar-logo-text">
              <h1>Fashion AI</h1>
              <p>Phối đồ thông minh</p>
            </div>
          </div>
          <button className="new-chat-btn" onClick={handleNewChat}>
            ＋ Cuộc trò chuyện mới
          </button>
        </div>

        {/* Sidebar Tabs */}
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab ${sidebarTab === 'history' ? 'active' : ''}`}
            onClick={() => setSidebarTab('history')}
          >
            💬 Lịch sử
          </button>
          <button
            className={`sidebar-tab ${sidebarTab === 'favorites' ? 'active' : ''}`}
            onClick={() => setSidebarTab('favorites')}
          >
            ❤️ Yêu thích
            {favorites.length > 0 && (
              <span className="sidebar-tab-badge">{favorites.length}</span>
            )}
          </button>
        </div>

        <div className="sidebar-history">
          {sidebarTab === 'history' ? (
            <>
              {conversations.length > 0 ? (
                <>
                  <div className="sidebar-history-title">Gần đây</div>
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`history-item ${activeConv === conv.id ? 'active' : ''}`}
                      onClick={() => {
                        setActiveConv(conv.id);
                        setSidebarOpen(false);
                      }}
                    >
                      💬 {conv.title}
                    </div>
                  ))}
                </>
              ) : (
                <div className="sidebar-empty">
                  <span>Chưa có lịch sử trò chuyện</span>
                </div>
              )}
            </>
          ) : (
            <FavoritesPanel
              favorites={favorites}
              onRemoveFavorite={handleRemoveFavorite}
              onViewInChat={handleViewFavoriteInChat}
            />
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <ChatInterface
          messages={messages}
          isLoading={isLoading}
          onSendMessage={handleSendMessage}
          favorites={favorites}
          onToggleFavorite={handleToggleFavorite}
          profile={profile}
          onOpenProfile={() => setProfileOpen(true)}
        />
      </main>

      {profileOpen && (
        <ProfileModal
          profile={profile}
          onSave={handleSaveProfile}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
