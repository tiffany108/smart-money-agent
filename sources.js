// ─────────────────────────────────────────────
//  NEWS SOURCES CONFIG
//  All RSS feeds + API sources for HK & UK
// ─────────────────────────────────────────────

export const RSS_SOURCES = [
  // ── CRYPTO (both markets) ──
  {
    name: 'CoinDesk',
    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    market: 'BOTH',
    pillar: 'crypto',
    language: 'en',
  },
  {
    name: 'CoinTelegraph',
    url: 'https://cointelegraph.com/rss',
    market: 'BOTH',
    pillar: 'crypto',
    language: 'en',
  },
  {
    name: 'Decrypt',
    url: 'https://decrypt.co/feed',
    market: 'BOTH',
    pillar: 'crypto',
    language: 'en',
  },

  // ── UK SOURCES ──
  {
    name: 'MoneySavingExpert',
    url: 'https://www.moneysavingexpert.com/rss/',
    market: 'UK',
    pillar: 'cashback',
    language: 'en',
  },
  {
    name: 'This is Money',
    url: 'https://www.thisismoney.co.uk/money/feeds.atom',
    market: 'UK',
    pillar: 'investing',
    language: 'en',
  },
  {
    name: 'Motley Fool UK',
    url: 'https://www.fool.co.uk/feed/',
    market: 'UK',
    pillar: 'investing',
    language: 'en',
  },
  {
    name: 'Boring Money',
    url: 'https://boringmoney.co.uk/feed/',
    market: 'UK',
    pillar: 'investing',
    language: 'en',
  },

  // ── HK SOURCES ──
  {
    name: 'SCMP Money',
    url: 'https://www.scmp.com/rss/91/feed',
    market: 'HK',
    pillar: 'investing',
    language: 'en',
  },
  {
    name: 'HKMA News',
    url: 'https://www.hkma.gov.hk/eng/rss/press-release.rss',
    market: 'HK',
    pillar: 'investing',
    language: 'en',
  },

  // ── REDDIT RSS (both markets) ──
  {
    name: 'Reddit - UKPersonalFinance',
    url: 'https://www.reddit.com/r/UKPersonalFinance/top/.rss?t=day',
    market: 'UK',
    pillar: 'general',
    language: 'en',
  },
  {
    name: 'Reddit - HongKong',
    url: 'https://www.reddit.com/r/HongKong/top/.rss?t=day',
    market: 'HK',
    pillar: 'general',
    language: 'en',
  },
  {
    name: 'Reddit - SideHustle',
    url: 'https://www.reddit.com/r/sidehustle/top/.rss?t=day',
    market: 'BOTH',
    pillar: 'side_hustle',
    language: 'en',
  },
  {
    name: 'Reddit - PassiveIncome',
    url: 'https://www.reddit.com/r/passiveincome/top/.rss?t=day',
    market: 'BOTH',
    pillar: 'side_hustle',
    language: 'en',
  },
  {
    name: 'Reddit - DividendInvesting',
    url: 'https://www.reddit.com/r/dividends/top/.rss?t=day',
    market: 'BOTH',
    pillar: 'investing',
    language: 'en',
  },
];

// ─────────────────────────────────────────────
//  KEYWORD SETS PER PILLAR
//  Used to score & tag each article
// ─────────────────────────────────────────────

export const PILLAR_KEYWORDS = {
  cashback: [
    'cashback', 'cash back', 'rewards', 'discount', 'coupon',
    'deal', 'offer', 'octopus rewards', 'topcashback', 'quidco',
    'clubcard', 'amex offer', 'credit card deal', 'nectar',
    'money off', 'saving deal',
  ],
  side_hustle: [
    'side hustle', 'extra income', 'freelance', 'gig economy',
    'airbnb', 'vinted', 'carousell', 'etsy', 'make money online',
    'passive income', 'fiverr', 'upwork', 'taskrabbit', 'reselling',
    'dropshipping', 'online business',
  ],
  investing: [
    'dividend', 'etf', 'index fund', 'stock', 'shares', 'mpf',
    'isa', 'sipp', 'compound interest', 'ibond', 'vanguard',
    'reit', 'portfolio', 'yield', 'interest rate', 'bond',
    'equity', 'fund', 'investment',
  ],
  crypto: [
    'crypto', 'bitcoin', 'ethereum', 'defi', 'staking',
    'yield farming', 'hashkey', 'osl', 'blockchain', 'nft',
    'web3', 'altcoin', 'crypto savings', 'celsius', 'binance',
    'coinbase', 'digital asset',
  ],
  real_estate: [
    'rental income', 'reit', 'buy-to-let', 'property', 'real estate',
    'link reit', 'rent a room', 'airbnb host', 'landlord',
    'hk property', 'mortgage', 'housing', 'letting',
    'property investment', 'rental yield',
  ],
  tax: [
    'tax saving', 'tax deduction', 'isa allowance', 'self-assessment',
    'hmrc', 'ird', 'salaries tax', 'mpf deduction', 'capital gains',
    'tax return', 'tax relief', 'tax free', 'tax allowance',
    'stamp duty', 'inheritance tax', 'income tax',
  ],
};

// ─────────────────────────────────────────────
//  MARKET KEYWORD DETECTORS
//  Override pillar market tag if HK/UK specific
// ─────────────────────────────────────────────

export const MARKET_KEYWORDS = {
  HK: [
    'hong kong', 'hk$', 'hkd', 'mpf', 'hkex', 'ird',
    'octopus', 'sfc', 'hkma', 'link reit', 'ibond',
    'carousell hk', 'hashkey', 'osl',
  ],
  UK: [
    'united kingdom', 'uk ', ' uk', '£', 'gbp', 'hmrc',
    'isa', 'sipp', 'quidco', 'topcashback', 'vinted',
    'motley fool uk', 'moneysavingexpert', 'ftse',
    'national insurance', 'self-assessment',
  ],
};
