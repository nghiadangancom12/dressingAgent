import 'dotenv/config';
import OpenAI from 'openai';

export const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: process.env.DASHSCOPE_BASE_URL,
});

export const MODEL        = process.env.AI_MODEL        || 'qwen-plus';
export const VISION_MODEL = process.env.AI_VISION_MODEL || 'qwen-vl-plus';

export const DASHSCOPE_API_KEY    = process.env.DASHSCOPE_API_KEY;
export const DASHSCOPE_BASE_URL   = process.env.DASHSCOPE_BASE_URL;
export const SERPER_API_KEY       = process.env.SERPER_API_KEY;
export const PORT                 = process.env.PORT || 3001;
