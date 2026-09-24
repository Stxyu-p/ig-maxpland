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
            classList: { add() {}, remove() {}, toggle() {} }, click() {}, addEventListener() {},
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
    const document = { cookie: 'ds_user_id=1; csrftoken=test',
        body: bodyEl,
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
    const context = vm.createContext({ document, console, URL, URLSearchParams, AbortController, DOMException, Response,
        setTimeout(fn) { try { fn && fn(); } catch (_) {} return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
        localStorage: { getItem() { return null; }, setItem() {} }, performance,
        window: win, unsafeWindow: win, location: { pathname: '/', href: 'https://www.instagram.com/' },
        alert() {}, confirm() { return true; } });
    const marker = "    if (document.readyState === 'complete' || document.readyState === 'interactive') {";
    assert.equal(source.split(marker).length, 2);
    // Suppress only automatic startup; exercise original functions without any live API requests.
    vm.runInContext(source.slice(0, source.indexOf(marker)) + `
        globalThis.api = { STATE, IgBridge, MaxPlandVault, runInactiveScan, runRelationshipScan,
            runBatchUnfollow, downloadResolvedMedia, renderRelationshipList, applyUnfollowResult,
            setFollowStateChip, injectStoryDownloadTools, downloadCurrentStoryMedia, downloadCurrentStoryCover,
            getActiveStorySection, pickStoryMedia, resolveCurrentStoryMedia, resolveCurrentStoryCover, installStorySeenInterceptor,
            bindUIEvents, setSleep(fn) { sleep = fn; }, setDownload(fn) { gmDownload = fn; } };
    })();`, context);
    const api = context.api;
    api.setSleep(async () => {});
    api.IgBridge.assertAccount = id => assert.equal(String(id), '1');
    api.STATE.relationshipAccountId = '1';
    return { ...api, context, document, nodes };
}

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

test('Story toolbar renders only 1 button (Stealth Mode) and omits download buttons', () => {
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
    h.injectStoryDownloadTools();

    const bar = h.document.getElementById('maxpland-story-bar');
    assert.ok(bar, 'story bar must be injected');
    const buttons = bar.children.filter(c => c.tagName === 'BUTTON');
    assert.equal(buttons.length, 2, 'must render exactly 2 buttons: Stealth toggle + Open Raw');
    assert.ok(buttons.some(b => b.id === 'maxpland-story-stealth-toggle'), 'stealth toggle present');
    assert.ok(buttons.some(b => b.id === 'maxpland-story-open-btn'), 'open raw tab button present');
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

    // Download Story
    let downloaded = null;
    h.setDownload(async (url, name) => { downloaded = { url, name }; return 'ok'; });
    await h.downloadCurrentStoryMedia();
    assert.ok(downloaded, 'must trigger download');
    assert.equal(downloaded.url, 'https://cdn.instagram.com/center_active.mp4', 'must download center active story, not left adjacent');
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

    let downloaded = null;
    h.setDownload(async (url, name) => { downloaded = { url, name }; return 'ok'; });

    await h.downloadCurrentStoryMedia();
    assert.ok(downloaded, 'must trigger story download');
    assert.equal(downloaded.url, 'https://scontent.cdninstagram.com/v/t50/video_1080p.mp4', 'must extract high-res 1080p MP4 from React Fiber');
});

test('Thumbnail download prefers a real cover image over the tiny avatar', async () => {
    const h = harness();
    h.context.window.innerHeight = 800; h.context.window.innerWidth = 400;
    const bigImg = { currentSrc: 'https://cdn.instagram.com/story_cover.jpg', checkVisibility: () => true,
        getAttribute: () => null,
        getBoundingClientRect: () => ({ width: 720, height: 1280, top: 0, bottom: 1280, left: 0, right: 720 }) };
    const avatarImg = { currentSrc: 'https://cdn.instagram.com/avatar_50x50.jpg', checkVisibility: () => true,
        getAttribute: () => null,
        getBoundingClientRect: () => ({ width: 40, height: 40, top: 10, bottom: 50, left: 10, right: 50 }) };
    h.document.querySelectorAll = sel => (sel.includes('video') ? [] : [avatarImg, bigImg]);
    let downloaded = null;
    h.setDownload(async (url, name) => { downloaded = { url, name }; return 'ok'; });
    await h.downloadCurrentStoryMedia(true);
    assert.ok(downloaded, 'download must start for a visible story');
    assert.equal(downloaded.url, 'https://cdn.instagram.com/story_cover.jpg', 'must pick the story cover, not the 50px avatar');
    assert.match(downloaded.name, /\.jpg$/);
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
test('Inter-page scan pacing stays uniformly short', async () => {
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
    for (const p of pauses) assert.ok(p <= 3000, `pause ${Math.round(p)}ms exceeds the uniform 2-3s budget`);
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
test('A is sequential; B and C overlap only the two endpoints', async () => {
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
        assert.equal(calls, 2); assert.equal(peak, ['B', 'C'].includes(mode) ? 2 : 1);
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
test('Concurrent failure cancels sibling, drains workers and never saves partial snapshot', async () => {
    for (const code of ['RATE_LIMIT', 'CHECKPOINT', 'AUTH', 'ACCOUNT_CHANGED', 'PAYLOAD']) {
        const h = perfHarness(1); let saved = 0, drained = false;
        h.STATE.prefs.scanSpeed = 'B';
        h.MaxPlandVault.saveSnapshot = async () => { saved++; };
        h.IgBridge.fetchAllRelationships = async endpoint => {
            if (endpoint === 'followers') {
                await new Promise(resolve => setImmediate(resolve));
                return Object.assign([], { completed: false, lastError: Object.assign(new Error(code), { code }) });
            }
            const signal = h.STATE.scanController.signal;
            await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
            await new Promise(resolve => setImmediate(resolve)); drained = true;
            return Object.assign([], { completed: false, lastError: new DOMException('Stopped', 'AbortError') });
        };
        await h.runRelationshipScan();
        assert.equal(saved, 0); assert.equal(drained, true); assert.equal(h.STATE.scanIncomplete, true);
        assert.equal(h.STATE.scanController, null);
        assert.match(h.document.getElementById('maxpland-scan-notice').textContent, new RegExp(code));
    }
});
test('C reduces only inter-page pause; A/B retain 2-3 seconds', async () => {
    for (const mode of ['A', 'B', 'C']) {
        const h = harness(); let requests = 0, waited = 0;
        h.IgBridge.fetchRelationshipPage = async () => ({ users: [{ id: String(++requests) }], next_max_id: requests === 1 ? 'next' : null });
        h.setSleep(async ms => { waited += ms; });
        const result = await h.IgBridge.fetchAllRelationships('followers', '1', 250, null, mode);
        assert.equal(result.completed, true);
        assert.ok(mode === 'C' ? waited >= 500 && waited <= 1000 : waited >= 2000 && waited <= 3000, `${mode}: ${waited}`);
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

(async () => {
    let failed = 0;
    for (const [name, fn] of tests) {
        try { await fn(); console.log('PASS', name); }
        catch (e) { failed++; console.error('FAIL', name, '\n ', e.message); }
    }
    console.log(`${tests.length - failed}/${tests.length} checks passed`);
    process.exitCode = failed ? 1 : 0;
})();
