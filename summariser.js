// ─────────────────────────────────────────────
//  SMART MONEY AGENT — AI SUMMARISER v1.1
//  Now includes suggestion package per post:
//  - Recommended products/platforms
//  - Step-by-step action plan
//  - Relevant links/resources
//  - Follow-up post ideas
// ─────────────────────────────────────────────

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const PLATFORMS = ['instagram', 'linkedin', 'facebook', 'threads'];
const BATCH_SIZE = 5;
const MODEL = 'claude-sonnet-4-6';

// ─────────────────────────────────────────────
//  PLATFORM SPECS
// ─────────────────────────────────────────────

const PLATFORM_SPECS = {
  instagram: {
    maxChars: 220,
    hashtagCount: '5-8',
    tone: 'visual, punchy, emoji-friendly',
    format: 'Hook + 2-3 short lines + call to action',
  },
  linkedin: {
    maxChars: 300,
    hashtagCount: '3-5',
    tone: 'professional but approachable, insight-driven',
    format: 'Strong opening insight + explanation + practical takeaway',
  },
  facebook: {
    maxChars: 180,
    hashtagCount: '1-3',
    tone: 'conversational, friendly, community-feel',
    format: 'Relatable hook + key point + question to engage',
  },
  threads: {
    maxChars: 280,
    hashtagCount: '0-2',
    tone: 'casual, conversational, like texting a friend',
    format: 'One punchy insight or tip, no fluff',
  },
};

// ─────────────────────────────────────────────
//  MARKET CONFIG
// ─────────────────────────────────────────────

const MARKET_CONFIG = {
  HK: {
    currency: 'HKD',
    currencySymbol: 'HK$',
    locale: 'Hong Kong',
    localTerms: 'MPF, Octopus rewards, HKEX, SFC, IRD, salaries tax, HK REITs',
    disclaimer: 'For general information only. Not financial advice.',
    platforms: {
      cashback: ['Octopus Rewards', 'OpenRice deals', 'HK credit card portals', 'Klook'],
      side_hustle: ['Carousell HK', 'Airbnb HK', 'Fiverr', 'Upwork', 'GogoX'],
      investing: ['HKEX', 'Futu (moomoo)', 'Tiger Brokers', 'MPF providers', 'iBond'],
      crypto: ['HashKey Exchange', 'OSL', 'Binance HK', 'Ledger'],
      real_estate: ['Link REIT', 'Midland Realty', 'Airbnb HK', 'Hong Kong REITs'],
      tax: ['IRD HK', 'MPF voluntary contributions', 'HKICPA resources'],
    },
    resources: {
      cashback: ['hkma.gov.hk', 'openrice.com', 'klook.com'],
      side_hustle: ['carousell.com.hk', 'airbnb.com.hk'],
      investing: ['hkex.com.hk', 'mpfa.org.hk', 'sfc.hk'],
      crypto: ['hashkey.com', 'osl.com', 'sfc.hk/crypto'],
      real_estate: ['linkreit.com', 'midland.com.hk'],
      tax: ['ird.gov.hk', 'mpfa.org.hk'],
    },
  },
  UK: {
    currency: 'GBP',
    currencySymbol: '£',
    locale: 'United Kingdom',
    localTerms: 'ISA, SIPP, HMRC, self-assessment, NI contributions, UK REITs',
    disclaimer: 'For general information only. Not financial advice.',
    platforms: {
      cashback: ['TopCashback', 'Quidco', 'Amex Offers', 'Nectar', 'Tesco Clubcard'],
      side_hustle: ['Vinted', 'Etsy', 'TaskRabbit', 'Airbnb UK', 'Fiverr', 'Upwork'],
      investing: ['Vanguard UK', 'Hargreaves Lansdown', 'Trading 212', 'Freetrade', 'AJ Bell'],
      crypto: ['Coinbase UK', 'Kraken UK', 'Ledger', 'FCA-registered exchanges'],
      real_estate: ['UK REITs', 'British Land', 'Rightmove', 'Zoopla', 'Airbnb UK'],
      tax: ['HMRC', 'gov.uk/self-assessment', 'TaxScouts', 'GoSimpleTax'],
    },
    resources: {
      cashback: ['topcashback.co.uk', 'quidco.com', 'moneysavingexpert.com'],
      side_hustle: ['vinted.co.uk', 'etsy.com', 'gov.uk/trading-allowance'],
      investing: ['vanguard.co.uk', 'hl.co.uk', 'moneysavingexpert.com/savings/stocks-shares-isas'],
      crypto: ['fca.org.uk/crypto', 'coinbase.com', 'kraken.com'],
      real_estate: ['gov.uk/rent-room-in-your-home', 'rightmove.co.uk'],
      tax: ['gov.uk/self-assessment-tax-returns', 'hmrc.gov.uk'],
    },
  },
};

// ─────────────────────────────────────────────
//  POST PROMPT
// ─────────────────────────────────────────────

function buildPostPrompt(article, market, platform) {
  const mktConfig = MARKET_CONFIG[market];
  const platSpec = PLATFORM_SPECS[platform];

  return `You are a friendly, relatable social media writer for a smart money and passive income page targeting everyday people in ${mktConfig.locale}.

ARTICLE TO SUMMARISE:
Title: ${article.title}
Summary: ${article.summary || 'No summary available'}
Topic pillar: ${article.pillar}

PLATFORM RULES for ${platform.toUpperCase()}:
- Maximum ${platSpec.maxChars} characters for the main body (excluding hashtags)
- Tone: ${platSpec.tone}
- Format: ${platSpec.format}
- Hashtags: ${platSpec.hashtagCount} hashtags

MARKET RULES for ${market}:
- Always use ${mktConfig.currencySymbol} (${mktConfig.currency}) for any money amounts
- Reference local products where relevant: ${mktConfig.localTerms}
- End with this disclaimer on a new line: ${mktConfig.disclaimer}

VOICE RULES:
- Talk like a knowledgeable friend, not a finance professor
- Lead with a relatable hook or surprising fact
- Always end with ONE clear actionable tip
- Never promise unrealistic returns
- Use simple, jargon-free language
- Specific numbers beat vague claims

RESPOND IN THIS EXACT JSON FORMAT (no markdown, no backticks):
{
  "body": "the full post text here, without hashtags",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"]
}`;
}

// ─────────────────────────────────────────────
//  SUGGESTION PACKAGE PROMPT
// ─────────────────────────────────────────────

function buildSuggestionPrompt(article, market) {
  const mktConfig = MARKET_CONFIG[market];
  const pillar = article.pillar || 'general';
  const knownPlatforms = mktConfig.platforms[pillar] || [];
  const knownResources = mktConfig.resources[pillar] || [];

  return `You are a smart money research assistant helping everyday people in ${mktConfig.locale} take action on finance news.

ARTICLE:
Title: ${article.title}
Summary: ${article.summary || 'No summary available'}
Topic pillar: ${pillar}
Market: ${market}
Currency: ${mktConfig.currency} (${mktConfig.currencySymbol})

Known local platforms for this pillar: ${knownPlatforms.join(', ')}
Known local resources for this pillar: ${knownResources.join(', ')}

YOUR TASK:
Create a practical suggestion package that helps someone in ${mktConfig.locale} act on this news today.

RULES:
- All money amounts in ${mktConfig.currencySymbol}
- Only recommend platforms/services available in ${mktConfig.locale}
- Keep each step short and actionable (one sentence max)
- Links must be real, working websites — only include if you are confident they exist
- Follow-up post ideas should be distinct angles on the same topic
- Label everything as general information, not financial advice

RESPOND IN THIS EXACT JSON FORMAT (no markdown, no backticks):
{
  "recommended_platforms": [
    {"name": "Platform Name", "reason": "Why it's relevant for this topic in ${market}"}
  ],
  "action_plan": [
    {"step": 1, "action": "First thing to do today"},
    {"step": 2, "action": "Second step"},
    {"step": 3, "action": "Third step"}
  ],
  "resources": [
    {"title": "Resource name", "url": "https://...", "description": "What it helps with"}
  ],
  "followup_post_ideas": [
    {"angle": "Post angle or hook idea", "pillar": "${pillar}"},
    {"angle": "Another angle", "pillar": "${pillar}"},
    {"angle": "A third angle", "pillar": "${pillar}"}
  ]
}`;
}

// ─────────────────────────────────────────────
//  GENERATE POST
// ─────────────────────────────────────────────

async function generatePost(article, market, platform) {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: buildPostPrompt(article, market, platform) }],
    });

    const clean = response.content[0].text.trim().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (!parsed.body || !parsed.hashtags) return null;
    return parsed;

  } catch (err) {
    console.error(`    ❌ Post generation error (${market}/${platform}): ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────
//  GENERATE SUGGESTION PACKAGE
// ─────────────────────────────────────────────

async function generateSuggestions(article, market) {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: buildSuggestionPrompt(article, market) }],
    });

    const clean = response.content[0].text.trim().replace(/```json|```/g, '').trim();
    return JSON.parse(clean);

  } catch (err) {
    console.error(`    ❌ Suggestion generation error (${market}): ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────
//  PROCESS ONE ARTICLE
// ─────────────────────────────────────────────

async function processArticle(article) {
  console.log(`\n  📰 ${article.title.slice(0, 65)}...`);
  console.log(`     Market: ${article.market} | Pillar: ${article.pillar}`);

  const markets = article.market === 'BOTH' ? ['HK', 'UK'] : [article.market];
  const posts = [];

  for (const market of markets) {

    // 1. Generate suggestion package once per market
    process.stdout.write(`     🎁 Generating suggestion package (${market})... `);
    const suggestions = await generateSuggestions(article, market);
    process.stdout.write(suggestions ? '✅\n' : '❌\n');
    await new Promise(r => setTimeout(r, 300));

    // 2. Generate post for each platform
    for (const platform of PLATFORMS) {
      process.stdout.write(`     ✍️  ${market}/${platform}... `);
      const post = await generatePost(article, market, platform);

      if (post) {
        posts.push({
          article_id: article.id,
          market,
          platform,
          pillar: article.pillar,
          body: post.body,
          hashtags: post.hashtags,
          currency: MARKET_CONFIG[market].currency,
          status: 'draft',
          ai_model: MODEL,
          prompt_version: 'v1.1',
          // Store full suggestion package as JSONB
          suggestions: suggestions || null,
        });
        process.stdout.write('✅\n');
      } else {
        process.stdout.write('❌\n');
      }

      await new Promise(r => setTimeout(r, 400));
    }
  }

  // Save all posts
  if (posts.length > 0) {
    const { error } = await supabase
      .from('generated_posts')
      .insert(posts);

    if (error) {
      console.error(`     ❌ Supabase insert error: ${error.message}`);
      return false;
    }
    console.log(`     💾 Saved ${posts.length} posts + suggestions`);
  }

  // Mark article as summarised
  await supabase
    .from('raw_articles')
    .update({ status: 'summarised' })
    .eq('id', article.id);

  return true;
}

// ─────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────

async function run() {
  console.log('\n🤖 Smart Money AI Summariser v1.1');
  console.log(`📅 ${new Date().toISOString()}`);
  console.log(`📦 Batch: ${BATCH_SIZE} articles | Model: ${MODEL}\n`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not set — exiting');
    process.exit(1);
  }

  const { data: articles, error } = await supabase
    .from('raw_articles')
    .select('*')
    .eq('status', 'pending')
    .order('relevance_score', { ascending: false })
    .limit(BATCH_SIZE);

  if (error) {
    console.error('❌ Failed to fetch articles:', error.message);
    process.exit(1);
  }

  if (!articles || articles.length === 0) {
    console.log('✅ No pending articles — all done!');
    return;
  }

  console.log(`📋 Processing ${articles.length} articles...\n`);
  console.log('─'.repeat(60));

  let success = 0;
  let fail = 0;

  for (const article of articles) {
    const ok = await processArticle(article);
    ok ? success++ : fail++;
  }

  console.log('\n' + '─'.repeat(60));
  console.log(`\n✅ ${success} processed | ❌ ${fail} failed`);

  const { count } = await supabase
    .from('generated_posts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'draft');

  console.log(`📝 Total draft posts in queue: ${count}`);
  console.log('\n✅ Done! Check generated_posts in Supabase.\n');
}

// Exit explicitly — see the note in collector.js. The Supabase realtime
// socket otherwise keeps the process alive after the work is done.
run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('💥 Crashed:', err);
    process.exit(1);
  });
