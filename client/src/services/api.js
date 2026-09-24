// Empty string (Docker build) = same origin, proxied by nginx; unset (npm run dev) = local server
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

/**
 * Send a chat message to the Fashion AI Agent
 * @param {string} message - User's message
 * @param {Array} history - Conversation history
 * @param {Object|null} [profile] - user profile from toApiProfile (photo, height, weight, gender)
 * @returns {Promise<Object>} Agent response with outfits
 */
export async function sendMessage(message, history = [], profile = null) {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      history: history.map(h => ({
        role: h.role,
        content: h.content,
      })),
      profile,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Server error: ${response.status}`);
  }

  return response.json();
}

/**
 * Send a chat message with an image attachment
 * @param {string} message - User's message
 * @param {Array} history - Conversation history
 * @param {File} imageFile - Image file to upload
 * @param {Object|null} [profile] - user profile from toApiProfile (photo, height, weight, gender)
 * @returns {Promise<Object>} Agent response with outfits
 */
export async function sendMessageWithImage(message, history = [], imageFile, profile = null) {
  const formData = new FormData();
  formData.append('image', imageFile);
  formData.append('message', message || '');
  formData.append('history', JSON.stringify(
    history.map(h => ({ role: h.role, content: h.content }))
  ));
  if (profile) {
    formData.append('profile', JSON.stringify(profile));
  }

  const response = await fetch(`${API_BASE}/api/chat/image`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Server error: ${response.status}`);
  }

  return response.json();
}

/**
 * Check if the backend server is healthy
 */
export async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}
