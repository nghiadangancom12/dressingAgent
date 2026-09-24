import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { DASHSCOPE_API_KEY } from '../../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// src/agent/tools/ → up 3 levels to server root → data/generated
const CACHE_DIR = path.join(__dirname, '..', '..', '..', 'data', 'generated');

// DashScope International multimodal generation endpoint (supports wan2.7-image and qwen-image-2.0)
const DASHSCOPE_MULTIMODAL_URL = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

// Default model: wan2.7-image, fallback: qwen-image-2.0
const PRIMARY_MODEL = 'wan2.7-image';
const FALLBACK_MODEL = 'qwen-image-2.0';

// wan2.7-image accepts up to 9 reference images per request
const MAX_REFERENCE_IMAGES = 9;
// Multi-image composition is slow; give it room before aborting
const GENERATION_TIMEOUT_MS = 120000;

// ──────────────────────────────────────────────
// Cache management
// ──────────────────────────────────────────────

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function md5(value) {
  return crypto.createHash('md5').update(value).digest('hex');
}

/**
 * Cache key covers the prompt AND the reference images, so the same prompt
 * with different products (or a different uploaded photo) is not a cache hit
 */
function getCacheKey(prompt, references = []) {
  const refsKey = references
    .map(ref => ref.sourceUrl || (ref.image.startsWith('data:') ? md5(ref.image) : ref.image))
    .join('|');
  return md5(`${prompt}::${refsKey}`);
}

function getCachedImage(cacheKey) {
  ensureCacheDir();
  const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`);
  try {
    if (fs.existsSync(cacheFile)) {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      // DashScope URLs expire in ~24h, cache for 20h
      const cacheAge = Date.now() - new Date(data.createdAt).getTime();
      if (cacheAge < 20 * 60 * 60 * 1000) {
        return data;
      }
    }
  } catch { /* ignore */ }
  return null;
}

function saveCachedImage(cacheKey, prompt, imageUrl, usedReferences) {
  ensureCacheDir();
  const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`);
  const data = {
    prompt,
    imageUrl,
    usedReferences,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2), 'utf-8');
  return data;
}

// ──────────────────────────────────────────────
// Reference images
// ──────────────────────────────────────────────

/**
 * Describe the user's build from height/weight so the model can draw a matching body
 * @param {Object} [person] - { height (cm), weight (kg), gender }
 * @returns {string} e.g. "cao 170 cm, nặng 65 kg — chiều cao trung bình, vóc dáng cân đối"
 */
export function describeBody(person) {
  const height = Number(person?.height) || null;
  const weight = Number(person?.weight) || null;
  if (!height && !weight) return '';

  const parts = [];
  if (height) {
    const [short, tall] = person?.gender === 'female' ? [152, 165] : [163, 177];
    parts.push(height < short ? 'dáng người thấp' : height > tall ? 'dáng người cao' : 'chiều cao trung bình');
  }
  if (height && weight) {
    const bmi = weight / ((height / 100) ** 2);
    parts.push(
      bmi < 18.5 ? 'vóc dáng gầy, mảnh khảnh'
        : bmi < 23 ? 'vóc dáng cân đối'
          : bmi < 25 ? 'vóc dáng hơi đầy đặn'
            : bmi < 30 ? 'vóc dáng đầy đặn, bụng hơi to'
              : 'vóc dáng to, mập'
    );
  }

  const numbers = [height && `cao ${height} cm`, weight && `nặng ${weight} kg`].filter(Boolean).join(', ');
  return `${numbers} — ${parts.join(', ')}`;
}

const IMAGE_FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  // No avif: CDNs (Uniqlo, Coolmate) then serve AVIF, which the image model doesn't accept
  'Accept': 'image/webp,image/jpeg,image/png;q=0.9,*/*;q=0.5',
};
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Other public locations of the same file. media.routine.vn (Cloudflare) serves browsers
 * but not server requests; most of its files are also on the S3 origin.
 */
function imageUrlCandidates(url) {
  const routineCdn = 'https://media.routine.vn/';
  if (url.startsWith(routineCdn)) {
    return [url, `https://routine-db.s3.amazonaws.com/${url.slice(routineCdn.length)}`];
  }
  return [url];
}

/**
 * Download a product photo ourselves and inline it as a data URI.
 * Shop CDNs often reject requests without a browser User-Agent (DashScope's downloader
 * gets 403), and one failed download fails the whole generation request.
 * @returns {Promise<string|null>} null when the image can't be fetched
 */
async function inlineImage(url) {
  for (const candidate of imageUrlCandidates(url)) {
    try {
      const response = await fetch(candidate, { headers: IMAGE_FETCH_HEADERS, signal: AbortSignal.timeout(15000) });
      if (!response.ok) continue;
      const type = (response.headers.get('content-type') || '').split(';')[0].trim();
      if (!/^image\/(jpeg|jpg|png|webp|bmp)$/.test(type)) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0 || buffer.length > MAX_INLINE_IMAGE_BYTES) continue;
      return `data:${type};base64,${buffer.toString('base64')}`;
    } catch {
      // try the next location
    }
  }
  return null;
}

/**
 * Collect the user's photos and one downloadable product photo per item, inlined as data URIs.
 * If an item's first product image can't be fetched, its other suggested products are tried;
 * items with no usable photo are returned in missingItems so the prompt can still describe them.
 * @param {Object} outfit - outfit data with items
 * @param {Object} [userImage] - { base64, mimeType } of the uploaded clothing photo
 * @param {Object} [person] - { mode: 'full'|'face', image: dataURL } photo of the user to dress
 * @returns {Promise<{references: Array<{image, label, role, sourceUrl?}>, missingItems: string[]}>}
 */
export async function resolveReferenceImages(outfit, userImage = null, person = null) {
  const references = [];

  // The person always goes first so the prompt can refer to them as "Ảnh 1"
  if (person?.image && (person.mode === 'full' || person.mode === 'face')) {
    references.push({
      image: person.image,
      label: person.mode === 'full' ? 'ảnh toàn thân của người dùng' : 'ảnh gương mặt của người dùng',
      role: 'person',
    });
  }

  if (userImage?.base64) {
    const existingItem = (outfit.items || []).find(item => item.is_existing);
    references.push({
      image: `data:${userImage.mimeType || 'image/jpeg'};base64,${userImage.base64}`,
      label: `món đồ người dùng đang có${existingItem?.name ? ` (${existingItem.name})` : ''}`,
      role: 'owned',
    });
  }

  const itemsToBuy = (outfit.items || []).filter(item => !item.is_existing);
  const productRefs = await Promise.all(itemsToBuy.map(async item => {
    for (const product of item.products || []) {
      if (typeof product.image !== 'string' || !product.image.startsWith('http')) continue;
      const image = await inlineImage(product.image);
      if (image) {
        return {
          image,
          sourceUrl: product.image,
          label: `${product.name}${product.brand ? ` (${product.brand})` : ''}`,
          role: 'product',
        };
      }
      console.warn(`  ⚠️ Product image unavailable, trying next suggestion: ${product.image}`);
    }
    return null;
  }));

  const missingItems = [];
  itemsToBuy.forEach((item, i) => {
    if (productRefs[i]) references.push(productRefs[i]);
    else missingItems.push(`${item.name}${item.description ? ` (${item.description})` : ''}`);
  });

  return { references: references.slice(0, MAX_REFERENCE_IMAGES), missingItems };
}

// ──────────────────────────────────────────────
// Prompt Builder
// ──────────────────────────────────────────────

/**
 * Build a fashion outfit prompt from outfit items
 * @param {Object} outfit - outfit data with items
 * @param {string} [gender] - male/female
 * @param {Array} [references] - reference images from resolveReferenceImages
 * @param {Object} [person] - user's profile { mode, height, weight, gender }
 * @param {string[]} [missingItems] - items without a usable photo, described in words instead
 * @returns {string} prompt for image generation
 */
export function buildOutfitPrompt(outfit, gender = 'male', references = [], person = null, missingItems = []) {
  const genderDesc = gender === 'female' ? 'người mẫu nữ trẻ trung' : 'người mẫu nam trẻ trung';
  const styleTags = (outfit.style_tags || []).join(', ');
  const body = describeBody({ ...person, gender });
  const bodyLine = body ? ` Vóc dáng người mặc: ${body}.` : '';
  // Without this the model fills the gap on its own (e.g. jeans instead of the missing skirt)
  const missingLine = missingItems.length > 0
    ? ` Ngoài ra người mặc còn mặc thêm các món sau (không có ảnh, vẽ theo mô tả): ${missingItems.join('; ')}.`
    : '';

  const personIndex = references.findIndex(ref => ref.role === 'person');
  if (personIndex !== -1) {
    const personRef = references[personIndex];
    const clothingRefs = references
      .map((ref, i) => ({ ...ref, n: i + 1 }))
      .filter(ref => ref.role !== 'person');
    const clothingList = clothingRefs.map(ref => `Ảnh ${ref.n}: ${ref.label}`).join('; ');
    const identity = personRef.label.includes('toàn thân')
      ? `chỉ lấy con người từ Ảnh ${personIndex + 1} (gương mặt, kiểu tóc, màu da, vóc dáng và tỉ lệ cơ thể), BỎ HOÀN TOÀN quần áo người đó đang mặc, không giữ lại màu hay kiểu của trang phục cũ`
      : `giữ nguyên gương mặt, kiểu tóc và màu da của người trong Ảnh ${personIndex + 1}, dựng phần thân phù hợp với vóc dáng được mô tả`;
    const outfitLine = clothingRefs.length > 0
      ? `Cho người này mặc ĐÚNG và ĐỦ các món quần áo sau, chỉ lấy quần áo và bỏ qua hoàn toàn người mẫu xuất hiện trong các ảnh đó: ${clothingList}. Giữ nguyên chính xác màu sắc, họa tiết, logo, kiểu dáng, form và chất liệu của từng món.${missingLine}`
      : `Cho người này mặc set đồ: ${(outfit.items || []).map(item => item.name).join(', ')}.`;
    return `Ảnh ${personIndex + 1} là ${personRef.label}. Tạo một ảnh lookbook thời trang chụp toàn thân của CHÍNH người này: ${identity}.${bodyLine} ${outfitLine} Phong cách: ${styleTags || 'smart-casual hiện đại'}. Ánh sáng studio chuyên nghiệp, phông nền studio tối giản, tạo dáng tự nhiên, thấy rõ toàn bộ trang phục từ đầu đến chân, chất lượng chuẩn tạp chí thời trang.`;
  }

  if (references.length > 0) {
    const refList = references.map((ref, i) => `Ảnh ${i + 1}: ${ref.label}`).join('; ');
    return `Các ảnh tham chiếu là từng món quần áo riêng lẻ. ${refList}. Hãy tạo một ảnh lookbook thời trang chụp toàn thân: một ${genderDesc} Châu Á mặc ĐÚNG và ĐỦ tất cả các món trong ảnh tham chiếu phối thành một set đồ.${bodyLine} Giữ nguyên chính xác màu sắc, họa tiết, logo, kiểu dáng, form và chất liệu của từng món như trong ảnh tham chiếu.${missingLine} Không thêm món đồ nào khác nổi bật. Phong cách: ${styleTags || 'smart-casual hiện đại'}. Ánh sáng studio chuyên nghiệp, phông nền studio tối giản, tạo dáng thời trang tự nhiên, thấy rõ toàn bộ trang phục từ đầu đến chân, chất lượng chuẩn tạp chí thời trang.`;
  }

  const items = outfit.items || [];
  const itemDescriptions = items
    .filter(item => !item.is_existing)
    .map(item => {
      // Prioritize the actual matched product from DB/search
      const realProduct = item.products?.[0];
      const name = realProduct ? realProduct.name : item.name;
      const brand = realProduct?.brand || item.brand;
      const color = item.color || '';
      return `${name}${brand ? ` (thương hiệu ${brand})` : ''}${color ? `, tông màu ${color}` : ''}`;
    })
    .join(', ');

  const existingItems = items
    .filter(item => item.is_existing)
    .map(item => `${item.name}${item.color ? `, màu ${item.color}` : ''}`)
    .join(', ');

  const allItems = existingItems
    ? `Món đồ đã có: ${existingItems}. Món đồ phối kèm: ${itemDescriptions}`
    : itemDescriptions;

  return `Ảnh lookbook thời trang chụp toàn thân cao cấp. Một ${genderDesc} Châu Á diện set đồ phối hoàn hảo gồm các món: ${allItems}.${bodyLine} Phong cách: ${styleTags || 'smart-casual hiện đại'}. Ánh sáng studio chuyên nghiệp, phông nền studio tối giản sang trọng, tạo dáng thời trang tự nhiên, màu sắc và kiểu dáng trang phục rõ nét, chất lượng 4K chuẩn tạp chí thời trang.`;
}

// ──────────────────────────────────────────────
// Image Generation via DashScope Multimodal API
// ──────────────────────────────────────────────

async function callGenerationApi(prompt, model = PRIMARY_MODEL, references = []) {
  const response = await fetch(DASHSCOPE_MULTIMODAL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: model,
      input: {
        messages: [
          {
            role: 'user',
            content: [
              ...references.map(ref => ({ image: ref.image })),
              { text: prompt },
            ]
          }
        ]
      },
      parameters: {
        n: 1,
        watermark: false,
      },
    }),
    signal: AbortSignal.timeout(GENERATION_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`DashScope API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const imageUrl = data.output?.choices?.[0]?.message?.content?.[0]?.image;

  if (!imageUrl) {
    throw new Error(`No image URL in response: ${JSON.stringify(data)}`);
  }

  return imageUrl;
}

/**
 * Generate an outfit image, using real product photos as references when available
 * @param {Object} outfit - outfit data with items
 * @param {string} [gender] - male/female
 * @param {Object} [options]
 * @param {Object} [options.userImage] - { base64, mimeType } of the uploaded clothing photo
 * @param {Object} [options.person] - user profile { mode: 'none'|'full'|'face', image, height, weight, gender }
 * @returns {Object} { imageUrl, prompt, fromCache, usedReferences, usedPerson }
 */
export async function generateOutfitImage(outfit, gender = 'male', options = {}) {
  if (!DASHSCOPE_API_KEY) {
    console.warn('⚠️ DASHSCOPE_API_KEY not set, cannot generate images');
    return { imageUrl: null, prompt: '', fromCache: false, usedReferences: 0, usedPerson: false, error: 'API key not configured' };
  }

  const person = options.person || null;
  const { references, missingItems } = await resolveReferenceImages(outfit, options.userImage, person);
  const refPrompt = buildOutfitPrompt(outfit, gender, references, person, missingItems);
  const textPrompt = buildOutfitPrompt(outfit, gender, [], person);
  const withoutPerson = references.filter(ref => ref.role !== 'person');

  // Check cache first
  const cacheKey = getCacheKey(refPrompt, references);
  const cached = getCachedImage(cacheKey);
  if (cached) {
    console.log('🖼️ Using cached outfit image');
    return {
      imageUrl: cached.imageUrl,
      prompt: cached.prompt,
      fromCache: true,
      usedReferences: cached.usedReferences ?? 0,
      usedPerson: withoutPerson.length < references.length,
    };
  }

  // Fallback chain: all references → without the user's photo (e.g. rejected by moderation)
  // → text-only primary → text-only fallback model
  const attempts = [
    ...(references.length > 0 ? [{ model: PRIMARY_MODEL, prompt: refPrompt, references }] : []),
    ...(withoutPerson.length > 0 && withoutPerson.length < references.length
      ? [{ model: PRIMARY_MODEL, prompt: buildOutfitPrompt(outfit, gender, withoutPerson, person, missingItems), references: withoutPerson }]
      : []),
    { model: PRIMARY_MODEL, prompt: textPrompt, references: [] },
    { model: FALLBACK_MODEL, prompt: textPrompt, references: [] },
  ];

  let lastError;
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    try {
      console.log(`🎨 Generating outfit image with ${attempt.model} (${attempt.references.length} reference images)...`);
      console.log(`  Prompt: ${attempt.prompt.substring(0, 100)}...`);

      const imageUrl = await callGenerationApi(attempt.prompt, attempt.model, attempt.references);
      const usedReferences = attempt.references.length;
      const usedPerson = attempt.references.some(ref => ref.role === 'person');
      console.log(`  ✅ Image generated successfully (usedReferences: ${usedReferences}, usedPerson: ${usedPerson}): ${imageUrl.substring(0, 80)}...`);

      // Only cache full-fidelity results; a degraded fallback shouldn't stick for 20h
      if (usedReferences === references.length) {
        saveCachedImage(cacheKey, attempt.prompt, imageUrl, usedReferences);
      }

      return { imageUrl, prompt: attempt.prompt, fromCache: false, usedReferences, usedPerson };
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ ${attempt.model} (${attempt.references.length} refs) failed:`, error.message);

      // One dead product image shouldn't cost the others: drop it and retry with the rest
      const badUrl = error.message.match(/Failed to download image from \[([^\]]+)\]/)?.[1];
      const remaining = attempt.references.filter(ref => ref.image !== badUrl);
      if (badUrl && remaining.length > 0 && remaining.length < attempt.references.length) {
        attempts.splice(i + 1, 0, {
          model: attempt.model,
          prompt: buildOutfitPrompt(outfit, gender, remaining, person, missingItems),
          references: remaining,
        });
      }
    }
  }

  console.error('❌ Image generation error:', lastError?.message);
  return { imageUrl: null, prompt: textPrompt, fromCache: false, usedReferences: 0, usedPerson: false, error: lastError?.message };
}

/**
 * Generate images for all outfits in a response
 * @param {Array} outfits - array of outfit objects
 * @param {string} [gender] - male/female
 * @param {Object} [options] - passed through to generateOutfitImage (userImage, person)
 * @returns {Array} outfits with generatedImage field added
 */
export async function generateOutfitImages(outfits, gender = 'male', options = {}) {
  if (!outfits || outfits.length === 0) return outfits;

  // Only generate image for the top 1-2 outfits to save time and API quota; run them in parallel
  return Promise.all(outfits.map(async (outfit, i) => {
    if (i >= 2) {
      return { ...outfit, generatedImage: null };
    }
    const { imageUrl, error, usedReferences, usedPerson } = await generateOutfitImage(outfit, gender, options);
    return {
      ...outfit,
      generatedImage: imageUrl || null,
      imageError: error || null,
      usedReferences: usedReferences || 0,
      usedPerson: !!usedPerson,
    };
  }));
}
