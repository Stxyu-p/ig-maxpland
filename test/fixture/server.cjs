// Local Instagram-web fixture for testing ig-maxpland under bsk.
// ponytail: Node stdlib only. Serves the DOM shapes the script depends on plus
// every API route it calls, with a controllable rate-limit / checkpoint switch.
// Add: a stress mode that tightens pacing so slow paths are reachable fast.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.FIXTURE_PORT || 8811);
// Must be numeric: the script validates /^\d+$/ on every relationship target
// and assertAccount compares it against the ds_user_id cookie.
const VIEWER = process.env.FIXTURE_VIEWER || '900000001';
const CSRF = 'fixture_csrf_token';

// Server-side knobs the tests flip via POST /__fixture/config
const cfg = {
  failAfter: 0,          // 0 = never. N = the Nth relationship page returns 429
  checkpoint: false,     // return a challenge payload on every API call
  rateLimitFirst: false, // 401 on the first call (auth expiry simulation)
  followersTotal: 137,   // 3 pages at 50
  followingTotal: 63,    // 2 pages
  viewerFanout: 41,      // users returned by the story-viewer endpoint
  logRequests: [],
};

const j = (res, code, body, headers = {}) => {
  const s = JSON.stringify(body);
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(s) }, headers));
  res.end(s);
};
const html = (res, code, s) => {
  res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
};

const user = (i) => ({
  pk: String(1000 + i),
  id: String(1000 + i),
  username: `user_${i}`,
  full_name: `Fixture User ${i}`,
  profile_pic_url: `https://example.invalid/avatar/${i}.jpg`,
  is_verified: i % 17 === 0,
  is_private: i % 11 === 0,
  has_anonymous_profile_picture: i % 13 === 0,
});

const PAGE = 50;
const pageOf = (endpoint, maxId) => {
  const total = endpoint === 'followers' ? cfg.followersTotal : cfg.followingTotal;
  const start = maxId ? Number(maxId) : 0;
  const slice = [];
  for (let i = start; i < Math.min(start + PAGE, total); i++) slice.push(user(i + (endpoint === 'following' ? 5000 : 0)));
  const next = start + PAGE;
  return {
    users: slice,
    next_max_id: next < total ? String(next) : null,
    has_more: next < total,
    more_available: next < total,
  };
};

const SHELL = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Instagram (fixture)</title>
<style>
  body{margin:0;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#000;color:#e4e6eb}
  header{position:sticky;top:0;display:flex;gap:16px;padding:12px 20px;background:#000;border-bottom:1px solid #262626;z-index:10}
  nav{width:72px;padding:16px 8px;border-right:1px solid #262626}
  main{padding:20px;max-width:640px}
  article{border:1px solid #262626;border-radius:8px;margin-bottom:16px;padding:12px}
  img{max-width:100%}
</style></head>
<body>
<nav aria-label="Primary">
  <a href="/explore/" aria-label="Explore">Explore</a>
  <a href="/${VIEWER}/" aria-label="Profile"><svg aria-label="Profile" width="24" height="24" viewBox="0 0 24 24"></svg><img alt="profile picture" src="https://example.invalid/me.jpg"></a>
  <a href="/direct/">Messages</a>
</nav>
<header><section><button>Test User</button><h2>Test User</h2><img alt="Test User's profile picture" src="https://example.invalid/me.jpg"></section></header>
<main id="main"></main>
<script type="application/json" id="bootstrap">{"config":{"viewer":{"id":"${VIEWER}","username":"${VIEWER}"},"viewerId":"${VIEWER}"},"data":{"viewer":{"id":"${VIEWER}","username":"${VIEWER}"}}}</script>
</body></html>`;

const FEED = (n = 6) => Array.from({ length: n }, (_, i) => `<article>
  <header><span>user_${i}</span></header>
  <section>
    <img src="https://example.invalid/post/${i}.jpg" alt="post ${i}">
    <div class="actions"><button aria-label="Like">Like</button><button aria-label="Comment">Comment</button><button aria-label="Share">Share</button></div>
  </section>
</article>`).join('\n');

const SHIM = (base) => `<script>
        document.cookie = 'ds_user_id=${VIEWER}; path=/';
        document.cookie = 'csrftoken=${CSRF}; path=/';
        (function () {
          var BASE = location.origin;
          var native = window.fetch.bind(window);
          window.fetch = function (input, init) {
            var url = typeof input === 'string' ? input : (input && input.url) || '';
            if (url.indexOf('instagram.com') !== -1) {
              var u = new URL(url, BASE);
              url = BASE + u.pathname + u.search;
            }
            return native(url, init);
          };
          window.__FIXTURE__ = { viewer: '${VIEWER}', log: [] };
        })();
      </script>`;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = u.pathname;
  cfg.logRequests.push({ t: Date.now(), m: req.method, p });
  if (cfg.logRequests.length > 2000) cfg.logRequests.shift();

  if (p === '/__fixture/config') {
    if (req.method === 'POST') {
      let b = ''; req.on('data', c => b += c); req.on('end', () => {
        try { Object.assign(cfg, JSON.parse(b || '{}')); } catch (_) {}
        j(res, 200, { ok: true, cfg: { ...cfg, logRequests: cfg.logRequests.length } });
      });
      return;
    }
    return j(res, 200, { ...cfg, logRequests: cfg.logRequests.slice(-50) });
  }
  if (p === '/__fixture/userscript.js') {
    const file = path.join(__dirname, '..', '..', 'dist', 'ig_maxpland_en.user.js');
    const s = fs.readFileSync(file, 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Content-Length': Buffer.byteLength(s) });
    return res.end(s);
  }
  if (p === '/__fixture/reset') { cfg.logRequests.length = 0; cfg.failAfter = 0; cfg.checkpoint = false; return j(res, 200, { ok: true }); }

  // ---- API surface the script calls ----
  const rel = p.match(/^\/api\/v1\/friendships\/(\d+)\/(followers|following)\/?$/);
  if (rel) {
    if (cfg.checkpoint) return j(res, 200, { message: 'challenge_required', challenge: { api_path: p }, checkpoint_url: 'https://instagram.com/challenge/' });
    if (cfg.rateLimitFirst) { cfg.rateLimitFirst = false; return j(res, 401, { message: 'login_required' }); }
    const n = cfg.logRequests.filter(r => r.p === p).length;
    if (cfg.failAfter && n > cfg.failAfter) return j(res, 429, { message: 'feedback_required', error_type: 'rate_limit' }, { 'Retry-After': '30' });
    return j(res, 200, pageOf(rel[2], u.searchParams.get('max_id')));
  }
  if (p.match(/^\/api\/v1\/media\/\d+\/list_reel_media_viewer\/?$/)) {
    if (cfg.checkpoint) return j(res, 200, { message: 'challenge_required', checkpoint_url: 'https://instagram.com/challenge/' });
    return j(res, 200, { status: 'ok', users: Array.from({ length: cfg.viewerFanout }, (_, i) => ({ pk: String(7000 + i), username: `viewer_${i}`, timestamp: Math.floor(Date.now() / 1000) - i * 600 })) });
  }
  if (p.match(/^\/api\/v1\/media\/\d+\/info\/?$/)) {
    const single = { pk: '90001', id: '90001', media_type: 1, taken_at: Math.floor(Date.now() / 1000) - 86400 * 3, user: { username: 'user_1' }, caption: { text: 'fixture caption' }, image_versions2: { candidates: [{ url: 'https://example.invalid/media/90001-1080.jpg', width: 1080, height: 1080 }, { url: 'https://example.invalid/media/90001-150.jpg', width: 150, height: 150 }] } };
    const carousel = { pk: '90002', id: '90002', media_type: 8, taken_at: Math.floor(Date.now() / 1000) - 86400 * 3, user: { username: 'user_2' }, image_versions2: { candidates: [{ url: 'https://example.invalid/media/90002-a.jpg', width: 1080, height: 1080 }] }, carousel_media: [single, { ...single, pk: '90003', id: '90003', media_type: 2, image_versions2: { candidates: [{ url: 'https://example.invalid/media/90003-thumb.jpg', width: 640, height: 640 }] }, video_versions: [{ url: 'https://example.invalid/media/90003-1080.mp4', width: 1080, height: 1920 }] }] };
    const short = String(u.searchParams.get('shortcode') || '');
    return j(res, 200, { items: [short === 'fixturecarousel' ? carousel : single], num_results: 1 });
  }
  if (p === '/api/v1/users/web_profile_info/') {
    return j(res, 200, { data: { user: { id: VIEWER, username: VIEWER, profile_pic_url: 'https://example.invalid/avatar/me.jpg', profile_pic_url_hd: 'https://example.invalid/avatar/me-hd.jpg' } } });
  }
  const feedUser = p.match(/^\/api\/v1\/feed\/user\/(\d+)\/?$/);
  if (feedUser) {
    const id = Number(feedUser[1]);
    // Deterministic: every 4th id has no posts, every 7th is a year stale.
    if (id % 4 === 0) return j(res, 200, { items: [], num_results: 0 });
    const age = (id % 7 === 0) ? 86400 * 400 : 86400 * 10;
    return j(res, 200, { items: [{ taken_at: Math.floor(Date.now() / 1000) - age }], num_results: 12 });
  }
  const un = p.match(/^\/(?:api\/v1\/web\/friendships\/(\d+)\/unfollow|api\/v1\/friendships\/destroy\/(\d+)|web\/friendships\/(\d+)\/unfollow)\/?$/);
  if (un && req.method === 'POST') {
    const uid = un[1] || un[2] || un[3];
    if (cfg.checkpoint) return j(res, 200, { message: 'challenge_required', checkpoint_url: 'https://instagram.com/challenge/' });
    const n = cfg.logRequests.filter(r => r.m === 'POST' && /unfollow|destroy/.test(r.p)).length;
    if (cfg.failAfter && n > cfg.failAfter) return j(res, 429, { message: 'feedback_required' }, { 'Retry-After': '60' });
    return j(res, 200, { status: 'ok', friendship_status: { following: false } });
  }
  if (p.startsWith('/graphql/query/')) {
    return j(res, 400, { message: 'GraphQL query hash no longer supported' });
  }

  // ---- pages ----
  if (p === '/' || p === `/${VIEWER}/`) {
    const s = SHELL
      .replace('</main>', `<div id="feed">${FEED()}</div></main>`)
      .replace('</body>', `${SHIM()}</body>`);
    return html(res, 200, s);
  }
  if (p === '/stories/user_1/90001/') {
    const s = SHELL
      .replace('</main>', `
      <section aria-label="Story">
        <a href="/stories/user_1/90001/"><img src="https://example.invalid/story/cover.jpg"></a>
        <video poster="https://example.invalid/story/poster.jpg" src="blob:fixture-blob-url" muted></video>
      </section>
      <div class="maxpland-story-bar-host"></div></main>`)
      .replace('</body>', `${SHIM()}</body>`);
    return html(res, 200, s);
  }
  html(res, 404, 'not found');
});

server.listen(PORT, '127.0.0.1', () => console.log(`[fixture] http://127.0.0.1:${PORT}`));
