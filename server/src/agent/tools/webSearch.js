import { searchByRules } from './catalogSearch.js';

/**
 * Web Search Service
 * - Uses Tiki's open official API to retrieve specific product links, real prices, and thumbnails
 * - Uses Serper.dev (Google Shopping Search API) for Shopee & Lazada specific product links when SERPER_API_KEY is present
 * - Falls back to direct search URLs for platforms without specific results
 */

const PLATFORMS = [
  {
    name: 'Shopee',
    icon: '🛒',
    color: '#EE4D2D',
    searchUrl: (query) =>
      `https://shopee.vn/search?keyword=${encodeURIComponent(query)}`,
    siteDomain: 'shopee.vn',
  },
  {
    name: 'Lazada',
    icon: '🛍️',
    color: '#0F146D',
    searchUrl: (query) =>
      `https://www.lazada.vn/catalog/?q=${encodeURIComponent(query)}`,
    siteDomain: 'lazada.vn',
  },
  {
    name: 'Tiki',
    icon: '📦',
    color: '#1A94FF',
    searchUrl: (query) =>
      `https://tiki.vn/search?q=${encodeURIComponent(query)}`,
    siteDomain: 'tiki.vn',
  },
];

/**
 * Fetch specific product result from Tiki official public API (free, no API key required)
 * @param {string} query
 * @param {number} page
 * @param {string} label
 */
async function fetchTikiProduct(query, page = 1, label = 'Tiki') {
  try {
    const url = `https://tiki.vn/api/v2/products?limit=1&page=${page}&q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://tiki.vn/',
        'x-guest-token': '825210279',
      },
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('json')) return null;

    const data = await response.json();
    const items = data.data || [];

    if (items.length > 0) {
      const item = items[0];
      if (!item.url_path) return null;

      const productUrl = item.url_path.startsWith('http')
        ? item.url_path
        : `https://tiki.vn/${item.url_path}`;

      return {
        name: item.name || `${query} - Tiki`,
        price: item.price ? `${item.price.toLocaleString('vi-VN')} ₫` : 'Xem trên Tiki',
        priceValue: item.price || null,
        image: item.thumbnail_url || null,
        url: productUrl,
        source: label,
        icon: '📦',
        color: '#1A94FF',
        isSpecific: true,
      };
    }
    return null;
  } catch (err) {
    console.error(`Tiki search error (page ${page}):`, err.message);
    return null;
  }
}

/**
 * Fetch specific product results from Serper Google Search API
 * for a single platform (Shopee, Lazada, etc.)
 */
async function serperSearchPlatform(query, platform) {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return null;

  try {
    const searchQuery = `${query} site:${platform.siteDomain}`;
    const response = await fetch('https://google.serper.dev/shopping', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ q: searchQuery, gl: 'vn', hl: 'vi', num: 3 }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const items = data.shopping || [];

    // Return top 1 result for this platform that is a real product link
    if (items.length > 0) {
      const item = items[0];
      if (!item.link) return null;

      return {
        name: item.title || `${query} - ${platform.name}`,
        price: item.price || 'Xem trên sàn',
        priceValue: parsePriceToNumber(item.price),
        image: item.imageUrl || null,
        url: item.link,
        source: platform.name,
        icon: platform.icon,
        color: platform.color,
        isSpecific: true,
      };
    }
    return null;
  } catch (err) {
    console.error(`Serper error for ${platform.name}:`, err.message);
    return null;
  }
}

/**
 * Parse price string like "150.000 ₫" or "150,000" to number
 */
function parsePriceToNumber(priceStr) {
  if (!priceStr) return null;
  const cleaned = String(priceStr).replace(/[^\d]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}

function isValidProductUrl(url) {
  if (!url) return false;
  // Official brand direct or search pages are always valid
  if (url.includes('uniqlo.com') || url.includes('routine.vn') || url.includes('coolmate.me')) {
    return true;
  }
  // For open marketplaces like Tiki/Shopee/Lazada, ensure direct product link
  return !url.includes('/search') && !url.includes('?q=') && !url.includes('?keyword=');
}

/**
 * Search for products across platforms.
 * Priority: 1) Rule-based search from scraped DB, 2) Tiki API, 3) Serper, 4) Catalog fallback
 * ONLY returns links to specific products (isSpecific = true).
 * Never returns marketplace search query URLs to prevent bot/captcha blocks.
 * @param {string} query - search query
 * @param {Object} [context] - optional context for rule engine (budget, gender, style, etc.)
 */
export async function searchProducts(query, context = {}) {
  if (!query || typeof query !== 'string') return [];

  const cleanQuery = query.trim();
  const results = [];

  // 1. FIRST: Search scraped product DB via rule engine
  try {
    const ruleResults = searchByRules(cleanQuery, context);
    if (ruleResults.length > 0) {
      results.push(...ruleResults);
      console.log(`  📦 Rule engine: ${ruleResults.length} results from scraped DB`);
    }
  } catch (err) {
    console.error('  ⚠️ Rule engine error:', err.message);
  }

  // 2. If we have enough in-budget results from DB, return early
  //    (when the DB only has over-budget items, live marketplaces may have cheaper ones)
  if (results.filter(r => !r.overBudget).length >= 3) {
    return results.slice(0, 3).filter(r => r.url && isValidProductUrl(r.url));
  }

  // 3. Supplement with live API results (Tiki + Serper).
  //    Marketplaces ignore context, so say the gender in the query ("giày oxford" returned men's shoes)
  const genderWord = { male: 'nam', female: 'nữ' }[context.gender];
  const liveQuery = genderWord && !cleanQuery.toLowerCase().includes(genderWord)
    ? `${cleanQuery} ${genderWord}`
    : cleanQuery;
  const tikiPromise1 = fetchTikiProduct(liveQuery, 1, 'Tiki');
  const tikiPromise2 = fetchTikiProduct(liveQuery, 2, 'Tiki (Lựa chọn 2)');
  const shopeePromise = serperSearchPlatform(liveQuery, PLATFORMS[0]);
  const lazadaPromise = serperSearchPlatform(liveQuery, PLATFORMS[1]);

  const [shopeeResult, lazadaResult, tikiResult1, tikiResult2] = await Promise.all([
    shopeePromise,
    lazadaPromise,
    tikiPromise1,
    tikiPromise2,
  ]);

  // Add live results (avoid duplicates by URL)
  const existingUrls = new Set(results.map(r => r.url));

  if (shopeeResult?.isSpecific && !existingUrls.has(shopeeResult.url)) {
    results.push(shopeeResult);
  }
  if (lazadaResult?.isSpecific && !existingUrls.has(lazadaResult.url)) {
    results.push(lazadaResult);
  }
  if (tikiResult1?.isSpecific && !existingUrls.has(tikiResult1.url)) {
    results.push(tikiResult1);
  }
  if (tikiResult2?.isSpecific && tikiResult2.url !== tikiResult1?.url && !existingUrls.has(tikiResult2.url)) {
    results.push(tikiResult2);
  }

  // No static-catalog top-up: its hand-written entries are stale and loosely matched
  // (it answered "ear cuff" with men's shirts). Fewer results beat wrong ones — the UI
  // shows a marketplace search hint when an item has no products.

  // Strict filter: ensure valid URLs
  return results.filter(r => r.url && isValidProductUrl(r.url));
}

/**
 * Get all supported platforms info
 */
export function getPlatforms() {
  return PLATFORMS.map(({ name, icon, color }) => ({ name, icon, color }));
}
