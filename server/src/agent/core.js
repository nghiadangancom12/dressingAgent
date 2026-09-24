import { client, MODEL, VISION_MODEL } from '../config/env.js';
import { searchProducts } from './tools/webSearch.js';
import { BUDGET_TOLERANCE } from './tools/catalogSearch.js';
import { generateOutfitImages } from './tools/imageGen.js';
import {
  PARSE_SYSTEM_PROMPT,
  OUTFIT_SYSTEM_PROMPT,
  VISION_OUTFIT_PROMPT,
  CHAT_SYSTEM_PROMPT,
} from './prompts/searchPrompt.js';

// ──────────────────────────────────────────────
// Core functions
// ──────────────────────────────────────────────

/**
 * Robust JSON parser that handles code fences and repaired truncated JSON
 */
function cleanAndParseJson(str) {
  if (!str) throw new Error('Dữ liệu JSON rỗng');
  let cleaned = str.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    try {
      const lastBrace = cleaned.lastIndexOf('}');
      if (lastBrace !== -1) {
        let sub = cleaned.slice(0, lastBrace + 1);
        const openBraces = (sub.match(/\{/g) || []).length;
        const closeBraces = (sub.match(/\}/g) || []).length;
        const openBrackets = (sub.match(/\[/g) || []).length;
        const closeBrackets = (sub.match(/\]/g) || []).length;
        for (let i = 0; i < openBrackets - closeBrackets; i++) sub += ']';
        for (let i = 0; i < openBraces - closeBraces; i++) sub += '}';
        return JSON.parse(sub);
      }
    } catch {
      // ignore fallback error
    }
    throw err;
  }
}

/**
 * Fill gaps in the parsed request from the saved profile (the message wins when it says otherwise),
 * so size suggestions and image generation use the user's real measurements
 */
/**
 * Rule-based gender from text, for when the parse model returns null
 * (it missed "set đồ nữ", which made the whole outfit and lookbook male).
 * Skirts and dresses count as female.
 * @returns {'male'|'female'|null}
 */
function detectGender(text) {
  const t = (text || '').normalize('NFC').toLowerCase();
  const female = /(^|[^\p{L}])(nữ|con gái|phụ nữ|bạn gái|women|female)([^\p{L}]|$)/u.test(t) || /váy|đầm/u.test(t);
  const male = /(^|[^\p{L}])(nam|con trai|đàn ông|bạn trai|men|male)([^\p{L}]|$)/u.test(t);
  if (female && !male) return 'female';
  if (male && !female) return 'male';
  return null;
}

function outfitItemNames(outfitData) {
  return (outfitData?.outfits || []).flatMap(o => (o.items || []).map(i => i.name)).join(' ');
}

function applyProfile(parsedRequest, profile) {
  if (!profile) return parsedRequest;
  return {
    ...parsedRequest,
    height: parsedRequest.height || profile.height || null,
    weight: parsedRequest.weight || profile.weight || null,
    gender: parsedRequest.gender || profile.gender || null,
  };
}

/**
 * Parse user's natural language request into structured data
 */
async function parseUserRequest(message) {
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: PARSE_SYSTEM_PROMPT },
        { role: 'user', content: message }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    return cleanAndParseJson(content);
  } catch (error) {
    console.error('Parse error:', error);
    return { is_fashion_request: true };
  }
}

/**
 * Generate outfit suggestions based on parsed request
 */
async function generateOutfitSuggestions(parsedRequest) {
  const userInfo = `
Thông tin người dùng:
- Ngân sách: ${parsedRequest.budget ? parsedRequest.budget.toLocaleString('vi-VN') + ' VND' : 'Không giới hạn'}
- Phong cách: ${parsedRequest.style || 'Tùy ý'}
- Giới tính: ${parsedRequest.gender === 'male' ? 'Nam' : parsedRequest.gender === 'female' ? 'Nữ' : 'Không xác định'}
- Chiều cao: ${parsedRequest.height ? parsedRequest.height + ' cm' : 'Không rõ'}
- Cân nặng: ${parsedRequest.weight ? parsedRequest.weight + ' kg' : 'Không rõ'}
- Dịp mặc: ${parsedRequest.occasion || 'Hàng ngày'}
- Mùa: ${parsedRequest.season || 'Không xác định'}
- Yêu cầu khác: ${parsedRequest.preferences || 'Không'}
  `.trim();

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: OUTFIT_SYSTEM_PROMPT },
        { role: 'user', content: userInfo }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    return cleanAndParseJson(content);
  } catch (error) {
    console.error('Outfit generation error:', error);
    throw new Error('Không thể tạo gợi ý outfit');
  }
}

/**
 * Analyze clothing image and generate outfit suggestions using Qwen Vision
 */
export async function analyzeOutfitImage(imageBase64, mimeType, userMessage, parsedRequest) {
  try {
    const userContext = parsedRequest ? `
Thông tin người dùng:
- Ngân sách: ${parsedRequest.budget ? parsedRequest.budget.toLocaleString('vi-VN') + ' VND' : 'Không giới hạn'}
- Phong cách: ${parsedRequest.style || 'Tùy ý'}
- Giới tính: ${parsedRequest.gender === 'male' ? 'Nam' : parsedRequest.gender === 'female' ? 'Nữ' : 'Không xác định'}
- Chiều cao: ${parsedRequest.height ? parsedRequest.height + ' cm' : 'Không rõ'}
- Cân nặng: ${parsedRequest.weight ? parsedRequest.weight + ' kg' : 'Không rõ'}
- Yêu cầu: ${userMessage || 'Gợi ý đồ phối thêm'}
    `.trim() : `Yêu cầu người dùng: ${userMessage || 'Gợi ý đồ phối thêm với món đồ trong ảnh'}`;

    const response = await client.chat.completions.create({
      model: VISION_MODEL,
      messages: [
        { role: 'system', content: VISION_OUTFIT_PROMPT },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
              },
            },
            {
              type: 'text',
              text: userContext,
            },
          ],
        },
      ],
      temperature: 0.7,
      max_tokens: 3500,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    return cleanAndParseJson(content);
  } catch (error) {
    console.error('Vision analysis error:', error);
    throw new Error('Không thể phân tích ảnh outfit: ' + error.message);
  }
}

/**
 * Parse the AI's per-item budget ("250000-300000", "250k-300k", "1,5tr") into VND
 * @returns {{min: number, max: number}|null}
 */
export function parseBudgetRange(range) {
  if (range == null) return null;
  const tokens = String(range).toLowerCase().match(/\d[\d.,]*\s*(k|tr|triệu)?/g) || [];
  const values = tokens
    .map(token => {
      const unit = token.match(/(k|tr|triệu)$/)?.[1];
      // "1.500.000" / "1,500,000" are thousand separators; "1,5tr" is a decimal
      const number = parseFloat(token.replace(/[.,](?=\d{3}(\D|$))/g, '').replace(',', '.'));
      return unit === 'k' ? number * 1000 : unit ? number * 1000000 : number;
    })
    .filter(value => value >= 10000);
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

/**
 * Search for real products for each outfit item
 */
async function searchForProducts(outfitData, parsedRequest = {}) {
  const enrichedOutfits = [];

  // Build search context from parsed request for rule engine
  const searchContext = {
    budget: parsedRequest.budget || null,
    gender: parsedRequest.gender || null,
    style: parsedRequest.style || null,
    season: parsedRequest.season || null,
  };

  for (const outfit of outfitData.outfits) {
    const enrichedItems = [];

    for (const item of outfit.items) {
      // Skip searching for existing items (uploaded image clothing)
      if (item.is_existing) {
        enrichedItems.push({ ...item, products: [] });
        continue;
      }

      const searchQuery = item.search_query_vi || item.search_query || item.name;
      const itemBudget = parseBudgetRange(item.budget_range);
      const products = await searchProducts(searchQuery, { ...searchContext, itemBudget, itemType: item.type });

      // Flag live-marketplace results too, and list in-budget products first (stable order otherwise)
      const flagged = products.map(p => ({
        ...p,
        overBudget: !!itemBudget && p.priceValue != null && p.priceValue > itemBudget.max * BUDGET_TOLERANCE,
      }));
      flagged.sort((a, b) => a.overBudget - b.overBudget);

      enrichedItems.push({
        ...item,
        products: flagged.slice(0, 3), // Top 3 results per item
      });
    }

    enrichedOutfits.push({
      ...outfit,
      items: enrichedItems,
    });
  }

  return {
    ...outfitData,
    outfits: enrichedOutfits,
  };
}

/**
 * Generate a friendly chat response with outfit presentation
 */
async function generateChatResponse(message, parsedRequest, outfitData, history, hasImage) {
  const outfitSummary = outfitData.outfits.map((outfit, i) => {
    const itemsList = outfit.items.map(item => {
      if (item.is_existing) {
        return `• [ĐỒ ĐÃ CÓ] ${item.name}: ${item.description}`;
      }
      const productLinks = item.products && item.products.length > 0
        ? item.products.map(p => `  - ${p.name} (${p.price}) [${p.source}]: ${p.url}`).join('\n')
        : '  - Đang cập nhật sản phẩm cụ thể';
      return `• ${item.name}: ${item.description}\n  Tầm giá: ${item.budget_range} VND\n${productLinks}`;
    }).join('\n');

    return `
**Outfit ${i + 1}: ${outfit.name}**
${outfit.description}
Tags: ${outfit.style_tags.join(', ')}

${itemsList}

💰 Tổng ước tính: ${outfit.total_estimated?.toLocaleString('vi-VN')} VND
💡 ${outfit.styling_tips}
`;
  }).join('\n---\n');

  const sizeInfo = outfitData.size_suggestion
    ? `Size gợi ý - Áo: ${outfitData.size_suggestion.top}, Quần: ${outfitData.size_suggestion.bottom}, Giày: ${outfitData.size_suggestion.shoe}`
    : '';

  const analyzedItemInfo = outfitData.analyzed_item
    ? `\nMón đồ đã phân tích: ${outfitData.analyzed_item.description} (${outfitData.analyzed_item.color}, ${outfitData.analyzed_item.style})`
    : '';

  const contextMessage = `
${hasImage ? 'Người dùng đã upload ảnh quần áo và hỏi:' : 'Người dùng hỏi:'} "${message}"
${analyzedItemInfo}

Thông tin người dùng:
${JSON.stringify(parsedRequest, null, 2)}

${sizeInfo}

Tóm tắt các outfit đã được tạo:
${outfitSummary}

HƯỚNG DẪN TRẢ LỜI:
1. Bạn là Stylist thời trang AI chuyên nghiệp, tự nhiên và thân thiện.
2. Trả lời bằng tiếng Việt gần gũi, giới thiệu tổng quan ý tưởng phối đồ và giải thích lý do set đồ này tôn dáng, hợp dịp cho người dùng.
3. Nhắc đến size gợi ý (áo, quần, giày) và chia sẻ 2-3 mẹo mix&match thông minh.
4. TUYỆT ĐỐI KHÔNG vẽ bảng markdown (| Cột 1 | Cột 2 |) và KHÔNG liệt kê lại toàn bộ danh sách từng món đồ thành bảng văn bản (vì bên dưới tin nhắn này, hệ thống giao diện sẽ tự động hiển thị các thẻ Outfit Card trực quan kèm ảnh và nút link đến từng sản phẩm cụ thể).
5. Sử dụng emoji tinh tế để câu trả lời sinh động, cuốn hút.
  `.trim();

  const messages = [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    ...history.slice(-6).map(h => ({
      role: h.role,
      content: h.content
    })),
    { role: 'user', content: contextMessage }
  ];

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.8,
      max_tokens: 3000
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Chat response error:', error);
    throw new Error('Không thể tạo câu trả lời');
  }
}

/**
 * Handle non-fashion requests with a friendly redirect
 */
async function handleNonFashionChat(message, history) {
  const messages = [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    ...history.slice(-6).map(h => ({
      role: h.role,
      content: h.content
    })),
    { role: 'user', content: message }
  ];

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.8,
      max_tokens: 1000
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Non-fashion chat error:', error);
    return 'Xin lỗi, tôi gặp lỗi khi xử lý. Bạn hãy thử lại nhé! 😊';
  }
}

// ──────────────────────────────────────────────
// Main handlers
// ──────────────────────────────────────────────

export async function handleChat(message, history, profile = null) {
  console.log(`\n📩 Received: "${message}"`);

  // Step 1: Parse user request
  console.log('🔍 Parsing user request...');
  const parsedRequest = applyProfile(await parseUserRequest(message), profile);
  parsedRequest.gender = parsedRequest.gender || detectGender(message);
  console.log('📋 Parsed:', JSON.stringify(parsedRequest, null, 2));

  // If not a fashion request, handle as general chat
  if (!parsedRequest.is_fashion_request) {
    console.log('💬 Non-fashion request, handling as chat...');
    const reply = await handleNonFashionChat(message, history);
    return {
      type: 'chat',
      message: reply,
      outfits: null
    };
  }

  // Step 2: Generate outfit suggestions
  console.log('👗 Generating outfit suggestions...');
  const outfitData = await generateOutfitSuggestions(parsedRequest);
  console.log(`✅ Generated ${outfitData.outfits?.length || 0} outfits`);
  // Last resort: the suggested items themselves (a skirt means a women's outfit)
  parsedRequest.gender = parsedRequest.gender || detectGender(outfitItemNames(outfitData));

  // Step 3: Search for real products
  console.log('🔎 Searching for products...');
  const enrichedOutfitData = await searchForProducts(outfitData, parsedRequest);

  // Step 4: Generate outfit images (async, non-blocking for chat response)
  console.log('🎨 Generating outfit images...');
  const outfitsWithImages = await generateOutfitImages(
    enrichedOutfitData.outfits,
    parsedRequest.gender || 'male',
    { person: { ...profile, height: parsedRequest.height, weight: parsedRequest.weight, gender: parsedRequest.gender } }
  );

  // Step 5: Generate friendly response
  console.log('💬 Generating response...');
  const chatMessage = await generateChatResponse(message, parsedRequest, enrichedOutfitData, history, false);

  return {
    type: 'outfit',
    message: chatMessage,
    outfits: outfitsWithImages,
    size_suggestion: enrichedOutfitData.size_suggestion,
    parsed_request: parsedRequest
  };
}

export async function handleChatWithImage(message, history, imageBase64, mimeType, profile = null) {
  console.log(`\n📸 Image upload + message: "${message}"`);

  // Step 1: Parse user context from message
  const parsedRequest = applyProfile(
    message ? await parseUserRequest(message) : { is_fashion_request: true },
    profile
  );
  parsedRequest.gender = parsedRequest.gender || detectGender(message);

  // Step 2: Analyze image with Vision model
  console.log('🔍 Analyzing outfit image...');
  const outfitData = await analyzeOutfitImage(imageBase64, mimeType, message, parsedRequest);
  console.log(`✅ Vision analysis done. Outfits: ${outfitData.outfits?.length || 0}`);
  parsedRequest.gender = parsedRequest.gender
    || detectGender(`${outfitData.analyzed_item?.description || ''} ${outfitItemNames(outfitData)}`);

  // Ensure analyzed item is present in each outfit with is_existing: true
  if (outfitData.analyzed_item && Array.isArray(outfitData.outfits)) {
    for (const outfit of outfitData.outfits) {
      if (Array.isArray(outfit.items)) {
        const hasExisting = outfit.items.some(it => it.is_existing);
        if (!hasExisting) {
          outfit.items.unshift({
            type: outfitData.analyzed_item.type || 'top',
            name: outfitData.analyzed_item.description || 'Món đồ trong ảnh',
            description: [outfitData.analyzed_item.color, outfitData.analyzed_item.style].filter(Boolean).join(' · ') || 'Đồ bạn đang có',
            budget_range: '0 (đã có)',
            is_existing: true,
          });
        }
      }
    }
  }

  // Step 3: Search for products for items that need to be bought
  console.log('🔎 Searching for products...');
  const enrichedOutfitData = await searchForProducts(outfitData, parsedRequest);

  // Step 4: Generate outfit images (uploaded photo + product photos as references)
  console.log('🎨 Generating outfit images...');
  const outfitsWithImages = await generateOutfitImages(
    enrichedOutfitData.outfits,
    parsedRequest.gender || 'male',
    { userImage: { base64: imageBase64, mimeType }, person: { ...profile, height: parsedRequest.height, weight: parsedRequest.weight, gender: parsedRequest.gender } }
  );

  // Step 5: Generate friendly response
  console.log('💬 Generating response...');
  const chatMessage = await generateChatResponse(
    message || 'Phối đồ với món đồ trong ảnh',
    parsedRequest,
    enrichedOutfitData,
    history,
    true
  );

  return {
    type: 'outfit',
    message: chatMessage,
    outfits: outfitsWithImages,
    size_suggestion: enrichedOutfitData.size_suggestion,
    analyzed_item: enrichedOutfitData.analyzed_item,
    parsed_request: parsedRequest
  };
}
