import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { handleChat, handleChatWithImage } from './services/aiAgent.js';
import { runAllScrapers } from './services/scraper.js';
import { loadProducts, reloadProducts, getStats } from './services/productDB.js';
import { generateOutfitImage } from './services/imageGenerator.js';
import { searchByRules } from './services/ruleEngine.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Multer: store uploads in memory (buffer), max 10MB
const upload = multer({
  storage: multer.memoryStorage(),
  // fieldSize: the user's profile photo travels as a data URL in a text field
  limits: { fileSize: 10 * 1024 * 1024, fieldSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file ảnh (jpeg, png, webp, gif)'));
    }
  },
});

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  methods: ['GET', 'POST'],
  credentials: true
}));
app.use(express.json({ limit: '8mb' }));

const PROFILE_IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_PROFILE_IMAGE_CHARS = 6 * 1024 * 1024;

/**
 * Validate the optional user profile sent with a chat request.
 * Returns null when there is nothing usable, so callers can treat "no profile" uniformly.
 * @returns {{mode: 'none'|'full'|'face', image: string|null, height: number|null, weight: number|null, gender: string|null}|null}
 */
function sanitizeProfile(raw) {
  let profile = raw;
  if (typeof profile === 'string') {
    try { profile = JSON.parse(profile); } catch { return null; }
  }
  if (!profile || typeof profile !== 'object') return null;

  const inRange = (value, min, max) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null;
  };
  const image = typeof profile.image === 'string'
    && profile.image.length <= MAX_PROFILE_IMAGE_CHARS
    && PROFILE_IMAGE_RE.test(profile.image)
    ? profile.image
    : null;
  let mode = ['none', 'full', 'face'].includes(profile.mode) ? profile.mode : 'none';
  if (mode !== 'none' && !image) mode = 'none';

  const result = {
    mode,
    image: mode === 'none' ? null : image,
    height: inRange(profile.height, 100, 230),
    weight: inRange(profile.weight, 30, 250),
    gender: ['male', 'female'].includes(profile.gender) ? profile.gender : null,
  };
  return result.image || result.height || result.weight || result.gender ? result : null;
}

// ──────────────────────────────────────────────
// Startup: Load product database
// ──────────────────────────────────────────────

console.log('📦 Loading product database...');
loadProducts();

// ──────────────────────────────────────────────
// API Routes
// ──────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => {
  const stats = getStats();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    features: {
      serper: !!process.env.SERPER_API_KEY,
      vision: true,
      imageGeneration: !!process.env.DASHSCOPE_API_KEY,
      scrapedProducts: stats.totalProducts,
    },
    productStats: stats,
  });
});

// Chat endpoint (text only)
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history } = req.body;
    const profile = sanitizeProfile(req.body.profile);

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const result = await handleChat(message, history || [], profile);
    res.json(result);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Đã xảy ra lỗi khi xử lý yêu cầu',
      details: error.message
    });
  }
});

// Upload + chat endpoint (image + optional text)
app.post('/api/chat/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    const message = req.body.message || '';
    const history = JSON.parse(req.body.history || '[]');
    const profile = sanitizeProfile(req.body.profile);

    // Convert buffer to base64
    const imageBase64 = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    const result = await handleChatWithImage(message, history, imageBase64, mimeType, profile);
    res.json(result);
  } catch (error) {
    console.error('Image chat error:', error);
    res.status(500).json({
      error: 'Đã xảy ra lỗi khi phân tích ảnh',
      details: error.message
    });
  }
});

// ──────────────────────────────────────────────
// NEW: Product & Scraper Routes
// ──────────────────────────────────────────────

// Get product database stats
app.get('/api/products/stats', (req, res) => {
  const stats = getStats();
  res.json(stats);
});

// Search products using rule-based engine
app.get('/api/products/search', (req, res) => {
  try {
    const query = req.query.q || '';
    const limit = parseInt(req.query.limit) || 10;
    const gender = req.query.gender || null;
    const maxPrice = req.query.maxPrice ? parseInt(req.query.maxPrice) : null;
    const style = req.query.style || null;

    const results = searchByRules(query, {
      limit,
      gender,
      maxPrice,
      style,
    });

    res.json({
      query,
      total: results.length,
      products: results,
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Trigger manual scrape (dev/admin only)
app.post('/api/scrape', async (req, res) => {
  try {
    const force = req.body.force === true;
    console.log(`\n🔄 Manual scrape triggered (force: ${force})`);

    const results = await runAllScrapers(force);

    // Reload product database after scraping
    reloadProducts();

    res.json({
      success: true,
      results,
      stats: getStats(),
    });
  } catch (error) {
    console.error('Scrape error:', error);
    res.status(500).json({
      error: 'Đã xảy ra lỗi khi scrape',
      details: error.message,
    });
  }
});

// ──────────────────────────────────────────────
// NEW: Image Generation Route
// ──────────────────────────────────────────────

// Generate outfit image
app.post('/api/outfit/generate-image', async (req, res) => {
  try {
    const { outfit, gender } = req.body;

    if (!outfit) {
      return res.status(400).json({ error: 'Outfit data is required' });
    }

    const result = await generateOutfitImage(outfit, gender || 'male');
    res.json(result);
  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500).json({
      error: 'Đã xảy ra lỗi khi tạo ảnh',
      details: error.message,
    });
  }
});

// ──────────────────────────────────────────────
// Auto-scrape schedule (every 3 days)
// ──────────────────────────────────────────────

const SCRAPE_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

function scheduleAutoScrape() {
  setInterval(async () => {
    console.log('\n⏰ Auto-scrape triggered (every 3 days)');
    try {
      await runAllScrapers(false); // Only scrape if data is stale
      reloadProducts();
    } catch (err) {
      console.error('Auto-scrape error:', err.message);
    }
  }, SCRAPE_INTERVAL_MS);
}

// ──────────────────────────────────────────────
// Start server
// ──────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`🚀 Fashion AI Server running on http://localhost:${PORT}`);
  console.log(`🔑 Serper API: ${process.env.SERPER_API_KEY ? '✅ enabled' : '❌ not configured (using search links)'}`);
  console.log(`🎨 Image Gen: ${process.env.DASHSCOPE_API_KEY ? '✅ enabled (wan2.7-image)' : '❌ not configured'}`);
  console.log(`📊 Products in DB: ${getStats().totalProducts}`);

  // Start auto-scrape schedule
  scheduleAutoScrape();
});
