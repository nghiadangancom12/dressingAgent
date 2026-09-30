import { Router } from 'express';
import multer from 'multer';
import { handleChat, handleChatWithImage } from '../agent/core.js';
import { runAllScrapers } from '../agent/tools/scraper.js';
import { loadProducts, reloadProducts, getStats } from '../db/productDB.js';
import { generateOutfitImage } from '../agent/tools/imageGen.js';
import { searchByRules } from '../agent/tools/catalogSearch.js';

const router = Router();

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
// Health check
// ──────────────────────────────────────────────

router.get('/health', (req, res) => {
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

// ──────────────────────────────────────────────
// Chat endpoints
// ──────────────────────────────────────────────

// Chat endpoint (text only)
router.post('/chat', async (req, res) => {
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
router.post('/chat/image', upload.single('image'), async (req, res) => {
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
      details: error.message,
    });
  }
});

// ──────────────────────────────────────────────
// Product & Scraper Routes
// ──────────────────────────────────────────────

// Get product database stats
router.get('/products/stats', (req, res) => {
  const stats = getStats();
  res.json(stats);
});

// Search products using rule-based engine
router.get('/products/search', (req, res) => {
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
router.post('/scrape', async (req, res) => {
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
// Image Generation Route
// ──────────────────────────────────────────────

// Generate outfit image
router.post('/outfit/generate-image', async (req, res) => {
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
// Marketplace Broker Route (Setup Client Protocol)
// ──────────────────────────────────────────────

// Session initialization endpoint (/api/marketplace/phien)
router.post('/marketplace/phien', (req, res) => {
  const token = req.body?.token || 'session-token';
  console.log(`[Marketplace] Client connected with token: ${token.slice(0, 15)}...`);

  res.json({
    maChuThe: "3f9a2c0011223344556677889900aabb",
    agentId: "sphinx/fashion-search-agent",
    version: "1.0.0",
    hetHan: Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days
    ten: "Fashion AI - Trợ Lý Phối Đồ Thông Minh",
    avatarUrl: "",
    gioiThieu: "Chào bạn! Mình là Fashion AI, trợ lý tư vấn phong cách thời trang và phối đồ thông minh.",
    hasAppLayout: false,
    appLayout: null
  });
});

// Chat message endpoint (/api/marketplace/tin)
router.post('/marketplace/tin', async (req, res) => {
  try {
    const { loi, message: msgFromBody } = req.body;
    const userMessage = (loi || msgFromBody || '').trim();

    if (!userMessage) {
      return res.status(400).json({ error: 'Nội dung tin nhắn không được để trống' });
    }

    console.log(`[Marketplace] User message: ${userMessage}`);
    const result = await handleChat(userMessage, [], null);
    const replyText = result?.message || result?.reply || 'Fashion AI đã xử lý xong yêu cầu của bạn.';

    const khoi = [
      {
        loai: 'markdown',
        noi_dung: replyText
      }
    ];

    // Trích xuất hình ảnh lookbook sinh bởi AI và sản phẩm thật kèm link mua
    if (Array.isArray(result?.outfits)) {
      for (const [idx, outfit] of result.outfits.entries()) {
        const outfitTitle = outfit.title || outfit.name || `Set đồ gợi ý #${idx + 1}`;

        // 1. Khối ảnh minh họa lookbook toàn bộ trang phục
        if (outfit.generatedImage) {
          khoi.push({
            loai: 'image',
            url: outfit.generatedImage,
            mo_ta: `📸 Minh họa Lookbook AI: ${outfitTitle}`
          });
        }

        // 2. Chi tiết từng món đồ kèm link và bảng mua sắm trực tiếp
        if (Array.isArray(outfit.items) && outfit.items.length > 0) {
          let itemDetails = `### 👗 Danh sách sản phẩm & Link đặt mua — ${outfitTitle}\n\n`;
          itemDetails += `| Món đồ | Tên sản phẩm đề xuất | Giá | Mua hàng |\n`;
          itemDetails += `| :--- | :--- | :--- | :--- |\n`;

          const productLinkBlocks = [];
          const secondaryImages = [];

          for (const it of outfit.items) {
            const productList = it.products || it.matched_products || [];
            const prod = productList[0] || null;
            const itemName = it.name || it.type || 'Món đồ';
            const price = prod?.price || (it.budget_range ? `~${it.budget_range} ₫` : 'Đang cập nhật');
            const brand = prod?.brand ? ` (${prod.brand})` : '';
            const prodName = prod?.name ? `${prod.name}${brand}` : itemName;
            const targetUrl = prod?.url || `https://shopee.vn/search?keyword=${encodeURIComponent(itemName)}`;
            const actionText = prod?.url ? `🛒 **MUA NGAY**` : `🔍 **Tìm mua**`;

            // Thêm vào bảng Markdown
            itemDetails += `| **${itemName}** | [${prodName}](${targetUrl}) | **${price}** | [${actionText}](${targetUrl}) |\n`;

            // Thêm nút Link chuẩn cho Player Client
            productLinkBlocks.push({
              loai: 'link',
              url: targetUrl,
              nhan: `🛒 [${prod?.brand || 'Mua ngay'}] ${itemName}: ${prod?.name || itemName} (${price})`
            });

            // Gom ảnh sản phẩm thật
            if (prod?.image && !prod.image.includes('placeholder')) {
              secondaryImages.push({
                loai: 'image',
                url: prod.image,
                mo_ta: `🛍️ ${itemName}: ${prod.name || ''} (${price})`
              });
            }
          }

          // Đưa Bảng sản phẩm & link lên NGAY DƯỚI ảnh Lookbook
          khoi.push({
            loai: 'markdown',
            noi_dung: itemDetails
          });

          // Đưa các nút Link bấm nhanh trực tiếp
          for (const linkBlock of productLinkBlocks) {
            khoi.push(linkBlock);
          }

          // Cuối cùng đưa ảnh sản phẩm thật (nếu có)
          for (const imgBlock of secondaryImages) {
            khoi.push(imgBlock);
          }
        }
      }
    }

    // 3. Khối gợi ý kích cỡ nếu có
    if (result?.size_suggestion) {
      const sz = result.size_suggestion;
      const sizeText = typeof sz === 'object'
        ? `Áo: **${sz.top || 'M'}** | Quần: **${sz.bottom || 'L'}** | Giày: **${sz.shoe || '40'}**`
        : sz;
      khoi.push({
        loai: 'markdown',
        noi_dung: `> 📏 **Gợi ý chọn size phù hợp:** ${sizeText}`
      });
    }

    res.json({ khoi });
  } catch (error) {
    console.error('[Marketplace] Error processing turn:', error);
    res.status(500).json({
      khoi: [
        {
          loai: 'markdown',
          noi_dung: `Đã xảy ra lỗi khi xử lý: ${error.message}`
        }
      ]
    });
  }
});

export { loadProducts, reloadProducts, getStats };
export default router;
