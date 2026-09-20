/**
 * IGSelectors.js
 * Instagram DOM and React Fiber selectors for IG MaxPland.
 * Decouples DOM traversal, Fiber inspection, and active viewport matching from business logic.
 */

const IGSelectors = {
    /**
     * Extracts post or reel shortcode from an article DOM element.
     * @param {Element} article
     * @returns {string|null}
     */
    shortcodeFromArticle(article) {
        if (!article || typeof article.querySelectorAll !== 'function') {
            if (typeof location !== 'undefined' && location.href) {
                const m = location.href.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
                return m ? m[1] : null;
            }
            return null;
        }

        const links = [...article.querySelectorAll('a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]')];
        for (const a of links) {
            const href = a.href || a.getAttribute('href') || '';
            const m = href.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
            if (m) return m[1];
        }

        if (typeof location !== 'undefined' && location.href) {
            const m = location.href.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
            if (m) return m[1];
        }
        return null;
    },

    /**
     * Safely extracts media item information from a DOM element's React Fiber return chain.
     * Depth is strictly capped at 30 iterations without recursion to prevent UI freezes.
     * @param {Element} el
     * @returns {{ url: string, isVideo: boolean, id: string, source: string }|null}
     */
    extractMediaFromFiber(el) {
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
    },

    /**
     * Finds the element matching the selector that is closest to the viewport's horizontal center.
     * @param {string} selector
     * @param {Element|Document} [root]
     * @returns {Element|null}
     */
    findCenterElement(selector, root = (typeof document !== 'undefined' ? document : null)) {
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
    },

    /**
     * Returns the active story <section> currently visible in the viewport center.
     * @param {Document} [doc]
     * @returns {Element|null}
     */
    getActiveStorySection(doc = (typeof document !== 'undefined' ? document : null)) {
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
    },

    /**
     * Resolves the username of the active story author.
     * @returns {string}
     */
    getActiveStoryUsername() {
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

        const activeSec = IGSelectors.getActiveStorySection(doc);
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
    },

    /**
     * Selects active story video and image elements, avoiding tiny avatars and background cards.
     * @param {string} [selectorVideo]
     * @param {string} [selectorImg]
     * @returns {{ video: Element|null, img: Element|null, mediaUrl: string, activeSection: Element|null }}
     */
    pickStoryMedia(selectorVideo, selectorImg) {
        const doc = typeof document !== 'undefined' ? document : null;
        const activeSection = IGSelectors.getActiveStorySection(doc);

        let video = (typeof activeSection?.querySelector === 'function' ? activeSection.querySelector('video') : null) || null;
        if (!video) {
            video = IGSelectors.findCenterElement(selectorVideo || 'section video, video');
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
            img = IGSelectors.findCenterElement(selectorImg || 'img');
        }

        let mediaUrl = video?.getAttribute?.('poster') || video?.poster || img?.currentSrc || img?.src || '';
        if (!/^https?:\/\//i.test(mediaUrl)) mediaUrl = '';
        return { video, img, mediaUrl, activeSection };
    },

    /**
     * Resolves the visible story element inside the active section or viewport center.
     * @param {string} selector
     * @returns {Element|null}
     */
    visibleStoryElement(selector) {
        const activeSec = IGSelectors.getActiveStorySection();
        if (activeSec && typeof activeSec.querySelector === 'function') {
            const inner = activeSec.querySelector(selector);
            if (inner) return inner;
        }
        return IGSelectors.findCenterElement(selector);
    }
};

// Global & CommonJS Export Pattern
if (typeof window !== 'undefined') {
    window.IGSelectors = IGSelectors;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        IGSelectors,
        shortcodeFromArticle: IGSelectors.shortcodeFromArticle,
        extractMediaFromFiber: IGSelectors.extractMediaFromFiber,
        findCenterElement: IGSelectors.findCenterElement,
        getActiveStorySection: IGSelectors.getActiveStorySection,
        getActiveStoryUsername: IGSelectors.getActiveStoryUsername,
        pickStoryMedia: IGSelectors.pickStoryMedia,
        visibleStoryElement: IGSelectors.visibleStoryElement
    };
}
