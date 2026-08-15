// ─────────────────────────────────────────────
//  SMART MONEY AGENT — META WEBHOOK LISTENER
//  Listens for comments on Instagram & Facebook
//  Detects trigger keyword (SEND/INFO/GET)
//  Auto-DMs the suggestion package back
//  Run: node webhook.js
// ─────────────────────────────────────────────

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'http';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.META_PAGE_ACCESS_TOKEN;

// Trigger keywords — case insensitive
const TRIGGER_KEYWORDS = ['send', 'info', 'get', 'yes', '👇'];

// Track who we've already DM'd per post (in-memory, resets on restart)
const dmSent = new Set();

// ─────────────────────────────────────────────
//  FORMAT DM MESSAGE
// ─────────────────────────────────────────────

function formatDM(suggestions, market) {
  if (!suggestions) {
    return `👋 Thanks for your interest! Here are some resources to get you started on your smart money journey. Follow us for daily tips! 💰`;
  }

  const currency = market === 'HK' ? 'HK$' : '£';
  let msg = `👋 Here's your Smart Money Guide!\n\n`;

  // Action plan
  if (suggestions.action_plan?.length > 0) {
    msg += `📋 *3 Steps to Get Started:*\n`;
    for (const step of suggestions.action_plan) {
      msg += `${step.step}️⃣ ${step.action}\n`;
    }
    msg += '\n';
  }

  // Recommended platforms
  if (suggestions.recommended_platforms?.length > 0) {
    msg += `⭐ *Top Platforms to Try:*\n`;
    for (const platform of suggestions.recommended_platforms.slice(0, 3)) {
      msg += `• ${platform.name} — ${platform.reason}\n`;
    }
    msg += '\n';
  }

  // Resources / links
  if (suggestions.resources?.length > 0) {
    msg += `🔗 *Useful Links:*\n`;
    for (const resource of suggestions.resources.slice(0, 3)) {
      msg += `• ${resource.title}: ${resource.url}\n`;
    }
    msg += '\n';
  }

  msg += `💡 Follow us for daily smart money tips for ${market === 'HK' ? 'Hong Kong' : 'the UK'}!\n`;
  msg += `\n⚠️ For general information only. Not financial advice.`;

  return msg;
}

// ─────────────────────────────────────────────
//  SEND DM — INSTAGRAM
// ─────────────────────────────────────────────

async function sendInstagramDM(recipientId, message) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/me/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: message },
          access_token: PAGE_ACCESS_TOKEN,
        }),
      }
    );
    const data = await res.json();
    if (data.error) {
      console.error('❌ Instagram DM error:', data.error.message);
      return false;
    }
    console.log(`✅ Instagram DM sent to ${recipientId}`);
    return true;
  } catch (err) {
    console.error('❌ Instagram DM failed:', err.message);
    return false;
  }
}

// ─────────────────────────────────────────────
//  SEND DM — FACEBOOK MESSENGER
// ─────────────────────────────────────────────

async function sendFacebookDM(recipientId, message) {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text: message },
          messaging_type: 'RESPONSE',
        }),
      }
    );
    const data = await res.json();
    if (data.error) {
      console.error('❌ Facebook DM error:', data.error.message);
      return false;
    }
    console.log(`✅ Facebook DM sent to ${recipientId}`);
    return true;
  } catch (err) {
    console.error('❌ Facebook DM failed:', err.message);
    return false;
  }
}

// ─────────────────────────────────────────────
//  REPLY TO COMMENT (public reply)
// ─────────────────────────────────────────────

async function replyToComment(commentId, platform) {
  const replyText = platform === 'instagram'
    ? `Thanks! 📩 Check your DMs — we've sent you the full guide!`
    : `Thanks for your interest! 📩 Check your Messenger — we've sent you the full guide!`;

  try {
    const endpoint = platform === 'instagram'
      ? `https://graph.facebook.com/v19.0/${commentId}/replies`
      : `https://graph.facebook.com/v19.0/${commentId}/comments`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: replyText,
        access_token: PAGE_ACCESS_TOKEN,
      }),
    });
    const data = await res.json();
    if (data.error) {
      console.error('❌ Comment reply error:', data.error.message);
    } else {
      console.log(`✅ Public reply posted on ${platform} comment`);
    }
  } catch (err) {
    console.error('❌ Comment reply failed:', err.message);
  }
}

// ─────────────────────────────────────────────
//  FIND MATCHING POST IN SUPABASE
// ─────────────────────────────────────────────

async function findMatchingPost(platform, market) {
  const { data } = await supabase
    .from('generated_posts')
    .select('suggestions')
    .eq('platform', platform)
    .eq('market', market)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(1);

  return data?.[0]?.suggestions || null;
}

// ─────────────────────────────────────────────
//  HANDLE INSTAGRAM COMMENT
// ─────────────────────────────────────────────

async function handleInstagramComment(entry) {
  for (const change of entry.changes || []) {
    if (change.field !== 'comments') continue;

    const comment = change.value;
    const commentText = (comment.text || '').toLowerCase().trim();
    const commentId = comment.id;
    const senderId = comment.from?.id;

    console.log(`📸 Instagram comment: "${commentText}" from ${senderId}`);

    // Check for trigger keyword
    const triggered = TRIGGER_KEYWORDS.some(kw => commentText.includes(kw));
    if (!triggered) continue;

    // Avoid duplicate DMs
    const dmKey = `ig_${senderId}_${commentId}`;
    if (dmSent.has(dmKey)) continue;
    dmSent.add(dmKey);

    console.log(`🎯 Trigger detected! Sending DM to ${senderId}`);

    // Get suggestions from latest published post
    const suggestions = await findMatchingPost('instagram', 'HK') ||
                        await findMatchingPost('instagram', 'UK');

    const market = suggestions?.market || 'HK';
    const message = formatDM(suggestions, market);

    // Send DM + reply to comment
    await sendInstagramDM(senderId, message);
    await replyToComment(commentId, 'instagram');
  }
}

// ─────────────────────────────────────────────
//  HANDLE FACEBOOK COMMENT
// ─────────────────────────────────────────────

async function handleFacebookComment(entry) {
  for (const change of entry.changes || []) {
    if (change.field !== 'feed') continue;

    const item = change.value;
    if (item.item !== 'comment') continue;

    const commentText = (item.message || '').toLowerCase().trim();
    const commentId = item.comment_id;
    const senderId = item.from?.id;

    console.log(`📘 Facebook comment: "${commentText}" from ${senderId}`);

    const triggered = TRIGGER_KEYWORDS.some(kw => commentText.includes(kw));
    if (!triggered) continue;

    const dmKey = `fb_${senderId}_${commentId}`;
    if (dmSent.has(dmKey)) continue;
    dmSent.add(dmKey);

    console.log(`🎯 Trigger detected! Sending DM to ${senderId}`);

    const suggestions = await findMatchingPost('facebook', 'UK') ||
                        await findMatchingPost('facebook', 'HK');

    const market = suggestions?.market || 'UK';
    const message = formatDM(suggestions, market);

    await sendFacebookDM(senderId, message);
    await replyToComment(commentId, 'facebook');
  }
}

// ─────────────────────────────────────────────
//  HTTP SERVER
// ─────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ── Webhook verification (GET) ──
  if (req.method === 'GET' && url.pathname === '/webhook') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ Webhook verified by Meta');
      res.writeHead(200);
      res.end(challenge);
    } else {
      console.error('❌ Webhook verification failed');
      res.writeHead(403);
      res.end('Forbidden');
    }
    return;
  }

  // ── Webhook events (POST) ──
  if (req.method === 'POST' && url.pathname === '/webhook') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        console.log(`\n📨 Webhook received: ${payload.object}`);

        for (const entry of payload.entry || []) {
          if (payload.object === 'instagram') {
            await handleInstagramComment(entry);
          } else if (payload.object === 'page') {
            await handleFacebookComment(entry);
          }
        }

        res.writeHead(200);
        res.end('EVENT_RECEIVED');
      } catch (err) {
        console.error('❌ Webhook parse error:', err.message);
        res.writeHead(200);
        res.end('EVENT_RECEIVED');
      }
    });
    return;
  }

  // ── Health check ──
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'Smart Money Webhook',
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n🚀 Smart Money Webhook Server running`);
  console.log(`📡 Listening on port ${PORT}`);
  console.log(`🔑 Verify token: ${VERIFY_TOKEN}`);
  console.log(`\n📋 Endpoints:`);
  console.log(`   GET  /webhook  — Meta verification`);
  console.log(`   POST /webhook  — Incoming events`);
  console.log(`   GET  /health   — Health check`);
  console.log(`\n⏳ Waiting for comments...\n`);
});
