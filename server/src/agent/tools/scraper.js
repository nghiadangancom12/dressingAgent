import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// src/agent/tools/ → up 3 levels to server root → data/
const DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with timeout + retry (backs off on 429/5xx and network errors)
 */
async function fetchWithRetry(url, options = {}, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { ...HEADERS, ...(options.headers || {}) },
        signal: AbortSignal.timeout(20000),
      });
      if ((response.status === 429 || response.status >= 500) && attempt < retries) {
        await delay(2000 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (err) {
      if (attempt >= retries || err.message.startsWith('HTTP')) throw err;
      await delay(2000 * (attempt + 1));
    }
  }
}

async function fetchJson(url, options) {
  return (await fetchWithRetry(url, options)).json();
}

async function fetchText(url, options) {
  return (await fetchWithRetry(url, options)).text();
}

/**
 * Lowercase + NFC-normalize so Vietnamese diacritics match consistently
 */
function normalizeText(text) {
  return (text || '').normalize('NFC').toLowerCase();
}

/**
 * Infer style tags from product name, category, and material
 */
function inferStyleTags(name, category, material) {
  const tags = [];
  const lower = normalizeText(name + ' ' + (material || ''));

  if (lower.includes('basic') || lower.includes('cổ tròn') || lower.includes('trơn')) tags.push('basic');
  if (lower.includes('slim') || lower.includes('body') || lower.includes('ôm')) tags.push('slim-fit');
  if (lower.includes('oversize') || lower.includes('rộng') || lower.includes('loose')) tags.push('oversize');
  if (lower.includes('casual') || lower.includes('thường ngày')) tags.push('casual');
  if (lower.includes('công sở') || lower.includes('formal') || lower.includes('lịch sự')) tags.push('formal');
  if (lower.includes('thể thao') || lower.includes('sport') || lower.includes('gym')) tags.push('sporty');
  if (lower.includes('vintage') || lower.includes('retro')) tags.push('vintage');
  if (lower.includes('minimalist') || lower.includes('tối giản')) tags.push('minimalist');
  if (lower.includes('streetwear') || lower.includes('street')) tags.push('streetwear');
  if (lower.includes('cotton')) tags.push('cotton');
  if (lower.includes('linen') || lower.includes('lanh')) tags.push('linen');
  if (lower.includes('jean') || lower.includes('denim')) tags.push('denim');
  if (lower.includes('kaki') || lower.includes('khaki') || lower.includes('chino')) tags.push('chino');
  if (lower.includes('polo')) tags.push('smart-casual');

  if (tags.length === 0) tags.push('casual');
  return tags;
}

/**
 * Infer category from product name
 */
function inferCategory(name) {
  const lower = normalizeText(name);
  // Vietnamese names lead with the product type: "Khăn Lụa Cài Túi Áo Vest" is a scarf, not a vest
  if (/^(khăn|cà vạt|tất|vớ|thắt lưng|dây lưng|ví|túi|balo|mũ|nón|kính|móc khóa)(\s|$)/.test(lower)) return { category: 'accessory', subcategory: 'accessory' };
  // Underwear and sleepwear aren't styled into outfits; 'other' drops them from the catalog
  if (/quần lót|quần sịp|quần tất|giữ nhiệt|đồ lót|áo lót|áo ngực|\bboxers?\b|\bbriefs?\b|\btrunks?\b|\bbra\b|pijama|pyjama|đồ ngủ|đồ mặc nhà/.test(lower)) return { category: 'other', subcategory: 'excluded' };
  // Sets and áo dài don't fill a single outfit slot ("Set bộ Áo - Quần" would show a top for "quần")
  // ("áo dài tay" is just a long-sleeve top and must stay)
  if (/^(set|bộ)(\s|$)|áo dài(?!\s*tay)/.test(lower)) return { category: 'other', subcategory: 'excluded' };
  // The leading word is the type: "Váy Nữ Jeans Mini" is a skirt, not jeans
  if (/^(chân váy|váy|đầm)(\s|$)/.test(lower)) return { category: 'dress', subcategory: 'dress' };
  if (lower.includes('áo thun') || lower.includes('t-shirt') || lower.includes('tshirt') || /\bt[\s-]?shirt/.test(lower) || /\btees?\b/.test(lower)) return { category: 'top', subcategory: 't-shirt' };
  if (lower.includes('áo polo') || lower.includes('polo')) return { category: 'top', subcategory: 'polo' };
  if (lower.includes('áo khoác') || lower.includes('jacket') || lower.includes('hoodie') || lower.includes('bomber') || lower.includes('parka') || lower.includes('áo phao') || lower.includes('áo gió')) return { category: 'outerwear', subcategory: 'jacket' };
  if (lower.includes('sơ mi') || lower.includes('shirt')) return { category: 'top', subcategory: 'shirt' };
  if (lower.includes('blazer') || lower.includes('vest')) return { category: 'outerwear', subcategory: 'blazer' };
  if (lower.includes('cardigan')) return { category: 'outerwear', subcategory: 'cardigan' };
  if (lower.includes('quần jean') || lower.includes('jeans') || lower.includes('quần bò') || lower.includes('quần denim')) return { category: 'bottom', subcategory: 'jeans' };
  if (lower.includes('quần âu') || lower.includes('quần tây') || lower.includes('quần vải')) return { category: 'bottom', subcategory: 'trousers' };
  if (lower.includes('quần short') || lower.includes('quần đùi') || lower.includes('quần ngắn') || /\bshorts?\b/.test(lower)) return { category: 'bottom', subcategory: 'shorts' };
  if (lower.includes('quần kaki') || lower.includes('chino')) return { category: 'bottom', subcategory: 'chinos' };
  if (lower.includes('quần jogger') || /\bjoggers?\b/.test(lower)) return { category: 'bottom', subcategory: 'jogger' };
  if (/\b(pants|trousers)\b/.test(lower)) return { category: 'bottom', subcategory: 'pants' };
  if (lower.includes('váy') || lower.includes('đầm') || lower.includes('chân váy') || /\b(skirts?|dress(es)?|jumpsuit)\b/.test(lower)) return { category: 'dress', subcategory: 'dress' };
  // Shoe subcategories match what ruleEngine asks for ('sneaker' / 'oxford'), so "giày da" finds dress shoes
  if (lower.includes('búp bê') || lower.includes('mary jane') || /\b(flats?|ballet)\b/.test(lower)) return { category: 'shoes', subcategory: 'flat' };
  if (lower.includes('cao gót') || lower.includes('guốc') || /\bheels?\b/.test(lower)) return { category: 'shoes', subcategory: 'heels' };
  if (lower.includes('giày tây') || lower.includes('giày da') || lower.includes('oxford') || lower.includes('derby') || lower.includes('loafer') || lower.includes('giày lười')) return { category: 'shoes', subcategory: 'oxford' };
  if (lower.includes('sneaker') || lower.includes('giày thể thao') || lower.includes('tennis') || lower.includes('giày chạy')) return { category: 'shoes', subcategory: 'sneaker' };
  if (lower.includes('sandal') || lower.includes('dép')) return { category: 'shoes', subcategory: 'sandal' };
  if (lower.includes('giày') || lower.includes('boot')) return { category: 'shoes', subcategory: 'shoes' };
  // Garments before accessories: "Quần ... Túi Hộp" (cargo pocket) or "Áo ... Có Mũ" (hood) are not bags/hats
  if (lower.includes('quần')) return { category: 'bottom', subcategory: 'pants' };
  if (/\b(sweater|sweatshirt|tank ?top|blouse|tops?|bodysuit|crop ?top)\b/.test(lower)) return { category: 'top', subcategory: 'top' };
  if (lower.includes('áo')) return { category: 'top', subcategory: 'top' };
  if (lower.includes('thắt lưng') || lower.includes('belt') || lower.includes('ví') || lower.includes('túi') || lower.includes('balo') || lower.includes('mũ') || lower.includes('kính')) return { category: 'accessory', subcategory: 'accessory' };
  return { category: 'other', subcategory: 'other' };
}

/**
 * Infer gender from product name
 */
function inferGender(name) {
  const lower = normalizeText(name);
  if (lower.includes('unisex')) return 'unisex';
  if (/(^|[^\p{L}])(nam|men)([^\p{L}]|$)/u.test(lower)) return 'male';
  if (/(^|[^\p{L}])(nữ|women)([^\p{L}]|$)/u.test(lower)) return 'female';
  return 'unisex';
}

const COLOR_MAP = {
  'trắng': 'white', 'white': 'white', 'off white': 'white', 'ivory': 'white',
  'đen': 'black', 'black': 'black',
  'xanh navy': 'navy', 'navy': 'navy', 'xanh đen': 'navy',
  'xanh dương': 'blue', 'blue': 'blue', 'indigo': 'blue', 'xanh da trời': 'blue',
  'xanh lá': 'green', 'green': 'green', 'olive': 'green', 'rêu': 'green',
  'đỏ': 'red', 'red': 'red', 'wine': 'red', 'burgundy': 'red',
  'vàng': 'yellow', 'yellow': 'yellow',
  'be': 'beige', 'beige': 'beige', 'kem': 'beige', 'cream': 'beige', 'natural': 'beige',
  'xám': 'gray', 'ghi': 'gray', 'grey': 'gray', 'gray': 'gray', 'charcoal': 'gray', 'melange': 'gray',
  'nâu': 'brown', 'brown': 'brown', 'camel': 'brown',
  'hồng': 'pink', 'pink': 'pink',
  'tím': 'purple', 'purple': 'purple',
  'cam': 'orange', 'orange': 'orange',
  'kaki': 'khaki', 'khaki': 'khaki',
};

/**
 * Extract colors from product name / color field (whole-word matches only,
 * so "be" doesn't match "beauty" and "cam" doesn't match "camel")
 */
function extractColors(name, colorField) {
  const source = normalizeText((name || '') + ' ' + (colorField || ''));
  const colors = [];
  for (const [word, en] of Object.entries(COLOR_MAP)) {
    const re = new RegExp(`(^|[^\\p{L}])${word}([^\\p{L}]|$)`, 'u');
    if (re.test(source) && !colors.includes(en)) {
      colors.push(en);
    }
  }
  return colors.length > 0 ? colors : ['unknown'];
}

// ──────────────────────────────────────────────
// Uniqlo VN Scraper
// ──────────────────────────────────────────────

const UNIQLO_API = 'https://www.uniqlo.com/vn/api/commerce/v5/vi/products';
// The commerce API rejects requests without the web client id
const UNIQLO_CLIENT_ID = 'uq.vn.web-spa';
const UNIQLO_GENDERS = { MEN: 'male', WOMEN: 'female', UNISEX: 'unisex' };

/**
 * Scrape products from Uniqlo VN's commerce API (paginated over the whole catalog)
 */
async function scrapeUniqlo() {
  console.log('🔄 Scraping Uniqlo VN...');
  const products = [];
  const pageSize = 100;
  let offset = 0;
  let total = Infinity;

  while (offset < total) {
    try {
      const data = await fetchJson(
        `${UNIQLO_API}?offset=${offset}&limit=${pageSize}&httpFailure=true`,
        { headers: { 'x-fr-clientid': UNIQLO_CLIENT_ID, 'Referer': 'https://www.uniqlo.com/vn/vi/' } },
      );
      if (data.status !== 'ok') throw new Error(JSON.stringify(data.error));

      const items = data.result?.items || [];
      total = data.result?.pagination?.total ?? 0;
      if (items.length === 0) break;

      for (const item of items) {
        const product = mapUniqloProduct(item);
        if (product) products.push(product);
      }

      console.log(`  ✅ Uniqlo ${offset}-${offset + items.length}/${total}`);
      offset += items.length;
      await delay(1000); // Rate limiting
    } catch (err) {
      console.error(`  ❌ Uniqlo offset ${offset}: ${err.message}`);
      break;
    }
  }

  console.log(`📦 Uniqlo total: ${products.length} products`);
  return products;
}

function mapUniqloProduct(item) {
  // Skip kids/baby lines — the app only styles adults
  const gender = UNIQLO_GENDERS[item.genderCategory];
  if (!gender || !item.name) return null;

  const basePrice = item.prices?.base?.value;
  const price = item.prices?.promo?.value || basePrice;
  if (!price) return null;

  const { category, subcategory } = inferCategory(item.name);
  if (category === 'other') return null;

  const colorCode = item.representative?.color?.displayCode || item.colors?.[0]?.displayCode;
  const mainImage = item.images?.main?.[colorCode]?.image || Object.values(item.images?.main || {})[0]?.image;
  const subImages = (item.images?.sub || []).map(s => s.image).filter(Boolean);
  const colorNames = (item.colors || []).map(c => c.name).join(' ');

  return {
    id: `uniqlo-${item.productId}`,
    brand: 'Uniqlo',
    name: item.name,
    price,
    originalPrice: basePrice || price,
    currency: 'VND',
    url: `https://www.uniqlo.com/vn/vi/products/${item.productId}/${item.priceGroup || '00'}${colorCode ? `?colorDisplayCode=${colorCode}` : ''}`,
    images: [mainImage, ...subImages].filter(Boolean).slice(0, 3),
    category,
    subcategory,
    gender,
    colors: extractColors(item.name, colorNames),
    sizes: (item.sizes || []).map(s => s.name).filter(Boolean),
    material: '',
    tags: inferStyleTags(item.name, category, ''),
    inStock: !item.storeStockOnly,
    scrapedAt: new Date().toISOString(),
  };
}

// ──────────────────────────────────────────────
// Routine VN Scraper (ecom-api.routine.vn)
// ──────────────────────────────────────────────

const ROUTINE_API = 'https://ecom-api.routine.vn/client';
// Some objects on the S3 origin (routine-db.s3.amazonaws.com) are private and return 403;
// the CDN serves all of them to browsers. Image generation downloads them server-side
// with a browser User-Agent (see imageGen.js), since the CDN rejects bare requests.
const ROUTINE_IMAGE_BASE = 'https://media.routine.vn/';
const ROUTINE_HEADERS = { 'Origin': 'https://routine.vn', 'Referer': 'https://routine.vn/' };

/**
 * Load Routine's attribute values (colors, sizes) as id → { attributeId, name }
 */
async function fetchRoutineAttributeValues() {
  const values = new Map();
  for (let page = 1; page <= 50; page++) {
    const data = await fetchJson(`${ROUTINE_API}/product-attribute-values?page=${page}&limit=100`, { headers: ROUTINE_HEADERS });
    for (const v of data.data || []) {
      const detail = v.detail?.find(d => d.langCode === 'vi') || v.detail?.[0];
      values.set(v.id, { attributeId: v.attributeId, name: detail?.name || v.slug });
    }
    if (page >= (data.pageCount || 1)) break;
    await delay(300);
  }
  return values;
}

/**
 * Scrape products from Routine VN's ecommerce API
 */
async function scrapeRoutine() {
  console.log('🔄 Scraping Routine VN...');
  const products = [];

  let attributeValues = new Map();
  try {
    attributeValues = await fetchRoutineAttributeValues();
  } catch (err) {
    console.warn(`  ⚠️ Routine attributes unavailable (${err.message}), colors/sizes will be inferred`);
  }

  const pageSize = 100;
  let total = Infinity;
  for (let page = 1; (page - 1) * pageSize < total; page++) {
    try {
      const data = await fetchJson(`${ROUTINE_API}/products?page=${page}&limit=${pageSize}`, { headers: ROUTINE_HEADERS });
      const items = data.data || [];
      total = data.total ?? 0;
      if (items.length === 0) break;

      for (const item of items) {
        const product = mapRoutineProduct(item, attributeValues);
        if (product) products.push(product);
      }

      console.log(`  ✅ Routine page ${page}: ${items.length} items`);
      await delay(800);
    } catch (err) {
      console.error(`  ❌ Routine page ${page}: ${err.message}`);
      break;
    }
  }

  console.log(`📦 Routine total: ${products.length} products`);
  return products;
}

function mapRoutineProduct(item, attributeValues) {
  // The API also returns placeholder/combo/gift records without a title or price
  const rawTitle = item.metadata?.title;
  if (!item.isActive || item.isGift || item.isCombo || !rawTitle || !(item.minPrice > 0)) return null;

  const name = rawTitle.replace(/\s*[-|]\s*routine\s*$/i, '').trim();
  const { category, subcategory } = inferCategory(name);
  if (category === 'other') return null;

  const colorNames = new Set();
  const sizes = new Set();
  let originalPrice = item.minPrice;
  for (const variant of item.variants || []) {
    for (const id of variant.attributeValueIds || []) {
      const value = attributeValues.get(id);
      if (value?.attributeId === '1') colorNames.add(value.name);
      if (value?.attributeId === '2') sizes.add(value.name);
    }
    originalPrice = Math.max(originalPrice, Number(variant.originalPrice) || 0);
  }

  const images = [item.thumbnail, item.secondThumbnail]
    .filter(Boolean)
    .map(p => ROUTINE_IMAGE_BASE + p);

  return {
    id: `routine-${item.id}`,
    brand: 'Routine',
    name,
    price: item.minPrice,
    originalPrice,
    currency: 'VND',
    url: `https://routine.vn/products/${item.slug}`,
    images,
    category,
    subcategory,
    gender: inferGender(name),
    colors: extractColors(name, [...colorNames].join(' ')),
    sizes: [...sizes],
    material: extractMaterial(name),
    tags: inferStyleTags(name, category, ''),
    inStock: !item.isOutOfStock,
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Extract material info from text / HTML
 */
function extractMaterial(html) {
  if (!html) return '';
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const matMatch = text.match(/(cotton|polyester|linen|lanh|spandex|modal|denim|len|nỉ|kaki)/i);
  return matMatch ? matMatch[0].trim() : '';
}

// ──────────────────────────────────────────────
// Coolmate Scraper
// ──────────────────────────────────────────────

const COOLMATE_IMAGE_BASE = 'https://n7media.coolmate.me/uploads';
const COOLMATE_GENDERS = { MALE: 'male', FEMALE: 'female', UNISEX: 'unisex' };
const COOLMATE_COLLECTIONS = [
  'ao-thun-nam', 'ao-polo-nam', 'ao-so-mi-nam', 'ao-khoac-nam',
  'quan-jeans-nam', 'quan-dai-nam', 'quan-kaki-nam', 'quan-jogger-nam', 'quan-short-nam',
  'ao-nu', 'ao-khoac-nu', 'quan-dai-nu', 'quan-short-nu', 'do-nu',
];

/**
 * Pull product objects out of a Next.js page's RSC flight payload
 * (Coolmate server-renders its collection pages; there is no public JSON API)
 */
function extractCoolmateProducts(html) {
  let flight = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try { flight += JSON.parse(m[1]); } catch { /* skip malformed chunk */ }
  }

  const found = [];
  let start = 0;
  while ((start = flight.indexOf('{"title":', start)) !== -1) {
    // Walk to the matching closing brace, respecting strings
    let depth = 0, end = start, inString = false;
    for (; end < flight.length; end++) {
      const c = flight[end];
      if (inString) {
        if (c === '\\') end++;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) break;
    }
    try {
      const obj = JSON.parse(flight.slice(start, end + 1));
      if (obj.href?.startsWith('/product/') && obj.regular_price) found.push(obj);
    } catch { /* not a product object */ }
    start = end + 1;
  }
  return found;
}

function coolmateImageUrl(p) {
  if (!p) return null;
  if (p.startsWith('http')) return p;
  return COOLMATE_IMAGE_BASE + p.replace(/^\/image/, '');
}

/**
 * Scrape products from Coolmate collection pages.
 * Only the first page (~20 items) of each collection is server-rendered.
 */
async function scrapeCoolmate() {
  console.log('🔄 Scraping Coolmate...');
  const byId = new Map();

  for (const collection of COOLMATE_COLLECTIONS) {
    try {
      const html = await fetchText(`https://www.coolmate.me/collection/${collection}`, {
        headers: { 'Accept': 'text/html' },
      });
      const items = extractCoolmateProducts(html);
      for (const item of items) {
        const product = mapCoolmateProduct(item);
        if (product && !byId.has(product.id)) byId.set(product.id, product);
      }
      console.log(`  ✅ Coolmate ${collection}: ${items.length} items`);
    } catch (err) {
      console.error(`  ❌ Coolmate ${collection}: ${err.message}`);
    }
    await delay(1000);
  }

  const products = [...byId.values()];
  console.log(`📦 Coolmate total: ${products.length} products`);
  return products;
}

function mapCoolmateProduct(item) {
  if (item.active === false || item.coming_soon) return null;

  const name = item.title;
  const { category, subcategory } = inferCategory(name);
  if (category === 'other') return null;

  const variants = Object.values(item.mapped_variants || {}).flat();
  const colorNames = Object.keys(item.mapped_variants || {});
  const sizes = [...new Set(variants.map(v => v.size).filter(Boolean))];

  return {
    id: `coolmate-${item.id}`,
    brand: 'Coolmate',
    name,
    price: item.regular_price,
    originalPrice: Math.max(item.compare_price || 0, item.regular_price),
    currency: 'VND',
    url: `https://www.coolmate.me${item.href}`,
    images: [item.default_thumbnail, item.default_thumbnail_hover].map(coolmateImageUrl).filter(Boolean),
    category,
    subcategory,
    gender: COOLMATE_GENDERS[item.gender_type] || inferGender(name),
    colors: extractColors(name, colorNames.join(' ')),
    sizes,
    material: extractMaterial(name),
    tags: inferStyleTags(name, category, ''),
    inStock: !item.is_out_of_stock,
    scrapedAt: new Date().toISOString(),
  };
}

// ──────────────────────────────────────────────
// Haravan / Sapo stores (public storefront JSON)
// ──────────────────────────────────────────────

// Kids' lines are skipped: the app only styles adults
const KIDS_RE = /trẻ em|bé trai|bé gái|\bkids?\b|baby/i;

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Map a storefront product (already normalized to common fields) to our product schema
 */
function mapStorefrontProduct({ brand, domain, defaultGender, id, name, productType, tagsText, url, images, price, compareAtPrice, colorNames, sizes, available, description }) {
  if (!name || !(price > 0)) return null;
  if (KIDS_RE.test(`${name} ${productType}`)) return null;

  // The shop's own product_type ("Dép Thông Dụng", "Quần dài (PS)") beats guessing from the title,
  // which may be English or brand-heavy ("Teelab Alter ... Pants PS149")
  const byName = inferCategory(name);
  if (byName.subcategory === 'excluded') return null; // underwear, sets, áo dài — whatever the shop's type says
  const byType = inferCategory(productType || '');
  const { category, subcategory } = byType.category !== 'other' ? byType : byName;
  if (category === 'other') return null;

  return {
    id: `${brand.toLowerCase().replace(/[^a-z0-9]/g, '')}-${id}`,
    brand,
    name,
    price,
    originalPrice: Math.max(compareAtPrice || 0, price),
    currency: 'VND',
    url: url.startsWith('http') ? url : `https://${domain}${url.startsWith('/') ? '' : '/'}${url}`,
    images: images.filter(Boolean).map(src => (src.startsWith('//') ? `https:${src}` : src)).slice(0, 3),
    category,
    subcategory,
    // Menswear-only shops rarely say "nam" in titles; fall back to the shop's audience
    gender: (() => {
      const g = inferGender(`${name} ${tagsText}`);
      return g === 'unisex' && defaultGender ? defaultGender : g;
    })(),
    colors: extractColors(name, colorNames.join(' ')),
    sizes,
    material: extractMaterial(`${name} ${description}`),
    tags: inferStyleTags(name, category, description),
    inStock: available !== false,
    scrapedAt: new Date().toISOString(),
  };
}

/** Values of the variant option whose name looks like `pattern` (e.g. Màu sắc / Kích thước) */
function optionValues(options, variants, pattern) {
  // Option names may arrive NFD-encoded ("Màu" as a + combining marks), so normalize before matching
  const index = (options || []).findIndex(o => pattern.test((o.name || '').normalize('NFC')));
  if (index === -1) return [];
  const key = `option${index + 1}`;
  return [...new Set((variants || []).map(v => v[key]).filter(Boolean))];
}

/**
 * Haravan storefront: /collections/all/products.json, 50 products per page
 */
async function scrapeHaravanStore({ brand, domain, defaultGender = null, maxPages = 60 }) {
  console.log(`🔄 Scraping ${brand} (Haravan)...`);
  const products = [];
  for (let page = 1; page <= maxPages; page++) {
    try {
      const data = await fetchJson(`https://${domain}/collections/all/products.json?limit=50&page=${page}`);
      const items = data.products || [];
      if (items.length === 0) break;
      for (const item of items) {
        const variants = item.variants || [];
        const prices = variants.map(v => Number(v.price)).filter(p => p > 0);
        const compare = variants.map(v => Number(v.compare_at_price)).filter(p => p > 0);
        const product = mapStorefrontProduct({
          brand,
          domain,
          defaultGender,
          id: item.id,
          name: item.title,
          productType: item.product_type,
          tagsText: typeof item.tags === 'string' ? item.tags : (item.tags || []).join(','),
          url: `/products/${item.handle}`,
          images: (item.images || []).map(img => img.src),
          price: prices.length ? Math.min(...prices) : 0,
          compareAtPrice: compare.length ? Math.max(...compare) : 0,
          colorNames: optionValues(item.options, variants, /màu|color/i),
          sizes: optionValues(item.options, variants, /size|kích|cỡ/i),
          available: item.available ?? variants.some(v => v.available),
          description: stripHtml(item.body_html).slice(0, 500),
        });
        if (product) products.push(product);
      }
      if (items.length < 50) break;
      await delay(700);
    } catch (err) {
      console.error(`  ❌ ${brand} page ${page}: ${err.message}`);
      break;
    }
  }
  console.log(`📦 ${brand} total: ${products.length} products`);
  return products;
}

/**
 * Sapo (Bizweb) storefront: /products.json, up to 250 products per page
 */
async function scrapeSapoStore({ brand, domain, defaultGender = null, maxPages = 20 }) {
  console.log(`🔄 Scraping ${brand} (Sapo)...`);
  const products = [];
  for (let page = 1; page <= maxPages; page++) {
    try {
      const data = await fetchJson(`https://${domain}/products.json?limit=250&page=${page}`);
      const items = data.products || [];
      if (items.length === 0) break;
      for (const item of items) {
        const product = mapStorefrontProduct({
          brand,
          domain,
          defaultGender,
          id: item.id,
          name: item.name,
          productType: item.product_type,
          tagsText: (item.tags || []).join(','),
          url: item.url || `/${item.alias}`,
          images: [item.featured_image, ...(item.images || [])].map(img => (typeof img === 'string' ? img : img?.src)),
          price: Number(item.price_min || item.price) || 0,
          compareAtPrice: Number(item.compare_at_price_max) || 0,
          colorNames: optionValues(item.options, item.variants, /màu|color/i),
          sizes: optionValues(item.options, item.variants, /size|kích|cỡ/i),
          available: item.available,
          description: stripHtml(item.content || item.summary).slice(0, 500),
        });
        if (product) products.push(product);
      }
      if (items.length < 250) break;
      await delay(700);
    } catch (err) {
      console.error(`  ❌ ${brand} page ${page}: ${err.message}`);
      break;
    }
  }
  // Sapo lists the featured image again inside images[]
  for (const p of products) p.images = [...new Set(p.images)];
  console.log(`📦 ${brand} total: ${products.length} products`);
  return products;
}

// ──────────────────────────────────────────────
// Main orchestrator
// ──────────────────────────────────────────────

/**
 * Save products to JSON file
 */
function saveProducts(brand, products) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const filename = `${brand.toLowerCase()}_products.json`;
  const filepath = path.join(DATA_DIR, filename);
  const data = {
    brand,
    scrapedAt: new Date().toISOString(),
    totalProducts: products.length,
    products,
  };

  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`💾 Saved ${products.length} products to ${filename}`);
}

/**
 * Get the last scrape timestamp for a brand
 */
function getLastScrapeTime(brand) {
  const filepath = path.join(DATA_DIR, `${brand.toLowerCase()}_products.json`);
  try {
    if (!fs.existsSync(filepath)) return null;
    const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    return data.scrapedAt ? new Date(data.scrapedAt) : null;
  } catch {
    return null;
  }
}

/**
 * Check if scrape is needed (older than intervalDays)
 */
function needsScrape(brand, intervalDays = 3) {
  const lastScrape = getLastScrapeTime(brand);
  if (!lastScrape) return true;
  const now = new Date();
  const diffMs = now - lastScrape;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= intervalDays;
}

/**
 * Every source, keyed by the file prefix it saves to (data/<key>_products.json).
 * To add a Haravan/Sapo shop, add one line here.
 */
const SCRAPERS = [
  { key: 'uniqlo', run: scrapeUniqlo },
  { key: 'routine', run: scrapeRoutine },
  { key: 'coolmate', run: scrapeCoolmate },
  { key: 'bitis', run: () => scrapeHaravanStore({ brand: "Biti's", domain: 'bitis.com.vn' }) },
  { key: 'dirtycoins', run: () => scrapeHaravanStore({ brand: 'Dirty Coins', domain: 'dirtycoins.vn' }) },
  { key: 'torano', run: () => scrapeHaravanStore({ brand: 'Torano', domain: 'torano.vn', defaultGender: 'male' }) },
  { key: 'aristino', run: () => scrapeHaravanStore({ brand: 'Aristino', domain: 'aristino.com', defaultGender: 'male' }) },
  { key: 'teelab', run: () => scrapeSapoStore({ brand: 'Teelab', domain: 'teelab.vn' }) },
  { key: 'davies', run: () => scrapeSapoStore({ brand: 'Davies', domain: 'davies.vn' }) },
  // Womenswear: titles rarely say "nữ", so the shop's audience is the default gender
  { key: 'marc', run: () => scrapeHaravanStore({ brand: 'Marc', domain: 'marc.com.vn', defaultGender: 'female' }) },
  { key: 'evadeeva', run: () => scrapeHaravanStore({ brand: 'Eva de Eva', domain: 'evadeeva.com.vn', defaultGender: 'female' }) },
  { key: 'libe', run: () => scrapeHaravanStore({ brand: 'Libé', domain: 'libeworkshop.com', defaultGender: 'female' }) },
  { key: 'olv', run: () => scrapeHaravanStore({ brand: 'OLV', domain: 'olv.vn', defaultGender: 'female' }) },
  { key: 'thebluetshirt', run: () => scrapeHaravanStore({ brand: 'The Blue T-shirt', domain: 'thebluetshirt.com', defaultGender: 'female' }) },
  { key: 'cocosin', run: () => scrapeHaravanStore({ brand: 'Coco Sin', domain: 'cocosin.vn', defaultGender: 'female' }) },
  { key: 'coupletx', run: () => scrapeHaravanStore({ brand: 'Couple TX', domain: 'coupletx.com' }) },
];

/**
 * Run all scrapers
 * @param {boolean} [force] - scrape even if data is fresh
 * @param {string[]} [only] - limit to these scraper keys
 */
export async function runAllScrapers(force = false, only = null) {
  console.log('\n🚀 Starting product scrapers...\n');
  const results = {};

  for (const { key, run } of SCRAPERS) {
    if (only && !only.includes(key)) continue;
    if (!force && !needsScrape(key, 3)) {
      console.log(`⏭️  ${key}: data is fresh, skipping`);
      results[key] = 'skipped';
      continue;
    }
    try {
      const products = await run();
      // Keep the previous file when a source breaks, rather than wiping it
      if (products.length > 0) saveProducts(key, products);
      results[key] = products.length;
    } catch (err) {
      console.error(`❌ ${key} scraper failed:`, err.message);
      results[key] = 0;
    }
  }

  console.log('\n✅ Scraping complete!', results);
  return results;
}

// If run directly: node src/agent/tools/scraper.js
if (process.argv[1] && process.argv[1].includes('scraper')) {
  const force = process.argv.includes('--force');
  // --only=bitis,teelab to run a subset
  const onlyArg = process.argv.find(a => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.slice(7).split(',').filter(Boolean) : null;
  runAllScrapers(force, only).catch(console.error);
}
