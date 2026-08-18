// ─────────────────────────────────────────────
//  SMART MONEY AGENT — DRAFT EXPORTER
//  Pulls draft posts out of Supabase and writes a self-contained HTML page
//  with one-click copy buttons, so you can paste straight into Facebook.
//
//  No Meta App Review needed — this is entirely manual publishing.
//
//  Run: npm run export
//  Then open: drafts.html
// ─────────────────────────────────────────────

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const PLATFORM = process.env.EXPORT_PLATFORM || 'facebook';
const LIMIT    = parseInt(process.env.EXPORT_LIMIT || '30', 10);

// Deliberately excludes 'published'. Once you mark a post as published it drops
// out of future exports, so you never see the same post twice.
const STATUSES = (process.env.EXPORT_STATUSES || 'draft,approved')
  .split(',').map(s => s.trim()).filter(Boolean);
const OUTFILE  = process.env.EXPORT_FILE || 'drafts.html';

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** Full text as it should appear on Facebook: body, blank line, hashtags. */
function composeMessage(post) {
  const parts = [String(post.body || '').trim()];
  if (Array.isArray(post.hashtags) && post.hashtags.length) {
    parts.push(post.hashtags.map(t => (t.startsWith('#') ? t : `#${t}`)).join(' '));
  }
  return parts.filter(Boolean).join('\n\n');
}

function buildHtml(posts) {
  const cards = posts.map((p, i) => {
    const msg = composeMessage(p);
    const article = p.raw_articles || {};
    return `
  <article class="card" id="post-${i}">
    <header>
      <span class="badge ${esc(p.market)}">${esc(p.market)}</span>
      <span class="badge pillar">${esc(p.pillar || '—')}</span>
      <span class="badge status-${esc(p.status)}">${esc(p.status)}</span>
      <span class="chars">${msg.length} chars</span>
    </header>

    <pre class="body" id="text-${i}">${esc(msg)}</pre>

    <footer>
      <button class="copy" data-target="text-${i}">Copy post</button>
      ${article.url ? `<a class="src" href="${esc(article.url)}" target="_blank" rel="noopener">Source: ${esc(article.source_name || 'link')} ↗</a>` : ''}
      <label class="done"><input type="checkbox" class="posted-tick" data-id="${esc(p.id)}"> Posted</label>
    </footer>
  </article>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Smart Money — drafts to post</title>
<style>
  :root { color-scheme: light; }
  body { max-width: 780px; margin: 0 auto; padding: 2rem 1rem 5rem;
         font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         background: #fafafa; color: #1a1a1a; }
  h1 { font-size: 1.6rem; margin-bottom: .2rem; }
  .sub { color: #666; margin-bottom: 1.5rem; font-size: .92rem; }
  .card { background: #fff; border: 1px solid #e4e4e4; border-radius: 10px;
          padding: 1rem 1.1rem; margin-bottom: 1rem; }
  .card.is-done { opacity: .45; }
  header { display: flex; gap: .4rem; align-items: center; margin-bottom: .7rem;
           flex-wrap: wrap; }
  .badge { font-size: .72rem; font-weight: 600; padding: .16rem .5rem;
           border-radius: 20px; text-transform: uppercase; letter-spacing: .03em; }
  .UK { background: #dbeafe; color: #1e40af; }
  .HK { background: #fee2e2; color: #991b1b; }
  .pillar { background: #f1f5f9; color: #475569; }
  .status-draft { background: #fef3c7; color: #92400e; }
  .status-approved { background: #dcfce7; color: #166534; }
  .chars { margin-left: auto; color: #999; font-size: .78rem; }
  pre.body { white-space: pre-wrap; word-wrap: break-word; font: inherit;
             background: #f8f9fb; border: 1px solid #eee; border-radius: 7px;
             padding: .85rem; margin: 0 0 .8rem; }
  footer { display: flex; gap: .8rem; align-items: center; flex-wrap: wrap; }
  button.copy { background: #1877f2; color: #fff; border: 0; border-radius: 6px;
                padding: .5rem 1rem; font-size: .88rem; font-weight: 600;
                cursor: pointer; }
  button.copy:hover { background: #145dbf; }
  button.copy.copied { background: #16a34a; }
  .src { color: #2563eb; font-size: .84rem; text-decoration: none; }
  .src:hover { text-decoration: underline; }
  .done { margin-left: auto; font-size: .84rem; color: #666; cursor: pointer;
          user-select: none; }
  .note { background: #fff7ed; border-left: 3px solid #f59e0b;
          padding: .8rem 1rem; margin-bottom: 1.5rem; font-size: .9rem; }
  .empty { text-align: center; color: #888; padding: 3rem 0; }

  .tray { position: fixed; left: 0; right: 0; bottom: 0; background: #1a1a1a;
          color: #fff; transform: translateY(110%); transition: transform .18s ease; }
  .tray.visible { transform: translateY(0); }
  .tray-inner { max-width: 780px; margin: 0 auto; padding: .85rem 1rem;
                display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
  #tray-count { font-weight: 600; }
  #tray-sql { background: #16a34a; color: #fff; border: 0; border-radius: 6px;
              padding: .5rem 1rem; font-size: .88rem; font-weight: 600; cursor: pointer; }
  #tray-sql:hover { background: #15803d; }
  .tray-hint { color: #aaa; font-size: .82rem; margin-left: auto; }
</style>
</head>
<body>

<h1>Drafts to post</h1>
<p class="sub">${posts.length} ${PLATFORM} post${posts.length === 1 ? '' : 's'} &middot;
   generated ${new Date().toLocaleString('en-GB')}</p>

<div class="note">
  <strong>Read before posting.</strong> These are machine-drafted. Check the facts against
  the source link, and make sure nothing reads as financial advice, before it goes on your
  Page. The "Posted" tick is only a visual marker for this page &mdash; it is not saved
  anywhere, and it does not update the database.
</div>

${posts.length ? cards : '<p class="empty">No unposted drafts. Run <code>npm run collect</code> then <code>npm run summarise</code> to generate more.</p>'}

${posts.length ? `
<div class="tray" id="tray">
  <div class="tray-inner">
    <span id="tray-count">0 ticked</span>
    <button id="tray-sql">Copy SQL to mark them posted</button>
    <span class="tray-hint">Paste into Supabase → SQL Editor → Run</span>
  </div>
</div>` : ''}

<script>
  // ── Mark-as-posted tray ────────────────────────────────────────────────
  // The tick alone does nothing to the database. This turns the ticked posts
  // into one UPDATE statement you run in Supabase, after which they stop
  // appearing in future exports.
  const tray      = document.getElementById('tray');
  const trayCount = document.getElementById('tray-count');
  const traySql   = document.getElementById('tray-sql');

  function tickedIds() {
    return [...document.querySelectorAll('.posted-tick:checked')].map(c => c.dataset.id);
  }

  function refreshTray() {
    if (!tray) return;
    const n = tickedIds().length;
    trayCount.textContent = n + (n === 1 ? ' ticked' : ' ticked');
    tray.classList.toggle('visible', n > 0);
  }

  if (traySql) {
    traySql.addEventListener('click', async () => {
      const ids = tickedIds();
      if (!ids.length) return;
      const sql = "update generated_posts set status = 'published' where id in (\\n  " +
                  ids.map(i => "'" + i + "'").join(',\\n  ') + "\\n);";
      try {
        await navigator.clipboard.writeText(sql);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = sql; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
      }
      traySql.textContent = 'SQL copied ✓ — paste it into Supabase';
      setTimeout(() => { traySql.textContent = 'Copy SQL to mark them posted'; }, 2600);
    });
  }

  document.querySelectorAll('button.copy').forEach(btn => {
    btn.addEventListener('click', async () => {
      const text = document.getElementById(btn.dataset.target).textContent;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); ta.remove();
      }
      btn.textContent = 'Copied ✓';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy post'; btn.classList.remove('copied'); }, 1600);
    });
  });

  document.querySelectorAll('.done input').forEach(cb => {
    cb.addEventListener('change', () => {
      cb.closest('.card').classList.toggle('is-done', cb.checked);
      refreshTray();
    });
  });

  refreshTray();
</script>

</body>
</html>`;
}

// ─────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────

async function run() {
  console.log('\n📤 Smart Money Draft Exporter');
  console.log(`📅 ${new Date().toISOString()}`);
  console.log(`🔎 platform=${PLATFORM} | statuses=${STATUSES.join(',')} | limit=${LIMIT}\n`);

  const { data: posts, error } = await supabase
    .from('generated_posts')
    .select('id, market, platform, pillar, body, hashtags, status, created_at, raw_articles ( title, url, source_name )')
    .eq('platform', PLATFORM)
    .in('status', STATUSES)
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  if (error) {
    console.error(`❌ Could not read posts: ${error.message}`);
    process.exit(1);
  }

  if (!posts || posts.length === 0) {
    console.log('✨ No matching posts found.');
    console.log('   Generate some with:  npm run collect  then  npm run summarise\n');
  } else {
    console.log(`📥 ${posts.length} post(s) found:`);
    const byMarket = posts.reduce((a, p) => (a[p.market] = (a[p.market] || 0) + 1, a), {});
    console.log('   By market:', byMarket);
  }

  writeFileSync(OUTFILE, buildHtml(posts || []), 'utf8');

  console.log(`\n✅ Wrote ${OUTFILE}`);
  console.log('   Open it in your browser, click "Copy post", paste into Facebook.\n');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('💥 Exporter crashed:', err);
    process.exit(1);
  });
