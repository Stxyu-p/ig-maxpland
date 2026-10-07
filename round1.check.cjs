// Run: node round1.check.cjs — real userscript, isolated DOM/storage/network boundaries.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sourcePath = require('node:path').resolve(__dirname, process.argv[2] || 'dist/ig_maxpland_en.user.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const tests = [];
function test(name, fn) { tests.push([name, fn]); }
function harness() {
    const nodes = new Map();
    const element = (tagName = 'div') => {
        const el = {
            tagName: tagName.toUpperCase(),
            style: {}, textContent: '', innerHTML: '', disabled: false,
            children: [],
            classList: { add() {}, remove() {}, toggle() {} }, click() {},
            addEventListener(type, fn) { (this.__click ||= {})[type] ||= []; this.__click[type].push(fn); },
            setAttribute() {},
            append(...ch) { this.children.push(...ch); },
            appendChild(ch) { this.children.push(ch); return ch; },
            querySelector() { return null; }, querySelectorAll() { return []; },
            remove() {
                if (this.id && nodes.has(this.id)) nodes.delete(this.id);
            }
        };
        return new Proxy(el, {
            set(target, prop, value) {
                target[prop] = value;
                if (prop === 'id' && typeof value === 'string') {
                    nodes.set(value, target);
                }
                return true;
            }
        });
    };
    const bodyEl = element('body');
    const docListeners = {}; // the row/batch actions live on one delegated document click listener
    const document = { cookie: 'ds_user_id=1; csrftoken=test',
        body: bodyEl,
        addEventListener(type, fn) { (docListeners[type] ||= []).push(fn); },
        dispatch(type, event) { return Promise.all((docListeners[type] || []).map(fn => fn(event))); },
        getElementById(id) {
            if (nodes.has(id)) return nodes.get(id);
            if (id === 'maxpland-story-bar' || id === 'maxpland-profile-avatar-btn') return null;
            const el = element();
            el.id = id;
            nodes.set(id, el);
            return el;
        },
        createElement(tag) { return element(tag); },
        querySelector() { return null; }, querySelectorAll() { return []; } };
    function FakeXHR() {}
    FakeXHR.prototype.open = function(m, u) { this.method = m; this.url = u; };
    FakeXHR.prototype.send = function(b) { this.body = b; };
    FakeXHR.prototype.dispatchEvent = function() {};
    const win = {
        fetch: async (input) => ({ requested: String(typeof input === 'string' ? input : input?.url), status: 200 }),
        XMLHttpRequest: FakeXHR,
        navigator: { sendBeacon: (url) => false },
        innerHeight: 800, innerWidth: 400
    };
    const timers = [];
    const context = vm.createContext({ document, console, URL, URLSearchParams, AbortController, DOMException, Response,
        setTimeout(fn, ms) { // real pending: a 30s request timeout must NOT fire instantly,
            if (ms >= 1000) { timers.push(fn); return timers.length; } // which faked a TIMEOUT on every request
            try { fn && fn(); } catch (_) {} return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
        localStorage: (() => { // Map-backed: the hard-block latch must be assertable
            const m = new Map();
            return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)),
                removeItem: k => m.delete(k), clear: () => m.clear() };
        })(), performance,
        window: win, unsafeWindow: win, location: { pathname: '/', href: 'https://www.instagram.com/' },
        alert() {}, confirm() { return true; } });
    const marker = "    if (document.readyState === 'complete' || document.readyState === 'interactive') {";
    assert.equal(source.split(marker).length, 2);
    // Suppress only automatic startup; exercise original functions without any live API requests.
    vm.runInContext(source.slice(0, source.indexOf(marker)) + `
        globalThis.api = { STATE, IgBridge, MaxPlandVault, runInactiveScan, runRelationshipScan,
            runBatchUnfollow, downloadResolvedMedia, renderRelationshipList, applyUnfollowResult,
            setFollowStateChip, injectStoryBar,
            getActiveStorySection, pickStoryMedia, resolveCurrentStoryMedia, installStorySeenInterceptor,
            bindUIEvents, safeStep, budgetState, formatBudget, localDayKey, getWriteBudget, noteWrite,
            setSleep(fn) { sleep = fn; }, setDownload(fn) { gmDownload = fn; } };
    })();`, context);
    const api = context.api;
    api.setSleep(async () => {});
    api.IgBridge.assertAccount = id => assert.equal(String(id), '1');
    api.STATE.relationshipAccountId = '1';
    return { ...api, context, document, nodes, dispatch: (t, e) => document.dispatch(t, e) };
}

test('Scope gate: removed dead code stays absent from shipped artifacts', () => {
    const path = require('node:path');
    const forbidden = ['downloadCurrentStory', 'getActiveStoryUsername', 'resolveCurrentStoryCover',
        'injectStoryDownloadTools', 'DEFAULT_AVATAR_PATTERNS', 'GM_xmlhttpRequest', 'fbcdn'];
    const kept = ['resolveCurrentStoryMedia', 'renderViewerPanel', 'fetchStoryViewers', 'injectStoryBar'];
    const codeFiles = ['src/app_en.js', 'dist/ig_maxpland_en.user.js', 'ig_maxpland_en.user.js'];
    for (const file of [...codeFiles, 'README.md', 'REFACTOR_PLAN.md']) {
        const text = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
        for (const token of forbidden) assert.ok(!text.includes(token), `${file} still contains removed token: ${token}`);
    }
    for (const file of codeFiles) {
        const text = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
        for (const token of kept) assert.ok(text.includes(token), `${file} lost retained core symbol: ${token}`);
    }
});

test('Story uses only native selectors and runs at document-start', () => {
    assert.equal(source.includes('section:visible'), false, 'native querySelector throws on :visible');
    assert.match(source, /\/\/ @run-at\s+document-start/, 'must run at document-start to catch seen beacons');
});

test('Stealth interceptor drops seen beacons across fetch, XHR, and sendBeacon', async () => {
    const h = harness();
    let networkCalls = [];
    h.context.window.fetch = async (input, init) => {
        networkCalls.push({ type: 'fetch', url: String(typeof input === 'string' ? input : input?.url), body: init?.body });
        return { requested: String(typeof input === 'string' ? input : input?.url), status: 200 };
    };
    let beaconCalls = [];
    h.context.window.navigator.sendBeacon = (url, data) => {
        beaconCalls.push({ url: String(url), data });
        return true;
    };
    let xhrCalls = [];
    h.context.window.XMLHttpRequest.prototype.send = function(body) {
        xhrCalls.push({ url: this.__mpSeenUrl, body });
    };

    vm.runInContext("delete window[Symbol.for('mp_seen_hooked')]", h.context);
    h.installStorySeenInterceptor();

    const fetchFn = h.context.window.fetch;

    // 1. REST seen endpoint
    const mockedRest = await fetchFn('https://www.instagram.com/api/v1/stories/reel/seen/');
    assert.equal(mockedRest.status, 200, 'REST seen mock 200');
    assert.equal(networkCalls.length, 0, 'REST seen must NOT reach network');

    // 2. GraphQL mutation with viewSeenAt
    const mockedGql = await fetchFn('https://www.instagram.com/api/graphql', {
        method: 'POST',
        body: JSON.stringify({ variables: { viewSeenAt: 1726000000 } })
    });
    assert.equal(mockedGql.status, 200, 'GraphQL seen mock 200');
    assert.equal(networkCalls.length, 0, 'GraphQL seen with viewSeenAt must NOT reach network');

    // 3. Read query (web_profile_info) MUST pass through!
    const readQuery = await fetchFn('https://www.instagram.com/api/v1/users/web_profile_info/?username=test');
    assert.equal(networkCalls.length, 1, 'read queries must reach network');
    assert.match(networkCalls[0].url, /web_profile_info/);

    // 4. sendBeacon seen
    const beaconBlocked = h.context.window.navigator.sendBeacon('https://www.instagram.com/api/v1/stories/reel/seen/', 'seen_data');
    assert.equal(beaconBlocked, true);
    assert.equal(beaconCalls.length, 0, 'sendBeacon seen must NOT reach raw sender');

    // 5. XHR seen
    const xhr = new h.context.window.XMLHttpRequest();
    xhr.open('POST', 'https://www.instagram.com/api/v1/stories/reel/seen/');
    xhr.send('seen=1');
    assert.equal(xhrCalls.length, 0, 'XHR seen must NOT reach raw send');
    assert.equal(xhr.status, 200);
});

test('Ghost off passes seen beacons through untouched', async () => {
    const h = harness();
    h.STATE.prefs.stealthStory = false;
    let reachedNetwork = false;
    h.context.window.fetch = async (input) => { reachedNetwork = true; return { requested: String(input), status: 200 }; };
    vm.runInContext("delete window[Symbol.for('mp_seen_hooked')]", h.context);
    h.installStorySeenInterceptor();
    const res = await h.context.window.fetch('https://www.instagram.com/api/v1/stories/reel/seen');
    assert.equal(reachedNetwork, true, 'seen request must pass through when stealth is off');
    assert.equal(res.requested.includes('/seen'), true);
});

test('fetchMediaInfo accepts both numerical mediaIds and shortcodes', async () => {
    const h = harness();
    const requestedUrls = [];
    h.IgBridge.request = async (url) => {
        requestedUrls.push(url);
        return { items: [{ id: '123', media_type: 1 }] };
    };

    // Numerical mediaId
    const item1 = await h.IgBridge.fetchMediaInfo('3456789012345678901');
    assert.equal(requestedUrls[0], '/api/v1/media/3456789012345678901/info/');
    assert.equal(item1.id, '123');

    // Shortcode
    const item2 = await h.IgBridge.fetchMediaInfo('C_abc123');
    const expectedId = h.IgBridge.shortcodeToMediaId('C_abc123');
    assert.equal(requestedUrls[1], `/api/v1/media/${expectedId}/info/`);
});

test('Story media resolution fetches full-res CDN video/image via API when mediaId in URL', async () => {
    const h = harness();
    h.context.location.pathname = '/stories/someone/3456789012345678901/';
    h.IgBridge.fetchMediaInfo = async (mediaId) => ({
        id: mediaId,
        media_type: 2,
        video_versions: [{ url: 'https://cdn.instagram.com/pristine_story.mp4', width: 1080, height: 1920 }],
        image_versions2: { candidates: [{ url: 'https://cdn.instagram.com/pristine_cover.jpg', width: 1080, height: 1920 }] }
    });

    const coverRes = await h.resolveCurrentStoryMedia(true);
    assert.equal(coverRes.url, 'https://cdn.instagram.com/pristine_cover.jpg');
    assert.equal(coverRes.isVideo, false);
});

test('Story media resolution falls back to video poster when API unavailable', async () => {
    const h = harness();
    h.context.location.pathname = '/stories/someone/';
    const videoEl = {
        currentSrc: 'blob:https://www.instagram.com/some-stream-blob',
        getAttribute: (attr) => attr === 'poster' ? 'https://cdn.instagram.com/video_poster.jpg' : null,
        checkVisibility: () => true,
        getBoundingClientRect: () => ({ width: 720, height: 1280, top: 0, bottom: 1280, left: 0, right: 720 })
    };
    h.document.querySelectorAll = sel => (sel.includes('video') ? [videoEl] : []);

    const coverRes = await h.resolveCurrentStoryMedia(true);
    assert.equal(coverRes.url, 'https://cdn.instagram.com/video_poster.jpg');
    assert.equal(coverRes.isVideo, false);
});

test('Story toolbar renders 3 buttons (Stealth + Open Raw + Viewers) and omits download buttons', () => {
    const h = harness();
    h.context.location.pathname = '/stories/someone/';
    const container = {
        tagName: 'SECTION',
        checkVisibility: () => true,
        getBoundingClientRect: () => ({ left: 200, right: 600, top: 50, bottom: 850, width: 400, height: 800 }),
        querySelector: () => null,
        querySelectorAll: () => []
    };
    h.document.querySelectorAll = sel => (sel.includes('section') ? [container] : []);
    h.injectStoryBar();

    const bar = h.document.getElementById('maxpland-story-bar');
    assert.ok(bar, 'story bar must be injected');
    const buttons = bar.children.filter(c => c.tagName === 'BUTTON');
    assert.equal(buttons.length, 3, 'must render exactly 3 buttons: Stealth toggle + Open Raw + Viewers');
    assert.ok(buttons.some(b => b.id === 'maxpland-story-stealth-toggle'), 'stealth toggle present');
    assert.ok(buttons.some(b => b.id === 'maxpland-story-open-btn'), 'open raw tab button present');
    assert.ok(buttons.some(b => b.id === 'maxpland-story-viewers-btn'), 'story viewers button present');
    assert.ok(!buttons.some(b => b.id === 'maxpland-story-dl-btn'), 'download story button stays removed (fragile per v2.7.2)');
    assert.ok(!buttons.some(b => b.id === 'maxpland-story-cover-btn'), 'cover button stays removed');
});

test('Story actions pick the center/active story, never adjacent side stories', async () => {
    const h = harness();
    h.context.window.innerHeight = 900;
    h.context.window.innerWidth = 1920; // center is 960

    const makeSection = (name, left, right) => ({
        tagName: 'SECTION',
        checkVisibility: () => true,
        getBoundingClientRect: () => ({ left, right, top: 50, bottom: 850, width: right - left, height: 800 }),
        querySelector(sel) {
            if (sel.includes('video')) return { currentSrc: `https://cdn.instagram.com/${name}.mp4`, checkVisibility: () => true, getAttribute: () => null, getBoundingClientRect: () => ({ left, right, top: 50, bottom: 850, width: right - left, height: 800 }) };
            if (sel.includes('img')) return { currentSrc: `https://cdn.instagram.com/${name}.jpg`, checkVisibility: () => true, getAttribute: () => null, getBoundingClientRect: () => ({ left, right, top: 50, bottom: 850, width: right - left, height: 800 }) };
            if (sel.includes('a')) return { getAttribute: (a) => a === 'href' ? `/stories/${name}/99999/` : null };
            return null;
        },
        querySelectorAll(sel) {
            const el = this.querySelector(sel);
            return el ? [el] : [];
        }
    });

    const leftSection = makeSection('left_adjacent', 100, 600); // center = 350
    const centerSection = makeSection('center_active', 710, 1210); // center = 960 (exact viewport center!)
    const rightSection = makeSection('right_adjacent', 1320, 1820); // center = 1570

    h.document.querySelectorAll = sel => {
        if (sel.includes('video')) return [leftSection.querySelector('video'), centerSection.querySelector('video'), rightSection.querySelector('video')];
        if (sel.includes('img')) return [leftSection.querySelector('img'), centerSection.querySelector('img'), rightSection.querySelector('img')];
        if (sel.includes('section')) return [leftSection, centerSection, rightSection];
        return [];
    };

    // Story media resolution: center-active beats preloaded adjacent slides
    const resolved = await h.resolveCurrentStoryMedia();
    assert.equal(resolved.url, 'https://cdn.instagram.com/center_active.mp4', 'must resolve center active story, not left adjacent');
});

test('Story media resolution safely resolves 1080p MP4 from React Fiber when video is blob without thread lock', async () => {
    const h = harness();
    h.context.window.innerHeight = 900;
    h.context.window.innerWidth = 1920;

    const blobVideo = {
        tagName: 'VIDEO',
        currentSrc: 'blob:https://www.instagram.com/1234-abcd',
        checkVisibility: () => true,
        getAttribute: () => null,
        getBoundingClientRect: () => ({ left: 700, right: 1220, top: 0, bottom: 900, width: 520, height: 900 }),
        '__reactFiber$test': {
            memoizedProps: {
                item: {
                    video_versions: [
                        { url: 'https://scontent.cdninstagram.com/v/t50/video_sd.mp4', width: 720, height: 1280 },
                        { url: 'https://scontent.cdninstagram.com/v/t50/video_1080p.mp4', width: 1080, height: 1920 }
                    ],
                    image_versions2: {
                        candidates: [
                            { url: 'https://scontent.cdninstagram.com/v/t51/cover_1080p.jpg', width: 1080, height: 1920 }
                        ]
                    }
                }
            }
        }
    };
    h.document.querySelectorAll = sel => (sel.includes('video') ? [blobVideo] : []);

    const resolved = await h.resolveCurrentStoryMedia();
    assert.equal(resolved.url, 'https://scontent.cdninstagram.com/v/t50/video_1080p.mp4', 'must extract high-res 1080p MP4 from React Fiber');
});

test('Thumbnail resolution prefers a real cover image over the tiny avatar', async () => {
    const h = harness();
    h.context.window.innerHeight = 800; h.context.window.innerWidth = 400;
    const bigImg = { currentSrc: 'https://cdn.instagram.com/story_cover.jpg', checkVisibility: () => true,
        getAttribute: () => null,
        getBoundingClientRect: () => ({ width: 720, height: 1280, top: 0, bottom: 1280, left: 0, right: 720 }) };
    const avatarImg = { currentSrc: 'https://cdn.instagram.com/avatar_50x50.jpg', checkVisibility: () => true,
        getAttribute: () => null,
        getBoundingClientRect: () => ({ width: 40, height: 40, top: 10, bottom: 50, left: 10, right: 50 }) };
    h.document.querySelectorAll = sel => (sel.includes('video') ? [] : [avatarImg, bigImg]);
    const resolved = await h.resolveCurrentStoryMedia(true);
    assert.equal(resolved.url, 'https://cdn.instagram.com/story_cover.jpg', 'must pick the story cover, not the 50px avatar');
    assert.equal(resolved.isVideo, false, 'cover resolves as an image');
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
    h.MaxPlandVault.saveSnapshot = async () => {};
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
test('Avatar detection handles real profile_pic_url without throwing and filters default avatars', async () => {
    const h = analyzeHarness(4);
    const userWithAvatar = {
        id: '201',
        username: 'real_user',
        profile_pic_url: 'https://instagram.fcbr1-1.fna.fbcdn.net/v/t51.2885-19/12345678_real.jpg'
    };
    const userWithDefaultAvatar1 = {
        id: '202',
        username: 'ghost_user_1',
        profile_pic_url: 'https://instagram.fcbr1-1.fna.fbcdn.net/v/t51.2885-19/44884218_345707102882519_2446069589734326272_n.jpg'
    };
    const userWithDefaultAvatar2 = {
        id: '203',
        username: 'ghost_user_2',
        profile_pic_url: 'https://instagram.fcbr1-1.fna.fbcdn.net/v/t51.2885-19/464760996_1254146839119862_3605321457742435801_n.jpg'
    };
    const userWithAnonFlag = {
        id: '204',
        username: 'anon_user',
        profile_pic_url: 'https://instagram.fcbr1-1.fna.fbcdn.net/v/t51.2885-19/99999999_custom.jpg',
        has_anonymous_profile_picture: true
    };
    const followers = [userWithAvatar, userWithDefaultAvatar1, userWithDefaultAvatar2, userWithAnonFlag];
    h.STATE.following = [userWithAvatar];
    h.IgBridge.fetchAllRelationships = async endpoint => {
        const list = endpoint === 'followers' ? [...followers] : [userWithAvatar];
        list.completed = true;
        return list;
    };
    await h.runRelationshipScan();
    assert.equal(h.STATE.ghostFollowers.length, 3, 'Default avatars and anonymous avatar are detected as ghosts');
    assert.equal(h.STATE.ghostFollowers.some(u => u.id === '201'), false, 'Real user with avatar is not a ghost');
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

function rateLimitHarness(respond) {
    const h = harness();
    h.context.localStorage.clear();
    h.IgBridge.hardBlockAccount = null;
    h.IgBridge.hardBlockAt = 0;
    h.IgBridge.cooldownUntil = 0;
    h.IgBridge.cooldownAccount = null;
    h.context.window.fetch = async () => respond();
    h.context.showToast = () => {};
    return h;
}
const softLimitResponse = () => ({
    status: 429, url: 'https://www.instagram.com/api/v1/friendships/2/following/',
    headers: { get: () => null },
    text: async () => JSON.stringify({ message: 'Please wait a few minutes before you try again.', error_type: 'rate_limit_error' })
});
const hardLimitResponse = () => ({
    status: 429, url: 'https://www.instagram.com/api/v1/friendships/2/following/',
    headers: { get: () => null },
    text: async () => JSON.stringify({ message: 'feedback_required' })
});

test('A plain 429 rate_limit_error stays on the SOFT tier and never latches the hard block', async () => {
    const h = rateLimitHarness(softLimitResponse);
    const err = await h.IgBridge.request('/api/v1/friendships/2/following/').then(() => null, e => e);
    assert.equal(err?.code, 'RATE_LIMIT', 'must surface as a retriable rate limit');
    assert.equal(h.IgBridge.hardBlockAccount, null, 'a 10-minute nuisance must not become a 6h lockout');
    assert.equal(h.context.localStorage.getItem('maxpland_hard_block'), null, 'nothing may persist to storage');
    // The soft brake must actually hold: a follow-up request is refused without hitting the network.
    let reached = 0;
    h.context.window.fetch = async () => { reached++; return softLimitResponse(); };
    const second = await h.IgBridge.request('/api/v1/friendships/2/following/').then(() => null, e => e);
    assert.equal(second?.code, 'RATE_LIMIT');
    assert.equal(reached, 0, 'cooldown must refuse before the network');
    assert.ok(h.IgBridge.cooldownUntil - Date.now() > 9 * 60 * 1000, 'floor is 10 minutes, not 60s');
});
test('feedback_required latches the hard block, survives reload, and is clearable from Settings', async () => {
    const h = rateLimitHarness(hardLimitResponse);
    const err = await h.IgBridge.request('/api/v1/friendships/2/following/').then(() => null, e => e);
    assert.equal(err?.code, 'BLOCKED');
    assert.equal(h.IgBridge.hardBlockAccount, '1', 'latched in memory');
    const saved = JSON.parse(h.context.localStorage.getItem('maxpland_hard_block'));
    assert.equal(String(saved.account), '1', 'latched to storage so a refresh cannot escape it');
    // Reload: a fresh runtime restores the latch from storage and refuses every request.
    const reloaded = rateLimitHarness(softLimitResponse);
    reloaded.context.localStorage.setItem('maxpland_hard_block', JSON.stringify(saved));
    reloaded.IgBridge.restoreHardBlock();
    let reached = 0;
    reloaded.context.window.fetch = async () => { reached++; return softLimitResponse(); };
    const afterReload = await reloaded.IgBridge.request('/api/v1/friendships/2/following/').then(() => null, e => e);
    assert.equal(afterReload?.code, 'BLOCKED', 'a reload must not reset the block');
    assert.equal(reached, 0, 'and must not reach the network');
    // Settings -> Clear Block is the only exit.
    reloaded.context.window.fetch = async () => ({ ok: true, status: 200, url: '', headers: { get: () => null },
        text: async () => JSON.stringify({ status: 'ok' }) });
    reloaded.IgBridge.clearHardBlock();
    assert.equal(reloaded.IgBridge.hardBlockAccount, null);
    assert.equal(reloaded.context.localStorage.getItem('maxpland_hard_block'), null);
    await assert.doesNotReject(reloaded.IgBridge.request('/api/v1/friendships/2/following/'));
});
test('Row-by-row unfollow is paced; the row path cannot outrun the batch path', async () => {
    const h = harness();
    let writes = 0;
    h.IgBridge.unfollowUser = async () => { writes++; };
    h.bindUIEvents(h.document.getElementById('trigger'), h.document.getElementById('overlay'), h.document.getElementById('modal'));
    // A fresh button per click: the real row is re-rendered after each unfollow, so a
    // reused button would keep the disabled=true the handler set and fake a pass.
    const rowClick = async () => {
        const btn = { dataset: { id: '2', user: 'a' }, disabled: false, textContent: '', innerHTML: '',
            closest: sel => (sel === '.maxpland-row-unfollow-btn' ? btn : null) };
        for (const fn of (h.nodes.get('maxpland-relationship-list').__click || {}).click || []) await fn({ target: btn });
        return String(h.document.getElementById('maxpland-toast').textContent);
    };

    // A write landed one second ago: the next row click must be refused, not sent.
    h.STATE.lastUnfollowAt = Date.now() - 1000;
    assert.match(await rowClick(), /Safety pacing/i, 'a row click inside the window must be refused with a reason');
    assert.equal(writes, 0, 'no write may escape the pacing guard');

    // Outside the window the row path runs, and it stamps the shared clock for the next one.
    h.STATE.lastUnfollowAt = 0;
    await rowClick();
    assert.equal(writes, 1);
    assert.ok(h.STATE.lastUnfollowAt > 0, 'a successful row unfollow must stamp the shared clock');

    // Immediately after, a second row click is refused again — the guard is stateful, not cosmetic.
    assert.match(await rowClick(), /Safety pacing/i, 'the second rapid click must be refused too');
    assert.equal(writes, 1, 'and must not write');
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
    assert.match(msg, /random delay 15-30 seconds per account/, 'must quote the researched unfollow delay window');
    assert.doesNotMatch(msg, /3-5/);
});
test('Select checkbox exposes an accessible name', () => {
    assert.match(source, /user-select-checkbox[^>]*aria-label=/, 'row checkbox needs an accessible name');
});
test('Inter-page pacing honors the Safe preset jitter window', async () => {
    const h = harness();
    const PAGES = 8, PER = 3;
    let page = 0, cur = 0;
    const pauses = [];
    h.IgBridge.fetchRelationshipPage = async (_endpoint, _uid, _cursor) => {
        pauses.push(cur); cur = 0;
        page++;
        const users = Array.from({ length: PER }, (_, i) => ({ id: String(page * 100 + i), username: 'u' }));
        return { users, has_more: page < PAGES, next_max_id: page < PAGES ? 'c' + page : null };
    };
    h.setSleep(async ms => { cur += ms; });
    const all = await h.IgBridge.fetchAllRelationships('followers', '1', 250, () => {});
    assert.equal(all.completed, true);
    assert.equal(all.length, PAGES * PER, 'all pages fetched and deduped');
    pauses.shift(); // no pause precedes page 1
    assert.equal(pauses.length, PAGES - 1, 'one pause per inter-page gap');
    for (const p of pauses) assert.ok(p >= 6000 && p <= 12250, `pause ${Math.round(p)}ms outside the A Safe window (6-12s + chunk overshoot)`);
});

function perfHarness(pageCount, { usersPerPage = 12 } = {}) {
    const h = harness();
    h.MaxPlandVault.getLatestSnapshot = async () => null;
    h.MaxPlandVault.getWhitelist = async () => new Map();
    h.MaxPlandVault.saveSnapshot = async () => {};
    h.IgBridge.resolveCurrentUser = async () => ({ id: '1', username: 'me' });
    h.IgBridge.fetchAllRelationships = async (endpoint, _uid, _limit, onProgress) => {
        const list = [];
        list.completed = true;
        list.pagesFetched = 0;
        for (let p = 1; p <= pageCount; p++) {
            for (let i = 0; i < usersPerPage; i++) list.push({ id: String(endpoint.length * 100000 + p * 1000 + i), username: 'u' });
            list.pagesFetched = p;
            onProgress?.(list.length, p, null);
        }
        return list;
    };
    return h;
}
test('Relationship scan surfaces time accounting for the next real scan', async () => {
    const h = perfHarness(4);
    await h.runRelationshipScan();
    const st = h.STATE.scanStatus;
    assert.ok(st && Number.isFinite(st.requestMs) && Number.isFinite(st.waitMs) && Number.isFinite(st.wallMs), 'scanStatus must carry requestMs/waitMs/wallMs');
    assert.ok(st.wallMs >= 0 && st.requestMs >= 0 && st.waitMs >= 0);
    const summary = String(h.document.getElementById('maxpland-scan-status-summary').textContent);
    assert.match(summary, /ดึงข้อมูล|Fetch/, 'summary shows network time');
    assert.match(summary, /รวม|Total/, 'summary shows wall time');
});

test('Scan speed lives in settings prefs, defaults to A, gone from action bar', () => {
    assert.match(source, /id="pref-setting-scan-speed"[^>]*aria-label=/);
    assert.match(source, /option value="A" selected/);
    assert.equal(source.includes('maxpland-scan-speed'), false, 'old action-bar select must be removed');
    assert.match(source, /scanSpeed/, 'prefs must persist scanSpeed');
});
test('Every speed mode fetches serially (peak concurrency 1)', async () => {
    for (const mode of ['A', 'B', 'C', 'invalid']) {
        const h = perfHarness(1); let active = 0, peak = 0, calls = 0;
        h.STATE.prefs.scanSpeed = mode;
        h.IgBridge.fetchAllRelationships = async (_endpoint, _uid, _limit, progress, speed) => {
            calls++; active++; peak = Math.max(peak, active);
            assert.equal(speed, mode === 'invalid' ? 'A' : mode);
            await new Promise(resolve => setImmediate(resolve));
            progress(3, 1); active--;
            return Object.assign([], { completed: true });
        };
        await h.runRelationshipScan();
        assert.equal(calls, 2);
        assert.equal(peak, 1, `${mode}: every mode must fetch serially — combined request rate is what detection sees`);
        assert.equal(h.STATE.scanIncomplete, false);
    }
});
test('C confirmation can cancel without starting any request', async () => {
    const h = perfHarness(1); let calls = 0;
    h.STATE.prefs.scanSpeed = 'C';
    h.context.confirm = () => false;
    h.IgBridge.resolveCurrentUser = async () => { calls++; };
    await h.runRelationshipScan();
    assert.equal(calls, 0); assert.equal(h.STATE.isScanning, false);
});
test('Fetch failure stops the scan before the second list; never saves partial snapshot', async () => {
    for (const code of ['RATE_LIMIT', 'CHECKPOINT', 'AUTH', 'ACCOUNT_CHANGED', 'PAYLOAD']) {
        const h = perfHarness(1); let saved = 0, secondListStarted = false;
        h.STATE.prefs.scanSpeed = 'B';
        h.MaxPlandVault.saveSnapshot = async () => { saved++; };
        h.IgBridge.fetchAllRelationships = async endpoint => {
            if (endpoint === 'followers') {
                await new Promise(resolve => setImmediate(resolve));
                return Object.assign([], { completed: false, lastError: Object.assign(new Error(code), { code }) });
            }
            secondListStarted = true;
            return Object.assign([], { completed: true });
        };
        await h.runRelationshipScan();
        assert.equal(saved, 0);
        assert.equal(secondListStarted, false, 'serial mode must not start the second list after a failure');
        assert.equal(h.STATE.scanIncomplete, true);
        assert.equal(h.STATE.scanController, null);
        assert.match(h.document.getElementById('maxpland-scan-notice').textContent, new RegExp(code));
    }
});
test('Each speed mode pages inside its own preset jitter window', async () => {
    const WINDOWS = { A: [6000, 12250], B: [3000, 6250], C: [1500, 3250] };
    for (const mode of ['A', 'B', 'C']) {
        const h = harness(); let requests = 0, waited = 0;
        h.IgBridge.fetchRelationshipPage = async () => ({ users: [{ id: String(++requests) }], next_max_id: requests === 1 ? 'next' : null });
        h.setSleep(async ms => { waited += ms; });
        const result = await h.IgBridge.fetchAllRelationships('followers', '1', 250, null, mode);
        assert.equal(result.completed, true);
        const [lo, hi] = WINDOWS[mode];
        assert.ok(waited >= lo && waited <= hi, `${mode}: ${waited} outside preset window ${lo}-${hi}`);
    }
});
test('Aborting during pause prevents the next page', async () => {
    const h = harness(); let calls = 0;
    h.STATE.scanController = new AbortController();
    h.IgBridge.fetchRelationshipPage = async () => { calls++; return { users: [{ id: '2' }], next_max_id: 'next' }; };
    h.setSleep(async () => h.STATE.scanController.abort());
    const result = await h.IgBridge.fetchAllRelationships('followers', '1', 250, null, 'C');
    assert.equal(calls, 1); assert.equal(result.completed, false);
});

test('Follow-state chips filter by presence in our Following list, exclusively', () => {
    assert.match(source, /toggle-filter-following'\)\.addEventListener\('click', \(\) => setFollowStateChip\('onlyFollowing'\)/);
    assert.match(source, /toggle-filter-notfollowing'\)\.addEventListener\('click', \(\) => setFollowStateChip\('onlyNotFollowed'\)/);
    for (const flag of ['onlyFollowing', 'onlyNotFollowed']) {
        const h = harness();
        h.STATE.relationshipFilter = 'ghost';
        h.STATE.ghostFollowers = [
            { id: '2', username: 'followed_person' },
            { id: '3', username: 'stranger_person' }
        ];
        h.STATE.following = [{ id: '2', username: 'followed_person' }];
        h.STATE.subFilters[flag] = true;
        h.renderRelationshipList();
        const rows = String(h.document.getElementById('maxpland-relationship-list').innerHTML);
        assert.equal(rows.includes('followed_person'), flag === 'onlyFollowing', flag);
        assert.equal(rows.includes('stranger_person'), flag === 'onlyNotFollowed', flag);
    }
});
test('Follow-state chips are mutually exclusive and re-click clears', () => {
    const h = harness();
    h.setFollowStateChip('onlyFollowing');
    assert.equal(h.STATE.subFilters.onlyFollowing, true);
    h.setFollowStateChip('onlyNotFollowed');
    assert.equal(h.STATE.subFilters.onlyFollowing, false, 'activating one clears the other');
    assert.equal(h.STATE.subFilters.onlyNotFollowed, true);
    h.setFollowStateChip('onlyNotFollowed');
    assert.equal(h.STATE.subFilters.onlyNotFollowed, false, 're-click clears');
});

test('Legacy fields stay removed and settings delay reads config', () => {
    assert.doesNotMatch(source, /isSuspiciousBot|cachedAppId|\bVERSION:\s*'2\.7\.0'/);
    assert.equal(source.includes('3,000 - 5,000 ms'), false);
    assert.ok(source.includes('${APP_CONFIG.UNFOLLOW_DELAY_MIN.toLocaleString()} - ${APP_CONFIG.UNFOLLOW_DELAY_MAX.toLocaleString()} ms'));
});

test('Export actions have a separate row after filters', () => {
    const filters = source.slice(source.indexOf('<div class="maxpland-subfilters">'), source.indexOf('<!-- Action Bar -->'));
    assert.match(filters, /<\/div>\s*<\/div>\s*<div class="maxpland-export-actions"/);
    assert.match(source, /\.maxpland-export-actions\s*\{[^}]*display: flex;[^}]*justify-content: flex-end;[^}]*flex-wrap: wrap;/);
    const [chips, actions] = filters.split('<div class="maxpland-export-actions"');
    assert.equal((chips.match(/id="toggle-filter-/g) || []).length, 6);
    assert.equal((actions.match(/id="maxpland-btn-(?:copy-usernames|export-csv|export-json)"/g) || []).length, 3);
});

test('Daily unfollow ceiling refuses the write at the action boundary', async () => {
    const h = harness(); let requests = 0;
    h.context.localStorage.setItem('maxpland_write_budget', JSON.stringify({ day: new Date().toISOString().slice(0, 10), daily: 180 }));
    h.STATE.prefs.dailyUnfollowCap = 180;
    h.STATE.following = [{ id: '2', username: 'a' }];
    h.IgBridge.request = async () => { requests++; return { status: 'ok', friendship_status: { following: false } }; };
    await assert.rejects(h.IgBridge.unfollowUser('2'), /ceiling/i);
    assert.equal(requests, 0, 'a capped account must never reach Instagram');
});

test('Daily ceiling stops the batch and keeps pending selections', async () => {
    const h = harness(); let requests = 0;
    h.context.localStorage.setItem('maxpland_write_budget', JSON.stringify({ day: new Date().toISOString().slice(0, 10), daily: 181 }));
    h.STATE.prefs.dailyUnfollowCap = 180;
    h.STATE.selectedIds = new Set(['2', '3']);
    h.STATE.following = [{ id: '2', username: 'a' }, { id: '3', username: 'b' }];
    h.IgBridge.request = async () => { requests++; return { status: 'ok', friendship_status: { following: false } }; };
    await h.runBatchUnfollow();
    assert.equal(requests, 0, 'the batch must stop at the ceiling, not burn the remaining selections');
    assert.equal(h.STATE.selectedIds.size, 2, 'pending work stays selected for after the ceiling is raised');
});

test('Daily ceiling of 0 keeps delay-only behavior, and the label reads the cap', () => {
    const h = harness();
    h.STATE.prefs.dailyUnfollowCap = 0;
    h.context.localStorage.setItem('maxpland_write_budget', JSON.stringify({ day: new Date().toISOString().slice(0, 10), daily: 9999 }));
    assert.equal(h.budgetState().blocked, false, 'ceiling off must not block writes');
    assert.match(h.formatBudget(), /ceiling off/);
    h.STATE.prefs.dailyUnfollowCap = 180;
    assert.match(h.formatBudget(), /9,999 \/ 180 unfollowed today/);
});

test('Snapshot retention drops history beyond the newest 30 per account', async () => {
    const h = harness();
    // Object stores are separate in IndexedDB, so the fake must be name-aware: a churn write
    // landing in the snapshot map would fake a prune failure.
    const stores = { snapshots: new Map(), churn: new Map() };
    const records = stores.snapshots;
    for (let i = 0; i < 35; i++) records.set(1000 + i, { timestamp: 1000 + i, complete: true, account_id: '1' });
    const deleted = [];
    h.MaxPlandVault.init = async () => ({
        transaction: (name = 'snapshots') => {
            const records = stores[name] || (stores[name] = new Map());
            const store = {
                put(rec) { records.set(rec.timestamp, rec); },
                delete(key) { deleted.push(key); records.delete(key); },
                openCursor() {
                    const keys = [...records.keys()].sort((a, b) => b - a);
                    const req = {};
                    let i = 0;
                    const step = () => {
                        if (i >= keys.length) { if (req.onsuccess) req.onsuccess({ target: { result: null } }); return; }
                        const key = keys[i++];
                        const cursor = { value: records.get(key), delete() { deleted.push(key); records.delete(key); },
                            continue() { step(); } };
                        if (req.onsuccess) req.onsuccess({ target: { result: cursor } });
                    };
                    setImmediate(step);
                    return req;
                }
            };
            const tx = { objectStore: () => store, abort() {}, addEventListener() {}, removeEventListener() {},
                onerror: null, onabort: null,
                set oncomplete(fn) { this._oc = fn; setImmediate(() => this._oc && this._oc()); },
                get oncomplete() { return this._oc; } };
            return tx;
        }
    });
    h.IgBridge.resolveCurrentUser = async () => ({ id: '1', username: 'me' });
    h.IgBridge.fetchAllRelationships = async endpoint => {
        const list = []; list.completed = true;
        if (endpoint === 'followers') list.push({ id: '2', username: 'aa' });
        return list;
    };
    h.MaxPlandVault.getLatestSnapshot = async () => null;
    h.MaxPlandVault.getWhitelist = async () => new Map();
    await h.runRelationshipScan();
    const kept = [...records.values()].filter(r => r.complete && r.account_id === '1');
    assert.equal(kept.length, 30, 'the store stays bounded at the retention window');
    assert.ok(deleted.length >= 6, 'the oldest snapshots are the ones dropped');
    assert.equal(stores.churn.size, 1, 'the churn row is written to its own store, not the snapshot store');
});

test('Daily ceiling rolls over at local midnight, and legacy UTC counters survive the upgrade', () => {
    const h = harness();
    const KEY = 'maxpland_write_budget';
    const local = h.localDayKey();
    h.STATE.prefs.dailyUnfollowCap = 180;
    h.context.localStorage.setItem(KEY, JSON.stringify({ day: local, daily: 179 }));
    assert.equal(h.budgetState().blocked, false, 'a counter under the cap on the same local day is fine');
    h.context.localStorage.setItem(KEY, JSON.stringify({ day: local, daily: 180 }));
    assert.equal(h.budgetState().blocked, true, 'the ceiling blocks on the local day key');
    // Pre-3.2 builds keyed the counter by the UTC date and carried no tz marker.
    h.context.localStorage.setItem(KEY, JSON.stringify({ day: new Date().toISOString().slice(0, 10), daily: 400 }));
    assert.equal(h.budgetState().blocked, true, 'a legacy UTC counter is adopted, never silently reset');
    h.context.localStorage.setItem(KEY, JSON.stringify({ day: '1999-01-01', daily: 400, tz: 'local' }));
    assert.equal(h.budgetState().blocked, false, 'yesterday does not carry into today');
    h.noteWrite();
    const saved = JSON.parse(h.context.localStorage.getItem(KEY));
    assert.equal(saved.day, local, 'writes stamp the local date');
    assert.equal(saved.tz, 'local', 'writes mark the key as local so it is never re-migrated');
    assert.equal(saved.daily, 1);
});

test('A checkpoint parked at the page cap cannot deadlock the scanner', async () => {
    const h = harness();
    const KEY = 'mp_scan_resume_followers';
    h.context.localStorage.setItem(KEY, JSON.stringify({ userId: '1', cursor: 'c5', transport: 'rest', pagesFetched: 2, users: [{ id: '1', username: 'u' }], savedAt: Date.now() }));
    let page = 0;
    h.IgBridge.fetchRelationshipPage = async () => {
        page++;
        return { users: [{ id: String(100 + page), username: 'x' }], has_more: page < 2, next_max_id: page < 2 ? 'c' + page : null };
    };
    const first = await h.IgBridge.fetchAllRelationships('followers', '1', 2, () => {});
    assert.equal(first.completed, true, 'a capped checkpoint is dropped instead of re-failing forever');
    assert.equal(h.STATE.scanResumedFrom, 0, 'a dropped checkpoint must not claim a resume');
    assert.equal(h.context.localStorage.getItem(KEY), null, 'the poisoned checkpoint is gone after the scan completes');
});

test('A stale checkpoint is dropped, a fresh one resumes and reports its page', async () => {
    const h = harness();
    const KEY = 'mp_scan_resume_followers';
    h.IgBridge.fetchRelationshipPage = async () => ({ users: [{ id: '9', username: 'y' }], has_more: false, next_max_id: null });
    h.context.localStorage.setItem(KEY, JSON.stringify({ userId: '1', cursor: 'c5', transport: 'rest', pagesFetched: 1, users: [{ id: '7', username: 'kept' }], savedAt: Date.now() - 25 * 3600 * 1000 }));
    const stale = await h.IgBridge.fetchAllRelationships('followers', '1', 60, () => {});
    assert.equal(stale.length, 1, 'a 25h-old checkpoint must not seed the list');
    assert.equal(h.STATE.scanResumedFrom, 0);
    h.context.localStorage.setItem(KEY, JSON.stringify({ userId: '1', cursor: 'c5', transport: 'rest', pagesFetched: 3, users: [{ id: '7', username: 'kept' }], savedAt: Date.now() }));
    const resumed = await h.IgBridge.fetchAllRelationships('followers', '1', 60, () => {});
    assert.equal(resumed.length, 2, 'the kept users plus the newly fetched page');
    assert.equal(h.STATE.scanResumedFrom, 3, 'the UI needs to know it resumed');
});

test('Churn history records who was lost, and merges with retained cycles', async () => {
    const h = harness();
    h.IgBridge.resolveCurrentUser = async () => ({ id: '1', username: 'me' });
    h.IgBridge.fetchAllRelationships = async endpoint => {
        const list = []; list.completed = true;
        list.push(endpoint === 'followers' ? { id: '2', username: 'still' } : { id: '3', username: 'x' });
        return list;
    };
    h.MaxPlandVault.getLatestSnapshot = async () => ({ complete: true, account_id: '1', follower_ids: ['2', '42'], follower_usernames: { 42: 'gone_guy' } });
    h.MaxPlandVault.getWhitelist = async () => new Map();
    h.MaxPlandVault.saveSnapshot = async () => {};
    h.MaxPlandVault.getChurnHistory = async () => [{ timestamp: Date.now() - 86400000, complete: true, account_id: '1', lost: [{ id: '77', username: 'older_gone' }] }];
    const writes = [];
    h.MaxPlandVault.saveChurn = async (record, account) => { writes.push({ record, account }); };
    await h.runRelationshipScan();
    assert.equal(writes.length, 1, 'one churn row per completed scan');
    // Array.from rebuilds in the host realm: deepStrictEqual compares prototypes, and vm arrays
    // never match host arrays even when the values do.
    const lost = Array.from(writes[0].record.lost, u => ({ id: u.id, username: u.username }));
    assert.deepEqual(lost, [{ id: '42', username: 'gone_guy' }], 'lost keeps the last known username');
    assert.deepEqual(Array.from(writes[0].record.rejoined), [], 'nobody rejoined in this cycle');
    assert.equal(writes[0].account, '1');
    assert.deepEqual(Array.from(h.STATE.churnLost30, u => u.username), ['gone_guy', 'older_gone'], 'the 30-day view merges the new cycle with retained ones');
    assert.equal(String(h.document.getElementById('pill-count-churn').textContent), '2');
});

test('A rejoining follower is reported as rejoined, not as a stranger', async () => {
    const h = harness();
    h.IgBridge.resolveCurrentUser = async () => ({ id: '1', username: 'me' });
    h.IgBridge.fetchAllRelationships = async endpoint => {
        const list = []; list.completed = true;
        if (endpoint === 'followers') list.push({ id: '2', username: 'back_again' });
        return list;
    };
    h.MaxPlandVault.getLatestSnapshot = async () => ({ complete: true, account_id: '1', follower_ids: [], follower_usernames: {} });
    h.MaxPlandVault.getWhitelist = async () => new Map();
    h.MaxPlandVault.saveSnapshot = async () => {};
    h.MaxPlandVault.getChurnHistory = async () => [{ timestamp: Date.now() - 86400000, lost: [{ id: '2', username: 'back_again' }] }];
    let record = null;
    h.MaxPlandVault.saveChurn = async r => { record = r; };
    await h.runRelationshipScan();
    const rejoined = Array.from(record.rejoined, u => ({ id: u.id, username: u.username }));
    assert.deepEqual(rejoined, [{ id: '2', username: 'back_again' }], 'a returning follower is flagged');
    assert.deepEqual(Array.from(record.lost), [], 'and is not double-counted as lost');
});

test('A failing churn store cannot fail a completed scan', async () => {
    const h = harness();
    h.IgBridge.resolveCurrentUser = async () => ({ id: '1', username: 'me' });
    h.IgBridge.fetchAllRelationships = async () => { const l = []; l.completed = true; return l; };
    h.MaxPlandVault.getLatestSnapshot = async () => null;
    h.MaxPlandVault.getWhitelist = async () => new Map();
    h.MaxPlandVault.saveSnapshot = async () => {};
    h.MaxPlandVault.getChurnHistory = async () => { throw new Error('churn store offline'); };
    h.MaxPlandVault.saveChurn = async () => { throw new Error('churn store offline'); };
    await h.runRelationshipScan();
    assert.equal(h.STATE.scanIncomplete, false, 'history is a bonus; the scan result still stands');
    assert.match(String(h.document.getElementById('maxpland-scan-phase').textContent), /completed/i);
});

test('Scan resume checkpoints every 5th page instead of every page', async () => {
    const h = harness();
    const writes = [];
    const realSet = h.context.localStorage.setItem;
    h.context.localStorage.setItem = (k, v) => { if (String(k).startsWith('mp_scan_resume_')) writes.push(k); return realSet(k, v); };
    const PAGES = 12;
    let page = 0;
    h.IgBridge.fetchRelationshipPage = async () => {
        page++;
        return { users: [{ id: String(page), username: 'u' }], has_more: page < PAGES, next_max_id: page < PAGES ? 'c' + page : null };
    };
    const all = await h.IgBridge.fetchAllRelationships('followers', '1', 250, () => {});
    assert.equal(all.completed, true);
    assert.ok(writes.length >= 1, 'a long scan must still checkpoint for resume');
    assert.ok(writes.length <= 3, 'a 12-page scan must not rewrite the whole checkpoint per page (wrote ' + writes.length + ')');
});

test('One failing injector cannot take the toolbar or observer down', async () => {
    const h = harness();
    const order = [];
    assert.equal(h.safeStep('boom', () => { order.push('a'); throw new Error('boom'); }), null, 'safeStep must swallow the failure');
    h.safeStep('ok', () => order.push('b'));
    assert.deepEqual(order, ['a', 'b'], 'later steps still run after a failure');
    const initBody = source.slice(source.indexOf('async function init()'));
    assert.ok(initBody.indexOf('startPageObserver()') < initBody.indexOf("safeStep('feed tools'"),
        'the observer must start before the injectors it has to outlive');
    for (const label of ['stealth interceptor', 'clean feed', 'feed tools', 'story bar', 'profile badge']) {
        assert.ok(initBody.includes("safeStep('" + label + "'"), `init must contain ${label} as a contained step`);
    }
});

test('Search keystrokes still filter, and the render is coalesced', async () => {
    const h = harness();
    h.bindUIEvents(h.document.getElementById('trigger'), h.document.getElementById('overlay'), h.document.getElementById('modal'));
    const pool = [{ id: '2', username: 'alpha' }, { id: '3', username: 'beta' }];
    h.STATE.followers = pool;
    h.STATE.notFollowingBack = pool;
    const input = h.nodes.get('maxpland-user-search');
    const handlers = ((input || {}).__click || {}).input || [];
    assert.ok(handlers.length, 'the search box is wired');
    for (const fn of handlers) fn({ target: { value: 'beta' } });
    const html = String(h.document.getElementById('maxpland-relationship-list').innerHTML);
    assert.match(html, /beta/, 'the filtered row is rendered');
    assert.doesNotMatch(html, /alpha/, 'non-matching rows are dropped');
    assert.match(source, /STATE\.searchRenderTimer = setTimeout/, 'keystrokes must be coalesced into one render');
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
