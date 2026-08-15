// ─────────────────────────────────────────────
//  SMART MONEY AGENT — NEWS COLLECTOR
//  Fetches RSS + APIs, scores, deduplicates,
//  and stores articles in Supabase
//  Run: node collector.js
// ─────────────────────────────────────────────

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { RSS_SOURCES, PILLAR_KEYWORDS, MARKET_KEYWORDS } from './sources.js';

// ── Supabase client ──
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const rssParser = new Parser({
  headers: { 'User-Agent': 'SmartMoneyAgent/1.0' },
  timeout: 10000,
});

// ─────────────────────────────────────────────
//  UTILS
// ─────────────────────────────────────────────

function hashUrl(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

function detectMarket(text, sourceMarket) {
  const lower = text.toLowerCase();

  const hkScore = MARKET_KEYWORDS.HK.filter(kw =>
    lower.includes(kw.toLowerCase())
  ).length;

  const ukScore = MARKET_KEYWORDS.UK.filter(kw =>
    lower.includes(kw.toLowerCase())
  ).length;

  if (hkScore > 0 && ukScore === 0) return 'HK';
  if (ukScore > 0 && hkScore === 0) return 'UK';
  if (hkScore > 0 && ukScore > 0) return 'BOTH';

  // Fall back to source-level market tag
  return sourceMarket;
}

function detectPillar(text, sourcePillar) {
  const lower = text.toLowerCase();
  let bestPillar = sourcePillar;
  let bestScore = 0;

  for (const [pillar, keywords] of Object.entries(PILLAR_KEYWORDS)) {
    const score = keywords.filter(kw =>
      lower.includes(kw.toLowerCase())
    ).length;
    if (score > bestScore) {
      bestScore = score;
      bestPillar = pillar;
    }
  }

  return { pillar: bestPillar, score: bestScore };
}

function scoreRelevance(text) {
  const lower = text.toLowerCase();
  const allKeywords = Object.values(PILLAR_KEYWORDS).flat();
  const matches = allKeywords.filter(kw => lower.includes(kw.toLowerCase())).length;
  // Normalise to 0–1 (cap at 10 matches = score 1.0)
  return Math.min(matches / 10, 1.0);
}

function cleanText(text = '') {
  return text
    .replace(/<[^>]*>/g, '')   // strip HTML tags
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
    .slice(0, 1000);           // cap summary length
}

// ─────────────────────────────────────────────
//  RSS FETCHER
// ─────────────────────────────────────────────

async function fetchRSSSource(source) {
  console.log(`  📡 Fetching RSS: ${source.name}`);

  try {
    const feed = await rssParser.parseURL(source.url);
    const articles = [];

    for (const item of feed.items) {
      if (!item.link || !item.title) continue;

      const combinedText = `${item.title} ${item.contentSnippet || item.summary || ''}`;
      const relevance = scoreRelevance(combinedText);

      // Skip very low relevance articles
      if (relevance < 0.1 && source.pillar === 'general') continue;

      const { pillar } = detectPillar(combinedText, source.pillar);
      const market = detectMarket(combinedText, source.market);

      articles.push({
        source_name: source.name,
        title: item.title.trim(),
        summary: cleanText(item.contentSnippet || item.summary || ''),
        url: item.link,
        url_hash: hashUrl(item.link),
        published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        collected_at: new Date().toISOString(),
        market,
        pillar,
        relevance_score: relevance,
        status: 'pending',
        language: source.language,
      });
    }

    console.log(`    ✅ ${articles.length} articles from ${source.name}`);
    return articles;

  } catch (err) {
    console.error(`    ❌ Failed to fetch ${source.name}: ${err.message}`);
    return [];
  }
}

// ─────────────────────────────────────────────
//  NEWSAPI FETCHER
// ─────────────────────────────────────────────

async function fetchNewsAPI() {
  if (!process.env.NEWSAPI_KEY) {
    console.log('  ⚠️  NEWSAPI_KEY not set — skipping');
    return [];
  }

  console.log('  📡 Fetching NewsAPI...');
  const articles = [];

  const queries = [
    // HK queries
    { q: 'Hong Kong finance cashback MPF dividend', market: 'HK' },
    { q: 'Hong Kong side hustle passive income property', market: 'HK' },
    { q: 'Hong Kong tax savings investment', market: 'HK' },
    // UK queries
    { q: 'UK ISA cashback deals MoneySavingExpert', market: 'UK' },
    { q: 'UK side hustle passive income dividend', market: 'UK' },
    { q: 'HMRC tax savings self assessment UK', market: 'UK' },
  ];

  for (const query of queries) {
    try {
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query.q)}&language=en&sortBy=publishedAt&pageSize=10&apiKey=${process.env.NEWSAPI_KEY}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.status !== 'ok') {
        console.error(`    ❌ NewsAPI error: ${data.message}`);
        continue;
      }

      for (const item of data.articles || []) {
        if (!item.url || !item.title || item.title === '[Removed]') continue;

        const combinedText = `${item.title} ${item.description || ''}`;
        const { pillar } = detectPillar(combinedText, 'general');
        const relevance = scoreRelevance(combinedText);

        articles.push({
          source_name: `NewsAPI - ${item.source?.name || 'Unknown'}`,
          title: item.title.trim(),
          summary: cleanText(item.description || ''),
          url: item.url,
          url_hash: hashUrl(item.url),
          published_at: item.publishedAt || new Date().toISOString(),
          collected_at: new Date().toISOString(),
          market: query.market,
          pillar,
          relevance_score: relevance,
          status: 'pending',
          language: 'en',
        });
      }

      // Small delay between API calls
      await new Promise(r => setTimeout(r, 200));

    } catch (err) {
      console.error(`    ❌ NewsAPI query failed: ${err.message}`);
    }
  }

  console.log(`    ✅ ${articles.length} articles from NewsAPI`);
  return articles;
}

// ─────────────────────────────────────────────
//  GNEWS FETCHER
// ─────────────────────────────────────────────

async function fetchGNews() {
  if (!process.env.GNEWS_KEY) {
    console.log('  ⚠️  GNEWS_KEY not set — skipping');
    return [];
  }

  console.log('  📡 Fetching GNews...');
  const articles = [];

  const queries = [
    { q: 'cashback deals save money', market: 'UK', lang: 'en', country: 'gb' },
    { q: 'side hustle earn money UK', market: 'UK', lang: 'en', country: 'gb' },
    { q: 'tax savings ISA HMRC', market: 'UK', lang: 'en', country: 'gb' },
    { q: 'Hong Kong finance investment', market: 'HK', lang: 'en', country: 'hk' },
    { q: 'crypto DeFi staking income', market: 'BOTH', lang: 'en', country: 'us' },
  ];

  for (const query of queries) {
    try {
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query.q)}&lang=${query.lang}&country=${query.country}&max=10&apikey=${process.env.GNEWS_KEY}`;
      const res = await fetch(url);
      const data = await res.json();

      for (const item of data.articles || []) {
        if (!item.url || !item.title) continue;

        const combinedText = `${item.title} ${item.description || ''}`;
        const { pillar } = detectPillar(combinedText, 'general');
        const relevance = scoreRelevance(combinedText);

        articles.push({
          source_name: `GNews - ${item.source?.name || 'Unknown'}`,
          title: item.title.trim(),
          summary: cleanText(item.description || ''),
          url: item.url,
          url_hash: hashUrl(item.url),
          published_at: item.publishedAt || new Date().toISOString(),
          collected_at: new Date().toISOString(),
          market: query.market,
          pillar,
          relevance_score: relevance,
          status: 'pending',
          language: 'en',
        });
      }

      await new Promise(r => setTimeout(r, 200));

    } catch (err) {
      console.error(`    ❌ GNews query failed: ${err.message}`);
    }
  }

  console.log(`    ✅ ${articles.length} articles from GNews`);
  return articles;
}

// ─────────────────────────────────────────────
//  DEDUPLICATION
// ─────────────────────────────────────────────

async function deduplicateArticles(articles) {
  // Get all existing url_hashes from Supabase
  const { data: existing } = await supabase
    .from('raw_articles')
    .select('url_hash');

  const existingHashes = new Set((existing || []).map(r => r.url_hash));

  // Also deduplicate within this batch
  const seenHashes = new Set();
  const unique = [];

  for (const article of articles) {
    if (!existingHashes.has(article.url_hash) && !seenHashes.has(article.url_hash)) {
      seenHashes.add(article.url_hash);
      unique.push(article);
    }
  }

  console.log(`\n  🧹 Deduplication: ${articles.length} collected → ${unique.length} new`);
  return unique;
}

// ─────────────────────────────────────────────
//  SAVE TO SUPABASE
// ─────────────────────────────────────────────

async function saveToSupabase(articles) {
  if (articles.length === 0) {
    console.log('  💾 Nothing new to save');
    return;
  }

  // Insert in batches of 50
  const batchSize = 50;
  let saved = 0;

  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);

    const { error } = await supabase
      .from('raw_articles')
      .insert(batch);

    if (error) {
      console.error(`  ❌ Supabase insert error: ${error.message}`);
    } else {
      saved += batch.length;
    }
  }

  console.log(`  💾 Saved ${saved} new articles to Supabase`);
}

// ─────────────────────────────────────────────
//  MAIN RUNNER
// ─────────────────────────────────────────────

async function run() {
  console.log('\n🚀 Smart Money Collector starting...');
  console.log(`📅 Run time: ${new Date().toISOString()}\n`);

  const allArticles = [];

  // 1. Fetch all RSS sources in parallel
  console.log('── RSS Feeds ──');
  const rssResults = await Promise.allSettled(
    RSS_SOURCES.map(source => fetchRSSSource(source))
  );
  for (const result of rssResults) {
    if (result.status === 'fulfilled') {
      allArticles.push(...result.value);
    }
  }

  // 2. Fetch NewsAPI
  console.log('\n── NewsAPI ──');
  const newsApiArticles = await fetchNewsAPI();
  allArticles.push(...newsApiArticles);

  // 3. Fetch GNews
  console.log('\n── GNews ──');
  const gnewsArticles = await fetchGNews();
  allArticles.push(...gnewsArticles);

  console.log(`\n📦 Total collected: ${allArticles.length} articles`);

  // 4. Deduplicate
  const uniqueArticles = await deduplicateArticles(allArticles);

  // 5. Save to Supabase
  await saveToSupabase(uniqueArticles);

  // 6. Summary
  const byMarket = uniqueArticles.reduce((acc, a) => {
    acc[a.market] = (acc[a.market] || 0) + 1;
    return acc;
  }, {});

  const byPillar = uniqueArticles.reduce((acc, a) => {
    acc[a.pillar] = (acc[a.pillar] || 0) + 1;
    return acc;
  }, {});

  console.log('\n📊 Summary:');
  console.log('  By market:', byMarket);
  console.log('  By pillar:', byPillar);
  console.log('\n✅ Collection run complete!\n');
}

run().catch(err => {
  console.error('💥 Collector crashed:', err);
  process.exit(1);
});
