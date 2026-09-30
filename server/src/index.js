import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { PORT } from './config/env.js';
import searchRoutes, { loadProducts, reloadProducts, getStats } from './routes/searchRoutes.js';
import { runAllScrapers } from './agent/tools/scraper.js';

const app = express();

// Middleware
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true
}));
app.use(express.json({ limit: '8mb' }));

// Mount all API routes
app.use('/api', searchRoutes);

// ──────────────────────────────────────────────
// Startup: Load product database
// ──────────────────────────────────────────────

console.log('📦 Loading product database...');
loadProducts();

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
