// ─────────────────────────────────────────────
//  SMART MONEY AGENT — PUBLISHER
//  Publishes due, approved posts to the Facebook Page.
//  Run: npm run publish            (dry run — safe)
//       npm run publish:live       (actually posts)
//
//  SAFETY MODEL — read before changing anything here:
//    1. DRY_RUN defaults to TRUE. Publishing is opt-in, never the default.
//    2. PUBLISH_ENABLED is a kill switch that works without a redeploy.
//    3. A row with platform_post_id set is NEVER republished.
//    4. Only posts a human approved (status 'scheduled') are eligible.
//    5. MAX_POSTS_PER_RUN caps the blast radius of any bug.
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

// Dry run unless explicitly disabled. Anything other than the exact
// string 'false' keeps us safe.
const DRY_RUN = process.env.DRY_RUN !== 'false';

// Kill switch. Must be exactly 'true' to publish.
const PUBLISH_ENABLED = process.env.PUBLISH_ENABLED === 'true';

const PAGE_ID      = process.env.FB_PAGE_ID;
const PAGE_TOKEN   = process.env.META_PAGE_ACCESS_TOKEN;
const GRAPH        = 'https://graph.facebook.com/v19.0';

const MAX_POSTS_PER_RUN = parseInt(process.env.MAX_POSTS_PER_RUN || '2', 10);
const DELAY_BETWEEN_MS  = parseInt(process.env.PUBLISH_DELAY_MS || '5000', 10);

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

/** Compose the message body sent to Facebook. */
function composeMessage(post) {
  const parts = [post.body?.trim() || ''];

  if (Array.isArray(post.hashtags) && post.hashtags.length) {
    const tags = post.hashtags
      .map(t => (t.startsWith('#') ? t : `#${t}`))
      .join(' ');
    parts.push(tags);
  }
  return parts.filter(Boolean).join('\n\n');
}

/** Publish one post to the Page feed. Returns the Facebook post id. */
async function publishToFacebook(message) {
  const res = await fetch(`${GRAPH}/${PAGE_ID}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: PAGE_TOKEN }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message || `HTTP ${res.status}`);
  }
  return data.id;
}

async function markFailed(scheduleId, reason) {
  await supabase
    .from('post_schedule')
    .update({ publish_status: 'failed', error_message: String(reason).slice(0, 500) })
    .eq('id', scheduleId);
}

// ─────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────

async function run() {
  console.log('\n📣 Smart Money Publisher');
  console.log(`📅 ${new Date().toISOString()}`);
  console.log(`🔒 Mode: ${DRY_RUN ? 'DRY RUN — nothing will be posted' : '*** LIVE — WILL POST PUBLICLY ***'}`);
  console.log(`🎚️  Max this run: ${MAX_POSTS_PER_RUN}\n`);

  // ── Preflight ──────────────────────────────
  if (!DRY_RUN) {
    if (!PUBLISH_ENABLED) {
      console.error('🛑 PUBLISH_ENABLED is not "true" — kill switch is engaged. Exiting.');
      process.exit(1);
    }
    if (!PAGE_ID || !PAGE_TOKEN) {
      console.error('❌ FB_PAGE_ID and META_PAGE_ACCESS_TOKEN must both be set for live publishing.');
      process.exit(1);
    }
  }

  // ── Fetch due items ────────────────────────
  const { data: due, error } = await supabase
    .from('post_schedule')
    .select(`
      id, post_id, platform, market, scheduled_at, publish_status, platform_post_id,
      generated_posts ( id, body, hashtags, status, market, platform )
    `)
    .eq('publish_status', 'queued')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(MAX_POSTS_PER_RUN);

  if (error) {
    console.error(`❌ Could not read the queue: ${error.message}`);
    process.exit(1);
  }

  if (!due || due.length === 0) {
    console.log('✨ Nothing due for publishing. Done.\n');
    return;
  }

  console.log(`📥 ${due.length} post(s) due\n`);

  let published = 0, skipped = 0, failed = 0;

  for (const row of due) {
    const post = row.generated_posts;
    const label = `${row.market}/${row.platform}`;

    // ── Guard 1: never republish ─────────────
    if (row.platform_post_id) {
      console.log(`   ↩️  ${label} — already has platform_post_id, skipping`);
      skipped++;
      continue;
    }

    // ── Guard 2: the post must still exist ───
    if (!post) {
      console.warn(`   ⚠️  ${label} — linked post is missing, marking failed`);
      await markFailed(row.id, 'Linked generated_posts row not found');
      failed++;
      continue;
    }

    // ── Guard 3: human approval still stands ─
    if (post.status !== 'scheduled') {
      console.warn(`   ⛔ ${label} — post status is "${post.status}", not "scheduled". Skipping.`);
      await supabase
        .from('post_schedule')
        .update({ publish_status: 'skipped', error_message: `Post status was "${post.status}"` })
        .eq('id', row.id);
      skipped++;
      continue;
    }

    // ── Guard 4: there must be something to say
    const message = composeMessage(post);
    if (!message) {
      console.warn(`   ⚠️  ${label} — empty body, marking failed`);
      await markFailed(row.id, 'Composed message was empty');
      failed++;
      continue;
    }

    // ── Publish ──────────────────────────────
    if (DRY_RUN) {
      console.log(`   🧪 ${label} — WOULD POST (${message.length} chars):`);
      console.log('      ┌' + '─'.repeat(60));
      message.split('\n').forEach(l => console.log('      │ ' + l));
      console.log('      └' + '─'.repeat(60));
      published++;
      continue;
    }

    try {
      const fbPostId = await publishToFacebook(message);

      await supabase
        .from('post_schedule')
        .update({
          publish_status: 'published',
          published_at: new Date().toISOString(),
          platform_post_id: fbPostId,
          error_message: null,
        })
        .eq('id', row.id);

      await supabase
        .from('generated_posts')
        .update({ status: 'published' })
        .eq('id', post.id);

      console.log(`   ✅ ${label} — published as ${fbPostId}`);
      published++;

    } catch (err) {
      console.error(`   ❌ ${label} — ${err.message}`);
      await markFailed(row.id, err.message);
      failed++;
    }

    if (DELAY_BETWEEN_MS > 0) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_MS));
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   ${DRY_RUN ? 'Would publish' : 'Published'}: ${published}`);
  console.log(`   Skipped:   ${skipped}`);
  console.log(`   Failed:    ${failed}`);

  if (DRY_RUN) {
    console.log('\n🧪 Dry run — nothing was posted.');
    console.log('   To publish for real, set BOTH:  DRY_RUN=false  PUBLISH_ENABLED=true\n');
  } else {
    console.log('\n✅ Publishing run complete.\n');
  }
}

// Exit explicitly — the Supabase realtime socket keeps Node alive otherwise.
run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('💥 Publisher crashed:', err);
    process.exit(1);
  });
