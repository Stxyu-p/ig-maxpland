/**
 * StoryStealth.js
 * Multi-channel Ghost/Stealth Story Seen Interceptor and Story Media Resolver for IG MaxPland.
 * Consolidates installStorySeenInterceptor, StoryMediaRegistry (LRU-bounded), and Fiber/DOM story media resolution.
 */

class LRUBoundedRegistry {
    constructor(maxSize = 200) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Evict oldest item (first key in Map iterator)
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
        this.cache.set(key, value);
    }

    get(key) {
        if (!this.cache.has(key)) return undefined;
        const val = this.cache.get(key);
        // Refresh position in LRU
        this.cache.delete(key);
        this.cache.set(key, val);
        return val;
    }

    has(key) {
        return this.cache.has(key);
    }

    clear() {
        this.cache.clear();
    }

    get size() {
        return this.cache.size;
    }
}

class StoryStealth {
    constructor(options = {}) {
        this.stateManager = options.stateManager || (typeof window !== 'undefined' ? window.stateManager : null);
        this.targetWindow = options.targetWindow || (typeof unsafeWindow !== 'undefined' ? unsafeWindow : (typeof window !== 'undefined' ? window : null));
        this.registry = new LRUBoundedRegistry(options.maxCacheSize || 200);
        this._stealthSeenCount = 0;
        this._isInstalled = false;
        this._enabled = true;

        // Backup for clean unpatching
        this._origFetch = null;
        this._origXHROpen = null;
        this._origXHRSend = null;
        this._origSendBeacon = null;
    }

    /* ==========================================================================
       Stealth State & Config
       ========================================================================== */

    enable() {
        this._enabled = true;
        if (this.stateManager) {
            const cur = this.stateManager.get('prefs') || {};
            this.stateManager.set('prefs', { ...cur, stealthStory: true });
        } else if (typeof window !== 'undefined' && window.STATE?.prefs) {
            window.STATE.prefs.stealthStory = true;
        }
    }

    disable() {
        this._enabled = false;
        if (this.stateManager) {
            const cur = this.stateManager.get('prefs') || {};
            this.stateManager.set('prefs', { ...cur, stealthStory: false });
        } else if (typeof window !== 'undefined' && window.STATE?.prefs) {
            window.STATE.prefs.stealthStory = false;
        }
    }

    isEnabled() {
        if (this.stateManager) {
            const prefs = this.stateManager.get('prefs');
            if (prefs && typeof prefs.stealthStory === 'boolean') return prefs.stealthStory;
        }
        if (typeof window !== 'undefined' && window.STATE?.prefs && typeof window.STATE.prefs.stealthStory === 'boolean') {
            return window.STATE.prefs.stealthStory;
        }
        return this._enabled;
    }

    get blockedCount() {
        return this._stealthSeenCount;
    }

    /* ==========================================================================
       Interception Logic
       ========================================================================== */

    isStorySeenRequest(url, body) {
        if (!this.isEnabled()) return false;
        const urlStr = String(url || '');
        const bodyStr = typeof body === 'string' ? body : (body ? JSON.stringify(body) : '');

        // Safety Guard: never block read queries (drawing story rings, viewing profiles, feed)
        const isRead = /web_profile_info|users\/web_profile|PolarisProfile|ProfilePage/i.test(urlStr) ||
                       /operationName["']?\s*[:=]\s*["']?[A-Za-z0-9_]*Query\b/i.test(urlStr) ||
                       /operationName["']?\s*[:=]\s*["']?[A-Za-z0-9_]*Query\b/i.test(bodyStr);
        if (isRead) return false;

        // 1. REST endpoint: /stories/reel/seen or /api/v1/stories/reel/seen
        if (/\/(?:api\/v1\/)?stories\/reel\/seen/i.test(urlStr)) return true;

        // 2. viewSeenAt timestamp in query or body
        if (/viewSeenAt/i.test(urlStr) || /viewSeenAt/i.test(bodyStr)) return true;

        // 3. GraphQL seen mutations
        if (/reels?_?media_?seen|Stor(?:y|ies)Seen/i.test(urlStr) || /reels?_?media_?seen|Stor(?:y|ies)Seen/i.test(bodyStr)) return true;

        return false;
    }

    install(targetWin) {
        const win = targetWin || this.targetWindow;
        if (!win || this._isInstalled) return;

        const hookSym = Symbol.for('mp_seen_hooked');
        if (win[hookSym]) {
            this._isInstalled = true;
            return;
        }
        win[hookSym] = true;

        const FAKE_JSON = JSON.stringify({ status: 'ok' });
        const isStoryDataUrl = (u) => Boolean(u && typeof u === 'string' && (/reels?_?media|graphql\/query|\/api\/v1\/media\//i.test(u)));
        const self = this;

        // 1. Intercept fetch
        if (typeof win.fetch === 'function') {
            this._origFetch = win.fetch;
            const rawFetch = win.fetch;
            const stealthFetch = function(resource, init = {}) {
                let url = '';
                let body = init?.body || null;

                if (typeof resource === 'string') {
                    url = resource;
                } else if (resource && typeof resource.url === 'string') {
                    url = resource.url;
                }

                if (self.isStorySeenRequest(url, body)) {
                    self._stealthSeenCount++;
                    console.info(`[StoryStealth] Blocked story seen ping #${self._stealthSeenCount}:`, url);
                    return Promise.resolve(new Response(FAKE_JSON, {
                        status: 200,
                        statusText: 'OK',
                        headers: { 'Content-Type': 'application/json' }
                    }));
                }

                const resPromise = rawFetch.apply(this, arguments);
                try {
                    if (isStoryDataUrl(url)) {
                        resPromise.then(res => {
                            try {
                                if (typeof res?.clone === 'function') {
                                    res.clone().json().then(data => self.parseAndCache(data)).catch(() => {});
                                }
                            } catch (_) {}
                        }).catch(() => {});
                    }
                } catch (_) {}
                return resPromise;
            };

            try {
                Object.defineProperty(stealthFetch, 'name', { value: rawFetch.name || 'fetch' });
                Object.defineProperty(stealthFetch, 'length', { value: rawFetch.length || 1 });
                const origToString = Function.prototype.toString;
                stealthFetch.toString = function() {
                    return this === stealthFetch ? origToString.call(rawFetch) : origToString.call(this);
                };
            } catch (_) {}

            win.fetch = stealthFetch;
        }

        // 2. Intercept XMLHttpRequest
        if (win.XMLHttpRequest && win.XMLHttpRequest.prototype) {
            this._origXHROpen = win.XMLHttpRequest.prototype.open;
            this._origXHRSend = win.XMLHttpRequest.prototype.send;
            const rawOpen = win.XMLHttpRequest.prototype.open;
            const rawSend = win.XMLHttpRequest.prototype.send;

            win.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                try {
                    this.__mpSeenUrl = typeof url === 'string' ? url : String(url || '');
                } catch (_) {}
                return rawOpen.apply(this, [method, url, ...rest]);
            };

            win.XMLHttpRequest.prototype.send = function(body) {
                try {
                    const url = this.__mpSeenUrl || '';
                    if (self.isStorySeenRequest(url, body)) {
                        self._stealthSeenCount++;
                        console.info(`[StoryStealth] Blocked XHR story seen ping #${self._stealthSeenCount}:`, url);
                        const xhr = this;
                        const define = (prop, val) => {
                            try { Object.defineProperty(xhr, prop, { value: val, configurable: true }); } catch (_) {}
                        };
                        define('readyState', 4);
                        define('status', 200);
                        define('statusText', 'OK');
                        define('responseText', FAKE_JSON);
                        define('response', FAKE_JSON);
                        setTimeout(() => {
                            try {
                                if (typeof xhr.onreadystatechange === 'function') xhr.onreadystatechange();
                                xhr.dispatchEvent(new Event('readystatechange'));
                                xhr.dispatchEvent(new Event('load'));
                                xhr.dispatchEvent(new Event('loadend'));
                            } catch (_) {}
                        }, 0);
                        return;
                    }
                    if (isStoryDataUrl(url)) {
                        const xhrInstance = this;
                        const origOnLoad = xhrInstance.onload;
                        xhrInstance.onload = function(...args) {
                            try {
                                if (xhrInstance.status === 200 && xhrInstance.responseText) {
                                    const data = JSON.parse(xhrInstance.responseText);
                                    self.parseAndCache(data);
                                }
                            } catch (_) {}
                            if (typeof origOnLoad === 'function') return origOnLoad.apply(this, args);
                        };
                    }
                } catch (_) {}
                return rawSend.apply(this, arguments);
            };
        }

        // 3. Intercept navigator.sendBeacon
        if (win.navigator && typeof win.navigator.sendBeacon === 'function') {
            this._origSendBeacon = win.navigator.sendBeacon;
            const rawSendBeacon = win.navigator.sendBeacon.bind(win.navigator);
            win.navigator.sendBeacon = function(url, data) {
                try {
                    if (self.isStorySeenRequest(url, data)) {
                        self._stealthSeenCount++;
                        console.info(`[StoryStealth] Blocked Beacon story seen ping #${self._stealthSeenCount}:`, url);
                        return true;
                    }
                } catch (_) {}
                return rawSendBeacon(url, data);
            };
        }

        this._isInstalled = true;
    }

    uninstall(targetWin) {
        const win = targetWin || this.targetWindow;
        if (!win || !this._isInstalled) return;

        if (this._origFetch && win.fetch) {
            win.fetch = this._origFetch;
            this._origFetch = null;
        }
        if (this._origXHROpen && win.XMLHttpRequest?.prototype) {
            win.XMLHttpRequest.prototype.open = this._origXHROpen;
            this._origXHROpen = null;
        }
        if (this._origXHRSend && win.XMLHttpRequest?.prototype) {
            win.XMLHttpRequest.prototype.send = this._origXHRSend;
            this._origXHRSend = null;
        }
        if (this._origSendBeacon && win.navigator) {
            win.navigator.sendBeacon = this._origSendBeacon;
            this._origSendBeacon = null;
        }

        const hookSym = Symbol.for('mp_seen_hooked');
        delete win[hookSym];
        this._isInstalled = false;
    }

    /* ==========================================================================
       Media Registry & DOM Script Scanner (LRU Bounded)
       ========================================================================== */

    cacheItem(item) {
        if (!item || typeof item !== 'object') return;
        const id = String(item.pk || item.id || '').split('_')[0];
        const isVideo = Boolean(item.video_versions && item.video_versions.length > 0) || item.media_type === 2 || Boolean(item.is_video);
        const videoVersions = Array.isArray(item.video_versions) ? [...item.video_versions] : [];
        const imageCandidates = Array.isArray(item.image_versions2?.candidates) ? [...item.image_versions2.candidates] : [];
        videoVersions.sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));
        imageCandidates.sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));

        const videoUrl = videoVersions[0]?.url || item.video_url || item.videoUrl || null;
        const imageUrl = imageCandidates[0]?.url || item.display_url || item.src || null;
        const username = item.user?.username || item.owner?.username || '';

        const entry = { id, isVideo, videoUrl, imageUrl, username };
        if (id) this.registry.set(id, entry);
    }

    parseAndCache(json) {
        if (!json || typeof json !== 'object') return;
        try {
            if (Array.isArray(json.reels_media)) {
                for (const reel of json.reels_media) {
                    if (Array.isArray(reel?.items)) {
                        for (const it of reel.items) this.cacheItem(it);
                    }
                }
            }
            if (json.reels && typeof json.reels === 'object') {
                for (const k in json.reels) {
                    const reel = json.reels[k];
                    if (Array.isArray(reel?.items)) {
                        for (const it of reel.items) this.cacheItem(it);
                    }
                }
            }
            if (Array.isArray(json.items)) {
                for (const it of json.items) this.cacheItem(it);
            }
            if (json.data && typeof json.data === 'object') {
                this.parseAndCache(json.data);
            }
        } catch (_) {}
    }

    scanDomScripts() {
        try {
            const win = this.targetWindow || (typeof window !== 'undefined' ? window : null);
            const doc = win?.document || (typeof document !== 'undefined' ? document : null);
            if (!doc || typeof doc.querySelectorAll !== 'function') return;

            for (const s of doc.querySelectorAll('script[type="application/json"]')) {
                const text = s.textContent || '';
                if (text.includes('video_versions') || text.includes('image_versions2')) {
                    try {
                        const data = JSON.parse(text);
                        this.parseAndCache(data);
                    } catch (_) {}
                }
            }
        } catch (_) {}
    }

    /* ==========================================================================
       React Fiber & DOM Story Extraction
       ========================================================================== */

    static extractMediaFromFiber(el) {
        if (!el) return null;
        const keys = Object.keys(el);
        const fiberKey = keys.find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        const propsKey = keys.find(k => k.startsWith('__reactProps$'));

        if (propsKey && el[propsKey]?.item) {
            const item = el[propsKey].item;
            if (item.video_versions || item.image_versions2) {
                const isVideo = Boolean(item.video_versions && item.video_versions.length > 0);
                const videoUrl = item.video_versions?.slice()?.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]?.url || null;
                const imageUrl = item.image_versions2?.candidates?.slice()?.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]?.url || null;
                const url = isVideo ? (videoUrl || imageUrl) : (imageUrl || videoUrl);
                if (url) return { url, isVideo, id: item.id || item.pk, source: 'fiber-props' };
            }
        }

        if (fiberKey) {
            let curr = el[fiberKey];
            let depth = 0;
            while (curr && depth < 30) {
                const item = curr.memoizedProps?.item || curr.pendingProps?.item || curr.props?.item;
                if (item && (item.video_versions || item.image_versions2)) {
                    const isVideo = Boolean(item.video_versions && item.video_versions.length > 0);
                    const videoUrl = item.video_versions?.slice()?.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]?.url || null;
                    const imageUrl = item.image_versions2?.candidates?.slice()?.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0]?.url || null;
                    const url = isVideo ? (videoUrl || imageUrl) : (imageUrl || videoUrl);
                    if (url) return { url, isVideo, id: item.id || item.pk, source: 'fiber' };
                }
                curr = curr.return;
                depth++;
            }
        }
        return null;
    }

    static findCenterElement(selector, root = (typeof document !== 'undefined' ? document : null)) {
        if (!root || typeof root.querySelectorAll !== 'function') return null;
        const viewportCenterX = ((typeof window !== 'undefined' ? window.innerWidth : 800) || 800) / 2;
        let best = null;
        let minDistance = Infinity;

        for (const el of root.querySelectorAll(selector)) {
            if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkVisibilityCSS: true })) continue;
            if (typeof el.getBoundingClientRect !== 'function') continue;
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            if (r.bottom <= 0 || r.top >= ((typeof window !== 'undefined' ? window.innerHeight : 600) || 600)) continue;

            const elCenterX = (r.left + r.right) / 2;
            const dist = Math.abs(elCenterX - viewportCenterX);
            if (dist < minDistance) {
                minDistance = dist;
                best = el;
            }
        }
        return best;
    }

    static getActiveStorySection(doc = (typeof document !== 'undefined' ? document : null)) {
        if (!doc || typeof doc.querySelectorAll !== 'function') return null;
        const viewportCenterX = ((typeof window !== 'undefined' ? window.innerWidth : 800) || 800) / 2;
        const sections = [...doc.querySelectorAll('section')];
        let best = null;
        let minDistance = Infinity;

        for (const sec of sections) {
            if (typeof sec.checkVisibility === 'function' && !sec.checkVisibility({ checkVisibilityCSS: true })) continue;
            if (typeof sec.getBoundingClientRect !== 'function') continue;
            const r = sec.getBoundingClientRect();
            if (r.width < 50 || r.height < 50) continue;
            if (r.bottom <= 0 || r.top >= ((typeof window !== 'undefined' ? window.innerHeight : 600) || 600)) continue;

            const secCenterX = (r.left + r.right) / 2;
            const dist = Math.abs(secCenterX - viewportCenterX);
            if (dist < minDistance) {
                minDistance = dist;
                best = sec;
            }
        }
        return best;
    }

    static getActiveStoryUsername() {
        const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : (typeof window !== 'undefined' ? window : null);
        const doc = win?.document || (typeof document !== 'undefined' ? document : null);
        if (!doc) return 'story';
        const centerX = (win?.innerWidth || 800) / 2;

        const headers = [...(doc.querySelectorAll ? doc.querySelectorAll('section header, [role="dialog"] header, header') : [])];
        for (const h of headers) {
            if (typeof h.getBoundingClientRect !== 'function') continue;
            const rect = h.getBoundingClientRect();
            if (rect.left <= centerX && rect.right >= centerX) {
                const userLink = typeof h.querySelector === 'function' ? h.querySelector('a[href^="/"]') : null;
                if (userLink && typeof userLink.getAttribute === 'function') {
                    const href = userLink.getAttribute('href') || '';
                    const parts = href.split('/').filter(Boolean);
                    if (parts.length > 0 && !['stories', 'explore', 'reels', 'direct'].includes(parts[0])) {
                        return parts[0];
                    }
                }
            }
        }

        const activeSec = StoryStealth.getActiveStorySection(doc);
        const headerLink = typeof activeSec?.querySelector === 'function' ? activeSec.querySelector('header a')?.getAttribute?.('href') : null;
        if (headerLink) {
            const parts = headerLink.split('/').filter(Boolean);
            if (parts.length > 0 && !['stories', 'explore', 'reels', 'direct'].includes(parts[0])) {
                return parts[0];
            }
        }

        if (typeof location !== 'undefined' && location.pathname) {
            const match = location.pathname.match(/\/stories\/([^\/]+)/);
            if (match && match[1] && match[1] !== 'highlights') return match[1];
        }

        return 'story';
    }

    static pickStoryMedia(selectorVideo, selectorImg) {
        const doc = typeof document !== 'undefined' ? document : null;
        const activeSection = StoryStealth.getActiveStorySection(doc);

        let video = (typeof activeSection?.querySelector === 'function' ? activeSection.querySelector('video') : null) || null;
        if (!video) {
            video = StoryStealth.findCenterElement(selectorVideo || 'section video, video');
        }

        let img = null;
        const imgCandidates = (activeSection && typeof activeSection.querySelectorAll === 'function')
            ? activeSection.querySelectorAll(selectorImg || 'img._aa63, img[crossorigin], img[referrerpolicy], img')
            : (doc && typeof doc.querySelectorAll === 'function'
                ? doc.querySelectorAll(selectorImg || 'section img._aa63, section img[crossorigin], section img[referrerpolicy], img')
                : []);

        let maxArea = 0;
        const viewportCenterX = ((typeof window !== 'undefined' ? window.innerWidth : 800) || 800) / 2;

        for (const candidate of imgCandidates) {
            if (typeof candidate.checkVisibility === 'function' && !candidate.checkVisibility({ checkVisibilityCSS: true })) continue;
            if (typeof candidate.getBoundingClientRect !== 'function') continue;
            const r = candidate.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            if (r.bottom <= 0 || r.top >= ((typeof window !== 'undefined' ? window.innerHeight : 600) || 600)) continue;

            const isAvatar = (r.width <= 64 && r.height <= 64) || (typeof candidate.closest === 'function' && candidate.closest('header'));
            if (isAvatar) continue;

            if (!activeSection) {
                const cX = (r.left + r.right) / 2;
                if (Math.abs(cX - viewportCenterX) > 350) continue;
            }

            const area = r.width * r.height;
            if (area > maxArea) {
                maxArea = area;
                img = candidate;
            }
        }

        if (!img && !video) {
            img = StoryStealth.findCenterElement(selectorImg || 'img');
        }

        let mediaUrl = video?.getAttribute?.('poster') || video?.poster || img?.currentSrc || img?.src || '';
        if (!/^https?:\/\//i.test(mediaUrl)) mediaUrl = '';
        return { video, img, mediaUrl, activeSection };
    }

    async resolveCurrentStoryMedia(isThumb = false) {
        const doc = typeof document !== 'undefined' ? document : null;
        const activeSection = StoryStealth.getActiveStorySection(doc);
        const { video, img } = StoryStealth.pickStoryMedia('section video', 'section img._aa63, section img[crossorigin], section img[referrerpolicy]');

        // 1. Direct video poster from active story if specifically requested
        if (isThumb && video) {
            const poster = video.getAttribute?.('poster') || video.poster;
            if (poster && /^https?:\/\//i.test(poster)) {
                return { url: poster, isVideo: false, source: 'dom-poster', isBlob: false };
            }
        }

        // 2. React Fiber extraction (lightning fast, bounded parent return loop, max depth 30)
        const fiberCandidates = [video, img, activeSection].filter(Boolean);
        for (const cand of fiberCandidates) {
            const fiber = StoryStealth.extractMediaFromFiber(cand);
            if (fiber?.url) {
                if (isThumb && fiber.source.includes('fiber')) {
                    const poster = video?.getAttribute?.('poster') || video?.poster;
                    if (poster && /^https?:\/\//i.test(poster)) {
                        return { url: poster, isVideo: false, source: 'dom-poster', isBlob: false };
                    }
                }
                return fiber;
            }
        }

        // 3. Network Cache lookup (LRU Registry)
        let mediaId = null;
        if (activeSection && typeof activeSection.querySelector === 'function') {
            const storyLink = activeSection.querySelector('a[href*="/stories/"]');
            const hrefMatch = storyLink?.getAttribute?.('href')?.match(/\/stories\/[^\/]+\/(\d+)/);
            if (hrefMatch) mediaId = hrefMatch[1];
        }
        if (!mediaId && typeof location !== 'undefined' && location.pathname) {
            const pathMatch = location.pathname.match(/\/stories\/[^\/]+\/(\d+)/);
            if (pathMatch) mediaId = pathMatch[1];
        }

        if (mediaId && this.registry.has(mediaId)) {
            const cached = this.registry.get(mediaId);
            if (isThumb && cached.imageUrl) return { url: cached.imageUrl, isVideo: false, source: 'cache', isBlob: false };
            const isVideo = Boolean(cached.isVideo && cached.videoUrl);
            const url = isVideo ? cached.videoUrl : (cached.imageUrl || cached.videoUrl);
            if (url) return { url, isVideo, source: 'cache', isBlob: false };
        }

        // 4. Native DOM fallback
        if (!isThumb && video) {
            const vSrc = video.currentSrc || video.src || '';
            if (vSrc && /^https?:\/\//i.test(vSrc) && !vSrc.startsWith('blob:')) {
                return { url: vSrc, isVideo: true, source: 'dom-video', isBlob: false };
            }
            const srcEl = typeof video.querySelector === 'function' ? video.querySelector('source') : null;
            if (srcEl?.src && /^https?:\/\//i.test(srcEl.src) && !srcEl.src.startsWith('blob:')) {
                return { url: srcEl.src, isVideo: true, source: 'dom-source', isBlob: false };
            }
        }
        if (img) {
            const imgUrl = img.currentSrc || img.src || '';
            if (imgUrl && /^https?:\/\//i.test(imgUrl)) {
                return { url: imgUrl, isVideo: false, source: 'dom-img', isBlob: false };
            }
        }

        // 5. Video poster fallback if video blob could not be resolved
        const poster = video?.getAttribute?.('poster') || video?.poster;
        if (poster && /^https?:\/\//i.test(poster)) {
            return { url: poster, isVideo: false, source: 'dom-poster', isBlob: false };
        }

        return {
            url: null,
            isVideo: Boolean(video),
            isBlob: Boolean(video?.currentSrc?.startsWith('blob:')),
            source: 'none'
        };
    }

    // Clean public method alias
    async getMedia(isThumb = false) {
        return this.resolveCurrentStoryMedia(isThumb);
    }
}

// Global singleton instance for easy script consumption
const storyStealthInstance = new StoryStealth();

// Global & CommonJS Export Pattern
if (typeof window !== 'undefined') {
    window.StoryStealth = StoryStealth;
    window.storyStealth = storyStealthInstance;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StoryStealth, storyStealth: storyStealthInstance, LRUBoundedRegistry };
}
