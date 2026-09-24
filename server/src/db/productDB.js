import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EXTENDED_CATALOG } from './catalogs/extendedCatalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// src/db/ → up 2 levels to server root → data/
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// ──────────────────────────────────────────────
// In-memory product database loaded from JSON
// ──────────────────────────────────────────────

let allProducts = [];
let isLoaded = false;

/**
 * Load all product JSON files from the data directory
 */
export function loadProducts() {
  allProducts = [];

  if (!fs.existsSync(DATA_DIR)) {
    console.log('📂 Data directory not found, no scraped products available');
    isLoaded = true;
    return allProducts;
  }

  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('_products.json'));

  if (files.length === 0) {
    // No scraped data — use extended curated catalog as fallback
    console.log('📦 No scraped data found, loading extended curated catalog...');
    allProducts = [...EXTENDED_CATALOG];
    isLoaded = true;
    console.log(`📊 Loaded ${allProducts.length} products from curated catalog`);
    return allProducts;
  }

  for (const file of files) {
    try {
      const filepath = path.join(DATA_DIR, file);
      const raw = fs.readFileSync(filepath, 'utf-8');
      const data = JSON.parse(raw);
      const products = data.products || [];
      allProducts.push(...products);
      console.log(`📦 Loaded ${products.length} products from ${file}`);
    } catch (err) {
      console.error(`❌ Error loading ${file}:`, err.message);
    }
  }

  // The curated catalog is only a fallback when nothing has been scraped: its links
  // and images are hand-written and go stale, which breaks buy links and image generation.
  // Categories the scraped shops don't sell (e.g. shoes) fall through to live Tiki/Serper search.

  isLoaded = true;
  console.log(`📊 Total products in DB: ${allProducts.length}`);
  return allProducts;
}

/**
 * Ensure products are loaded
 */
function ensureLoaded() {
  if (!isLoaded) {
    loadProducts();
  }
}

/**
 * Get all products
 */
export function getAllProducts() {
  ensureLoaded();
  return allProducts;
}

/**
 * Query products with multi-criteria filters
 * @param {Object} filters
 * @param {string} [filters.category] - top/bottom/shoes/outerwear/accessory/dress
 * @param {string} [filters.gender] - male/female/unisex
 * @param {number} [filters.maxPrice] - maximum price in VND
 * @param {number} [filters.minPrice] - minimum price in VND
 * @param {string} [filters.brand] - brand name
 * @param {string[]} [filters.tags] - style tags to match
 * @param {string[]} [filters.colors] - color preferences
 * @param {string} [filters.keyword] - search keyword
 * @param {boolean} [filters.inStock] - only in-stock items
 * @returns {Array} matching products
 */
export function queryProducts(filters = {}) {
  ensureLoaded();

  let results = [...allProducts];

  // Filter by category
  if (filters.category) {
    results = results.filter(p => p.category === filters.category);
  }

  // Filter by gender (include unisex)
  if (filters.gender) {
    results = results.filter(p =>
      p.gender === filters.gender || p.gender === 'unisex'
    );
  }

  // Filter by price range
  if (filters.maxPrice) {
    results = results.filter(p => p.price <= filters.maxPrice);
  }
  if (filters.minPrice) {
    results = results.filter(p => p.price >= filters.minPrice);
  }

  // Filter by brand
  if (filters.brand) {
    results = results.filter(p =>
      p.brand.toLowerCase() === filters.brand.toLowerCase()
    );
  }

  // Filter by in-stock
  if (filters.inStock !== undefined) {
    results = results.filter(p => p.inStock === filters.inStock);
  }

  // Filter by keyword (search in name)
  if (filters.keyword) {
    const kw = filters.keyword.toLowerCase();
    results = results.filter(p =>
      p.name.toLowerCase().includes(kw) ||
      p.subcategory?.toLowerCase().includes(kw) ||
      p.tags?.some(t => t.toLowerCase().includes(kw))
    );
  }

  // Filter by tags (at least one tag matches)
  if (filters.tags && filters.tags.length > 0) {
    const filterTags = filters.tags.map(t => t.toLowerCase());
    results = results.filter(p =>
      p.tags?.some(t => filterTags.includes(t.toLowerCase()))
    );
  }

  // Filter by colors (at least one color matches)
  if (filters.colors && filters.colors.length > 0) {
    const filterColors = filters.colors.map(c => c.toLowerCase());
    results = results.filter(p =>
      p.colors?.some(c => filterColors.includes(c.toLowerCase()))
    );
  }

  return results;
}

/**
 * Get a single product by ID
 */
export function getProductById(id) {
  ensureLoaded();
  return allProducts.find(p => p.id === id) || null;
}

/**
 * Get statistics about the product database
 */
export function getStats() {
  ensureLoaded();

  const brands = [...new Set(allProducts.map(p => p.brand))];
  const categories = [...new Set(allProducts.map(p => p.category))];

  const brandCounts = {};
  for (const p of allProducts) {
    brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;
  }

  const categoryCounts = {};
  for (const p of allProducts) {
    categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
  }

  // Get last scrape times
  const scrapeInfo = {};
  if (fs.existsSync(DATA_DIR)) {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('_products.json'));
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));
        const brand = file.replace('_products.json', '');
        scrapeInfo[brand] = {
          scrapedAt: data.scrapedAt,
          count: data.totalProducts,
        };
      } catch { /* ignore */ }
    }
  }

  return {
    totalProducts: allProducts.length,
    brands,
    brandCounts,
    categories,
    categoryCounts,
    scrapeInfo,
    priceRange: allProducts.length > 0 ? {
      min: Math.min(...allProducts.map(p => p.price)),
      max: Math.max(...allProducts.map(p => p.price)),
    } : null,
  };
}

/**
 * Reload products from disk (call after scraping)
 */
export function reloadProducts() {
  isLoaded = false;
  return loadProducts();
}
