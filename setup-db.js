// ─────────────────────────────────────────────
//  SUPABASE DATABASE SETUP
//  Run once to create all tables
//  Run: node setup-db.js
// ─────────────────────────────────────────────

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Copy and paste this SQL into your Supabase SQL Editor:
// https://supabase.com/dashboard/project/mfyhvwtjqwiyqvytqzqb/sql

const SQL = `
-- ── Enable UUID extension ──
create extension if not exists "pgcrypto";

-- ── raw_articles ──
create table if not exists raw_articles (
  id              uuid primary key default gen_random_uuid(),
  source_name     text not null,
  title           text not null,
  summary         text,
  url             text not null,
  url_hash        text not null unique,
  published_at    timestamptz,
  collected_at    timestamptz default now(),
  market          text check (market in ('HK', 'UK', 'BOTH')),
  pillar          text check (pillar in ('cashback', 'side_hustle', 'investing', 'crypto', 'real_estate', 'tax', 'general')),
  relevance_score float4 default 0,
  status          text default 'pending' check (status in ('pending', 'summarised', 'rejected', 'published')),
  language        text default 'en'
);

-- ── Indexes for fast querying ──
create index if not exists idx_raw_articles_url_hash   on raw_articles(url_hash);
create index if not exists idx_raw_articles_status     on raw_articles(status);
create index if not exists idx_raw_articles_market     on raw_articles(market);
create index if not exists idx_raw_articles_pillar     on raw_articles(pillar);
create index if not exists idx_raw_articles_collected  on raw_articles(collected_at desc);

-- ── generated_posts ──
create table if not exists generated_posts (
  id              uuid primary key default gen_random_uuid(),
  article_id      uuid references raw_articles(id) on delete cascade,
  market          text check (market in ('HK', 'UK')),
  platform        text check (platform in ('instagram', 'linkedin', 'facebook', 'threads')),
  pillar          text,
  body            text,
  hashtags        text[],
  currency        text check (currency in ('HKD', 'GBP')),
  status          text default 'draft' check (status in ('draft', 'approved', 'scheduled', 'published', 'rejected')),
  approved_by     text,
  approved_at     timestamptz,
  ai_model        text,
  prompt_version  text default 'v1.0',
  created_at      timestamptz default now()
);

create index if not exists idx_generated_posts_status   on generated_posts(status);
create index if not exists idx_generated_posts_market   on generated_posts(market);
create index if not exists idx_generated_posts_platform on generated_posts(platform);

-- ── post_schedule ──
create table if not exists post_schedule (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid references generated_posts(id) on delete cascade,
  platform          text,
  market            text,
  scheduled_at      timestamptz,
  timezone          text,
  publish_status    text default 'queued' check (publish_status in ('queued', 'published', 'failed', 'skipped')),
  published_at      timestamptz,
  platform_post_id  text,
  error_message     text
);

create index if not exists idx_post_schedule_status      on post_schedule(publish_status);
create index if not exists idx_post_schedule_scheduled   on post_schedule(scheduled_at);

-- ── engagement_metrics ──
create table if not exists engagement_metrics (
  id               uuid primary key default gen_random_uuid(),
  schedule_id      uuid references post_schedule(id) on delete cascade,
  market           text,
  platform         text,
  pillar           text,
  likes            int4 default 0,
  comments         int4 default 0,
  shares           int4 default 0,
  saves            int4 default 0,
  impressions      int4 default 0,
  engagement_rate  float4 default 0,
  recorded_at      timestamptz default now()
);
`;

console.log('\n📋 Supabase SQL Setup\n');
console.log('Copy and paste the following SQL into your Supabase SQL Editor:');
console.log('👉 https://supabase.com/dashboard/project/mfyhvwtjqwiyqvytqzqb/sql/new\n');
console.log('─'.repeat(60));
console.log(SQL);
console.log('─'.repeat(60));
console.log('\n✅ After running the SQL, your database is ready!');
console.log('Then run: npm run collect\n');
