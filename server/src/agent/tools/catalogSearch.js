import { queryProducts, getAllProducts } from '../../db/productDB.js';

// ──────────────────────────────────────────────
// Color Harmony Rules
// ──────────────────────────────────────────────

const COLOR_HARMONY = {
  white:  ['black', 'navy', 'gray', 'beige', 'blue', 'brown', 'green', 'red', 'pink', 'khaki'],
  black:  ['white', 'gray', 'beige', 'red', 'blue', 'navy', 'pink', 'khaki'],
  navy:   ['white', 'beige', 'gray', 'brown', 'khaki', 'blue'],
  beige:  ['navy', 'white', 'brown', 'black', 'blue', 'green', 'khaki'],
  gray:   ['white', 'black', 'navy', 'blue', 'pink', 'beige'],
  blue:   ['white', 'beige', 'gray', 'navy', 'brown', 'khaki'],
  brown:  ['white', 'beige', 'navy', 'blue', 'khaki', 'green'],
  green:  ['white', 'beige', 'brown', 'black', 'khaki'],
  red:    ['white', 'black', 'gray', 'navy', 'beige'],
  pink:   ['white', 'gray', 'black', 'navy', 'beige'],
  khaki:  ['white', 'navy', 'black', 'brown', 'beige', 'blue'],
  yellow: ['white', 'black', 'navy', 'gray', 'blue'],
  orange: ['white', 'navy', 'black', 'beige', 'brown'],
  purple: ['white', 'gray', 'black', 'beige'],
};

// ──────────────────────────────────────────────
// Season-Material Rules
// ──────────────────────────────────────────────

const SEASON_MATERIALS = {
  summer: ['cotton', 'linen', 'lanh', 'bamboo', 'coolmax', 'mesh', 'polyester nhẹ'],
  winter: ['wool', 'fleece', 'dạ', 'nỉ', 'lông cừu', 'len', 'dày', 'ấm'],
  spring: ['cotton', 'linen', 'rayon', 'vải nhẹ'],
  fall:   ['cotton', 'denim', 'jean', 'kaki', 'vải dày'],
};

const SEASON_CATEGORIES = {
  summer: { prefer: ['t-shirt', 'polo', 'shorts', 'dress'], avoid: ['jacket', 'blazer'] },
  winter: { prefer: ['jacket', 'blazer', 'cardigan', 'hoodie'], avoid: ['shorts'] },
  spring: { prefer: ['shirt', 'polo', 't-shirt', 'chinos'], avoid: [] },
  fall:   { prefer: ['shirt', 'jacket', 'jeans', 'chinos', 'blazer'], avoid: ['shorts'] },
};

// ──────────────────────────────────────────────
// Style-Brand Mapping
// ──────────────────────────────────────────────

const STYLE_BRAND_AFFINITY = {
  minimalist: { Uniqlo: 1.0, Routine: 0.7, Coolmate: 0.6, Torano: 0.6, Teelab: 0.5 },
  basic:      { Uniqlo: 0.9, Coolmate: 0.9, Routine: 0.6, Torano: 0.6, Teelab: 0.6 },
  casual:     { Coolmate: 0.8, Uniqlo: 0.8, Routine: 0.7, Teelab: 0.7, Torano: 0.6, "Biti's": 0.7 },
  formal:     { Routine: 1.0, Aristino: 1.0, Torano: 0.8, Uniqlo: 0.5, Coolmate: 0.3 },
  streetwear: { 'Dirty Coins': 1.0, Davies: 1.0, Teelab: 0.8, Routine: 0.7, Coolmate: 0.5, Uniqlo: 0.4 },
  sporty:     { Coolmate: 1.0, "Biti's": 0.8, Uniqlo: 0.6, Routine: 0.3 },
  korean:     { Routine: 0.9, Teelab: 0.7, Uniqlo: 0.6, Coolmate: 0.4 },
  japanese:   { Uniqlo: 1.0, Routine: 0.5, Coolmate: 0.4 },
  vintage:    { Routine: 0.7, Davies: 0.6, Uniqlo: 0.5, Coolmate: 0.3 },
};

// ──────────────────────────────────────────────
// Scoring Weights
// ──────────────────────────────────────────────

const WEIGHTS = {
  budget:   0.25,
  category: 0.20,
  style:    0.20,
  gender:   0.15,
  season:   0.10,
  brand:    0.05,
  color:    0.05,
};

// ──────────────────────────────────────────────
// Score Calculation
// ──────────────────────────────────────────────

/**
 * Calculate a match score for a product given criteria
 * @param {Object} product - product from DB
 * @param {Object} criteria - parsed user request
 * @returns {number} score 0-1
 */
function scoreProduct(product, criteria) {
  let totalScore = 0;

  // 1. Budget score
  if (criteria.itemBudget) {
    // Per-item range from the stylist: land inside it, not as far below it as possible
    const { min, max } = criteria.itemBudget;
    if (product.price >= min * 0.8 && product.price <= max) totalScore += WEIGHTS.budget * 1.0;
    else if (product.price < min * 0.8) totalScore += WEIGHTS.budget * 0.6;
    else if (product.price <= max * BUDGET_TOLERANCE) totalScore += WEIGHTS.budget * 0.6;
    else totalScore += 0;
  } else if (criteria.budget) {
    const ratio = product.price / criteria.budget;
    if (ratio <= 0.5) totalScore += WEIGHTS.budget * 0.7; // Too cheap might be low quality
    else if (ratio <= 0.8) totalScore += WEIGHTS.budget * 1.0; // Sweet spot
    else if (ratio <= 1.0) totalScore += WEIGHTS.budget * 0.9;
    else if (ratio <= 1.2) totalScore += WEIGHTS.budget * 0.4; // Slightly over
    else totalScore += WEIGHTS.budget * 0; // Over budget
  } else {
    totalScore += WEIGHTS.budget * 0.5; // No budget = neutral
  }

  // 2. Category score (exact match by item type needed)
  if (criteria.targetCategory) {
    if (product.category === criteria.targetCategory) {
      totalScore += WEIGHTS.category * 1.0;
    } else {
      totalScore += 0; // Wrong category = 0
    }
  } else {
    totalScore += WEIGHTS.category * 0.5;
  }

  // 3. Style score (tag intersection)
  if (criteria.style) {
    const styleTag = criteria.style.toLowerCase();
    const productTags = (product.tags || []).map(t => t.toLowerCase());

    if (productTags.includes(styleTag)) {
      totalScore += WEIGHTS.style * 1.0;
    } else {
      // Partial match: check if any tag is related
      const relatedStyles = {
        casual: ['basic', 'comfortable', 'cotton'],
        formal: ['công sở', 'office', 'slim-fit', 'lịch sự'],
        minimalist: ['basic', 'clean', 'simple', 'trơn'],
        streetwear: ['oversize', 'urban', 'hip-hop'],
        sporty: ['sport', 'active', 'gym', 'running'],
        korean: ['slim-fit', 'oversized', 'minimalist'],
        japanese: ['basic', 'minimalist', 'clean'],
        vintage: ['retro', 'classic', 'old-school'],
      };

      const related = relatedStyles[styleTag] || [];
      const hasRelated = productTags.some(t => related.includes(t));
      totalScore += WEIGHTS.style * (hasRelated ? 0.5 : 0.1);
    }
  } else {
    totalScore += WEIGHTS.style * 0.5;
  }

  // 4. Gender score
  if (criteria.gender) {
    if (product.gender === criteria.gender) totalScore += WEIGHTS.gender * 1.0;
    else if (product.gender === 'unisex') totalScore += WEIGHTS.gender * 0.7;
    else totalScore += 0;
  } else {
    totalScore += WEIGHTS.gender * 0.5;
  }

  // 5. Season score
  if (criteria.season) {
    const seasonMats = SEASON_MATERIALS[criteria.season] || [];
    const seasonCats = SEASON_CATEGORIES[criteria.season] || {};
    const material = (product.material || '').toLowerCase();
    const hasMaterial = seasonMats.some(m => material.includes(m));
    const isPreferred = seasonCats.prefer?.includes(product.subcategory);
    const isAvoided = seasonCats.avoid?.includes(product.subcategory);

    if (isAvoided) totalScore += 0;
    else if (hasMaterial && isPreferred) totalScore += WEIGHTS.season * 1.0;
    else if (isPreferred) totalScore += WEIGHTS.season * 0.7;
    else if (hasMaterial) totalScore += WEIGHTS.season * 0.6;
    else totalScore += WEIGHTS.season * 0.3;
  } else {
    totalScore += WEIGHTS.season * 0.5;
  }

  // 6. Brand affinity score
  if (criteria.style) {
    const affinity = STYLE_BRAND_AFFINITY[criteria.style.toLowerCase()];
    if (affinity && affinity[product.brand]) {
      totalScore += WEIGHTS.brand * affinity[product.brand];
    } else {
      totalScore += WEIGHTS.brand * 0.5;
    }
  } else {
    totalScore += WEIGHTS.brand * 0.5;
  }

  // 7. Color harmony score
  if (criteria.preferredColors && criteria.preferredColors.length > 0) {
    const productColors = (product.colors || []).map(c => c.toLowerCase());
    const hasMatch = criteria.preferredColors.some(c =>
      productColors.includes(c.toLowerCase())
    );
    totalScore += WEIGHTS.color * (hasMatch ? 1.0 : 0.3);
  } else {
    totalScore += WEIGHTS.color * 0.5;
  }

  return totalScore;
}

// ──────────────────────────────────────────────
// Outfit Composition
// ──────────────────────────────────────────────

/**
 * Build a complete outfit from scored products
 * @param {Object} criteria - user request criteria
 * @returns {Object} outfit with items
 */
export function buildOutfit(criteria) {
  const slots = [
    { category: 'top', required: true },
    { category: 'bottom', required: true },
    { category: 'shoes', required: true },
    { category: 'outerwear', required: false },
    { category: 'accessory', required: false },
  ];

  const outfit = [];
  const usedBrands = new Set();
  const itemBudgets = allocateBudget(criteria.budget, slots);

  for (const slot of slots) {
    const itemCriteria = {
      ...criteria,
      targetCategory: slot.category,
      budget: itemBudgets[slot.category] || null,
    };

    // Get all products for this category, score them
    const categoryProducts = queryProducts({
      category: slot.category,
      gender: criteria.gender,
      inStock: true,
    });

    if (categoryProducts.length === 0 && slot.required) continue;
    if (categoryProducts.length === 0 && !slot.required) continue;

    // Score and sort
    const scored = categoryProducts
      .map(p => ({ ...p, _score: scoreProduct(p, itemCriteria) }))
      .sort((a, b) => b._score - a._score);

    // Pick the best that's from a different brand (variety)
    let picked = null;
    for (const candidate of scored) {
      if (!usedBrands.has(candidate.brand) || usedBrands.size >= 3) {
        picked = candidate;
        break;
      }
    }

    // Fallback: just pick the best regardless
    if (!picked && scored.length > 0) {
      picked = scored[0];
    }

    if (picked) {
      usedBrands.add(picked.brand);
      outfit.push({
        ...picked,
        _slotCategory: slot.category,
        _required: slot.required,
      });
    }
  }

  return outfit;
}

/**
 * Allocate budget across item categories
 */
function allocateBudget(totalBudget, slots) {
  if (!totalBudget) return {};

  // Budget allocation ratios
  const ratios = {
    top: 0.25,
    bottom: 0.30,
    shoes: 0.30,
    outerwear: 0.10,
    accessory: 0.05,
  };

  const budgets = {};
  for (const slot of slots) {
    budgets[slot.category] = Math.round(totalBudget * (ratios[slot.category] || 0.1));
  }
  return budgets;
}

function removeAccents(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

// How far over an item's budget a product may go and still count as "in range"
export const BUDGET_TOLERANCE = 1.2;

/**
 * Find matching products for a specific search query using the rule engine
 * @param {string} query - search query (from AI)
 * @param {Object} [context] - optional context (budget, gender, style, etc.)
 * @param {{min: number, max: number}} [context.itemBudget] - price range for this one item
 * @returns {Array} top matching products (overBudget: true when nothing fit the item budget)
 */
export function searchByRules(query, context = {}) {
  if (!query || typeof query !== 'string') return [];

  const allProds = getAllProducts();
  if (allProds.length === 0) return [];

  const cleanQ = query.toLowerCase();
  const normalizedQ = removeAccents(cleanQ);

  // Infer target category and subcategory from query with diacritic-agnostic regex
  let targetCategory = null;
  let targetSubcategory = null;

  // Shoes first: "giày da oxford" must not be caught by the oxford-shirt rule below.
  // ("dép" alone is not used: without accents it collides with "đẹp")
  if (/\bgiay\b|sneaker|loafer|sandal|\bslides?|\bdep (le|quai|lao|bet)\b|\bguoc\b/.test(normalizedQ)) {
    targetCategory = 'shoes';
    if (/sneaker|giay the thao/.test(normalizedQ)) targetSubcategory = 'sneaker';
    else if (/mary jane|bup be|\bflats?\b|ballet/.test(normalizedQ)) targetSubcategory = 'flat';
    else if (/cao got|\bguoc\b|\bheels?\b/.test(normalizedQ)) targetSubcategory = 'heels';
    else if (/giay tay|derby|oxford|loafer|giay da|giay luoi/.test(normalizedQ)) targetSubcategory = 'oxford';
    else if (/sandal|\bslides?\b|\bdep\b/.test(normalizedQ)) targetSubcategory = 'sandal';
  } else if (/ao polo|polo/.test(normalizedQ)) {
    targetCategory = 'top';
    targetSubcategory = 'polo';
  } else if (/ao so mi|so mi|shirt|oxford/.test(normalizedQ)) {
    targetCategory = 'top';
    targetSubcategory = 'shirt';
  } else if (/ao thun|t-shirt|tee|ao phong/.test(normalizedQ)) {
    targetCategory = 'top';
    targetSubcategory = 't-shirt';
  } else if (/ao khoac|jacket|hoodie|blazer|bomber|cardigan/.test(normalizedQ)) {
    targetCategory = 'outerwear';
    if (/blazer/.test(normalizedQ)) targetSubcategory = 'blazer';
  } else if (/quan jean|jeans|quan bo|denim/.test(normalizedQ)) {
    targetCategory = 'bottom';
    targetSubcategory = 'jeans';
  } else if (/quan short|quan dui|shorts/.test(normalizedQ)) {
    targetCategory = 'bottom';
    targetSubcategory = 'shorts';
  } else if (/quan chino|kaki/.test(normalizedQ)) {
    targetCategory = 'bottom';
    targetSubcategory = 'chinos';
  } else if (/quan au|quan tay|quan vai|trousers/.test(normalizedQ)) {
    targetCategory = 'bottom';
    targetSubcategory = 'trousers';
  } else if (/quan/.test(normalizedQ)) {
    targetCategory = 'bottom';
  } else if (/sneaker|giay the thao/.test(normalizedQ)) {
    targetCategory = 'shoes';
    targetSubcategory = 'sneaker';
  } else if (/giay tay|derby|oxford|loafer|giay da/.test(normalizedQ)) {
    targetCategory = 'shoes';
    targetSubcategory = 'oxford';
  } else if (/giay/.test(normalizedQ)) {
    targetCategory = 'shoes';
  } else if (/vay|dam|dress|chan vay/.test(normalizedQ)) {
    targetCategory = 'dress';
  } else if (/that lung|day lung|belt|\bvi\b|\btui\b|balo|\bmu\b|\bnon\b|kinh|ca vat|\bkhan\b|dong ho|\btat\b|\bvo\b/.test(normalizedQ)) {
    targetCategory = 'accessory';
  } else if (/ao/.test(normalizedQ)) {
    targetCategory = 'top';
  }

  // Fall back to the stylist's own item type when the query names nothing we recognize
  // ("Chóo (ear cuff)" must not search the whole catalog and return a tank top)
  if (!targetCategory && ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory'].includes(context.itemType)) {
    targetCategory = context.itemType;
  }

  const itemMax = context.itemBudget?.max || null;
  const criteria = {
    // Score against the item's own budget when known; the total outfit budget is far too lax per item
    budget: itemMax || context.budget || null,
    itemBudget: context.itemBudget?.max ? context.itemBudget : null,
    gender: context.gender || null,
    style: context.style || null,
    season: context.season || null,
    targetCategory,
    targetSubcategory,
    preferredColors: context.preferredColors || [],
  };

  // Filter first by category strictly
  let candidates = allProds;
  if (targetCategory) {
    candidates = candidates.filter(p => p.category === targetCategory);
  }
  // Close substitutes, used when nothing of the exact subcategory fits the budget.
  // Only near-equivalents: shorts are no answer for "quần kaki", nor a sneaker for "giày da oxford"
  const SUBCATEGORY_SUBSTITUTES = {
    chinos: ['trousers', 'pants'],
    trousers: ['chinos', 'pants'],
    pants: ['chinos', 'trousers', 'jogger'],
    jogger: ['pants'],
    jeans: ['pants'],
    shirt: ['top'],
    't-shirt': ['top'],
    polo: ['t-shirt'],
  };

  // Narrow by what the product actually is, from its name, where category alone is too broad
  // (before the substitute pool is built, so the fallback can't reintroduce socks for "kính mắt")
  const nameOf = p => removeAccents(p.name);
  if (targetCategory === 'accessory') {
    // "kính mắt" must not return socks or bags: match the accessory type, or return nothing
    // so live marketplace search can find it
    // Matched WITH diacritics: stripped, "mũ" (hat) and "Túi Mù" (blind bag) look the same.
    // Accent-free patterns are only a fallback for unaccented queries.
    const W = '(^|[^\\p{L}])';
    const E = '([^\\p{L}]|$)';
    const ACCESSORY_TYPES = [
      [`kính|glasses|sunglass`, `kinh|glasses`],
      [`${W}túi${E}|${W}bag${E}|pouch`, `\\btui\\b|\\bbag\\b|pouch`],
      [`balo|backpack`, `balo|backpack`],
      [`${W}(mũ|nón)${E}|${W}(hat|cap|bucket)${E}`, `\\b(mu|non|hat|cap|bucket)\\b`],
      [`thắt lưng|dây lưng|belt`, `that lung|day lung|belt`],
      [`${W}ví${E}|wallet`, `\\bvi\\b|wallet`],
      [`${W}(tất|vớ)${E}|socks?`, `\\b(tat|vo)\\b|socks?`],
      [`khăn|scarf`, `\\bkhan\\b|scarf`],
      [`cà vạt|${W}tie${E}`, `ca vat|\\btie\\b`],
      [`đồng hồ|watch`, `dong ho|watch`],
      [`khuyên tai|bông tai|hoa tai|${W}khuyên${E}|${W}chóo${E}|ear ?cuff|earring|vòng|lắc|nhẫn|dây chuyền|trang sức`,
        `khuyen tai|bong tai|hoa tai|\\bchoo\\b|ear ?cuff|earring|\\bvong\\b|\\bnhan\\b|day chuyen|trang suc`],
    ];
    const hasAccents = cleanQ !== normalizedQ;
    const accented = s => s.normalize('NFC').toLowerCase();
    let knownType = false;
    for (const [withAccents, withoutAccents] of ACCESSORY_TYPES) {
      const re = hasAccents ? new RegExp(withAccents, 'u') : new RegExp(withoutAccents);
      const textOf = hasAccents ? p => accented(p.name) : nameOf;
      if (re.test(hasAccents ? accented(cleanQ) : normalizedQ)) {
        candidates = candidates.filter(p => re.test(textOf(p)));
        knownType = true;
        break;
      }
    }
    // An accessory we can't identify: guessing (a pouch for earrings) is worse than live search
    if (!knownType) candidates = [];
  } else if (targetCategory === 'bottom' && targetSubcategory !== 'shorts' && !/short|\bdui\b|\bngan\b/.test(normalizedQ)) {
    // Long trousers asked for: shorts and leggings are wrong answers
    const longOnly = candidates.filter(p => p.subcategory !== 'shorts' && !/short|legging/.test(nameOf(p)));
    if (longOnly.length > 0) candidates = longOnly;
  } else if (targetCategory === 'dress') {
    // The dress category holds both skirts (chân váy) and dresses (đầm)
    const isSkirt = p => /chan vay|skirt/.test(nameOf(p));
    const wantsSkirt = /chan vay|skirt/.test(normalizedQ);
    const matching = candidates.filter(p => isSkirt(p) === wantsSkirt);
    if (matching.length > 0) candidates = matching;
  }

  let categoryPool = targetSubcategory
    ? candidates.filter(p => (SUBCATEGORY_SUBSTITUTES[targetSubcategory] || []).includes(p.subcategory))
    : candidates;

  // If subcategory is identified, prioritize subcategory matches
  if (targetSubcategory) {
    const subMatches = candidates.filter(p => p.subcategory === targetSubcategory);
    if (subMatches.length > 0) {
      candidates = subMatches;
    } else if (targetCategory === 'shoes') {
      // Scraped shops barely sell shoes of every type; return nothing
      // and let live marketplace search find the right type
      candidates = [];
    }
  }

  // Filter by gender if specified
  if (context.gender && (context.gender === 'male' || context.gender === 'female')) {
    // Products tagged for the other gender are never a fallback (men's oxfords for "giày oxford nữ");
    // nothing left means live marketplace search takes over
    const byGender = list => list.filter(p => p.gender === context.gender || p.gender === 'unisex');
    candidates = byGender(candidates);
    categoryPool = byGender(categoryPool);
  }

  // Price range before keywords: an affordable plain shirt beats a matching-but-3x-price one.
  // Order: exact type in budget → same category in budget (any trousers when no chino fits)
  // → cheapest of the exact type, flagged overBudget
  if (itemMax) {
    const fits = p => p.price <= itemMax * BUDGET_TOLERANCE;
    const affordable = candidates.filter(fits);
    const affordableInCategory = categoryPool.filter(fits);
    if (affordable.length > 0) {
      candidates = affordable;
    } else if (affordableInCategory.length > 0) {
      candidates = affordableInCategory;
    } else {
      candidates = [...candidates].sort((a, b) => a.price - b.price).slice(0, 20);
    }
  }

  // Relevance: how many of the query's descriptive words — and word pairs like "đeo chéo",
  // "ống rộng", "kẻ sọc" — the product mentions as whole words. Pairs count double.
  const stopWords = new Set(['cho', 'nam', 'nu', 'dep', 're', 'cung', 'cac', 'mot', 'set', 'do', 'hang', 'ngay', 'ao', 'quan', 'mau', 'form', 'va', 'co', 'phong', 'cach']);
  const tokens = normalizedQ.split(/[^a-z0-9]+/).filter(Boolean);
  const words = [...new Set(tokens.filter(w => w.length >= 2 && !stopWords.has(w)))];
  const pairs = [...new Set(tokens.slice(1).map((w, i) => `${tokens[i]} ${w}`)
    .filter(pair => pair.split(' ').some(w => w.length >= 2 && !stopWords.has(w))))];
  const relevance = p => {
    const text = ` ${removeAccents(`${p.name} ${(p.tags || []).join(' ')}`).replace(/[^a-z0-9]+/g, ' ')} `;
    return words.filter(w => text.includes(` ${w} `)).length
      + 2 * pairs.filter(pair => text.includes(` ${pair} `)).length;
  };

  // Score and sort (relevance dominates; scoreProduct is 0-1 and breaks ties), keeping one color
  // of each model: shops list "Giày X Màu Đen" / "Giày X Màu Kem" as separate products,
  // which would otherwise fill all three slots with the same shoe
  const modelKey = p => `${p.brand}|${p.name.toLowerCase().replace(/\s+màu\s.*$/u, '').replace(/\s+[a-z0-9]{6,}$/, '')}`;
  const seenModels = new Set();
  const scored = candidates
    .map(p => ({ ...p, _score: relevance(p) + scoreProduct(p, criteria) }))
    .sort((a, b) => b._score - a._score)
    .filter(p => {
      const key = modelKey(p);
      if (seenModels.has(key)) return false;
      seenModels.add(key);
      return true;
    });

  // Return top results, ensure variety in brands strictly within same category
  const results = [];
  const seenBrands = new Set();

  for (const p of scored) {
    if (results.length >= 3) break;

    // Try to get at least one from each brand, but ONLY within the same category
    if (seenBrands.has(p.brand) && results.length < 3 && scored.length > 3) {
      const unseenBrand = scored.find(
        s => !seenBrands.has(s.brand) && !results.includes(s) && (!targetCategory || s.category === targetCategory)
      );
      // Variety only among near-equals: a less relevant product shouldn't win just for its brand
      if (unseenBrand && unseenBrand._score >= p._score * 0.75) {
        results.push(unseenBrand);
        seenBrands.add(unseenBrand.brand);
        continue;
      }
    }

    results.push(p);
    seenBrands.add(p.brand);
  }

  // Format results to match existing product format
  return results.map(p => ({
    name: p.name,
    price: `${p.price.toLocaleString('vi-VN')} ₫`,
    priceValue: p.price,
    image: p.images?.[0] || null,
    url: p.url,
    brand: p.brand,
    source: p.brand,
    icon: getBrandIcon(p.brand),
    color: getBrandColor(p.brand),
    isSpecific: true,
    overBudget: !!itemMax && p.price > itemMax * BUDGET_TOLERANCE,
    _score: p._score,
  }));
}

/**
 * Get colors that harmonize with a given color
 */
export function getHarmoniousColors(color) {
  return COLOR_HARMONY[color.toLowerCase()] || [];
}

function getBrandIcon(brand) {
  const icons = {
    Uniqlo: '🏪',
    Routine: '👔',
    Coolmate: '🌟',
  };
  return icons[brand] || '🛍️';
}

function getBrandColor(brand) {
  const colors = {
    Uniqlo: '#E60012',
    Routine: '#0F146D',
    Coolmate: '#0052CC',
  };
  return colors[brand] || '#333333';
}
