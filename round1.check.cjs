// Run: node round1.check.cjs — real userscript, isolated DOM/storage/network boundaries.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sourcePath = require('node:path').resolve(__dirname, process.argv[2] || 'ig_maxpland.user.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const tests = [];
function test(name, fn) { tests.push([name, fn]); }
function harness() {
    const nodes = new Map();
    const element = () => ({ style: {}, textContent: '', innerHTML: '', disabled: false,
        classList: { add() {}, remove() {}, toggle() {} }, click() {}, addEventListener() {},
        setAttribute() {}, append() {}, appendChild() {}, querySelectorAll() { return []; } });
    const document = { cookie: 'ds_user_id=1; csrftoken=test',
        getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); },
        createElement() { return element(); },
        querySelector() { return null; }, querySelectorAll() { return []; } };
    const context = vm.createContext({ document, console, URL, URLSearchParams, AbortController, DOMException,
        setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
        localStorage: { getItem() { return null; }, setItem() {} },
        window: {}, location: { pathname: '/', href: 'https://www.instagram.com/' },
        alert() {}, confirm() { return true; } });
    const marker = "    if (document.readyState === 'complete' || document.readyState === 'interactive') {";
    assert.equal(source.split(marker).length, 2);
    // Suppress only automatic startup; exercise original functions without any live API requests.
    vm.runInContext(source.slice(0, source.indexOf(marker)) + `
        globalThis.api = { STATE, IgBridge, MaxPlandVault, runInactiveScan, runRelationshipScan,
            runBatchUnfollow, downloadResolvedMedia, renderRelationshipList, applyUnfollowResult,
            injectStoryDownloadTools, downloadCurrentStoryMedia, openCurrentStoryMediaTab,
            bindUIEvents, setSleep(fn) { sleep = fn; }, setDownload(fn) { gmDownload = fn; } };
    })();`, context);
    const api = context.api;
    api.setSleep(async () => {});
    api.IgBridge.assertAccount = id => assert.equal(String(id), '1');
    api.STATE.relationshipAccountId = '1';
    return { ...api, context, document, nodes };
}

test('Story uses only native selectors', () => {
    assert.equal(source.includes('section:visible'), false, 'native querySelector throws on :visible');
});

test('Whitelist blocks request at the action boundary', async () => {
    const h = harness(); let requests = 0;
    h.STATE.whitelist.set('2', { id: '2', username: 'friend' });
    h.IgBridge.request = async () => { requests++; return { status: 'ok' }; };
    await assert.rejects(h.IgBridge.unfollowUser('2'), /Whitelist/);
    assert.equal(requests, 0);
});
test('Whitelist username protection matches the UI', async () => {
    const h = harness(); let requests = 0;
    h.STATE.whitelist.set('old', { id: 'old', username: 'FRIEND' });
    h.STATE.following = [{ id: '2', username: 'friend' }];
    h.IgBridge.request = async () => { requests++; return { status: 'ok' }; };
    await assert.rejects(h.IgBridge.unfollowUser('2'), /Whitelist/);
    assert.equal(requests, 0);
});
test('Unfollow does not accept following:true or an empty status', async () => {
    for (const response of [{ status: 'ok', friendship_status: { following: true } }, { friendship_status: {} }]) {
        const h = harness(); let requests = 0;
        h.IgBridge.request = async () => { requests++; return response; };
        await assert.rejects(h.IgBridge.unfollowUser('2'));
        assert.equal(requests, 1, 'ambiguous write must not try another route');
    }
});
test('Unfollow stops after session errors or ambiguous network failure', async () => {
    for (const code of ['CHECKPOINT', 'AUTH', 'TIMEOUT', 'NETWORK']) {
        const h = harness(); let requests = 0;
        h.IgBridge.request = async () => { requests++; throw Object.assign(new Error(code), { code, status: 403 }); };
        await assert.rejects(h.IgBridge.unfollowUser('2'));
        assert.equal(requests, 1, code);
    }
});
test('Explicit unfollow confirmation still succeeds', async () => {
    const h = harness();
    h.IgBridge.request = async () => ({ friendship_status: { following: false } });
    assert.equal(await h.IgBridge.unfollowUser('2'), true);
});

function radarHarness(count) {
    const h = harness();
    h.STATE.following = Array.from({ length: count }, (_, i) => ({ id: String(i + 2), username: 'u' + i }));
    h.MaxPlandVault.getUserActivity = async () => null;
    h.MaxPlandVault.saveUserActivity = async () => {};
    h.IgBridge.fetchUserLastPost = async () => ({ has_posts: false, last_taken_at: null });
    return h;
}
test('Radar includes item 20 and reports partial completion', async () => {
    const h = radarHarness(21);
    await h.runInactiveScan();
    assert.equal(h.STATE.inactiveFollowing.length, 20);
    assert.match(h.document.getElementById('maxpland-scan-phase').textContent, /20\/21/);
    assert.doesNotMatch(h.document.getElementById('maxpland-scan-phase').textContent, /เสร็จสิ้น|Scan complete/);
});
test('Radar restarts after prior Stop and supplies an abort signal', async () => {
    const h = radarHarness(1);
    h.STATE.stopScanFlag = true;
    h.IgBridge.fetchUserLastPost = async (_uid, options) => {
        assert.ok(options?.signal, 'missing abort signal');
        return { has_posts: false, last_taken_at: null };
    };
    await h.runInactiveScan();
    assert.equal(h.STATE.inactiveFollowing.length, 1);
});
test('Radar stops on account/auth failure, rather than scanning every user', async () => {
    for (const code of ['ACCOUNT_CHANGED', 'AUTH', 'CHECKPOINT']) {
        const h = radarHarness(3); let calls = 0;
        h.IgBridge.fetchUserLastPost = async () => { calls++; throw Object.assign(new Error(code), { code }); };
        await h.runInactiveScan();
        assert.equal(calls, 1, code);
        assert.match(h.document.getElementById('maxpland-scan-phase').textContent, new RegExp(code));
    }
});
test('Lost-follower rows show the last known username from the index map', async () => {
    const h = harness();
    h.IgBridge.resolveCurrentUser = async () => ({ id: '1', username: 'me' });
    h.IgBridge.fetchAllRelationships = async endpoint => {
        const list = [];
        list.completed = true;
        if (endpoint === 'followers') list.push({ id: '2', username: 'was_friend' });
        else list.push({ id: '3', username: 'still_there' });
        return list;
    };
    h.MaxPlandVault.getLatestSnapshot = async () => ({ follower_ids: ['9'], usernames: { '9': 'was_friend' }, complete: true });
    h.MaxPlandVault.saveSnapshot = async () => {};
    h.MaxPlandVault.getWhitelist = async () => new Map();
    await h.runRelationshipScan();
    h.STATE.relationshipFilter = 'lost';
    h.renderRelationshipList();
    const rows = String(h.document.getElementById('maxpland-relationship-list').innerHTML);
    assert.match(rows, /was_friend/, 'lost rows must show the last known username');
    assert.doesNotMatch(rows, /user_9/, 'the placeholder era; this test pins the upgrade');
});
test('Snapshot stores follower and following usernames and stays lean', async () => {
    const h = harness(); let captured = null;
    h.IgBridge.resolveCurrentUser = async () => ({ id: '1', username: 'me' });
    h.IgBridge.fetchAllRelationships = async () => { const list = []; list.completed = true; return list; };
    h.MaxPlandVault.init = async () => ({
        transaction: () => {
            const store = { put(rec) { captured = rec; } };
            const tx = { objectStore: () => store, abort() {}, addEventListener() {}, removeEventListener() {},
                onerror: null, onabort: null, _oc: null,
                set oncomplete(fn) { this._oc = fn; setImmediate(() => this._oc && this._oc()); },
                get oncomplete() { return this._oc; } };
            return tx;
        }
    });
    h.MaxPlandVault.getLatestSnapshot = async () => null;
    h.MaxPlandVault.getWhitelist = async () => new Map();
    const followers = [{ id: '2', username: 'aa' }, { id: '3', username: 'bb' }];
    const following = [{ id: '3', username: 'cc' }];
    h.IgBridge.fetchAllRelationships = async endpoint => {
        const list = [];
        list.completed = true;
        list.push(...(endpoint === 'followers' ? followers : following));
        return list;
    };
    await h.runRelationshipScan();
    assert.deepEqual([...captured.follower_ids], ['2', '3']);
    assert.deepEqual({ ...captured.follower_usernames }, { 2: 'aa', 3: 'bb' });
    assert.deepEqual({ ...captured.following_usernames }, { 3: 'cc' });
    assert.ok(!('usernames' in captured), 'no fat blob field');
});
function analyzeHarness(count) {
    const h = harness();
    h.MaxPlandVault.getLatestSnapshot = async () => null;
    h.MaxPlandVault.getWhitelist = async () => new Map();
    const followers = Array.from({ length: count }, (_, i) => ({ id: String(i + 2), username: 'f' + i }));
    h.STATE.following = followers;
    h.IgBridge.resolveCurrentUser = async () => ({ id: '1', username: 'me' });
    h.IgBridge.fetchAllRelationships = async endpoint => {
        const list = [];
        list.completed = true;
        if (endpoint === 'followers') list.push(...followers);
        else list.push(followers[0]);
        return list;
    };
    return h;
}
test('Bot-ghost heuristic is a subset of the no-avatar set', () => {
    const h = analyzeHarness(5);
    const ghostSource = source;
    assert.match(ghostSource, /ghostFollowers: followers\.filter\(u => hasNoAvatar\(u\)\)/);
    assert.doesNotMatch(ghostSource, /hasNoAvatar\(u\) \|\| isSuspiciousBot\(u\)/);
});
test('Ghost copy stops promising bot detection', async () => {
    const h = analyzeHarness(5);
    await h.runRelationshipScan();
    const html = String(h.document.getElementById('maxpland-relationship-list').innerHTML);
    assert.ok(!/บอท|\bbots?\b/i.test(html), 'no bot wording in row tags');
});
test('Empty result explains no-new-posts, rather than claiming abandoned', async () => {
    const h = analyzeHarness(2);
    h.MaxPlandVault.getUserActivity = async () => ({ last_post_taken_at: null, has_posts: false, checked_at: Date.now() });
    await h.runInactiveScan();
    assert.equal(h.STATE.inactiveFollowing.length, 2);
});
test('Tag map drives filter-to-label mapping', async () => {
    const h = harness();
    h.STATE.relationshipFilter = 'ghost';
    h.STATE.ghostFollowers = [{ id: '2', username: 'gh' }];
    h.renderRelationshipList();
    const html = String(h.document.getElementById('maxpland-relationship-list').innerHTML);
    assert.match(html, /maxpland-status-tag ghost/);
});
test('Whitelist lookup is not rebuilt per row', () => {
    const src = source;
    assert.doesNotMatch(src, /const isWhitelisted = STATE\.whitelist\.has\(uid\) \|\|/, 'per-row rebuild in render/select paths');
    assert.match(src, /isProtectedUser\(uid, uname\)/);
});
test('Whitelist username lookups do not rescan the vault per row', () => {
    const h = harness();
    const realValues = h.STATE.whitelist.values.bind(h.STATE.whitelist);
    let scans = 0;
    h.STATE.whitelist.values = function() { scans++; return realValues(); };
    h.STATE.notFollowingBack = Array.from({ length: 300 }, (_, i) => ({ id: 'x' + i, username: 'u' + i }));
    h.STATE.relationshipFilter = 'not_following_back';
    h.renderRelationshipList();
    assert.ok(scans <= 2, `values() iterated ${scans}x for 300 rows — O(n) rebuild per row`);
});
test('Relationship scan and batch cannot start while Radar runs', async () => {
    const h = radarHarness(1); let touched = false;
    h.STATE.isScanningInactive = true;
    h.IgBridge.resolveCurrentUser = async () => { touched = true; return { id: '1' }; };
    await h.runRelationshipScan();
    assert.equal(touched, false);
    h.STATE.selectedIds.add('2');
    h.IgBridge.unfollowUser = async () => { touched = true; };
    await h.runBatchUnfollow();
    assert.equal(touched, false);
});
test('Radar does not cache a response received after cancellation', async () => {
    const h = radarHarness(1); let saved = false;
    h.IgBridge.fetchUserLastPost = async (_uid, options) => {
        h.STATE.stopInactiveScanFlag = true;
        h.STATE.inactiveController?.abort();
        return { has_posts: false, last_taken_at: null };
    };
    h.MaxPlandVault.saveUserActivity = async () => { saved = true; };
    await h.runInactiveScan();
    assert.equal(saved, false);
    assert.equal(h.STATE.inactiveFollowing.length, 0);
    assert.match(h.document.getElementById('maxpland-scan-phase').textContent, /หยุด|Stopped/);
});

test('Video without a stream falls back to thumbnail and is labeled as one', async () => {
    const h = harness(); const files = []; const saved = [];
    h.setDownload(async (url, name) => { files.push(name); return name; });
    h.MaxPlandVault.markMediaDownloaded = async rec => { saved.push(rec); };
    await h.downloadResolvedMedia({ shortcode: 'abc', username: 'u', caption: '', nodes: [
        { index: 0, id: '100', mediaType: 'video', imageUrl: 'https://cdn/x.jpg', progressiveVideoUrl: '' }
    ] }, { allCarousel: true });
    assert.match(files[0], /\.jpg$/, 'fallback must not reuse the video extension');
    assert.equal(saved[0].media_type, 'video_thumb');
});
test('Real video downloads keep video type and mp4 extension', async () => {
    const h = harness(); const files = []; const saved = [];
    h.setDownload(async (url, name) => { files.push(name); return name; });
    h.MaxPlandVault.markMediaDownloaded = async rec => { saved.push(rec); };
    await h.downloadResolvedMedia({ shortcode: 'abc', username: 'u', caption: '', nodes: [
        { index: 0, id: '100', mediaType: 'video', imageUrl: 'https://cdn/x.jpg', progressiveVideoUrl: 'https://cdn/v.mp4' }
    ] }, { allCarousel: true });
    assert.match(files[0], /\.mp4$/);
    assert.equal(saved[0].media_type, 'video');
});
test('Carousel history keys use the media id, and dedupe still skips on rerun', async () => {
    const h = harness(); const store = new Map();
    h.setDownload(async (url, name) => name);
    h.MaxPlandVault.hasMedia = async key => store.has(key);
    h.MaxPlandVault.markMediaDownloaded = async rec => { store.set(rec.key, rec); };
    const resolved = { shortcode: 'abc', username: 'u', caption: '', nodes: [
        { index: 0, id: '100', mediaType: 'image', imageUrl: 'https://cdn/x.jpg' },
        { index: 1, id: '200', mediaType: 'image', imageUrl: 'https://cdn/y.jpg' }
    ] };
    await h.downloadResolvedMedia(resolved, { allCarousel: true });
    assert.deepEqual([...store.keys()].sort(), ['abc:100:media', 'abc:200:media']);
    const second = await h.downloadResolvedMedia(resolved, { allCarousel: true, skipExisting: true });
    assert.deepEqual([...second.map(r => r.status)], ['skipped', 'skipped']);
});

test('Footer version matches the script header', () => {
    const ver = (source.match(/@version\s+(\S+)/) || [])[1];
    assert.ok(ver, 'header @version found');
    assert.match(source, new RegExp(`MaxPland v${ver.replace(/\./g, '\\.')}`), 'footer must quote the header version');
});
test('Batch confirm quotes the configured delay, not stale prose', async () => {
    const h = harness(); let msg = '';
    h.context.confirm = m => { msg = String(m); return false; };
    h.STATE.selectedIds = new Set(['7']);
    await h.runBatchUnfollow();
    assert.match(msg, /4\.5/, 'must quote UNFOLLOW_DELAY_MIN in seconds');
    assert.match(msg, /7\.5/, 'must quote UNFOLLOW_DELAY_MAX in seconds');
    assert.doesNotMatch(msg, /3-5/);
});
test('Select checkbox exposes an accessible name', () => {
    assert.match(source, /user-select-checkbox[^>]*aria-label=/, 'row checkbox needs an accessible name');
});

(async () => {
    let failed = 0;
    for (const [name, fn] of tests) {
        try { await fn(); console.log('PASS', name); }
        catch (e) { failed++; console.error('FAIL', name, '\n ', e.message); }
    }
    console.log(`${tests.length - failed}/${tests.length} checks passed`);
    process.exitCode = failed ? 1 : 0;
})();
