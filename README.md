# Smart Money Agent — News Collector

Collects finance news from RSS feeds + APIs for HK & UK markets, stores in Supabase.

## Setup (5 steps)

### 1. Install dependencies
```bash
npm install
```

### 2. Create your .env file
```bash
cp .env.example .env
```
Then fill in your keys:
```
SUPABASE_URL=https://mfyhvwtjqwiyqvytqzqb.supabase.co
SUPABASE_ANON_KEY=your_key_here
NEWSAPI_KEY=your_key_here
GNEWS_KEY=your_key_here
```

### 3. Set up Supabase tables
```bash
node setup-db.js
```
Copy the SQL output and run it in your Supabase SQL Editor.

### 4. Test the collector
```bash
npm run collect
```

### 5. Set up GitHub Actions (automated every 6 hours)
Create `.github/workflows/collect.yml` — see below.

## GitHub Actions Schedule

```yaml
name: News Collector
on:
  schedule:
    - cron: '0 0,6,12,18 * * *'  # Every 6 hours UTC
  workflow_dispatch:               # Manual trigger

jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm run collect
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          NEWSAPI_KEY: ${{ secrets.NEWSAPI_KEY }}
          GNEWS_KEY: ${{ secrets.GNEWS_KEY }}
```

## File structure
```
smart-money-collector/
├── collector.js     ← Main script — run this
├── sources.js       ← All RSS feeds + keyword config
├── setup-db.js      ← Prints SQL to create Supabase tables
├── .env.example     ← Copy to .env and fill in keys
└── package.json
```

## What it does each run
1. Fetches all 14 RSS feeds in parallel
2. Calls NewsAPI (HK + UK keyword queries)
3. Calls GNews (HK + UK keyword queries)
4. Scores each article against 6 pillar keyword sets
5. Detects market (HK/UK/BOTH) from article text
6. Deduplicates against existing Supabase records
7. Saves new articles with status = 'pending'
8. Prints summary by market and pillar
