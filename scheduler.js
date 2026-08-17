// ─────────────────────────────────────────────
//  SMART MONEY AGENT — SCHEDULER
//  Moves approved posts into the publish queue.
//  Does NOT publish anything. See publisher.js.
//  Run: npm run schedule
// ─────────────────────────────────────────────

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ─────────────────────────────────────────────
//  CONFIG
// ─────────────────────────────────────────────

// Local posting times per market. Tune these freely — they are wall-clock
// times in each market's own timezone, not UTC.
const POSTING_TIMES = {
  HK: { timeZone: 'Asia/Hong_Kong', slots: ['08:00', '20:00'] },
  UK: { timeZone: 'Europe/London',  slots: ['07:30', '18:30'] },
};

// Only these platforms get scheduled. Facebook first; the others need
// different APIs entirely (see PUBLISHER-DESIGN.md).
const PLATFORMS = (process.env.SCHEDULE_PLATFORMS || 'facebook')
  .split(',').map(s => s.trim()).filter(Boolean);

// Never queue more than this in one run.
const MAX_PER_RUN = parseInt(process.env.SCHEDULE_MAX_PER_RUN || '20', 10);

// ─────────────────────────────────────────────
//  TIMEZONE HELPERS  (no external dependencies)
// ─────────────────────────────────────────────

/** Offset in ms between a given instant and its wall-clock time in `timeZone`. */
function tzOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(
    dtf.formatToParts(date).filter(x => x.type !== 'literal').map(x => [x.type, x.value])
  );
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUTC - date.getTime();
}

/** Wall-clock date parts in `timeZone` for a given instant. */
function localParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const p = Object.fromEntries(
    dtf.formatToParts(date).filter(x => x.type !== 'literal').map(x => [x.type, x.value])
  );
  return { year: +p.year, month: +p.month, day: +p.day };
}

/** Convert a wall-clock time in `timeZone` to the correct UTC instant. */
function zonedToUtc(year, month, day, hour, minute, timeZone) {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  // Two passes settles DST boundaries.
  let instant = naive;
  for (let i = 0; i < 2; i++) {
    instant = naive - tzOffsetMs(new Date(instant), timeZone);
  }
  return new Date(instant);
}

/**
 * The next `count` posting slots for a market, starting after `after`.
 * Walks forward day by day so DST transitions are handled by zonedToUtc.
 */
function nextSlots(market, after, count) {
  const { timeZone, slots } = POSTING_TIMES[market];
  const out = [];

  for (let dayOffset = 0; dayOffset < 30 && out.length < count; dayOffset++) {
    const probe = new Date(after.getTime() + dayOffset * 86400000);
    const { year, month, day } = localParts(probe, timeZone);

    for (const slot of slots) {
      const [hh, mm] = slot.split(':').map(Number);
      const when = zonedToUtc(year, month, day, hh, mm, timeZone);
      if (when > after) out.push(when);
      if (out.length >= count) break;
    }
  }
  return out;
}

// ─────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────

async function run() {
  console.log('\n🗓️  Smart Money Scheduler');
  console.log(`📅 ${new Date().toISOString()}`);
  console.log(`📌 Platforms: ${PLATFORMS.join(', ')} | Max per run: ${MAX_PER_RUN}\n`);

  // 1. Approved posts awaiting scheduling
  const { data: approved, error } = await supabase
    .from('generated_posts')
    .select('id, market, platform, body, created_at')
    .eq('status', 'approved')
    .in('platform', PLATFORMS)
    .order('created_at', { ascending: true })
    .limit(MAX_PER_RUN);

  if (error) {
    console.error(`❌ Could not read approved posts: ${error.message}`);
    process.exit(1);
  }

  if (!approved || approved.length === 0) {
    console.log('✨ Nothing approved and waiting. Done.\n');
    return;
  }

  console.log(`📥 ${approved.length} approved post(s) found`);

  // 2. Skip anything already queued — scheduling must be idempotent
  const { data: existing } = await supabase
    .from('post_schedule')
    .select('post_id')
    .in('post_id', approved.map(p => p.id));

  const alreadyQueued = new Set((existing || []).map(r => r.post_id));
  const toSchedule = approved.filter(p => !alreadyQueued.has(p.id));

  if (alreadyQueued.size > 0) {
    console.log(`   ↩️  ${alreadyQueued.size} already queued — skipping`);
  }
  if (toSchedule.length === 0) {
    console.log('✨ Everything approved is already queued. Done.\n');
    return;
  }

  // 3. Assign slots, spacing posts out per market
  const now = new Date();
  const byMarket = {};
  for (const post of toSchedule) {
    (byMarket[post.market] ||= []).push(post);
  }

  const rows = [];
  for (const [market, posts] of Object.entries(byMarket)) {
    if (!POSTING_TIMES[market]) {
      console.warn(`   ⚠️  No posting times configured for market "${market}" — skipped`);
      continue;
    }

    // Continue after whatever is already scheduled for this market
    const { data: last } = await supabase
      .from('post_schedule')
      .select('scheduled_at')
      .eq('market', market)
      .eq('publish_status', 'queued')
      .order('scheduled_at', { ascending: false })
      .limit(1);

    const startFrom = last?.[0]?.scheduled_at
      ? new Date(Math.max(new Date(last[0].scheduled_at).getTime(), now.getTime()))
      : now;

    const slots = nextSlots(market, startFrom, posts.length);

    posts.forEach((post, i) => {
      if (!slots[i]) return;
      rows.push({
        post_id: post.id,
        platform: post.platform,
        market,
        scheduled_at: slots[i].toISOString(),
        timezone: POSTING_TIMES[market].timeZone,
        publish_status: 'queued',
      });
    });
  }

  if (rows.length === 0) {
    console.log('\n✨ Nothing to queue. Done.\n');
    return;
  }

  // 4. Write the queue
  const { error: insErr } = await supabase.from('post_schedule').insert(rows);
  if (insErr) {
    console.error(`❌ Could not write queue: ${insErr.message}`);
    process.exit(1);
  }

  // 5. Mark posts as scheduled
  const { error: updErr } = await supabase
    .from('generated_posts')
    .update({ status: 'scheduled' })
    .in('id', rows.map(r => r.post_id));

  if (updErr) {
    console.error(`⚠️  Queued, but could not update post status: ${updErr.message}`);
  }

  console.log(`\n📤 Queued ${rows.length} post(s):`);
  for (const r of rows) {
    console.log(`   ${r.market}/${r.platform} → ${new Date(r.scheduled_at).toISOString()} (${r.timezone})`);
  }
  console.log('\n✅ Scheduling complete. Nothing published — run publisher.js for that.\n');
}

run().catch(err => {
  console.error('💥 Scheduler crashed:', err);
  process.exit(1);
});
