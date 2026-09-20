// ==UserScript==
// @name         IG MaxPland
// @namespace    http://tampermonkey.net/
// @version      3.0.0
// @description  Instagram Relationship Scanner & Comprehensive Media Downloader (Clean Architecture v3.0.0)
// @author       P Choke & SORA
// @match        https://*.instagram.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=instagram.com
// @grant        GM_download
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @connect      instagram.com
// @connect      cdninstagram.com
// @run-at       document-start
// @homepageURL   https://greasyfork.org/th/scripts/595787-ig-maxpland
// @supportURL    https://greasyfork.org/th/scripts/595787-ig-maxpland/feedback
// @updateURL     https://greasyfork.org/scripts/595787-ig-maxpland/code/ig-maxpland.user.js
// @downloadURL   https://greasyfork.org/scripts/595787-ig-maxpland/code/ig-maxpland.user.js
// @license      MIT
// ==/UserScript==

(() => {
    'use strict';

    /* ==========================================================================
       MODULAR CORE ARCHITECTURE (v3.0.0 Clean Architecture)
       ========================================================================== */

    // ─── Module: src/utils/Utils.js ──────────────────────────────────────
/**
 * Utils.js
 * Pure utility functions for IG MaxPland.
 * Zero external dependencies, safe string escapes, timing, and formatting helpers.
 */

const Utils = {
    /**
     * Escapes HTML special characters for XSS prevention.
     * @param {*} value
     * @returns {string}
     */
    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[ch]);
    },

    /**
     * Sanitizes and quotes a cell value for safe CSV export (prevents spreadsheet formula injection).
     * @param {*} value
     * @returns {string}
     */
    csvCell(value) {
        let s = String(value ?? '');
        if (/^[\s\x00-\x1f]*[=+\-@]/.test(s)) {
            s = "'" + s;
        }
        return `"${s.replace(/"/g, '""')}"`;
    },

    /**
     * Sanitizes a string into a filesystem-safe filename.
     * @param {*} value
     * @returns {string}
     */
    safeFilename(value) {
        return String(value || 'instagram')
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .slice(0, 150);
    },

    /**
     * Extracts a known media file extension from a URL, or returns the fallback.
     * @param {string} url
     * @param {string} [fallback='jpg']
     * @returns {string}
     */
    extensionFromUrl(url, fallback = 'jpg') {
        try {
            const pathname = new URL(url).pathname;
            const ext = pathname.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
            if (ext && ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'm4a', 'mp3', 'aac', 'webm'].includes(ext)) {
                return ext;
            }
        } catch (_) {}
        return fallback;
    },

    /**
     * Formats seconds into MM:SS string representation.
     * @param {number} seconds
     * @returns {string}
     */
    formatTime(seconds) {
        const sec = Math.max(0, Math.floor(Number(seconds) || 0));
        const m = Math.floor(sec / 60).toString().padStart(2, '0');
        const s = (sec % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    },

    /**
     * Promise-based sleep timer.
     * @param {number} ms
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
    },

    /**
     * Extracts post/reel shortcodes from raw text or pasted URLs.
     * @param {string} text
     * @returns {string[]}
     */
    extractShortcodesFromText(text) {
        const raw = String(text || '');
        const codes = new Set();
        const urlRx = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/gi;
        let match;
        while ((match = urlRx.exec(raw))) {
            codes.add(match[1]);
        }
        raw.split(/\r?\n/).forEach(line => {
            const clean = line.trim().replace(/^["']+|["']+$/g, '');
            if (/^[A-Za-z0-9_-]{5,}$/.test(clean)) {
                codes.add(clean);
            }
        });
        return [...codes];
    }
};

// Global & CommonJS Export Pattern
if (typeof window !== 'undefined') {
    window.Utils = Utils;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        Utils,
        escapeHtml: Utils.escapeHtml,
        csvCell: Utils.csvCell,
        safeFilename: Utils.safeFilename,
        extensionFromUrl: Utils.extensionFromUrl,
        formatTime: Utils.formatTime,
        sleep: Utils.sleep,
        extractShortcodesFromText: Utils.extractShortcodesFromText
    };
}


    // ─── Module: src/utils/DOMUtils.js ──────────────────────────────────────
/**
 * DOMUtils.js
 * DOM manipulation and event delegation utilities for IG MaxPland.
 * Supports center element resolution, visibility guards, and unbindable event delegation.
 */

const DOMUtils = {
    /**
     * Checks if an element is visible in the layout and viewport.
     * @param {Element} el
     * @param {Object} [options]
     * @param {number} [options.viewportWidth]
     * @param {number} [options.viewportHeight]
     * @returns {boolean}
     */
    isVisible(el, options = {}) {
        if (!el) return false;
        if (typeof el.checkVisibility === 'function') {
            if (!el.checkVisibility({ checkVisibilityCSS: true })) return false;
        }
        if (typeof el.getBoundingClientRect !== 'function') return false;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        const vHeight = options.viewportHeight || ((typeof window !== 'undefined' ? window.innerHeight : 600) || 600);
        if (r.bottom <= 0 || r.top >= vHeight) return false;
        return true;
    },

    /**
     * Finds the element matching selector that is closest horizontally to viewport center.
     * @param {string} selector
     * @param {Element|Document} [root]
     * @param {Object} [options]
     * @returns {Element|null}
     */
    findCenterElement(selector, root = (typeof document !== 'undefined' ? document : null), options = {}) {
        if (!root || typeof root.querySelectorAll !== 'function') return null;
        const vWidth = options.viewportWidth || ((typeof window !== 'undefined' ? window.innerWidth : 800) || 800);
        const viewportCenterX = vWidth / 2;
        let best = null;
        let minDistance = Infinity;

        for (const el of root.querySelectorAll(selector)) {
            if (!DOMUtils.isVisible(el, options)) continue;
            const r = el.getBoundingClientRect();
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
     * Attaches an event listener to target and returns an unbind function.
     * @param {EventTarget} target
     * @param {string} eventType
     * @param {Function} handler
     * @param {Object|boolean} [options]
     * @returns {Function} Unbind callback
     */
    on(target, eventType, handler, options) {
        if (!target || typeof target.addEventListener !== 'function') {
            return () => {};
        }
        target.addEventListener(eventType, handler, options);
        let isUnbound = false;
        return () => {
            if (isUnbound) return;
            isUnbound = true;
            target.removeEventListener(eventType, handler, options);
        };
    },

    /**
     * Sets up event delegation on a container and returns an unbind function.
     * @param {Element} container
     * @param {string} eventType
     * @param {string} selector
     * @param {Function} handler (event, matchingElement) => void
     * @returns {Function} Unbind callback
     */
    delegate(container, eventType, selector, handler) {
        if (!container || typeof container.addEventListener !== 'function') {
            return () => {};
        }

        const listener = function(event) {
            const target = event.target;
            if (!target || typeof target.closest !== 'function') return;
            const match = target.closest(selector);
            if (match && container.contains(match)) {
                handler.call(match, event, match);
            }
        };

        return DOMUtils.on(container, eventType, listener);
    },

    /**
     * Declaratively creates a DOM element with attributes and children.
     * @param {string} tag
     * @param {Object} [attrs={}]
     * @param {Array|string|Element} [children=[]]
     * @param {Document} [doc]
     * @returns {Element}
     */
    createElement(tag, attrs = {}, children = [], doc = (typeof document !== 'undefined' ? document : null)) {
        if (!doc || typeof doc.createElement !== 'function') {
            throw new Error('Document object required to create element');
        }

        const el = doc.createElement(tag);
        for (const [key, val] of Object.entries(attrs)) {
            if (key === 'className') {
                el.className = val;
            } else if (key === 'style' && typeof val === 'object') {
                Object.assign(el.style, val);
            } else if (key.startsWith('on') && typeof val === 'function') {
                const evName = key.slice(2).toLowerCase();
                el.addEventListener(evName, val);
            } else if (key.startsWith('data-')) {
                el.setAttribute(key, String(val));
            } else if (val === true) {
                el.setAttribute(key, '');
            } else if (val !== false && val != null) {
                el.setAttribute(key, String(val));
            }
        }

        const childList = Array.isArray(children) ? children : [children];
        for (const child of childList) {
            if (child == null) continue;
            if (typeof child === 'string' || typeof child === 'number') {
                el.appendChild(doc.createTextNode(String(child)));
            } else if (child && typeof child.nodeType === 'number') {
                el.appendChild(child);
            }
        }

        return el;
    }
};

// Global & CommonJS Export Pattern
if (typeof window !== 'undefined') {
    window.DOMUtils = DOMUtils;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        DOMUtils,
        isVisible: DOMUtils.isVisible,
        findCenterElement: DOMUtils.findCenterElement,
        on: DOMUtils.on,
        delegate: DOMUtils.delegate,
        createElement: DOMUtils.createElement
    };
}


    // ─── Module: src/utils/IGSelectors.js ──────────────────────────────────────
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


    // ─── Module: src/modules/IgAuth.js ──────────────────────────────────────
/* ==========================================================================
   IgAuth — Authentication & Account Management Module
   Extracted from IgBridge for Clean Architecture (v3.0.0)
   Dependencies: none (leaf module)
   ========================================================================== */

const IgAuth = (() => {
    'use strict';

    // ─── Private State ──────────────────────────────────────────────────────
    let currentUserId = null;
    let currentUsername = null;
    let wwwClaim = null;
    let cooldownUntil = 0;
    let cooldownAccount = null;

    // ─── Constants ──────────────────────────────────────────────────────────
    const INSTAGRAM_WEB_APP_ID = '936619743392459';

    // ─── Helpers ────────────────────────────────────────────────────────────
    function getCookie(name) {
        const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
        return match ? decodeURIComponent(match[3]) : null;
    }

    function makeError(message, code, status = 0) {
        return Object.assign(new Error(message), { code, status });
    }

    // ─── Public API ─────────────────────────────────────────────────────────
    return {
        // App identity
        getAppId() {
            return INSTAGRAM_WEB_APP_ID;
        },

        // Cookie access
        getCookie,

        // Current user resolution (multi-level fallback)
        async resolveCurrentUser() {
            // Level 1: Standard authentication cookie 'ds_user_id'
            const cookieId = getCookie('ds_user_id');
            if (!cookieId) {
                currentUserId = null;
                currentUsername = null;
                return { id: null, username: null };
            }
            if (cookieId) {
                if (currentUserId !== cookieId) {
                    currentUsername = null;
                }
                currentUserId = cookieId;
            }

            // Level 2: window globals (_sharedData, __initialData) with viewer validation
            try {
                const page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
                const sharedViewer = page._sharedData?.config?.viewer;
                const sharedViewerId = page._sharedData?.config?.viewerId || sharedViewer?.id;
                if (sharedViewerId) {
                    const svIdStr = String(sharedViewerId);
                    if (!currentUserId) currentUserId = svIdStr;
                    if (currentUserId === svIdStr && sharedViewer?.username) {
                        currentUsername = sharedViewer.username;
                    }
                }

                const initialViewer = page.__initialData?.data?.viewer;
                if (initialViewer?.id) {
                    const ivIdStr = String(initialViewer.id);
                    if (!currentUserId) currentUserId = ivIdStr;
                    if (currentUserId === ivIdStr && initialViewer.username) {
                        currentUsername = initialViewer.username;
                    }
                }
            } catch (_) {}

            // Level 3: Scan inline JSON script tags strictly tied to currentUserId
            try {
                const scripts = document.querySelectorAll('script[type="application/json"], script:not([src])');
                for (const s of scripts) {
                    const txt = s.textContent || '';
                    if (!currentUserId) {
                        const m = txt.match(/"(?:viewerId|actorID|userId)":\s*"(\d+)"/)
                               || txt.match(/"viewer":\s*\{\s*"id":\s*"(\d+)"/);
                        if (m && m[1]) currentUserId = m[1];
                    }

                    if (currentUserId && !currentUsername && txt.includes('username')) {
                        const uid = currentUserId;
                        // Match username in tight proximity to user ID (JSON object level)
                        const m1 = txt.match(new RegExp(`"id"\\s*:\\s*"${uid}"[^{}]{0,300}"username"\\s*:\\s*"([a-zA-Z0-9._]+)"`));
                        const m2 = txt.match(new RegExp(`"username"\\s*:\\s*"([a-zA-Z0-9._]+)"[^{}]{0,300}"id"\\s*:\\s*"${uid}"`));
                        const m3 = txt.match(new RegExp(`"(?:viewerId|actorID)"\\s*:\\s*"${uid}"[^{}]{0,300}"username"\\s*:\\s*"([a-zA-Z0-9._]+)"`));
                        const m4 = txt.match(new RegExp(`"username"\\s*:\\s*"([a-zA-Z0-9._]+)"[^{}]{0,300}"(?:viewerId|actorID)"\\s*:\\s*"${uid}"`));
                        const found = m1?.[1] || m2?.[1] || m3?.[1] || m4?.[1];
                        if (found && !['null', 'undefined'].includes(found)) {
                            currentUsername = found;
                            break;
                        }
                    }
                }
            } catch (_) {}

            // Level 4: Navigation Bar ONLY (strictly desktop sidebar or mobile nav bar, NEVER feed/posts)
            if (!currentUsername) {
                try {
                    const navContainer = document.querySelector('nav, [role="navigation"], aside');
                    if (navContainer) {
                        const navAnchors = Array.from(navContainer.querySelectorAll('a[href^="/"]'));
                        const reserved = new Set([
                            '', 'explore', 'reels', 'direct', 'stories', 'your_activity',
                            'settings', 'accounts', 'api', 'legal', 'about', 'p', 'reel', 'tv'
                        ]);

                        // 4a. Profile link with explicit aria-label or SVG Profile icon in nav
                        const profileLink = navAnchors.find(a => {
                            const svg = a.querySelector('svg[aria-label="Profile"], svg[aria-label="โปรไฟล์"]');
                            const aria = a.getAttribute('aria-label') || '';
                            return Boolean(svg || aria.includes('Profile') || aria.includes('โปรไฟล์'));
                        });

                        if (profileLink) {
                            const parts = (profileLink.getAttribute('href') || '').replace(/^\/|\/$/g, '').split('/');
                            if (parts.length === 1 && !reserved.has(parts[0].toLowerCase())) {
                                currentUsername = parts[0];
                            }
                        }

                        // 4b. Nav link that contains an avatar img inside the navigation container
                        if (!currentUsername) {
                            for (const a of navAnchors) {
                                const parts = (a.getAttribute('href') || '').replace(/^\/|\/$/g, '').split('/');
                                if (parts.length === 1 && !reserved.has(parts[0].toLowerCase())) {
                                    if (a.querySelector('img')) {
                                        currentUsername = parts[0];
                                        break;
                                    }
                                }
                            }
                        }
                    }
                } catch (_) {}
            }

            return { id: currentUserId, username: currentUsername };
        },

        // Current user getters (cached)
        getCurrentUserId() {
            return currentUserId;
        },
        getCurrentUsername() {
            return currentUsername;
        },

        // WWW-Claim header management (for request signing)
        setWWWClaim(claim) {
            wwwClaim = claim;
        },
        getWWWClaim() {
            return wwwClaim;
        },

        // Rate-limit cooldown management
        setCooldown(accountId, untilMs) {
            cooldownAccount = accountId;
            cooldownUntil = untilMs;
        },
        getCooldown(accountId) {
            if (cooldownAccount === accountId && Date.now() < cooldownUntil) {
                return Math.ceil((cooldownUntil - Date.now()) / 1000);
            }
            return 0;
        },
        clearCooldown(accountId) {
            if (cooldownAccount === accountId) {
                cooldownUntil = 0;
                cooldownAccount = null;
            }
        },

        // Error factory
        error: makeError,

        // Account validation (throws if mismatch)
        assertAccount(accountId) {
            if (!accountId || getCookie('ds_user_id') !== String(accountId)) {
                throw makeError('บัญชีเปลี่ยนหรือออกจากระบบ กรุณารีเฟรชแล้วเริ่มใหม่', 'ACCOUNT_CHANGED');
            }
        },
        validateAccount(accountId) {
            return this.assertAccount(accountId);
        },
        getCurrentUser() {
            return { id: currentUserId, username: currentUsername };
        },

        // Session error detection
        isSessionError(err) {
            return ['AUTH', 'CHECKPOINT', 'RATE_LIMIT', 'ACCOUNT_CHANGED'].includes(err?.code);
        },

        // Forced cache clear (e.g., after logout)
        clearCache() {
            currentUserId = null;
            currentUsername = null;
            wwwClaim = null;
        }
    };
})();

// ─── Global Exposure (IIFE-compatible) ──────────────────────────────────────
if (typeof window !== 'undefined') {
    window.IgAuth = IgAuth;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { IgAuth };
}

    // ─── Module: src/modules/IgTransport.js ──────────────────────────────────────
/* ==========================================================================
   IgTransport — HTTP Transport & API Request Module
   Extracted from IgBridge for Clean Architecture (v3.0.0)
   Dependencies: IgAuth
   ========================================================================== */

const IgTransport = (() => {
    'use strict';

    // ─── Constants ──────────────────────────────────────────────────────────
    const APP_ID = IgAuth.getAppId();
    const ASBD_ID = '129477';
    const BASE_ORIGIN = 'https://www.instagram.com';
    const ALLOWED_HOSTNAMES = ['www.instagram.com', 'instagram.com'];

    // ─── Private State ──────────────────────────────────────────────────────
    let fetchFn = null;

    // ─── Helpers ────────────────────────────────────────────────────────────
    function getFetchFn() {
        if (fetchFn) return fetchFn;
        const page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        fetchFn = typeof page.fetch === 'function' ? page.fetch.bind(page) : fetch;
        return fetchFn;
    }

    function buildHeaders(csrf, optionsHeaders = {}) {
        return {
            'X-IG-App-ID': APP_ID,
            'X-ASBD-ID': ASBD_ID,
            'X-IG-WWW-Claim': IgAuth.getWWWClaim() || '0',
            'Accept': '*/*',
            ...(csrf ? { 'X-CSRFToken': csrf } : {}),
            ...optionsHeaders
        };
    }

    function validateOrigin(url) {
        const target = new URL(url, BASE_ORIGIN);
        if (target.protocol !== 'https:' ||
            !ALLOWED_HOSTNAMES.includes(target.hostname) ||
            target.port ||
            target.username ||
            target.password) {
            throw IgAuth.error('Unsupported API origin', 'ORIGIN');
        }
        return target;
    }

    function parseResponse(text) {
        try {
            return JSON.parse(text);
        } catch (_) {
            return null;
        }
    }

    function checkCheckpoint(data, redirected) {
        const message = String(data?.message || data?.error_type || '');
        return /challenge|checkpoint|consent_required/i.test(message + redirected) ||
               data?.challenge || data?.checkpoint_url;
    }

    function checkAuthError(res, data, message, redirected) {
        if (res.status === 401 || /login_required|\/accounts\/login/i.test(message + redirected)) {
            return IgAuth.error('Session หมดอายุ กรุณาเข้าสู่ระบบ Instagram แล้วรีเฟรช', 'AUTH', res.status);
        }
        if (res.status === 403) {
            return IgAuth.error('Instagram ไม่อนุญาตคำขอนี้ กรุณาตรวจสอบสถานะบัญชีในหน้าเว็บ', 'AUTH', 403);
        }
        if (/^\s*</.test(text)) {
            return IgAuth.error('Instagram ส่ง HTML แทนข้อมูล กรุณาตรวจสอบการล็อกอินแล้วรีเฟรช', 'HTML_RESPONSE', res.status);
        }
        if (!res.ok) {
            return IgAuth.error(`Instagram ตอบกลับ HTTP ${res.status}`, 'HTTP', res.status);
        }
        if (!data || typeof data !== 'object') {
            return IgAuth.error('Instagram ส่งรูปแบบข้อมูลไม่ถูกต้อง', 'PAYLOAD', res.status);
        }
        if (data.status === 'fail' || (data.errors && data.errors.length)) {
            return IgAuth.error('Instagram ปฏิเสธคำขอข้อมูล', 'API', res.status);
        }
        return null;
    }

    function checkRateLimit(res, data, message, accountId) {
        if (res.status === 429 || /feedback_required|please wait|try again later|rate.limit/i.test(message)) {
            const retry = res.headers?.get('Retry-After');
            const delay = retry && /^\d+(\.\d+)?$/.test(retry)
                ? Number(retry) * 1000
                : Date.parse(retry) - Date.now();
            IgAuth.setCooldown(accountId, Date.now() + Math.max(60000, Number.isFinite(delay) ? delay : 60000));
            return IgAuth.error('Instagram จำกัดคำขอชั่วคราว กรุณาพักแล้วลองใหม่', 'RATE_LIMIT', res.status);
        }
        return null;
    }

    async function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ─── Public API ─────────────────────────────────────────────────────────
    return {
        // Core request with retry, abort, rate-limit handling
        async request(url, options = {}) {
            const target = validateOrigin(url);
            const accountId = options.accountId || IgAuth.getCookie('ds_user_id');

            // Check cooldown before making request
            const cooldownSec = IgAuth.getCooldown(accountId);
            if (cooldownSec > 0) {
                throw IgAuth.error(`Instagram ขอให้พัก กรุณารออีก ${cooldownSec} วินาที`, 'RATE_LIMIT', 429);
            }

            IgAuth.assertAccount(accountId);

            const method = String(options.method || 'GET').toUpperCase();
            const csrf = IgAuth.getCookie('csrftoken');
            const headers = buildHeaders(csrf, options.headers);
            const attempts = method === 'GET' ? 3 : 1;

            // Account validation hoisted out of retry loop (P0 fix)
            IgAuth.assertAccount(accountId);

            for (let attempt = 0; attempt < attempts; attempt++) {
                if (options.signal?.aborted) throw new DOMException('หยุดการทำงานแล้ว', 'AbortError');

                const controller = new AbortController();
                const abort = () => controller.abort();
                options.signal?.addEventListener('abort', abort, { once: true });

                let timedOut = false;
                const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 30000);

                try {
                    const res = await getFetchFn()(target.href, {
                        method,
                        headers,
                        credentials: 'include',
                        body: options.body ?? options.data,
                        signal: controller.signal
                    });

                    const newClaim = res.headers?.get('x-ig-www-claim');
                    if (newClaim) IgAuth.setWWWClaim(newClaim);

                    const text = await res.text();

                    if (options.signal?.aborted) throw new DOMException('หยุดการทำงานแล้ว', 'AbortError');

                    const data = parseResponse(text);
                    const message = String(data?.message || data?.error_type || '');
                    const redirected = res.url || '';

                    // Checkpoint detection
                    if (checkCheckpoint(data, redirected)) {
                        throw IgAuth.error('Instagram ต้องการยืนยันตัวตน กรุณาเปิด Instagram และดำเนินการให้ครบก่อนสแกนใหม่', 'CHECKPOINT', res.status);
                    }

                    // Auth & response validation
                    const authErr = checkAuthError(res, data, message, redirected);
                    if (authErr) throw authErr;

                    // Rate limit detection
                    const rateErr = checkRateLimit(res, data, message, accountId);
                    if (rateErr) throw rateErr;

                    return data;

                } catch (err) {
                    if (options.signal?.aborted) throw new DOMException('หยุดการทำงานแล้ว', 'AbortError');
                    if (timedOut) throw IgAuth.error('Instagram ไม่ตอบกลับภายใน 30 วินาที กรุณาลองใหม่', 'TIMEOUT');

                    const transient = err.status >= 500 || (!err.code && err.name === 'TypeError');
                    if (!transient || attempt + 1 >= attempts) throw err;
                } finally {
                    clearTimeout(timeout);
                    options.signal?.removeEventListener('abort', abort);
                }

                await sleep(1000 * (attempt + 1));
            }
        },

        // Relationship endpoints
        async fetchRelationshipPage(endpoint, userId, cursor = null, options = {}) {
            const uid = String(userId || '');
            if (!/^\d+$/.test(uid) || !['followers', 'following'].includes(endpoint)) {
                throw new Error('Invalid relationship target');
            }
            IgAuth.assertAccount(uid);

            const count = Math.min(50, Math.max(1, Number(APP_CONFIG?.PAGE_SIZE) || 50));

            if (options.transport === 'graphql') {
                const hash = endpoint === 'followers'
                    ? '37479f2b8209594dde7facb0d904896a'
                    : '58712303d941c6855d4e888c5f0cd22f';
                const variables = { id: uid, first: count, ...(cursor ? { after: cursor } : {}) };
                const qs = new URLSearchParams({ query_hash: hash, variables: JSON.stringify(variables) });
                const data = await this.request(`/graphql/query/?${qs}`, { ...options, accountId: uid });
                const connection = data?.data?.user?.[endpoint === 'followers' ? 'edge_followed_by' : 'edge_follow'];
                if (!Array.isArray(connection?.edges) || typeof connection.page_info?.has_next_page !== 'boolean') {
                    throw new Error('Invalid GraphQL relationship page');
                }
                return {
                    users: connection.edges.map(edge => edge?.node),
                    has_more: connection.page_info.has_next_page,
                    next_max_id: connection.page_info.has_next_page ? connection.page_info.end_cursor : null
                };
            }

            const qs = new URLSearchParams({ count: String(count), search_surface: 'follow_list_page' });
            if (cursor) qs.set('max_id', cursor);
            return this.request(`/api/v1/friendships/${uid}/${endpoint}/?${qs}`, { ...options, accountId: uid });
        },

        async fetchAllRelationships(endpoint, userId, pageSafetyLimit = 250, onProgress, speedMode = 'A') {
            const all = [];
            all.completed = false;
            all.lastError = null;
            all.pagesFetched = 0;
            all.fetchStats = { requestMs: 0, waitMs: 0 };

            const seenUsers = new Set();
            const seenCursors = new Set();
            let cursor = null;
            let transport = 'rest';
            const signal = (typeof STATE !== 'undefined' && STATE.scanController) ? STATE.scanController.signal : null;

            // Use endpoint-specific safety limits from APP_CONFIG (P0 fix)
            const safetyLimit = endpoint === 'followers'
                ? (APP_CONFIG?.FOLLOWERS_PAGE_SAFETY_LIMIT || 250)
                : (APP_CONFIG?.FOLLOWING_PAGE_SAFETY_LIMIT || 60);
            const limit = Math.max(1, Math.min(safetyLimit, Number(pageSafetyLimit) || safetyLimit));

            try {
                while (!STATE?.stopScanFlag) {
                    IgAuth.assertAccount(String(userId));
                    let data;

                    try {
                        const t0 = performance.now();
                        data = await this.fetchRelationshipPage(endpoint, userId, cursor, { transport, signal });
                        all.fetchStats.requestMs += performance.now() - t0;
                    } catch (err) {
                        // Only first-page endpoint incompatibility can switch routes
                        if (all.pagesFetched || transport !== 'rest' || err.code !== 'HTTP' || ![400, 404].includes(err.status)) {
                            throw err;
                        }
                        transport = 'graphql';
                        onProgress?.(0, 0, 'Instagram ไม่รับคำขอแบบเดิม กำลังลองเส้นทางอ่านสำรอง...');
                        if (STATE?.stopScanFlag) break;
                        const t1 = performance.now();
                        data = await this.fetchRelationshipPage(endpoint, userId, null, { transport, signal });
                        all.fetchStats.requestMs += performance.now() - t1;
                    }

                    IgAuth.assertAccount(String(userId));
                    if (STATE?.stopScanFlag) { all.completed = false; break; }
                    if (!Array.isArray(data?.users)) throw new Error('Invalid relationship page');

                    const next = data.next_max_id == null ? '' : String(data.next_max_id);
                    if ((data.has_more === true || data.more_available === true) && !next) throw new Error('Missing relationship cursor');
                    if (next && (data.has_more === false || data.more_available === false)) throw new Error('Conflicting relationship cursor');
                    if (!data.users.length && next) throw new Error('Empty relationship page with cursor');

                    const before = all.length;
                    for (const user of data.users) {
                        const id = String(user?.id || user?.pk_id || user?.pk || '').trim();
                        if (!/^\d+$/.test(id)) continue;
                        if (!seenUsers.has(id)) {
                            seenUsers.add(id);
                            all.push({
                                id,
                                username: user.username || '',
                                full_name: user.full_name || '',
                                profile_pic_url: user.profile_pic_url || '',
                                is_verified: Boolean(user.is_verified),
                                is_private: Boolean(user.is_private),
                                has_anonymous_profile_picture: Boolean(user.has_anonymous_profile_picture)
                            });
                        }
                    }

                    all.pagesFetched++;
                    onProgress?.(all.length, all.pagesFetched, null);

                    IgAuth.assertAccount(String(userId));
                    if (STATE?.stopScanFlag) { all.completed = false; break; }
                    if (!next) { all.completed = true; break; }
                    if (seenCursors.has(next)) throw new Error('Repeated relationship cursor');
                    if (before === all.length) throw new Error('Relationship pagination made no progress');
                    if (all.pagesFetched >= limit) throw new Error(`สแกนถึงขีดจำกัด ${limit} หน้า ข้อมูลยังไม่ครบ`);

                    seenCursors.add(next);
                    cursor = next;

                    // Yield between pages
                    const pause = speedMode === 'C'
                        ? 500 + Math.floor(Math.random() * 500)
                        : 2000 + Math.floor(Math.random() * 1000);
                    const tw = performance.now();
                    for (let ms = 0; ms < pause && !STATE?.stopScanFlag && !signal?.aborted; ms += 250) {
                        await sleep(250);
                    }
                    all.fetchStats.waitMs += performance.now() - tw;

                    if (STATE?.stopScanFlag || signal?.aborted) break;
                }
            } catch (err) {
                all.lastError = err;
                onProgress?.(all.length, all.pagesFetched, err.message);
            }

            return all;
        },

        // Shortcode / Media ID conversion
        shortcodeToMediaId(shortcode) {
            if (!/^[A-Za-z0-9_-]+$/.test(String(shortcode || ''))) throw new Error('Invalid shortcode');
            const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
            let value = 0n;
            for (const ch of String(shortcode || '')) {
                const index = alphabet.indexOf(ch);
                if (index < 0) throw new Error('Invalid shortcode');
                value = value * 64n + BigInt(index);
            }
            return value.toString();
        }
    };
})();

// ─── Global Exposure ────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.IgTransport = IgTransport;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { IgTransport };
}

    // ─── Module: src/modules/IgRelationship.js ──────────────────────────────────────
/* ==========================================================================
   IgRelationship — Relationship Analysis, Diff & Ghost Detection Module
   Extracted from IgBridge / runRelationshipScan for Clean Architecture (v3.0.0)
   Dependencies: none (pure algorithmic module)
   ========================================================================== */

const IgRelationship = (() => {
    'use strict';

    // ─── Constants ──────────────────────────────────────────────────────────
    const DEFAULT_AVATAR_PATTERNS = [
        '44884218_345707102882519_2446069589734326272_n',
        '464760996_1254146839119862_3605321457742435801_n'
    ];

    // ─── Extraction & Normalization Helpers ─────────────────────────────────
    function getUid(user) {
        if (!user) return '';
        return String(user.id || user.pk_id || user.pk || '').trim();
    }

    function getUname(user) {
        if (!user) return '';
        return String(user.username || '').trim().toLowerCase();
    }

    function buildIdAndUsernameSets(userList = []) {
        const idSet = new Set();
        const usernameSet = new Set();
        for (const u of userList) {
            const uid = getUid(u);
            const uname = getUname(u);
            if (uid) idSet.add(uid);
            if (uname) usernameSet.add(uname);
        }
        return { idSet, usernameSet };
    }

    // ─── Follower / Following Predicates ────────────────────────────────────
    function isFollower(user, followerIdSet, followerUsernameSet) {
        if (user?.friendship_status?.followed_by === true) return true;
        const uid = getUid(user);
        const uname = getUname(user);
        return (Boolean(uid) && followerIdSet.has(uid)) ||
               (Boolean(uname) && followerUsernameSet.has(uname));
    }

    function isFollowing(user, followingIdSet, followingUsernameSet) {
        if (user?.friendship_status?.following === true) return true;
        const uid = getUid(user);
        const uname = getUname(user);
        return (Boolean(uid) && followingIdSet.has(uid)) ||
               (Boolean(uname) && followingUsernameSet.has(uname));
    }

    // ─── Avatar Heuristics ──────────────────────────────────────────────────
    function hasNoAvatar(user, customPatterns = DEFAULT_AVATAR_PATTERNS) {
        if (!user) return true;
        if (!user.profile_pic_url) return true;
        if (user.has_anonymous_profile_picture === true) return true;
        const patterns = Array.isArray(customPatterns) ? customPatterns : DEFAULT_AVATAR_PATTERNS;
        return patterns.some(pattern => typeof user.profile_pic_url === 'string' && user.profile_pic_url.includes(pattern));
    }

    // ─── Public API ─────────────────────────────────────────────────────────
    return {
        getUid,
        getUname,
        hasNoAvatar,
        buildIdAndUsernameSets,

        /**
         * Detects ghost followers based strictly on missing or default placeholder avatars.
         * Note: Does not claim speculative bot detection.
         * @param {Array<Object>} followers - List of follower user objects
         * @param {Array<string>} [avatarPatterns] - Optional override patterns
         * @returns {Array<Object>} Ghost follower users
         */
        detectGhostFollowers(followers = [], avatarPatterns = DEFAULT_AVATAR_PATTERNS) {
            if (!Array.isArray(followers)) return [];
            return followers.filter(user => hasNoAvatar(user, avatarPatterns));
        },

        /**
         * Computes relationship diffs and lists:
         * - notFollowingBack: accounts we follow who do not follow us back
         * - fans: accounts that follow us whom we do not follow back
         * - mutual: accounts where both sides follow each other
         * - lostFollowers: accounts present in prevSnapshot followers but absent now
         *
         * @param {Array<Object>} followers - Current followers array
         * @param {Array<Object>} following - Current following array
         * @param {Object|null} [prevSnapshot] - Previous saved snapshot
         * @returns {{ notFollowingBack: Array, fans: Array, mutual: Array, lostFollowers: Array }}
         */
        computeDiff(followers = [], following = [], prevSnapshot = null) {
            const followersList = Array.isArray(followers) ? followers : [];
            const followingList = Array.isArray(following) ? following : [];

            const { idSet: followerIdSet, usernameSet: followerUsernameSet } = buildIdAndUsernameSets(followersList);
            const { idSet: followingIdSet, usernameSet: followingUsernameSet } = buildIdAndUsernameSets(followingList);

            // 1. Not following back: in following, but not in followers
            const notFollowingBack = followingList.filter(u => !isFollower(u, followerIdSet, followerUsernameSet));

            // 2. Fans: in followers, but not in following
            const fans = followersList.filter(u => !isFollowing(u, followingIdSet, followingUsernameSet));

            // 3. Mutual: in following AND in followers
            const mutual = followingList.filter(u => isFollower(u, followerIdSet, followerUsernameSet));

            // 4. Lost followers: were in prevSnapshot.follower_ids but not in current followerIdSet
            // Includes migration fallback for pre-v6 snapshots lacking follower_usernames
            const prevFollowerIds = Array.isArray(prevSnapshot?.follower_ids) ? prevSnapshot.follower_ids : [];
            const lostFollowers = prevFollowerIds
                .filter(id => !followerIdSet.has(String(id)))
                .map(id => {
                    const sid = String(id);
                    const uname = prevSnapshot?.follower_usernames?.[sid] || prevSnapshot?.usernames?.[sid];
                    return {
                        pk: sid,
                        id: sid,
                        username: uname || `user_${sid}`,
                        full_name: uname ? '' : 'เลิกติดตามหลังจากสแกนครั้งก่อน (username ไม่พบ)',
                        profile_pic_url: ''
                    };
                });

            return {
                notFollowingBack,
                fans,
                mutual,
                lostFollowers
            };
        }
    };
})();

// Export for Node.js test environment if applicable
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { IgRelationship };
}


    // ─── Module: src/modules/IgMedia.js ──────────────────────────────────────
/* ==========================================================================
   IgMedia — Media Resolution & Download Module
   Extracted from IgBridge for Clean Architecture (v3.0.0)
   Dependencies: IgAuth, IgTransport
   ========================================================================== */

const IgMedia = (() => {
    'use strict';

    // ─── Constants ──────────────────────────────────────────────────────────
    const VIDEO_FALLBACK_THRESHOLD = 1024 * 1024; // 1MB minimum for valid video
    const MAX_DOWNLOAD_RETRIES = 3;
    const BASE_RETRY_DELAY = 1000; // 1s, 2s, 4s

    // ─── Private State ──────────────────────────────────────────────────────
    const storyMediaRegistry = new Map(); // shortcode -> { items, timestamp }
    const STORY_REGISTRY_MAX = 200; // LRU cap

    // ─── Helpers ────────────────────────────────────────────────────────────
    async function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function trimRegistry() {
        if (storyMediaRegistry.size > STORY_REGISTRY_MAX) {
            const sorted = Array.from(storyMediaRegistry.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp);
            const toDelete = sorted.length - STORY_REGISTRY_MAX;
            for (let i = 0; i < toDelete; i++) {
                storyMediaRegistry.delete(sorted[i][0]);
            }
        }
    }

    // Unified download with retry logic
    async function downloadWithRetry(url, options = {}) {
        const { retries = MAX_DOWNLOAD_RETRIES, baseDelay = BASE_RETRY_DELAY } = options;
        let lastError = null;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const res = await fetch(url, { credentials: 'include' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const blob = await res.blob();
                if (blob.size === 0) throw new Error('Empty blob');
                return blob;
            } catch (err) {
                lastError = err;
                if (attempt < retries) {
                    const delay = baseDelay * Math.pow(2, attempt);
                    await sleep(delay);
                }
            }
        }
        throw lastError || new Error('Download failed after retries');
    }

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }

    // ─── Public API ─────────────────────────────────────────────────────────
    return {
        // Media selection helpers
        bestImage(item) {
            const c = item?.image_versions2?.candidates || [];
            return [...c].sort((a, b) =>
                ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))
            )[0]?.url || null;
        },

        bestProgressiveVideo(item) {
            const v = item?.video_versions || [];
            return [...v].sort((a, b) =>
                ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))
            )[0]?.url || null;
        },

        bestDashVideo(item) {
            const v = item?.video_dash_manifest ? null : null; // placeholder for future
            return v;
        },

        shortcodeToMediaId(shortcode) {
            return IgTransport.shortcodeToMediaId(shortcode);
        },

        // Core resolution
        async fetchMediaInfo(shortcode) {
            const raw = String(shortcode || '').trim();
            const mediaId = /^\d+$/.test(raw) ? raw : IgTransport.shortcodeToMediaId(raw);
            const data = await IgTransport.request(`/api/v1/media/${mediaId}/info/`);
            const item = (data.items || [])[0];
            if (!item) throw new Error('ไม่พบข้อมูลสื่อนี้');
            return item;
        },

        async resolve(shortcode) {
            return this.resolveMedia(shortcode);
        },

        async resolveMedia(shortcode) {
            const item = await this.fetchMediaInfo(shortcode);
            const nodes = Array.isArray(item.carousel_media) && item.carousel_media.length
                ? item.carousel_media
                : [item];

            return {
                item,
                shortcode,
                username: item?.user?.username || '',
                caption: item?.caption?.text || '',
                nodes: nodes.map((node, index) => ({
                    index,
                    id: String(node.pk || node.id || item.pk || item.id || shortcode),
                    mediaType: node.media_type === 2 ? 'video' : 'image',
                    imageUrl: this.bestImage(node),
                    progressiveVideoUrl: this.bestProgressiveVideo(node)
                }))
            };
        },

        // User profile HD pic
        async fetchUserProfileHD(username) {
            try {
                const data = await IgTransport.request(
                    `/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`
                );
                const user = data?.data?.user;
                if (user) {
                    return user.profile_pic_url_hd || user.profile_pic_url || null;
                }
            } catch (_) {}
            return null;
        },

        // User last post
        async fetchUserLastPost(userId, options = {}) {
            const uid = String(userId || '');
            if (!/^\d+$/.test(uid)) throw new Error('Invalid user ID');
            const accountId = (typeof STATE !== 'undefined' && STATE.relationshipAccountId) || IgAuth.getCookie('ds_user_id');
            IgAuth.assertAccount(accountId);
            const data = await IgTransport.request(`/api/v1/feed/user/${uid}/?count=1`, { ...options, accountId });
            const item = (data?.items || [])[0];
            return {
                has_posts: Boolean(item),
                last_taken_at: item?.taken_at || null,
                total_posts: data?.num_results ?? (item ? 1 : 0)
            };
        },

        // Story media registry (for stealth download)
        registerStoryMedia(shortcode, items) {
            storyMediaRegistry.set(shortcode, {
                items,
                timestamp: Date.now()
            });
            trimRegistry();
        },

        getStoryMedia(shortcode) {
            const entry = storyMediaRegistry.get(shortcode);
            if (!entry) return null;
            // TTL: 30 minutes
            if (Date.now() - entry.timestamp > 30 * 60 * 1000) {
                storyMediaRegistry.delete(shortcode);
                return null;
            }
            return entry.items;
        },

        // Download by shortcode with retry (P0 fix)
        async downloadByShortcode(shortcode, options = {}) {
            const { filename, onProgress } = options;
            onProgress?.('กำลังดึงข้อมูลสื่อ...', 0);

            const resolved = await this.resolveMedia(shortcode);
            const node = resolved.nodes[0]; // first node for now

            if (node.mediaType === 'video') {
                onProgress?.('กำลังดาวน์โหลดวิดีโอ...', 30);
                const blob = await downloadWithRetry(node.progressiveVideoUrl);
                // Validate video size
                if (blob.size < VIDEO_FALLBACK_THRESHOLD && node.imageUrl) {
                    onProgress?.('วิดีโอเล็กผิดปกติ ลองใช้รูปแทน...', 60);
                    const imgBlob = await downloadWithRetry(node.imageUrl);
                    triggerDownload(imgBlob, filename || `${resolved.username}_${shortcode}.jpg`);
                    onProgress?.('ดาวน์โหลดสำเร็จ', 100);
                    return;
                }
                triggerDownload(blob, filename || `${resolved.username}_${shortcode}.mp4`);
            } else {
                onProgress?.('กำลังดาวน์โหลดรูปภาพ...', 30);
                const blob = await downloadWithRetry(node.imageUrl);
                triggerDownload(blob, filename || `${resolved.username}_${shortcode}.jpg`);
            }
            onProgress?.('ดาวน์โหลดสำเร็จ', 100);
        },

        // Batch download resolved media (carousel support)
        async downloadResolvedMedia(resolved, options = {}) {
            const { onProgress, accountId } = options;
            IgAuth.assertAccount(accountId || IgAuth.getCookie('ds_user_id'));

            let success = 0;
            for (let i = 0; i < resolved.nodes.length; i++) {
                const node = resolved.nodes[i];
                onProgress?.(`กำลังดาวน์โหลด ${i + 1}/${resolved.nodes.length}...`, Math.round((i / resolved.nodes.length) * 100));

                try {
                    if (node.mediaType === 'video') {
                        const blob = await downloadWithRetry(node.progressiveVideoUrl);
                        if (blob.size < VIDEO_FALLBACK_THRESHOLD && node.imageUrl) {
                            const imgBlob = await downloadWithRetry(node.imageUrl);
                            triggerDownload(imgBlob, `${resolved.username}_${resolved.shortcode}_${i}.jpg`);
                        } else {
                            triggerDownload(blob, `${resolved.username}_${resolved.shortcode}_${i}.mp4`);
                        }
                    } else {
                        const blob = await downloadWithRetry(node.imageUrl);
                        triggerDownload(blob, `${resolved.username}_${resolved.shortcode}_${i}.jpg`);
                    }
                    success++;
                    await sleep(300); // small delay between downloads
                } catch (err) {
                    console.error(`Download failed for node ${i}:`, err);
                    onProgress?.(`ล้มเหลว: ${err.message}`, Math.round((i / resolved.nodes.length) * 100));
                }
            }
            onProgress?.(`เสร็จสิ้น ${success}/${resolved.nodes.length}`, 100);
            return { success, total: resolved.nodes.length };
        },

        // Queue-based media download (for bulk operations)
        async runMediaQueue(queue, options = {}) {
            const { onProgress, accountId } = options;
            const validatedAccountId = accountId || IgAuth.getCookie('ds_user_id');
            IgAuth.assertAccount(validatedAccountId);

            const results = [];
            for (let i = 0; i < queue.length; i++) {
                const item = queue[i];
                onProgress?.(`คิว ${i + 1}/${queue.length}: ${item.shortcode}`, Math.round((i / queue.length) * 100));
                try {
                    await this.downloadByShortcode(item.shortcode, { ...options, filename: item.filename });
                    results.push({ shortcode: item.shortcode, success: true });
                } catch (err) {
                    results.push({ shortcode: item.shortcode, success: false, error: err.message });
                }
                await sleep(500); // respect rate limits
            }
            onProgress?.('คิวดาวน์โหลดเสร็จสิ้น', 100);
            return results;
        }
    };
})();

// ─── Global Exposure ────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.IgMedia = IgMedia;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { IgMedia };
}

    // ─── Module: src/modules/IgProfile.js ──────────────────────────────────────
/* ==========================================================================
   IgProfile — User Profile & Inactive Activity Telemetry Module
   Extracted from IgBridge for Clean Architecture (v3.0.0)
   Dependencies: IgAuth, IgTransport
   ========================================================================== */

const IgProfile = (() => {
    'use strict';

    // ─── Public API ─────────────────────────────────────────────────────────
    return {
        /**
         * Fetches high-definition profile picture URL for an Instagram username.
         * @param {string} username - Instagram handle
         * @returns {Promise<string|null>} Full resolution avatar URL or null
         */
        async getProfileHD(username) {
            const cleanName = String(username || '').trim().replace(/^@/, '');
            if (!cleanName) return null;

            try {
                const data = await IgTransport.request(
                    `/api/v1/users/web_profile_info/?username=${encodeURIComponent(cleanName)}`
                );
                const user = data?.data?.user;
                if (user) {
                    return user.profile_pic_url_hd || user.profile_pic_url || null;
                }
            } catch (_) {
                // Silently fallback on network, parse, or privacy block
            }
            return null;
        },

        /**
         * Fetches user's latest post activity to detect inactivity/dormancy.
         * Used by Inactive Radar.
         * @param {string|number} userId - Numerical Instagram user pk/id
         * @param {Object} [options={}] - Request options (signal, accountId, etc.)
         * @returns {Promise<{ has_posts: boolean, last_taken_at: number|null, total_posts: number }>}
         */
        async getLastPost(userId, options = {}) {
            const uid = String(userId || '').trim();
            if (!/^\d+$/.test(uid)) {
                throw new Error('Invalid user ID');
            }

            const accountId = options.accountId || IgAuth.getCookie('ds_user_id');
            if (accountId) {
                IgAuth.validateAccount(accountId);
            }

            const data = await IgTransport.request(`/api/v1/feed/user/${uid}/?count=1`, {
                ...options,
                accountId
            });

            const item = (data?.items || [])[0];
            return {
                has_posts: Boolean(item),
                last_taken_at: item?.taken_at || null,
                total_posts: data?.num_results ?? (item ? 1 : 0)
            };
        }
    };
})();

// Export for Node.js test environment if applicable
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { IgProfile };
}


    // ─── Module: src/modules/IgUnfollow.js ──────────────────────────────────────
/* ==========================================================================
   IgUnfollow — Unfollow Action & Safety Verification Module
   Extracted from IgBridge for Clean Architecture (v3.0.0)
   Dependencies: IgAuth, IgTransport
   ========================================================================== */

const IgUnfollow = (() => {
    'use strict';

    // ─── Helpers ────────────────────────────────────────────────────────────
    async function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function makeError(message, code, status = 0) {
        return Object.assign(new Error(message), { code, status });
    }

    // ─── Public API ─────────────────────────────────────────────────────────
    return {
        /**
         * Executes an unfollow request for a specific user ID.
         * Tries multiple candidate routes sequentially with fallback on HTTP 404/405.
         * Fails fast on authentication errors, session mismatch, or ambiguous network errors.
         *
         * @param {string|number} userId - Numerical Instagram user ID
         * @param {Object} [options={}] - Execution options:
         *        - accountId: current active account ID (defaults to ds_user_id cookie)
         *        - csrf: CSRF token (defaults to csrftoken cookie)
         *        - isProtectedUser: (uid, username) => boolean whitelist checker
         *        - username: username of user to unfollow (for whitelist lookup)
         *        - signal: AbortSignal
         * @returns {Promise<boolean>} Resolves true when unfollow is confirmed by Instagram
         */
        async execute(userId, options = {}) {
            const uid = String(userId || '').trim();
            if (!/^\d+$/.test(uid)) {
                throw makeError('Invalid User ID to unfollow', 'INVALID_ID');
            }

            // Whitelist protection guard
            if (typeof options.isProtectedUser === 'function') {
                if (options.isProtectedUser(uid, options.username)) {
                    throw makeError('บัญชีนี้อยู่ใน Whitelist', 'WHITELIST');
                }
            }

            const accountId = options.accountId || IgAuth.getCookie('ds_user_id');
            // Validate account before unfollow attempt
            try {
                IgAuth.validateAccount(accountId);
            } catch (e) {
                throw makeError('บัญชีเปลี่ยนหรือออกจากระบบ — กรุณารีเฟรช Instagram แล้วลองใหม่', 'ACCOUNT_CHANGED');
            }

            const csrf = options.csrf || IgAuth.getCookie('csrftoken');
            if (!csrf) {
                throw makeError('ไม่พบ CSRF token กรุณารีเฟรช Instagram', 'AUTH');
            }

            const candidateRoutes = [
                {
                    url: `/web/friendships/${uid}/unfollow/`,
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                },
                {
                    url: `/api/v1/web/friendships/${uid}/unfollow/`,
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                },
                {
                    url: `/api/v1/friendships/destroy/${uid}/`,
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ user_id: uid, _uid: accountId, _csrftoken: csrf }).toString()
                }
            ];

            let lastError = null;
            for (let i = 0; i < candidateRoutes.length; i++) {
                IgAuth.validateAccount(accountId);
                if (i > 0) await sleep(1000);

                const route = candidateRoutes[i];
                try {
                    const res = await IgTransport.request(route.url, {
                        method: 'POST',
                        accountId,
                        headers: route.headers,
                        body: route.body,
                        signal: options.signal
                    });

                    // Verification: Must confirm unfollow status explicitly
                    if (res?.friendship_status?.following === false ||
                        (res?.status === 'ok' && res.friendship_status === undefined)) {
                        return true;
                    }

                    throw makeError(
                        'Instagram ไม่ได้ยืนยันการเลิกติดตาม กรุณาตรวจสอบหน้าโปรไฟล์ก่อนลองใหม่',
                        'UNCONFIRMED'
                    );
                } catch (err) {
                    lastError = err;
                    // Never repeat an ambiguous write or a rejected session on another route.
                    // Only fallback to next route on 404 (Not Found) or 405 (Method Not Allowed).
                    if (err.code !== 'HTTP' || ![404, 405].includes(err.status)) {
                        throw err;
                    }
                }
            }

            throw lastError || makeError(
                'Instagram ไม่ได้ยืนยันการเลิกติดตาม กรุณาตรวจสอบในหน้าโปรไฟล์ก่อนลองใหม่',
                'UNCONFIRMED'
            );
        }
    };
})();

// Export for Node.js test environment if applicable
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { IgUnfollow };
}


    // ─── Module: src/core/StateManager.js ──────────────────────────────────────
/* ==========================================================================
   StateManager — Central Reactive State Store & Undo/Redo Engine
   Replaces the global STATE object for Clean Architecture (v3.0.0)
   Dependencies: IgRelationship (optional, for derived relationship diffing)
   ========================================================================== */

class StateManager {
    #state;
    #listeners;
    #undoStack;
    #redoStack;

    static DEFAULT_PREFS = {
        stealthStory: true,
        cleanFeed: true,
        quickDownloadFeed: true,
        quickDownloadStory: true,
        inactiveThresholdDays: 180,
        scanSpeed: 'A'
    };

    constructor(initialState = {}) {
        this.#listeners = new Map();
        this.#undoStack = [];
        this.#redoStack = [];

        this.#state = {
            currentUser: { id: null, username: null },
            relationshipAccountId: null,
            followers: [],
            following: [],
            notFollowingBack: [],
            fans: [],
            mutual: [],
            lostFollowers: [],
            ghostFollowers: [],
            inactiveFollowing: [],
            whitelist: new Map(),
            whitelistByName: new Set(),
            selectedIds: new Set(),
            isScanning: false,
            stopScanFlag: false,
            scanController: null,
            scanStartTime: 0,
            scanIncomplete: false,
            isUnfollowing: false,
            stopUnfollowFlag: false,
            isScanningInactive: false,
            stopInactiveScanFlag: false,
            inactiveController: null,
            activeTab: 'relationship',
            relationshipFilter: 'not_following_back',
            searchQuery: '',
            relationshipLimit: 100,
            subFilters: {
                excludeVerified: false,
                excludePrivate: false,
                excludeNoAvatar: false,
                excludeWhitelist: false,
                onlyFollowing: false,
                onlyNotFollowed: false
            },
            prefs: this.#loadPrefs(),
            ...initialState
        };
    }

    #loadPrefs() {
        try {
            if (typeof localStorage !== 'undefined') {
                const raw = localStorage.getItem('maxpland_prefs');
                if (raw) return { ...StateManager.DEFAULT_PREFS, ...JSON.parse(raw) };
            }
        } catch (_) {}
        return { ...StateManager.DEFAULT_PREFS };
    }

    #savePrefs(prefs) {
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('maxpland_prefs', JSON.stringify(prefs));
            }
        } catch (_) {}
    }

    // ─── Event Emitter ──────────────────────────────────────────────────────
    on(event, handler) {
        if (typeof handler !== 'function') return () => {};
        if (!this.#listeners.has(event)) {
            this.#listeners.set(event, new Set());
        }
        this.#listeners.get(event).add(handler);
        return () => this.off(event, handler);
    }

    off(event, handler) {
        const set = this.#listeners.get(event);
        if (set) {
            set.delete(handler);
            if (set.size === 0) this.#listeners.delete(event);
        }
    }

    emit(event, payload) {
        const set = this.#listeners.get(event);
        if (set) {
            for (const handler of set) {
                try {
                    handler(payload, this.getSnapshot());
                } catch (err) {
                    console.error(`[StateManager] Error in event listener for "${event}":`, err);
                }
            }
        }
        // Also emit wildcard event
        const wildcard = this.#listeners.get('*');
        if (wildcard) {
            for (const handler of wildcard) {
                try {
                    handler({ event, payload }, this.getSnapshot());
                } catch (err) {
                    console.error('[StateManager] Error in wildcard listener:', err);
                }
            }
        }
    }

    // ─── State Access & Mutation ────────────────────────────────────────────
    get(key) {
        return this.#state[key];
    }

    getSnapshot() {
        return { ...this.#state };
    }

    set(key, value) {
        const prev = this.#state[key];
        this.#state[key] = value;
        if (key === 'prefs') {
            this.#savePrefs(value);
        }
        this.emit(`change:${key}`, { prev, current: value });
        this.emit('change', { key, prev, current: value });
        return value;
    }

    update(partial) {
        if (!partial || typeof partial !== 'object') return;
        const changes = [];
        for (const [key, value] of Object.entries(partial)) {
            const prev = this.#state[key];
            this.#state[key] = value;
            if (key === 'prefs') this.#savePrefs(value);
            changes.push({ key, prev, current: value });
            this.emit(`change:${key}`, { prev, current: value });
        }
        this.emit('batchChange', changes);
    }

    // ─── Relationship Ingestion & Derived State ─────────────────────────────
    setRelationships(followers, following, prevSnapshot = null, relationshipModule = null) {
        const rm = relationshipModule || (typeof IgRelationship !== 'undefined' ? IgRelationship : null);
        let diff = { notFollowingBack: [], fans: [], mutual: [], lostFollowers: [] };
        let ghostFollowers = [];

        if (rm && typeof rm.computeDiff === 'function') {
            diff = rm.computeDiff(followers, following, prevSnapshot);
            ghostFollowers = rm.detectGhostFollowers ? rm.detectGhostFollowers(followers) : [];
        } else {
            // Fallback in-memory diff if module not provided
            const followerIdSet = new Set((followers || []).map(u => String(u.id || u.pk || '')));
            const followingIdSet = new Set((following || []).map(u => String(u.id || u.pk || '')));
            diff.notFollowingBack = (following || []).filter(u => !followerIdSet.has(String(u.id || u.pk || '')));
            diff.fans = (followers || []).filter(u => !followingIdSet.has(String(u.id || u.pk || '')));
            diff.mutual = (following || []).filter(u => followerIdSet.has(String(u.id || u.pk || '')));
            diff.lostFollowers = (prevSnapshot?.follower_ids || [])
                .filter(id => !followerIdSet.has(String(id)))
                .map(id => ({ id: String(id), pk: String(id), username: `user_${id}` }));
        }

        this.update({
            followers: [...(followers || [])],
            following: [...(following || [])],
            notFollowingBack: diff.notFollowingBack,
            fans: diff.fans,
            mutual: diff.mutual,
            lostFollowers: diff.lostFollowers,
            ghostFollowers,
            scanIncomplete: false
        });

        this.emit('relationshipsUpdated', {
            totalFollowers: followers?.length || 0,
            totalFollowing: following?.length || 0,
            diff
        });
    }

    // ─── Whitelist & Undo / Redo ────────────────────────────────────────────
    toggleWhitelist(userId, username = '') {
        const uid = String(userId || '').trim();
        const uname = String(username || '').trim().toLowerCase();
        if (!uid && !uname) return;

        const isCurrentlyWhitelisted = this.#state.whitelist.has(uid) || (uname && this.#state.whitelistByName.has(uname));
        const action = {
            type: 'TOGGLE_WHITELIST',
            userId: uid,
            username: uname,
            wasWhitelisted: isCurrentlyWhitelisted
        };

        this.#applyWhitelistChange(uid, uname, !isCurrentlyWhitelisted);
        this.#undoStack.push(action);
        this.#redoStack = []; // Clear redo on new action
        this.emit('whitelistChanged', { userId: uid, username: uname, isWhitelisted: !isCurrentlyWhitelisted });
    }

    #applyWhitelistChange(uid, uname, add) {
        if (add) {
            if (uid) this.#state.whitelist.set(uid, { username: uname, added_at: Date.now() });
            if (uname) this.#state.whitelistByName.add(uname);
        } else {
            if (uid) this.#state.whitelist.delete(uid);
            if (uname) this.#state.whitelistByName.delete(uname);
        }
    }

    undo() {
        const action = this.#undoStack.pop();
        if (!action) return false;

        if (action.type === 'TOGGLE_WHITELIST') {
            this.#applyWhitelistChange(action.userId, action.username, action.wasWhitelisted);
            this.#redoStack.push(action);
            this.emit('whitelistChanged', {
                userId: action.userId,
                username: action.username,
                isWhitelisted: action.wasWhitelisted,
                isUndo: true
            });
            return true;
        }
        return false;
    }

    redo() {
        const action = this.#redoStack.pop();
        if (!action) return false;

        if (action.type === 'TOGGLE_WHITELIST') {
            this.#applyWhitelistChange(action.userId, action.username, !action.wasWhitelisted);
            this.#undoStack.push(action);
            this.emit('whitelistChanged', {
                userId: action.userId,
                username: action.username,
                isWhitelisted: !action.wasWhitelisted,
                isRedo: true
            });
            return true;
        }
        return false;
    }

    get canUndo() {
        return this.#undoStack.length > 0;
    }

    get canRedo() {
        return this.#redoStack.length > 0;
    }
}

// ─── Global Exposure & Export ───────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.StateManager = StateManager;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StateManager };
}


    // ─── Module: src/core/FilterEngine.js ──────────────────────────────────────
/* ==========================================================================
   FilterEngine — Reactive Query & Faceted Filter Engine
   Filters users based on relationship categories, follow-state chips,
   safety exemptions, and search queries for Clean Architecture (v3.0.0)
   Dependencies: StateManager, IgRelationship (for hasNoAvatar)
   ========================================================================== */

class FilterEngine {
    #stateManager;
    #subscribers;
    #unsubscribeState;

    constructor(stateManager) {
        if (!stateManager) {
            throw new Error('[FilterEngine] StateManager instance required');
        }
        this.#stateManager = stateManager;
        this.#subscribers = new Set();

        // Automatically trigger listeners when relevant state slices change
        this.#unsubscribeState = this.#stateManager.on('*', ({ event }) => {
            if (
                event.startsWith('change:') ||
                event === 'relationshipsUpdated' ||
                event === 'whitelistChanged' ||
                event === 'batchChange'
            ) {
                this.notify();
            }
        });
    }

    destroy() {
        if (typeof this.#unsubscribeState === 'function') {
            this.#unsubscribeState();
        }
        this.#subscribers.clear();
    }

    // ─── Filter Mutators ────────────────────────────────────────────────────
    setFilter(filterName) {
        this.#stateManager.set('relationshipFilter', filterName);
        this.notify();
    }

    setSubFilter(key, value) {
        const sub = { ...(this.#stateManager.get('subFilters') || {}) };
        sub[key] = Boolean(value);
        this.#stateManager.set('subFilters', sub);
        this.notify();
    }

    /**
     * Toggles mutually exclusive follow-state chips:
     * 'onlyFollowing' vs 'onlyNotFollowed'.
     * Clicking an active chip turns it off.
     */
    setFollowStateChip(which) {
        const currentSub = this.#stateManager.get('subFilters') || {};
        const next = !currentSub[which];

        const updated = {
            ...currentSub,
            onlyFollowing: which === 'onlyFollowing' && next,
            onlyNotFollowed: which === 'onlyNotFollowed' && next
        };

        this.#stateManager.set('subFilters', updated);
        this.notify();
        return updated;
    }

    setSearchQuery(query) {
        this.#stateManager.set('searchQuery', String(query || '').trim().toLowerCase());
        this.notify();
    }

    // ─── Query Evaluation ───────────────────────────────────────────────────
    apply() {
        const filter = this.#stateManager.get('relationshipFilter') || 'not_following_back';
        const subFilters = this.#stateManager.get('subFilters') || {};
        const searchQuery = String(this.#stateManager.get('searchQuery') || '').trim().toLowerCase();
        const following = this.#stateManager.get('following') || [];
        const whitelist = this.#stateManager.get('whitelist') || new Map();
        const whitelistByName = this.#stateManager.get('whitelistByName') || new Set();

        // 1. Resolve raw pool
        let pool = [];
        if (filter === 'not_following_back') pool = this.#stateManager.get('notFollowingBack') || [];
        else if (filter === 'fans') pool = this.#stateManager.get('fans') || [];
        else if (filter === 'mutual') pool = this.#stateManager.get('mutual') || [];
        else if (filter === 'lost') pool = this.#stateManager.get('lostFollowers') || [];
        else if (filter === 'ghost') pool = this.#stateManager.get('ghostFollowers') || [];
        else if (filter === 'inactive') pool = this.#stateManager.get('inactiveFollowing') || [];
        else if (filter === 'whitelist') pool = Array.from(whitelist.values());
        else pool = this.#stateManager.get(filter) || [];

        // Precompute followed IDs set for O(1) membership check
        const followedIds = new Set(
            following.map(x => String(x.id || x.pk_id || x.pk || '').trim()).filter(Boolean)
        );

        // Helper to check whitelist status
        const isWhitelisted = (uid, uname) => {
            return whitelist.has(uid) || (uname && whitelistByName.has(uname));
        };

        // Helper for avatar check
        const checkNoAvatar = u => {
            if (typeof IgRelationship !== 'undefined' && typeof IgRelationship.hasNoAvatar === 'function') {
                return IgRelationship.hasNoAvatar(u);
            }
            return !u.profile_pic_url || u.has_anonymous_profile_picture === true;
        };

        // 2. Filter predicates
        return pool.filter(u => {
            const uid = String(u.id || u.pk_id || u.pk || '').trim();
            const uname = String(u.username || '').toLowerCase();

            // Follow-state chips (mutually exclusive)
            const isFollowedByUs = Boolean(uid) && followedIds.has(uid);
            if (subFilters.onlyFollowing && !isFollowedByUs) return false;
            if (subFilters.onlyNotFollowed && isFollowedByUs) return false;

            // Whitelist exclusion
            if (subFilters.excludeWhitelist && isWhitelisted(uid, uname)) return false;

            // Verified exclusion
            if (subFilters.excludeVerified && u.is_verified) return false;

            // Private account exclusion
            if (subFilters.excludePrivate && u.is_private) return false;

            // No-avatar exclusion
            if (subFilters.excludeNoAvatar && checkNoAvatar(u)) return false;

            // Text search query (username or full_name)
            if (searchQuery) {
                const matchUser = uname.includes(searchQuery);
                const matchName = u.full_name && String(u.full_name).toLowerCase().includes(searchQuery);
                if (!matchUser && !matchName) return false;
            }

            return true;
        });
    }

    // ─── Reactive Subscriptions ─────────────────────────────────────────────
    subscribe(callback) {
        if (typeof callback !== 'function') return () => {};
        this.#subscribers.add(callback);
        // Immediately invoke with current results
        try {
            callback(this.apply());
        } catch (err) {
            console.error('[FilterEngine] Error in initial subscriber callback:', err);
        }
        return () => this.#subscribers.delete(callback);
    }

    notify() {
        if (this.#subscribers.size === 0) return;
        const results = this.apply();
        for (const cb of this.#subscribers) {
            try {
                cb(results);
            } catch (err) {
                console.error('[FilterEngine] Error notifying subscriber:', err);
            }
        }
    }
}

// ─── Global Exposure & Export ───────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.FilterEngine = FilterEngine;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FilterEngine };
}


    // ─── Module: src/ui/TemplateEngine.js ──────────────────────────────────────
/* ==========================================================================
   TemplateEngine & ComponentRegistry
   Lightweight zero-dependency templating and component registry for Clean
   Architecture (v3.0.0)
   ========================================================================== */

const TemplateEngine = (() => {
    'use strict';

    const components = new Map();

    // ─── Sanitization & Escaping ────────────────────────────────────────────
    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Resolve nested object property e.g. "user.profile.name"
    function resolvePath(obj, path) {
        return path.split('.').reduce((acc, part) => (acc != null ? acc[part] : undefined), obj);
    }

    // ─── Template Interpolation ─────────────────────────────────────────────
    /**
     * Renders a template string by replacing {{key}} or {{!rawKey}} tokens.
     * Tokens prefixed with "!" (e.g. {{!htmlContent}}) are rendered unescaped.
     * All standard {{key}} tokens are automatically HTML-escaped.
     *
     * @param {string} template - Template string
     * @param {Object} data - Context object
     * @returns {string} Interpolated HTML string
     */
    function render(template, data = {}) {
        if (typeof template !== 'string') return '';

        return template.replace(/\{\{(!?)\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, rawFlag, key) => {
            const val = resolvePath(data, key);
            if (val === undefined || val === null) return '';
            return rawFlag === '!' ? String(val) : escapeHtml(val);
        });
    }

    // ─── Component Registry ─────────────────────────────────────────────────
    function registerComponent(name, renderer) {
        if (typeof renderer === 'function') {
            components.set(name, renderer);
        } else if (typeof renderer === 'string') {
            components.set(name, props => render(renderer, props));
        } else {
            throw new Error(`[TemplateEngine] Invalid renderer for component "${name}"`);
        }
    }

    function renderComponent(name, props = {}) {
        const renderer = components.get(name);
        if (!renderer) {
            console.warn(`[TemplateEngine] Component "${name}" not found`);
            return '';
        }
        return renderer(props);
    }

    // ─── Pre-registered MaxPland Components ─────────────────────────────────
    registerComponent('statCard', ({ cardClass = '', targetFilter = '', label = '', value = '-', id = '' }) => `
        <div class="maxpland-stat-card ${escapeHtml(cardClass)}" ${targetFilter ? `data-target-filter="${escapeHtml(targetFilter)}"` : ''}>
            <span class="maxpland-stat-label">${escapeHtml(label)}</span>
            <span class="maxpland-stat-value" ${id ? `id="${escapeHtml(id)}"` : ''}>${escapeHtml(value)}</span>
        </div>
    `);

    registerComponent('pillButton', ({ filter = '', icon = '', label = '', count = '-', countId = '', active = false }) => `
        <button class="maxpland-pill-btn ${active ? 'active' : ''}" data-filter="${escapeHtml(filter)}">
            ${icon ? `${icon} ` : ''}${escapeHtml(label)}
            <span class="maxpland-pill-count" ${countId ? `id="${escapeHtml(countId)}"` : ''}>${escapeHtml(count)}</span>
        </button>
    `);

    registerComponent('statusTag', ({ tagClass = '', text = '', icon = '' }) => `
        <span class="maxpland-status-tag ${escapeHtml(tagClass)}">
            ${icon ? `${icon} ` : ''}${escapeHtml(text)}
        </span>
    `);

    registerComponent('userRow', ({ user, tagClass = '', tagText = '', isSelected = false, isWhitelisted = false }) => {
        const uid = escapeHtml(user?.id || user?.pk_id || user?.pk || '');
        const uname = escapeHtml(user?.username || '');
        const fullName = escapeHtml(user?.full_name || '');
        const avatarUrl = user?.profile_pic_url ? escapeHtml(user.profile_pic_url) : '';

        return `
            <div class="maxpland-user-row" data-id="${uid}" data-username="${uname}">
                <div class="maxpland-user-check">
                    <input type="checkbox" class="maxpland-checkbox user-select-checkbox" data-id="${uid}" aria-label="เลือก @${uname}" ${isSelected ? 'checked' : ''}>
                </div>
                <div class="maxpland-user-avatar">
                    ${avatarUrl ? `<img src="${avatarUrl}" alt="${uname}" loading="lazy">` : '<div class="maxpland-avatar-placeholder">?</div>'}
                </div>
                <div class="maxpland-user-info">
                    <div class="maxpland-user-name-line">
                        <a href="https://www.instagram.com/${uname}/" target="_blank" rel="noopener noreferrer" class="maxpland-username">@${uname}</a>
                        ${user?.is_verified ? '<span class="maxpland-verified-badge" title="Verified">✓</span>' : ''}
                        ${user?.is_private ? '<span class="maxpland-private-badge" title="Private">🔒</span>' : ''}
                        ${tagText ? `<span class="maxpland-status-tag ${escapeHtml(tagClass)}">${escapeHtml(tagText)}</span>` : ''}
                    </div>
                    ${fullName ? `<div class="maxpland-fullname">${fullName}</div>` : ''}
                </div>
                <div class="maxpland-user-actions">
                    <button type="button" class="maxpland-icon-btn btn-toggle-whitelist" data-id="${uid}" data-username="${uname}" title="${isWhitelisted ? 'นำออกจาก Whitelist' : 'เพิ่มใน Whitelist'}">
                        ${isWhitelisted ? '★' : '☆'}
                    </button>
                    <button type="button" class="maxpland-btn-sm maxpland-btn-unfollow" data-id="${uid}" data-username="${uname}">
                        เลิกติดตาม
                    </button>
                </div>
            </div>
        `;
    });

    // ─── Public API ─────────────────────────────────────────────────────────
    return {
        escapeHtml,
        render,
        registerComponent,
        renderComponent,
        hasComponent(name) {
            return components.has(name);
        },
        listComponents() {
            return Array.from(components.keys());
        }
    };
})();

// ─── Global Exposure & Export ───────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.TemplateEngine = TemplateEngine;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TemplateEngine };
}


    // ─── Module: src/ui/ProgressController.js ──────────────────────────────────────
/* ==========================================================================
   ProgressController — Unified Global Scanner & Progress UI Controller
   Consolidates progress updates across relationship scans, unfollow, radar,
   and media downloads for Clean Architecture (v3.0.0)
   ========================================================================== */

const ProgressController = (() => {
    'use strict';

    // ─── Private State ──────────────────────────────────────────────────────
    let startTime = 0;
    let timerInterval = null;
    let hideTimer = null;
    let isRunning = false;

    // ─── DOM Helpers ────────────────────────────────────────────────────────
    const dummyEl = {
        style: {},
        textContent: '',
        innerHTML: '',
        disabled: false
    };

    function el(id) {
        if (typeof document === 'undefined') return dummyEl;
        return document.getElementById(id) || dummyEl;
    }

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function clearHideTimer() {
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }
    }

    // ─── Public API ─────────────────────────────────────────────────────────
    return {
        /**
         * Starts the progress UI for an operation.
         * @param {Object} options
         * @param {string} [options.title='กำลังเริ่มการทำงาน...'] - Initial phase title
         * @param {number} [options.total=0] - Total expected units
         * @param {string} [options.countText] - Custom count indicator
         */
        start({ title = 'กำลังเริ่มการทำงาน...', total = 0, countText = '' } = {}) {
            clearHideTimer();
            stopTimer();

            isRunning = true;
            startTime = Date.now();

            const container = el('maxpland-global-progress');
            container.style.display = 'block';

            el('maxpland-scan-phase').textContent = title;
            el('maxpland-scan-notice').style.display = 'none';
            el('maxpland-scan-notice').textContent = '';
            el('maxpland-scan-status-summary').textContent = '';
            el('maxpland-progress-fill').style.width = '0%';
            el('maxpland-scan-stat-count').textContent = countText || (total ? `0 / ${total}` : 'บัญชี: 0');
            el('maxpland-scan-stat-page').textContent = 'หน้า: 0';
            el('maxpland-scan-stat-timer').textContent = '⏱️ 00:00';

            timerInterval = setInterval(() => {
                const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
                el('maxpland-scan-stat-timer').textContent = `⏱️ ${formatTime(elapsedSec)}`;
            }, 1000);
        },

        /**
         * Updates progress status, percentage, counts, and messages.
         * @param {Object} options
         */
        update({ phase, current, total, page, message, percentage, countText } = {}) {
            if (!isRunning) return;

            if (phase) {
                el('maxpland-scan-phase').textContent = phase;
            }

            if (countText) {
                el('maxpland-scan-stat-count').textContent = countText;
            } else if (current != null && total != null) {
                el('maxpland-scan-stat-count').textContent = `${current.toLocaleString()} / ${total.toLocaleString()}`;
            } else if (current != null) {
                el('maxpland-scan-stat-count').textContent = `บัญชี: ${current.toLocaleString()}`;
            }

            if (page != null) {
                el('maxpland-scan-stat-page').textContent = `หน้า: ${page}`;
            }

            // Calculate or apply percentage width
            let pct = percentage;
            if (pct == null && current != null && total) {
                pct = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
            }
            if (pct != null) {
                el('maxpland-progress-fill').style.width = `${pct}%`;
            }

            // Optional notice / message display
            const noticeEl = el('maxpland-scan-notice');
            if (message) {
                noticeEl.textContent = message;
                noticeEl.style.display = 'block';
            }
        },

        /**
         * Marks operation as finished, updates summary and sets 100% width.
         * @param {Object} options
         */
        finish({ success = true, summary = '', delayHideMs = 0 } = {}) {
            stopTimer();
            isRunning = false;

            el('maxpland-progress-fill').style.width = success ? '100%' : el('maxpland-progress-fill').style.width;
            el('maxpland-scan-phase').textContent = success ? 'เสร็จสมบูรณ์' : 'หยุดการทำงานแล้ว';

            if (summary) {
                el('maxpland-scan-status-summary').textContent = summary;
            }

            if (delayHideMs > 0) {
                this.hide(delayHideMs);
            }
        },

        /**
         * Reports an error in the progress banner.
         * @param {string} message - Error description
         */
        error(message) {
            stopTimer();
            isRunning = false;

            el('maxpland-scan-phase').textContent = 'เกิดข้อผิดพลาด';
            const noticeEl = el('maxpland-scan-notice');
            noticeEl.textContent = message || 'ไม่สามารถดำเนินการต่อได้';
            noticeEl.style.display = 'block';
        },

        /**
         * Hides the progress UI after an optional delay.
         * @param {number} [delayMs=0] - Delay before hiding
         */
        hide(delayMs = 0) {
            clearHideTimer();
            stopTimer();
            isRunning = false;

            if (delayMs <= 0) {
                el('maxpland-global-progress').style.display = 'none';
            } else {
                hideTimer = setTimeout(() => {
                    el('maxpland-global-progress').style.display = 'none';
                    hideTimer = null;
                }, delayMs);
            }
        },

        get isRunning() {
            return isRunning;
        }
    };
})();

// ─── Global Exposure & Export ───────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.ProgressController = ProgressController;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ProgressController };
}


    // ─── Module: src/ui/EventDelegator.js ──────────────────────────────────────
/**
 * EventDelegator.js
 * Centralized, leak-free event delegation system for IG MaxPland UI.
 * Replaces 50+ individual addEventListener bindings with single root event listeners and data-action routing.
 */

class EventDelegator {
    /**
     * @param {Element|Document} [rootElement] Root element to bind native listeners to.
     */
    constructor(rootElement) {
        this.root = rootElement || (typeof document !== 'undefined' ? document : null);
        this.routes = new Map(); // eventType -> Map<selector, Set<handler>>
        this.activeEventTypes = new Set();
        this.abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
        this._isDestroyed = false;
    }

    /**
     * Normalizes selector: converts simple action names to `[data-action="name"]`.
     * @param {string} selectorOrAction
     * @returns {string}
     */
    static normalizeSelector(selectorOrAction) {
        if (!selectorOrAction || typeof selectorOrAction !== 'string') return '';
        const trimmed = selectorOrAction.trim();
        // If it looks like a CSS selector, keep it
        if (/^[.#\[:>+~]/.test(trimmed) || trimmed.includes(' ') || trimmed.includes('[')) {
            return trimmed;
        }
        // Shorthand for data-action
        return `[data-action="${trimmed}"]`;
    }

    /**
     * Registers a delegated event handler.
     * @param {string} eventType e.g. 'click', 'change', 'input'
     * @param {string} selectorOrAction CSS selector or data-action name
     * @param {Function} handler (event, targetElement) => void
     * @returns {Function} Unbind callback
     */
    on(eventType, selectorOrAction, handler) {
        if (this._isDestroyed) return () => {};
        if (typeof eventType !== 'string' || typeof handler !== 'function') return () => {};

        const selector = EventDelegator.normalizeSelector(selectorOrAction);
        if (!selector) return () => {};

        if (!this.routes.has(eventType)) {
            this.routes.set(eventType, new Map());
            this._mountRootListener(eventType);
        }

        const selectorMap = this.routes.get(eventType);
        if (!selectorMap.has(selector)) {
            selectorMap.set(selector, new Set());
        }

        const handlerSet = selectorMap.get(selector);
        handlerSet.add(handler);

        let isUnbound = false;
        return () => {
            if (isUnbound) return;
            isUnbound = true;
            this.off(eventType, selector, handler);
        };
    }

    /**
     * Unregisters a delegated event handler.
     * @param {string} eventType
     * @param {string} selectorOrAction
     * @param {Function} [handler]
     */
    off(eventType, selectorOrAction, handler) {
        if (!this.routes.has(eventType)) return;
        const selector = EventDelegator.normalizeSelector(selectorOrAction);
        const selectorMap = this.routes.get(eventType);

        if (!selectorMap.has(selector)) return;

        if (handler) {
            const handlerSet = selectorMap.get(selector);
            handlerSet.delete(handler);
            if (handlerSet.size === 0) {
                selectorMap.delete(selector);
            }
        } else {
            selectorMap.delete(selector);
        }

        if (selectorMap.size === 0) {
            this.routes.delete(eventType);
        }
    }

    /**
     * Mounts a single native event listener on the root element.
     * @private
     * @param {string} eventType
     */
    _mountRootListener(eventType) {
        if (!this.root || typeof this.root.addEventListener !== 'function') return;
        if (this.activeEventTypes.has(eventType)) return;

        this.activeEventTypes.add(eventType);
        const signal = this.abortController ? this.abortController.signal : undefined;

        this.root.addEventListener(eventType, (event) => {
            if (this._isDestroyed) return;
            const selectorMap = this.routes.get(eventType);
            if (!selectorMap || selectorMap.size === 0) return;

            let target = event.target;
            if (!target) return;

            for (const [selector, handlers] of selectorMap.entries()) {
                if (handlers.size === 0) continue;

                let match = null;
                if (typeof target.closest === 'function') {
                    match = target.closest(selector);
                }

                const isDoc = typeof document !== 'undefined' && this.root === document;
                if (match && (isDoc || typeof this.root?.contains !== 'function' || this.root.contains(match))) {
                    for (const fn of handlers) {
                        try {
                            fn.call(match, event, match);
                        } catch (err) {
                            console.error(`[EventDelegator] Error in handler for ${eventType} ${selector}:`, err);
                        }
                    }
                }
            }
        }, { signal, passive: false });
    }

    /**
     * Programmatically triggers actions registered on this delegator.
     * @param {string} actionName
     * @param {Object} [payload={}]
     * @param {Event} [originalEvent]
     */
    dispatch(actionName, payload = {}, originalEvent = null) {
        const selector = `[data-action="${actionName}"]`;
        const selectorMap = this.routes.get('click');
        if (!selectorMap || !selectorMap.has(selector)) return false;

        const handlers = selectorMap.get(selector);
        const syntheticEvent = originalEvent || {
            type: 'click',
            target: null,
            detail: payload,
            preventDefault: () => {},
            stopPropagation: () => {}
        };

        for (const fn of handlers) {
            try {
                fn.call(null, syntheticEvent, null);
            } catch (err) {
                console.error(`[EventDelegator] Error in dispatch for ${actionName}:`, err);
            }
        }
        return true;
    }

    /**
     * Cleanly tears down all event listeners and routes.
     */
    destroy() {
        if (this._isDestroyed) return;
        this._isDestroyed = true;

        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }

        this.routes.clear();
        this.activeEventTypes.clear();
        this.root = null;
    }
}

// Global & CommonJS Export Pattern
if (typeof window !== 'undefined') {
    window.EventDelegator = EventDelegator;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { EventDelegator };
}


    // ─── Module: src/features/MediaDownloader.js ──────────────────────────────────────
/**
 * MediaDownloader.js
 * Comprehensive media download orchestrator for IG MaxPland.
 * Consolidates downloadResolvedMedia, downloadByShortcode, downloadFromArticle, and runMediaQueue.
 */

class MediaDownloader {
    /**
     * @param {Object} options
     * @param {Object} [options.stateManager]
     * @param {Object} [options.progressController]
     * @param {Object} [options.igMedia]
     * @param {Object} [options.igAuth]
     * @param {Object} [options.vault]
     * @param {Function} [options.gmDownloadFn]
     */
    constructor(options = {}) {
        this.stateManager = options.stateManager || (typeof window !== 'undefined' ? window.stateManager : null);
        this.progressController = options.progressController || (typeof window !== 'undefined' ? window.progressController : null);
        this.igMedia = options.igMedia || (typeof window !== 'undefined' ? (window.IgMedia || window.IgBridge) : null);
        this.igAuth = options.igAuth || (typeof window !== 'undefined' ? (window.IgAuth || window.IgBridge) : null);
        this.vault = options.vault || (typeof window !== 'undefined' ? window.MaxPlandVault : null);
        this.gmDownloadFn = options.gmDownloadFn || (typeof GM_download === 'function' ? GM_download : null);

        this.isQueueRunning = false;
        this.activeQueue = null;
    }

    /* ==========================================================================
       Static Helpers
       ========================================================================== */

    static extractShortcodesFromText(text) {
        const raw = String(text || '');
        const codes = new Set();
        const urlRx = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/gi;
        let match;
        while ((match = urlRx.exec(raw))) codes.add(match[1]);
        raw.split(/\r?\n/).forEach(line => {
            const clean = line.trim().replace(/^["']+|["']+$/g, '');
            if (/^[A-Za-z0-9_-]{5,}$/.test(clean)) codes.add(clean);
        });
        return [...codes];
    }

    static shortcodeFromArticle(article) {
        if (!article || typeof article.querySelectorAll !== 'function') return null;
        const links = [...article.querySelectorAll('a[href*="/p/"],a[href*="/reel/"],a[href*="/tv/"]')];
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
    }

    static safeFilename(value) {
        return String(value || 'instagram')
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .slice(0, 150);
    }

    static extensionFromUrl(url, fallback = 'jpg') {
        try {
            const pathname = new URL(url).pathname;
            const ext = pathname.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
            if (ext && ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'm4a', 'mp3', 'aac', 'webm'].includes(ext)) {
                return ext;
            }
        } catch (_) {}
        return fallback;
    }

    static sleep(ms) {
        return new Promise(res => setTimeout(res, ms));
    }

    /* ==========================================================================
       Download Execution
       ========================================================================== */

    async _gmDownload(url, name) {
        if (typeof this.gmDownloadFn === 'function') {
            return new Promise((resolve, reject) => {
                try {
                    const ret = this.gmDownloadFn({
                        url,
                        name,
                        saveAs: false,
                        timeout: 120000,
                        ontimeout: () => reject(new Error('Download timed out')),
                        onabort: () => reject(new Error('Download aborted')),
                        onload: () => resolve(name),
                        onerror: err => reject(err)
                    });
                    if (ret && typeof ret.then === 'function') {
                        ret.then(() => resolve(name), reject);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }
        // Fallback for Node test or environments without GM_download
        return name;
    }

    async downloadResolvedMedia(resolved, { allCarousel = false, skipExisting = false } = {}) {
        if (!resolved || !Array.isArray(resolved.nodes) || resolved.nodes.length === 0) {
            throw new Error('Invalid resolved media object: missing nodes');
        }

        const accountId = this.igAuth && typeof this.igAuth.getCookie === 'function'
            ? this.igAuth.getCookie('ds_user_id')
            : null;

        const completed = [];
        const nodesToDownload = allCarousel ? resolved.nodes : [resolved.nodes[0]];

        for (const node of nodesToDownload) {
            const key = `${resolved.shortcode}:${node.id || node.index}:media`;
            if (skipExisting && this.vault && typeof this.vault.hasMedia === 'function') {
                if (await this.vault.hasMedia(key)) {
                    completed.push({ key, status: 'skipped' });
                    continue;
                }
            }

            const base = MediaDownloader.safeFilename(`${resolved.username || 'instagram'}_${resolved.shortcode}_${node.index + 1}`);
            const files = [];

            if (node.mediaType === 'image') {
                if (!node.imageUrl) throw new Error(`No image URL for ${resolved.shortcode}`);
                const ext = MediaDownloader.extensionFromUrl(node.imageUrl, 'jpg');
                files.push(await this._gmDownload(node.imageUrl, `${base}.${ext}`));
            } else if (node.progressiveVideoUrl) {
                const ext = MediaDownloader.extensionFromUrl(node.progressiveVideoUrl, 'mp4');
                files.push(await this._gmDownload(node.progressiveVideoUrl, `${base}.${ext}`));
            } else if (node.imageUrl) {
                const thumbType = node.mediaType === 'video' ? 'video_thumb' : node.mediaType;
                const ext = MediaDownloader.extensionFromUrl(node.imageUrl, 'jpg');
                files.push(await this._gmDownload(node.imageUrl, `${base}.${ext}`));
                node.mediaType = thumbType;
            } else {
                throw new Error(`No downloadable stream for ${resolved.shortcode}`);
            }

            if (accountId && this.igAuth && typeof this.igAuth.assertAccount === 'function') {
                this.igAuth.assertAccount(accountId);
            }

            if (this.vault && typeof this.vault.markMediaDownloaded === 'function') {
                await this.vault.markMediaDownloaded({
                    key,
                    shortcode: resolved.shortcode,
                    username: resolved.username || '',
                    item_index: node.index,
                    media_type: node.mediaType,
                    files
                });
            }

            completed.push({ key, status: 'done', files });
        }

        return completed;
    }

    async downloadShortcode(shortcode, options = {}) {
        if (!this.igMedia || (typeof this.igMedia.resolveMedia !== 'function' && typeof this.igMedia.resolve !== 'function')) {
            throw new Error('IgMedia service required to download by shortcode');
        }

        const resolveFn = this.igMedia.resolveMedia || this.igMedia.resolve;
        let lastErr;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const resolved = await resolveFn.call(this.igMedia, shortcode);
                return await this.downloadResolvedMedia(resolved, options);
            } catch (err) {
                lastErr = err;
                const isSession = this.igAuth && typeof this.igAuth.isSessionError === 'function'
                    ? this.igAuth.isSessionError(err)
                    : false;
                if (isSession || err.name === 'AbortError') throw err;
                await MediaDownloader.sleep(500 * (attempt + 1));
            }
        }
        throw lastErr;
    }

    // Alias for backward compatibility
    async downloadByShortcode(shortcode, options = {}) {
        return this.downloadShortcode(shortcode, options);
    }

    async downloadFromArticle(article, { allCarousel = false } = {}) {
        const accountId = this.igAuth && typeof this.igAuth.getCookie === 'function'
            ? this.igAuth.getCookie('ds_user_id')
            : null;

        if (accountId && this.igAuth && typeof this.igAuth.assertAccount === 'function') {
            this.igAuth.assertAccount(accountId);
        }

        const shortcode = MediaDownloader.shortcodeFromArticle(article);
        if (shortcode && this.igMedia) {
            try {
                const results = await this.downloadShortcode(shortcode, { allCarousel, skipExisting: false });
                const done = results.filter(x => x.status === 'done').length;
                if (!done) throw new Error('ไม่พบ Stream ไฟล์ที่สามารถดาวน์โหลดได้');
                if (typeof GM_notification === 'function') {
                    GM_notification({
                        title: 'IG MaxPland',
                        text: `ดาวน์โหลด ${done} ไฟล์จาก ${shortcode} สำเร็จ`,
                        timeout: 2500
                    });
                }
                return results;
            } catch (err) {
                if (accountId && this.igAuth && typeof this.igAuth.assertAccount === 'function') {
                    this.igAuth.assertAccount(accountId);
                }
                const isSession = this.igAuth && typeof this.igAuth.isSessionError === 'function'
                    ? this.igAuth.isSessionError(err)
                    : false;
                if (isSession || allCarousel) throw err;
                console.warn('[MediaDownloader] API resolver failed, falling back to DOM scraper');
            }
        }

        // DOM Fallback
        if (accountId && this.igAuth && typeof this.igAuth.assertAccount === 'function') {
            this.igAuth.assertAccount(accountId);
        }

        if (!article || typeof article.querySelector !== 'function') {
            throw new Error('Invalid article element');
        }

        const video = article.querySelector('video');
        const img = article.querySelector('img[srcset]') || article.querySelector('img');
        const mediaUrl = video?.currentSrc || video?.src || img?.currentSrc || img?.src || null;

        if (!mediaUrl || !/^https?:\/\//i.test(mediaUrl)) {
            throw new Error('ไม่พบ HTTP(S) media URL ที่ดาวน์โหลดได้จากโพสต์นี้');
        }

        const isVideo = Boolean(video && (video.currentSrc || video.src));
        const ext = MediaDownloader.extensionFromUrl(mediaUrl, isVideo ? 'mp4' : 'jpg');
        const filename = `IG_MaxPland_${Date.now()}.${ext}`;

        try {
            await this._gmDownload(mediaUrl, filename);
            return [{ key: `dom:${shortcode || 'direct'}`, status: 'done', files: [filename] }];
        } catch (_) {
            if (typeof window !== 'undefined') {
                window.open(mediaUrl, '_blank', 'noopener,noreferrer');
            }
            return [{ key: `dom:${shortcode || 'direct'}`, status: 'opened_in_tab', files: [] }];
        }
    }

    // Alias for backward compatibility
    async handleDirectMediaDownload(article, options = {}) {
        return this.downloadFromArticle(article, options);
    }

    async downloadQueue(codes, { skipExisting = false, onProgress, onStatus } = {}) {
        if (this.isQueueRunning) throw new Error('Media queue is already running');
        const list = Array.isArray(codes) ? codes : MediaDownloader.extractShortcodesFromText(codes);
        if (!list.length) throw new Error('กรุณาระบุ shortcodes หรือ URLs');

        const accountId = this.igAuth && typeof this.igAuth.getCookie === 'function'
            ? this.igAuth.getCookie('ds_user_id')
            : null;

        this.isQueueRunning = true;
        const queue = {
            codes: list,
            finished: new Set(),
            attempted: new Set()
        };
        this.activeQueue = queue;

        let done = 0, skipped = 0, failed = 0, stopped = false;

        try {
            for (let i = 0; i < list.length; i++) {
                const code = list[i];
                if (queue.finished.has(code)) continue;

                if (typeof onStatus === 'function') {
                    onStatus(`${i + 1}/${list.length} · กำลังโหลด ${code}...`);
                }

                try {
                    if (accountId && this.igAuth && typeof this.igAuth.assertAccount === 'function') {
                        this.igAuth.assertAccount(accountId);
                    }

                    const retry = queue.attempted.has(code);
                    queue.attempted.add(code);
                    const result = await this.downloadShortcode(code, {
                        skipExisting: skipExisting || retry,
                        allCarousel: true
                    });

                    if (accountId && this.igAuth && typeof this.igAuth.assertAccount === 'function') {
                        this.igAuth.assertAccount(accountId);
                    }

                    for (const item of result) {
                        if (item.status === 'done') done++;
                        else if (item.status === 'skipped') skipped++;
                    }
                    queue.finished.add(code);
                } catch (err) {
                    failed++;
                    const isSession = this.igAuth && typeof this.igAuth.isSessionError === 'function'
                        ? this.igAuth.isSessionError(err)
                        : false;
                    if (isSession) {
                        stopped = true;
                        if (typeof onStatus === 'function') {
                            onStatus(`หยุดคิว: ${err.message} · คงเหลือ ${list.length - queue.finished.size} โพสต์`);
                        }
                        break;
                    }
                }

                if (typeof onProgress === 'function') {
                    onProgress({ done, skipped, failed, total: list.length, completed: queue.finished.size });
                }

                if (i < list.length - 1) {
                    await MediaDownloader.sleep(800);
                }
            }
        } finally {
            this.isQueueRunning = false;
            this.activeQueue = null;
        }

        return { done, skipped, failed, stopped, total: list.length };
    }
}

// Global & CommonJS Export Pattern
if (typeof window !== 'undefined') {
    window.MediaDownloader = MediaDownloader;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MediaDownloader };
}


    // ─── Module: src/features/DOMInjector.js ──────────────────────────────────────
/**
 * DOMInjector.js
 * Consolidated DOM Observer and UI Injector for IG MaxPland.
 * Manages in-feed download action menus, story stealth toolbars, and profile HD avatar badges.
 */

const DEFAULT_INJECTOR_ICONS = {
    DOWNLOAD: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    DOWNLOAD_ALL: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/><polyline points="12 12 15 15 18 12"/><line x1="15" y1="15" x2="15" y2="9"/></svg>`,
    EXTERNAL: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
    LOGO: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>`,
    AVATAR: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>`
};

class DOMInjector {
    /**
     * @param {Object} [options]
     * @param {Object} [options.stateManager]
     * @param {Object} [options.mediaDownloader]
     * @param {Object} [options.igProfile]
     * @param {Object} [options.icons]
     */
    constructor(options = {}) {
        this.stateManager = options.stateManager || (typeof window !== 'undefined' ? window.stateManager : null);
        this.mediaDownloader = options.mediaDownloader || (typeof window !== 'undefined' ? window.mediaDownloader : null);
        this.igProfile = options.igProfile || (typeof window !== 'undefined' ? (window.IgProfile || window.IgBridge) : null);
        this.icons = options.icons || (typeof window !== 'undefined' && window.ICONS ? window.ICONS : DEFAULT_INJECTOR_ICONS);

        this.observers = new Map(); // selector -> callback
        this.mutationObserver = null;
        this.debounceTimer = null;
        this.isStarted = false;
        this._handleClickOutside = this._handleClickOutside.bind(this);
    }

    /**
     * Register a custom selector observer
     * @param {string} selector
     * @param {Function} callback
     */
    observe(selector, callback) {
        if (typeof selector === 'string' && typeof callback === 'function') {
            this.observers.set(selector, callback);
        }
        return this;
    }

    /**
     * Start the DOM mutation observer loop
     * @param {Node} [targetNode]
     */
    start(targetNode) {
        if (typeof window === 'undefined' || typeof document === 'undefined') return this;
        if (this.isStarted) return this;

        const root = targetNode || document.body;
        if (!root) return this;

        this.isStarted = true;

        // Register default injectors
        if (!this.observers.has('article')) {
            this.observe('article', (el) => this.injectFeedButton(el));
        }
        if (!this.observers.has('section[story]')) {
            this.observe('section[story]', (el) => this.injectStoryToolbar(el));
        }
        if (!this.observers.has('header[profile]')) {
            this.observe('header[profile]', (el) => this.injectAvatarBadge(el));
        }

        // Global click to close popups
        document.addEventListener('click', this._handleClickOutside);

        // Initial scan
        this._runScan();

        if (typeof MutationObserver !== 'undefined') {
            this.mutationObserver = new MutationObserver(() => {
                if (this.debounceTimer) return;
                this.debounceTimer = setTimeout(() => {
                    this.debounceTimer = null;
                    this._runScan();
                }, 300);
            });
            this.mutationObserver.observe(root, { childList: true, subtree: true });
        }

        return this;
    }

    _runScan() {
        if (typeof document === 'undefined') return;
        const path = typeof location !== 'undefined' ? location.pathname : '';

        // Story page injection
        if (path.startsWith('/stories/')) {
            this.injectStoryDownloadTools();
        } else {
            // Feed & Profile page injections
            this.injectInFeedDownloadButtons();
            this.injectProfileAvatarBadge();
        }

        // Run custom observers
        for (const [selector, cb] of this.observers.entries()) {
            if (selector === 'article' || selector === 'section[story]' || selector === 'header[profile]') {
                continue;
            }
            try {
                const nodes = document.querySelectorAll(selector);
                nodes.forEach(node => cb(node));
            } catch (_) {}
        }
    }

    _handleClickOutside(e) {
        if (e && e.target && typeof e.target.closest === 'function') {
            if (e.target.closest('.maxpland-action-wrap')) return;
        }
        this.closeAllMenus();
    }

    closeAllMenus() {
        if (typeof document === 'undefined') return;
        document.querySelectorAll('.maxpland-action-menu.show').forEach(m => m.classList.remove('show'));
    }

    /* ==========================================================================
       In-Feed Action Bar Injection
       ========================================================================== */

    injectFeedButton(article) {
        if (!article || typeof article.querySelector !== 'function') return;

        const prefs = this.stateManager?.get?.('prefs') || (typeof window !== 'undefined' ? window.STATE?.prefs : null) || {};
        if (prefs.quickDownloadFeed === false) {
            const existing = article.querySelector('.maxpland-action-wrap');
            if (existing) existing.remove();
            return;
        }

        const section = article.querySelector('section');
        if (!section) return;

        // Remove legacy banner if present
        const oldBanner = article.querySelector('.maxpland-feed-tools');
        if (oldBanner) oldBanner.remove();

        // Prevent duplicate insertion
        if (section.querySelector('.maxpland-action-wrap')) return;

        const doc = article.ownerDocument || (typeof document !== 'undefined' ? document : null);
        if (!doc || typeof doc.createElement !== 'function') return;

        const wrap = doc.createElement('div');
        wrap.className = 'maxpland-action-wrap';

        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'maxpland-action-btn';
        btn.setAttribute('aria-label', 'ดาวน์โหลดมีเดีย (MaxPland)');
        btn.title = 'ดาวน์โหลดมีเดีย (MaxPland) · คลิกเพื่อเปิดตัวเลือก';
        btn.innerHTML = this.icons.DOWNLOAD || DEFAULT_INJECTOR_ICONS.DOWNLOAD;

        const menu = doc.createElement('div');
        menu.className = 'maxpland-action-menu';

        // 1. Single Media Download
        const dlSingle = doc.createElement('button');
        dlSingle.type = 'button';
        dlSingle.className = 'maxpland-menu-item maxpland-menu-dl-single';
        dlSingle.innerHTML = (this.icons.DOWNLOAD || DEFAULT_INJECTOR_ICONS.DOWNLOAD) + '<span>ดาวน์โหลด (HD)</span>';
        dlSingle.onclick = (e) => {
            e.stopPropagation();
            this.closeAllMenus();
            this._runFeedAction(article, btn, { allCarousel: false });
        };

        // 2. Carousel All Download
        const dlAll = doc.createElement('button');
        dlAll.type = 'button';
        dlAll.className = 'maxpland-menu-item maxpland-menu-dl-all';
        dlAll.innerHTML = (this.icons.DOWNLOAD_ALL || DEFAULT_INJECTOR_ICONS.DOWNLOAD_ALL) + '<span>ดาวน์โหลดทั้งหมดในโพสต์</span>';
        dlAll.onclick = (e) => {
            e.stopPropagation();
            this.closeAllMenus();
            this._runFeedAction(article, btn, { allCarousel: true });
        };

        // 3. Open in new tab
        const openTab = doc.createElement('button');
        openTab.type = 'button';
        openTab.className = 'maxpland-menu-item';
        openTab.innerHTML = (this.icons.EXTERNAL || DEFAULT_INJECTOR_ICONS.EXTERNAL) + '<span>เปิดมีเดียในแท็บใหม่</span>';
        openTab.onclick = (e) => {
            e.stopPropagation();
            this.closeAllMenus();
            this._openMediaDirectLink(article);
        };

        // 4. Divider
        const divider = doc.createElement('div');
        divider.className = 'maxpland-menu-divider';

        // 5. Open MaxPland Studio
        const openStudio = doc.createElement('button');
        openStudio.type = 'button';
        openStudio.className = 'maxpland-menu-item';
        openStudio.innerHTML = (this.icons.LOGO || DEFAULT_INJECTOR_ICONS.LOGO) + '<span>เปิด MaxPland Studio</span>';
        openStudio.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.closeAllMenus();
            if (typeof window !== 'undefined' && typeof window.openMaxPlandStudio === 'function') {
                window.openMaxPlandStudio();
            } else if (typeof document !== 'undefined') {
                const tb = document.getElementById('maxpland-trigger-btn');
                if (tb) tb.click();
            }
        };

        menu.append(dlSingle, dlAll, openTab, divider, openStudio);

        btn.onclick = (e) => {
            e.stopPropagation();
            const isShown = menu.classList.contains('show');
            this.closeAllMenus();
            if (!isShown) {
                const hasVideo = Boolean(article.querySelector('video'));
                const isCarousel = Boolean(article.querySelector('ul li') || article.querySelectorAll('button[aria-label*="Next"], button[aria-label*="ต่อไป"]').length);

                dlSingle.innerHTML = (this.icons.DOWNLOAD || DEFAULT_INJECTOR_ICONS.DOWNLOAD) + `<span>${hasVideo ? 'ดาวน์โหลดวิดีโอ (HD)' : 'ดาวน์โหลดรูปภาพ (HD)'}</span>`;
                dlAll.style.display = isCarousel ? 'flex' : 'none';
                menu.classList.add('show');
            }
        };

        btn.ondblclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.closeAllMenus();
            this._runFeedAction(article, btn, { allCarousel: false });
        };

        wrap.append(btn, menu);

        // Position inside section alongside bookmark or at end
        const bookmarkIcon = section.querySelector('svg[aria-label*="Save"], svg[aria-label*="บันทึก"], svg[aria-label*="Remove"], svg[aria-label*="ลบออก"], polygon');
        const bookmarkContainer = bookmarkIcon ? bookmarkIcon.closest('button, div[role="button"]') : null;
        if (bookmarkContainer && bookmarkContainer.parentElement) {
            bookmarkContainer.parentElement.insertBefore(wrap, bookmarkContainer);
        } else {
            const lastChild = section.lastElementChild;
            if (lastChild && lastChild !== section) {
                lastChild.appendChild(wrap);
            } else {
                section.appendChild(wrap);
            }
        }
    }

    injectInFeedDownloadButtons(root = (typeof document !== 'undefined' ? document : null)) {
        if (!root) return;
        const prefs = this.stateManager?.get?.('prefs') || (typeof window !== 'undefined' ? window.STATE?.prefs : null) || {};
        if (prefs.quickDownloadFeed === false) {
            if (typeof document !== 'undefined') {
                document.querySelectorAll('.maxpland-action-wrap').forEach(el => el.remove());
            }
            return;
        }
        const articles = root instanceof Element && root.matches('article')
            ? [root]
            : (typeof root.querySelectorAll === 'function' ? root.querySelectorAll('article') : []);
        articles.forEach(article => this.injectFeedButton(article));
    }

    async _runFeedAction(article, btn, options) {
        if (!btn || btn.classList.contains('loading')) return;
        btn.classList.add('loading');
        const origIcon = btn.innerHTML;
        btn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5"><circle cx="12" cy="12" r="9" stroke-dasharray="28" stroke-linecap="round"/></svg>`;

        try {
            if (this.mediaDownloader && typeof this.mediaDownloader.downloadFromArticle === 'function') {
                await this.mediaDownloader.downloadFromArticle(article, options);
            } else if (typeof window !== 'undefined' && typeof window.handleDirectMediaDownload === 'function') {
                await window.handleDirectMediaDownload(article, options);
            }
        } catch (err) {
            if (typeof alert === 'function') alert(err.message || String(err));
            else console.error(err);
        } finally {
            btn.classList.remove('loading');
            btn.innerHTML = origIcon;
        }
    }

    _openMediaDirectLink(article) {
        if (!article || typeof article.querySelector !== 'function') return;
        const video = article.querySelector('video');
        const img = article.querySelector('img[srcset]') || article.querySelector('img');
        const mediaUrl = video?.currentSrc || video?.src || img?.currentSrc || img?.src || null;
        if (mediaUrl && typeof window !== 'undefined') {
            window.open(mediaUrl, '_blank', 'noopener,noreferrer');
        } else if (typeof alert === 'function') {
            alert('ไม่พบ Media URL ของรายการนี้');
        }
    }

    /* ==========================================================================
       Story Toolbar Injection (Ghost/Stealth Seen Blocking)
       ========================================================================== */

    injectStoryToolbar(section) {
        this.injectStoryDownloadTools();
    }

    injectStoryDownloadTools() {
        if (typeof location === 'undefined' || typeof document === 'undefined') return;

        if (!location.pathname.startsWith('/stories/')) {
            const existing = document.getElementById('maxpland-story-bar');
            if (existing) existing.remove();
            return;
        }

        const prefs = this.stateManager?.get?.('prefs') || (typeof window !== 'undefined' ? window.STATE?.prefs : null) || {};
        if (prefs.quickDownloadStory === false) {
            const existing = document.getElementById('maxpland-story-bar');
            if (existing) existing.remove();
            return;
        }

        if (document.getElementById('maxpland-story-bar')) return;

        // Look for visible story section
        const storySections = document.querySelectorAll('section');
        let storyContainer = null;
        for (const s of storySections) {
            if (s.offsetWidth > 0 || s.offsetHeight > 0 || s.getClientRects().length > 0) {
                storyContainer = s;
                break;
            }
        }
        if (!storyContainer) storyContainer = document.querySelector('section');
        if (!storyContainer) return;

        const bar = document.createElement('div');
        bar.id = 'maxpland-story-bar';
        bar.className = 'maxpland-story-tools';

        const stealthBtn = document.createElement('button');
        stealthBtn.type = 'button';
        stealthBtn.id = 'maxpland-story-stealth-toggle';
        stealthBtn.className = 'maxpland-story-btn';

        const isStealth = prefs.stealthStory !== false;
        stealthBtn.style.background = isStealth ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
        stealthBtn.style.border = `1px solid ${isStealth ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`;
        stealthBtn.innerHTML = `<span>${isStealth ? '👁️ แอบส่อง: เปิด' : '👁️ แอบส่อง: ปิด'}</span>`;
        stealthBtn.title = isStealth ? 'โหมดแอบส่องเนียนเปิดอยู่ (ไม่ส่ง Seen)' : 'โหมดแอบส่องเนียนปิดอยู่ (ส่ง Seen ตามปกติ)';

        stealthBtn.onclick = () => {
            const next = !(this.stateManager?.get?.('prefs')?.stealthStory !== false);
            if (this.stateManager) {
                const curPrefs = this.stateManager.get('prefs') || {};
                this.stateManager.set('prefs', { ...curPrefs, stealthStory: next });
            } else if (typeof window !== 'undefined' && window.STATE) {
                window.STATE.prefs = window.STATE.prefs || {};
                window.STATE.prefs.stealthStory = next;
                if (typeof window.savePrefs === 'function') window.savePrefs();
            }

            stealthBtn.style.background = next ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
            stealthBtn.style.border = `1px solid ${next ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`;
            stealthBtn.innerHTML = `<span>${next ? '👁️ แอบส่อง: เปิด' : '👁️ แอบส่อง: ปิด'}</span>`;
            stealthBtn.title = next ? 'โหมดแอบส่องเนียนเปิดอยู่ (ไม่ส่ง Seen)' : 'โหมดแอบส่องเนียนปิดอยู่ (ส่ง Seen ตามปกติ)';

            const modalSwitch = document.getElementById('pref-switch-stealth-story');
            if (modalSwitch) modalSwitch.checked = next;

            if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
                window.showToast(next ? 'เปิดโหมดแอบส่องสตอรี่ (ไม่ขึ้น Seen)' : 'ปิดโหมดแอบส่องสตอรี่ (ส่ง Seen ตามปกติ)');
            }
        };

        bar.append(stealthBtn);
        document.body.appendChild(bar);
    }

    /* ==========================================================================
       Profile HD Avatar Badge Injection
       ========================================================================== */

    injectAvatarBadge(header) {
        this.injectProfileAvatarBadge();
    }

    injectProfileAvatarBadge() {
        if (typeof location === 'undefined' || typeof document === 'undefined') return;

        const pathParts = location.pathname.split('/').filter(Boolean);
        if (pathParts.length !== 1 || ['explore', 'stories', 'reels', 'direct', 'accounts'].includes(pathParts[0])) {
            const b = document.getElementById('maxpland-profile-avatar-btn');
            if (b) b.remove();
            return;
        }

        if (document.getElementById('maxpland-profile-avatar-btn')) return;

        const headerActions = document.querySelector('header section') || document.querySelector('header h2')?.parentElement;
        if (!headerActions) return;

        const uname = pathParts[0];
        const btn = document.createElement('button');
        btn.id = 'maxpland-profile-avatar-btn';
        btn.type = 'button';
        btn.className = 'maxpland-avatar-badge';
        btn.title = `ดาวน์โหลดรูปโปรไฟล์ HD ของ @${uname}`;
        btn.innerHTML = (this.icons.AVATAR || DEFAULT_INJECTOR_ICONS.AVATAR) + '<span>รูปโปรไฟล์ HD</span>';

        btn.onclick = async () => {
            btn.disabled = true;
            btn.textContent = 'กำลังดึง HD...';
            try {
                let hdUrl = null;
                if (this.igProfile && typeof this.igProfile.getProfileHD === 'function') {
                    hdUrl = await this.igProfile.getProfileHD(uname);
                } else if (typeof window !== 'undefined' && window.IgBridge?.fetchUserProfileHD) {
                    hdUrl = await window.IgBridge.fetchUserProfileHD(uname);
                }

                const fallbackImg = document.querySelector('header img[alt*="profile"]');
                const finalUrl = hdUrl || fallbackImg?.currentSrc || fallbackImg?.src;
                if (!finalUrl) throw new Error('ไม่พบรูปโปรไฟล์');

                const filename = `${uname}_profile_hd_${Date.now()}.jpg`;
                if (typeof GM_download === 'function') {
                    GM_download({ url: finalUrl, name: filename });
                } else if (typeof window !== 'undefined' && typeof window.gmDownload === 'function') {
                    await window.gmDownload(finalUrl, filename);
                }

                if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
                    window.showToast(`ดาวน์โหลดรูปโปรไฟล์ HD ของ @${uname} เรียบร้อย`);
                }
            } catch (err) {
                if (typeof alert === 'function') {
                    alert(`ดาวน์โหลดรูปโปรไฟล์ล้มเหลว: ${err.message || err}`);
                }
            } finally {
                btn.disabled = false;
                btn.innerHTML = (this.icons.AVATAR || DEFAULT_INJECTOR_ICONS.AVATAR) + '<span>รูปโปรไฟล์ HD</span>';
            }
        };

        headerActions.appendChild(btn);
    }

    /* ==========================================================================
       Teardown & Cleanup
       ========================================================================== */

    destroy() {
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        if (typeof document !== 'undefined') {
            document.removeEventListener('click', this._handleClickOutside);
            document.querySelectorAll('.maxpland-action-wrap, #maxpland-story-bar, #maxpland-profile-avatar-btn').forEach(el => el.remove());
        }
        this.observers.clear();
        this.isStarted = false;
    }
}

// Global & CommonJS Export Pattern
if (typeof window !== 'undefined') {
    window.DOMInjector = DOMInjector;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DOMInjector };
}


    // ─── Module: src/features/StoryStealth.js ──────────────────────────────────────
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


    // ─── Module: src/features/CleanFeed.js ──────────────────────────────────────
/**
 * CleanFeed.js
 * High-performance Instagram feed ad & suggested post decluttering engine for IG MaxPland.
 * Eliminates sponsored posts and suggestions with zero layout collapse / zero scroll jump.
 */

const CLEAN_FEED_CSS = `
    article:has(a[href*="/ads/ig_redirect/"]),
    article:has(a[href*="/ads/about/"]),
    article:has(a[href*="facebook.com/ads/"]),
    article[data-mp-hidden-ad="true"] {
        visibility: hidden !important;
        height: 0 !important;
        min-height: 0 !important;
        max-height: 0 !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        overflow: hidden !important;
        overflow-anchor: none !important;
        pointer-events: none !important;
        opacity: 0 !important;
    }
`;

const DEFAULT_AD_KEYWORDS = [
    'sponsored',
    'ได้รับการสนับสนุน',
    'suggested for you',
    'แนะนำสำหรับคุณ'
];

class CleanFeed {
    /**
     * @param {Object} [options]
     * @param {Object} [options.stateManager]
     * @param {string[]} [options.keywords]
     * @param {string} [options.styleId]
     */
    constructor(options = {}) {
        this.stateManager = options.stateManager || (typeof window !== 'undefined' ? window.stateManager : null);
        this.keywords = options.keywords || DEFAULT_AD_KEYWORDS;
        this.styleId = options.styleId || 'maxpland-clean-feed-style';

        this.observer = null;
        this.debounceTimer = null;
        this._enabled = false;
    }

    isEnabled() {
        if (this.stateManager) {
            const prefs = this.stateManager.get('prefs');
            if (prefs && typeof prefs.cleanFeed === 'boolean') return prefs.cleanFeed;
        }
        if (typeof window !== 'undefined' && window.STATE?.prefs && typeof window.STATE.prefs.cleanFeed === 'boolean') {
            return window.STATE.prefs.cleanFeed;
        }
        return this._enabled;
    }

    /**
     * Inspects an article DOM element for advertisement/suggestion signals
     * @param {Element} article
     * @returns {boolean}
     */
    isAdArticle(article) {
        if (!article || typeof article.querySelector !== 'function') return false;

        // 1. Direct link indicators
        const adLink = article.querySelector('a[href*="/ads/ig_redirect/"], a[href*="/ads/about/"], a[href*="facebook.com/ads/"]');
        if (adLink) return true;

        // 2. Multilingual header text keywords
        const header = article.querySelector('header');
        const text = (header ? header.textContent : (article.textContent || '').slice(0, 300)).toLowerCase();
        return this.keywords.some(kw => text.includes(kw.toLowerCase()));
    }

    /**
     * Scans articles within a given root element
     * @param {Element|Document} [root]
     * @returns {number} Count of newly hidden articles
     */
    scanArticles(root = (typeof document !== 'undefined' ? document : null)) {
        if (!root || typeof root.querySelectorAll !== 'function') return 0;
        if (!this.isEnabled()) return 0;

        let hiddenCount = 0;
        const articles = root.querySelectorAll('article:not([data-mp-hidden-ad])');
        for (const article of articles) {
            if (this.isAdArticle(article)) {
                article.setAttribute('data-mp-hidden-ad', 'true');
                if (article.dataset) article.dataset.mpHiddenAd = 'true';
                hiddenCount++;
            }
        }
        return hiddenCount;
    }

    /**
     * Enable Clean Feed mode: injects anti-collapse CSS, scans, and attaches scoped observer
     */
    enable() {
        this._enabled = true;
        if (this.stateManager) {
            const cur = this.stateManager.get('prefs') || {};
            this.stateManager.set('prefs', { ...cur, cleanFeed: true });
        } else if (typeof window !== 'undefined' && window.STATE?.prefs) {
            window.STATE.prefs.cleanFeed = true;
        }

        if (typeof document === 'undefined') return;

        // Inject non-collapsing anti-slop CSS
        let styleTag = document.getElementById(this.styleId);
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = this.styleId;
            styleTag.textContent = CLEAN_FEED_CSS;
            (document.head || document.documentElement).appendChild(styleTag);
        }

        // Perform initial scan
        this.scanArticles();

        // Start debounced mutation observer scoped to feed container if possible
        if (!this.observer && typeof MutationObserver !== 'undefined') {
            const target = document.querySelector('main') || document.querySelector('[role="main"]') || document.body || document.documentElement;
            this.observer = new MutationObserver(() => {
                if (this.debounceTimer) return;
                this.debounceTimer = setTimeout(() => {
                    this.debounceTimer = null;
                    this.scanArticles();
                }, 150);
            });
            this.observer.observe(target, { childList: true, subtree: true });
        }
    }

    /**
     * Disable Clean Feed mode: removes styles, disconnects observer, and unhides articles
     */
    disable() {
        this._enabled = false;
        if (this.stateManager) {
            const cur = this.stateManager.get('prefs') || {};
            this.stateManager.set('prefs', { ...cur, cleanFeed: false });
        } else if (typeof window !== 'undefined' && window.STATE?.prefs) {
            window.STATE.prefs.cleanFeed = false;
        }

        if (typeof document === 'undefined') return;

        const styleTag = document.getElementById(this.styleId);
        if (styleTag) styleTag.remove();

        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        document.querySelectorAll('article[data-mp-hidden-ad="true"]').forEach(el => {
            el.removeAttribute('data-mp-hidden-ad');
            if (el.dataset) delete el.dataset.mpHiddenAd;
        });
    }

    destroy() {
        this.disable();
    }
}

// Global singleton instance for easy script consumption
const cleanFeedInstance = new CleanFeed();

// Global & CommonJS Export Pattern
if (typeof window !== 'undefined') {
    window.CleanFeed = CleanFeed;
    window.cleanFeed = cleanFeedInstance;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CleanFeed, cleanFeed: cleanFeedInstance, CLEAN_FEED_CSS, DEFAULT_AD_KEYWORDS };
}


    /* ==========================================================================
       APPLICATION RUNTIME & UI GLUE
       ========================================================================== */


    /* ==========================================================================
       1. CONSTANTS & DESIGN TOKENS (Anti-Slop / Clean Minimal Precision)
       ========================================================================== */

    const APP_CONFIG = {
        APP_NAME: 'IG MaxPland',
        DB_NAME: 'IG_MAXPLAND_VAULT',
        DB_VERSION: 6,
        PAGE_SIZE: 50,
        INSTAGRAM_WEB_APP_ID: '936619743392459',
        FOLLOWING_PAGE_SAFETY_LIMIT: 60,
        FOLLOWERS_PAGE_SAFETY_LIMIT: 250,
        UNFOLLOW_DELAY_MIN: 4500,
        UNFOLLOW_DELAY_MAX: 7500,
    };

    const ICONS = {
        LOGO: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>`,
        CLOSE: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
        USERS: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
        DOWNLOAD: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
        DOWNLOAD_ALL: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 13v8l-4-4"/><path d="m12 21 4-4"/><path d="M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284"/></svg>`,
        THUMBNAIL: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
        STAR: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
        STAR_FILLED: `<svg width="14" height="14" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
        SEARCH: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
        EXTERNAL: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
        STOP: `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
        UNFOLLOW: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="11" x2="23" y2="11"/></svg>`,
        COPY: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
        VERIFIED: `<svg width="13" height="13" viewBox="0 0 24 24" fill="#38bdf8"><path d="M12 2l2.4 2.4 3.4-.4 1.4 3.1 3.2 1.3-.4 3.4 2.4 2.4-2.4 2.4.4 3.4-3.2 1.3-1.4 3.1-3.4-.4L12 22l-2.4-2.4-3.4.4-1.4-3.1-3.2-1.3.4-3.4L-2 12l2.4-2.4-.4-3.4 3.2-1.3 1.4-3.1 3.4.4L12 2zm-1.5 13.5l5.5-5.5-1.4-1.4-4.1 4.1-2.1-2.1-1.4 1.4 3.5 3.5z"/></svg>`,
        LOCK: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
        BACKUP: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
        RESTORE: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
        AVATAR: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>`,
        EYE: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
        SHIELD: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
        ANALYTICS: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>`,
        FEATURES: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>`,
        SETTINGS: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
        CLOCK: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
    };

    const NATIVE_IG_CSS = `
        :root {
            --mp-bg-root: #0b0d10;
            --mp-bg-surface: #12151b;
            --mp-bg-panel: #171b23;
            --mp-bg-card: #1e232d;
            --mp-bg-elevated: #252b37;
            --mp-bg-hover: #2b3240;
            --mp-border-subtle: rgba(255, 255, 255, 0.08);
            --mp-border-card: #2e3544;
            --mp-border-active: rgba(255, 255, 255, 0.25);
            --mp-text-primary: #f8fafc;
            --mp-text-secondary: #94a3b8;
            --mp-text-muted: #64748b;
            --mp-blue: #0284c7;
            --mp-blue-hover: #0369a1;
            --mp-rose: #f43f5e;
            --mp-rose-bg: rgba(244, 63, 94, 0.14);
            --mp-emerald: #10b981;
            --mp-emerald-bg: rgba(16, 185, 129, 0.14);
            --mp-amber: #f59e0b;
            --mp-amber-bg: rgba(245, 158, 11, 0.14);
            --mp-cyan: #0ea5e9;
            --mp-cyan-bg: rgba(14, 165, 233, 0.14);
            --mp-shadow-modal: 0 12px 32px rgba(0, 0, 0, 0.6), 0 32px 80px rgba(0, 0, 0, 0.85);
            --mp-shadow-card: 0 1px 3px rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        #maxpland-studio-modal {
            position: fixed; inset: 50% auto auto 50%; transform: translate(-50%, -50%); z-index: 100000;
            width: min(1040px, 95vw); height: min(780px, 90dvh); max-height: 90dvh;
            display: grid; grid-template-columns: 190px minmax(0, 1fr); grid-template-rows: auto auto minmax(0, 1fr) auto;
            grid-template-areas: 'header header' 'nav progress' 'nav main' 'footer footer';
            background: var(--mp-bg-surface); color: var(--mp-text-primary); border: 1px solid var(--mp-border-subtle);
            border-radius: 12px; overflow: hidden; box-shadow: var(--mp-shadow-modal);
            font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            text-align: left; color-scheme: dark;
        }
        #maxpland-studio-modal, #maxpland-studio-modal * { box-sizing: border-box; }
        #maxpland-studio-modal button, #maxpland-studio-modal input, #maxpland-studio-modal textarea { font: inherit; }
        #maxpland-studio-modal button { cursor: pointer; }
        #maxpland-studio-modal button:disabled { cursor: not-allowed; opacity: .5; }
        #maxpland-studio-modal :focus-visible, #maxpland-trigger-btn:focus-visible { outline: 2px solid var(--mp-blue); outline-offset: 2px; }

        #maxpland-studio-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.75); z-index: 99999; backdrop-filter: blur(2px); }

        /* Mini Floating Draggable Launcher */
        #maxpland-trigger-btn {
            position: fixed; right: 24px; bottom: 24px; z-index: 99998;
            width: 44px; height: 44px; border-radius: 50%; padding: 0;
            display: grid; place-items: center;
            appearance: none; -webkit-appearance: none;
            border: 1.5px solid #0284c7; background: #171b23; color: #38bdf8;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5), 0 0 12px rgba(2, 132, 199, 0.35);
            cursor: grab; user-select: none; touch-action: none;
            transition: border-color .15s ease, box-shadow .15s ease, transform .12s ease;
        }
        #maxpland-trigger-btn:hover {
            border-color: #38bdf8; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6), 0 0 16px rgba(56, 189, 248, 0.5);
            transform: scale(1.05);
        }
        #maxpland-trigger-btn:active { cursor: grabbing; transform: scale(0.98); }

        /* Header */
        .maxpland-header {
            grid-area: header; height: 52px; border-bottom: 1px solid var(--mp-border-subtle);
            display: flex; align-items: center; justify-content: space-between; padding: 0 18px;
            background: var(--mp-bg-surface);
        }
        .maxpland-brand { display: flex; align-items: center; gap: 9px; font-weight: 700; font-size: 14px; }
        .maxpland-user-pill {
            font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 6px;
            background: var(--mp-bg-panel); color: #38bdf8; border: 1px solid var(--mp-border-card);
            display: inline-flex; align-items: center; gap: 5px;
        }
        .maxpland-close-btn {
            background: none; border: 1px solid transparent; color: var(--mp-text-secondary);
            padding: 6px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
            transition: background-color .15s, color .15s;
        }
        .maxpland-close-btn:hover { background: var(--mp-bg-hover); color: var(--mp-text-primary); border-color: var(--mp-border-subtle); }

        /* Sidebar Navigation */
        .maxpland-tabs {
            grid-area: nav; border-right: 1px solid var(--mp-border-subtle); padding: 14px 10px;
            display: flex; flex-direction: column; gap: 6px; background: var(--mp-bg-panel);
        }
        .maxpland-tab-btn {
            display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid transparent; background: none;
            color: var(--mp-text-secondary); border-radius: 8px; text-align: left; font-weight: 600; font-size: 13px;
            transition: background-color .15s, color .15s, border-color .15s;
        }
        .maxpland-tab-btn:hover { background: var(--mp-bg-hover); color: var(--mp-text-primary); }
        .maxpland-tab-btn.active {
            background: var(--mp-bg-card); color: var(--mp-text-primary);
            border-color: var(--mp-border-card);
        }

        /* Scan Progress & Action Strip */
        .maxpland-progress-container {
            grid-area: progress; display: none; padding: 12px 18px; background: var(--mp-bg-panel);
            border-bottom: 1px solid var(--mp-border-subtle);
        }
        .maxpland-scan-row {
            display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 12.5px;
        }
        .maxpland-scan-phase { font-weight: 600; color: #38bdf8; display: flex; align-items: center; gap: 6px; }
        .maxpland-scan-meta {
            font-variant-numeric: tabular-nums; color: var(--mp-text-secondary); font-size: 12px; display: flex; align-items: center; gap: 12px;
        }
        .maxpland-progress-track {
            height: 6px; background: #0b0d10; border-radius: 3px; overflow: hidden; border: 1px solid var(--mp-border-subtle);
        }
        .maxpland-progress-bar {
            height: 100%; width: 0; background: linear-gradient(90deg, var(--mp-blue), #6366f1);
            transition: width .2s ease-out; border-radius: 3px;
        }
        .maxpland-scan-notice {
            font-size: 11.5px; color: #fbbf24; margin-top: 6px; display: none; font-weight: 500;
        }

        /* Main Content Body */
        .maxpland-body { grid-area: main; overflow-y: auto; padding: 18px 20px; background: var(--mp-bg-surface); position: relative; }
        .maxpland-tab-content { display: none; }
        .maxpland-tab-content.active { display: block; }

        /* Stat Cards */
        .maxpland-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 16px; }
        .maxpland-stat-card {
            background: var(--mp-bg-card); border: 1px solid var(--mp-border-card); border-radius: 8px;
            padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; box-shadow: var(--mp-shadow-card);
            position: relative; overflow: hidden; cursor: pointer; transition: border-color .15s, transform .12s;
        }
        .maxpland-stat-card:hover { border-color: var(--mp-border-active); transform: translateY(-1px); }
        .maxpland-stat-card::before {
            content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
        }
        .maxpland-stat-card.card-not-following::before { background: var(--mp-rose); }
        .maxpland-stat-card.card-fans::before { background: var(--mp-cyan); }
        .maxpland-stat-card.card-mutual::before { background: var(--mp-emerald); }
        .maxpland-stat-card.card-lost::before { background: var(--mp-amber); }
        .maxpland-stat-card.card-ghost::before { background: #a855f7; }

        .maxpland-stat-label { font-size: 11px; color: var(--mp-text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: .4px; }
        .maxpland-stat-value {
            font-size: 24px; font-weight: 800; color: var(--mp-text-primary); line-height: 1.1;
            font-variant-numeric: tabular-nums;
        }
        .maxpland-stat-hint { font-size: 11px; color: var(--mp-text-secondary); }

        /* Toolbars & Filters */
        .maxpland-toolbar {
            display: flex; align-items: center; justify-content: space-between; gap: 10px;
            margin-bottom: 12px; flex-wrap: wrap;
        }
        .maxpland-filter-group { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
        .maxpland-pill-btn {
            padding: 5px 12px; border-radius: 6px; border: 1px solid var(--mp-border-card);
            background: var(--mp-bg-panel); color: var(--mp-text-secondary); font-size: 12px; font-weight: 600;
            display: inline-flex; align-items: center; gap: 6px; transition: all .15s;
        }
        .maxpland-pill-btn:hover { background: var(--mp-bg-hover); color: var(--mp-text-primary); border-color: var(--mp-border-active); }
        .maxpland-pill-btn.active {
            background: var(--mp-text-primary); color: var(--mp-bg-root); border-color: var(--mp-text-primary);
        }
        .maxpland-pill-count {
            font-size: 10.5px; opacity: .85; font-variant-numeric: tabular-nums;
        }

        /* Sub-filter chips */
        .maxpland-subfilters {
            display: flex; align-items: center; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; font-size: 11.5px; color: var(--mp-text-secondary);
        }
        .maxpland-export-actions {
            display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 6px; margin-bottom: 12px;
        }
        .maxpland-chip-toggle {
            display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 5px;
            background: var(--mp-bg-panel); border: 1px solid var(--mp-border-card); cursor: pointer; user-select: none;
            transition: all .12s;
        }
        .maxpland-chip-toggle:hover { border-color: var(--mp-border-active); color: var(--mp-text-primary); }
        .maxpland-chip-toggle.active {
            background: #1e293b; border-color: #38bdf8; color: #38bdf8;
        }

        /* Search Input */
        .maxpland-search-box {
            display: flex; align-items: center; gap: 8px; background: var(--mp-bg-panel); border: 1px solid var(--mp-border-card);
            border-radius: 6px; padding: 6px 10px; color: var(--mp-text-muted); min-width: 220px;
        }
        .maxpland-search-box:focus-within { border-color: var(--mp-blue); color: var(--mp-text-primary); }
        .maxpland-search-box input {
            background: none; border: none; outline: none; color: var(--mp-text-primary); font-size: 12px; width: 100%;
        }

        /* Action Buttons */
        .maxpland-btn-primary {
            background: var(--mp-blue); color: #fff; border: 1px solid transparent; border-radius: 6px;
            padding: 7px 14px; font-weight: 600; font-size: 12.5px; display: inline-flex; align-items: center; gap: 7px;
            transition: background-color .15s;
        }
        .maxpland-btn-primary:hover { background: var(--mp-blue-hover); }
        .maxpland-btn-secondary {
            background: var(--mp-bg-card); color: var(--mp-text-primary); border: 1px solid var(--mp-border-card);
            border-radius: 6px; padding: 7px 12px; font-weight: 600; font-size: 12.5px; display: inline-flex; align-items: center; gap: 7px;
            transition: background-color .15s, border-color .15s;
        }
        .maxpland-btn-secondary:hover { background: var(--mp-bg-hover); border-color: var(--mp-border-active); }
        .maxpland-btn-danger {
            background: var(--mp-rose-bg); color: #fda4af; border: 1px solid rgba(244, 63, 94, 0.3);
            border-radius: 6px; padding: 5px 11px; font-weight: 600; font-size: 11.5px; display: inline-flex; align-items: center; gap: 5px;
            transition: background-color .15s;
        }
        .maxpland-btn-danger:hover { background: rgba(244, 63, 94, 0.28); }

        /* Floating / Sticky Bulk Action Bar */
        .maxpland-bulk-bar {
            display: none; align-items: center; justify-content: space-between; padding: 8px 14px;
            background: #1e293b; border: 1px solid #38bdf8; border-radius: 8px; margin-bottom: 12px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.4); animation: mpFadeIn .15s ease-out;
        }
        .maxpland-bulk-info { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 12.5px; color: #f8fafc; }
        .maxpland-bulk-actions { display: flex; align-items: center; gap: 8px; }

        /* User List */
        .maxpland-user-list {
            background: var(--mp-bg-panel); border: 1px solid var(--mp-border-card); border-radius: 8px;
            overflow: hidden; max-height: 420px; overflow-y: auto; position: relative;
        }
        .maxpland-user-row {
            display: flex; align-items: center; justify-content: space-between; padding: 8px 14px;
            border-bottom: 1px solid var(--mp-border-subtle); gap: 12px; transition: background-color .12s;
        }
        .maxpland-user-row:last-child { border-bottom: none; }
        .maxpland-user-row:hover { background: var(--mp-bg-hover); }
        .maxpland-user-left { display: flex; align-items: center; gap: 11px; min-width: 0; }
        
        .maxpland-checkbox {
            appearance: none; -webkit-appearance: none; width: 16px; height: 16px; border: 1.5px solid var(--mp-border-card);
            border-radius: 4px; background: var(--mp-bg-card); cursor: pointer; display: grid; place-items: center;
            flex: 0 0 16px; transition: all .12s;
        }
        .maxpland-checkbox:checked {
            background: var(--mp-blue); border-color: var(--mp-blue);
        }
        .maxpland-checkbox:checked::after {
            content: ''; width: 4px; height: 8px; border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg) translate(-1px, -1px);
        }
        .maxpland-checkbox:disabled { cursor: not-allowed; opacity: .3; }

        .maxpland-avatar {
            width: 36px; height: 36px; border-radius: 50%; object-fit: cover;
            background: var(--mp-bg-elevated); border: 1px solid var(--mp-border-subtle);
            display: grid; place-items: center; font-weight: 700; flex: 0 0 36px; color: var(--mp-text-secondary);
        }
        .maxpland-user-names { display: flex; flex-direction: column; min-width: 0; }
        .maxpland-username-wrap { display: flex; align-items: center; gap: 6px; }
        .maxpland-username {
            font-weight: 650; font-size: 13px; color: var(--mp-text-primary); text-decoration: none;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .maxpland-username:hover { text-decoration: underline; color: #38bdf8; }
        .maxpland-fullname { font-size: 11.5px; color: var(--mp-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .maxpland-status-tag {
            font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px;
        }
        .maxpland-status-tag.not_following { background: var(--mp-rose-bg); color: #fda4af; border: 1px solid rgba(244, 63, 94, 0.25); }
        .maxpland-status-tag.fan { background: var(--mp-cyan-bg); color: #7dd3fc; border: 1px solid rgba(14, 165, 233, 0.25); }
        .maxpland-status-tag.mutual { background: var(--mp-emerald-bg); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.25); }
        .maxpland-status-tag.lost { background: var(--mp-amber-bg); color: #fde68a; border: 1px solid rgba(245, 158, 11, 0.25); }
        .maxpland-status-tag.ghost { background: rgba(168, 85, 247, 0.14); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.25); }

        .maxpland-user-actions { display: flex; align-items: center; gap: 6px; }
        .maxpland-icon-action {
            background: none; border: none; cursor: pointer; padding: 6px; color: var(--mp-text-muted);
            border-radius: 5px; display: flex; align-items: center; justify-content: center;
            transition: color .15s, background-color .15s;
        }
        .maxpland-icon-action:hover { color: var(--mp-text-primary); background: var(--mp-bg-elevated); }
        .maxpland-row-unfollow-btn {
            background: var(--mp-bg-elevated); color: #fda4af; border: 1px solid rgba(244, 63, 94, 0.2);
            border-radius: 5px; padding: 4px 8px; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;
            transition: all .12s;
        }
        .maxpland-row-unfollow-btn:hover { background: var(--mp-rose-bg); border-color: rgba(244, 63, 94, 0.4); color: #fff; }

        /* Toast Notification */
        .maxpland-toast {
            position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: #1e293b; color: #f8fafc; border: 1px solid #38bdf8;
            padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 600;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5); z-index: 100005; pointer-events: none;
            opacity: 0; transition: opacity .2s ease, transform .2s ease;
        }
        .maxpland-toast.show { opacity: 1; transform: translate(-50%, -6px); }

        /* Footer */
        .maxpland-footer {
            grid-area: footer; height: 38px; border-top: 1px solid var(--mp-border-subtle); background: var(--mp-bg-surface);
            padding: 0 18px; display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; color: var(--mp-text-muted);
        }
        .maxpland-footer kbd {
            background: var(--mp-bg-panel); border: 1px solid var(--mp-border-card); border-radius: 4px;
            padding: 2px 5px; font-size: 10px; font-family: ui-monospace, monospace; color: var(--mp-text-secondary);
        }

        /* In-feed Native Action Bar Integration (Zero Vertical Space Waste) */
        .maxpland-action-wrap {
            display: inline-flex;
            align-items: center;
            position: relative;
            z-index: 50;
        }
        .maxpland-action-btn {
            background: none;
            border: none;
            padding: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: inherit;
            border-radius: 50%;
            transition: transform .12s ease, opacity .12s ease, color .12s ease;
            line-height: 1;
        }
        .maxpland-action-btn:hover {
            opacity: 0.75;
            transform: scale(1.08);
            color: #38bdf8;
        }
        .maxpland-action-btn:active {
            transform: scale(0.95);
        }
        .maxpland-action-btn svg {
            width: 24px;
            height: 24px;
        }
        .maxpland-action-btn.loading {
            animation: mpPulse 1s infinite alternate;
            pointer-events: none;
            opacity: 0.5;
        }

        /* Native-integrated Glassmorphism Popover Menu */
        .maxpland-action-menu {
            position: absolute;
            bottom: calc(100% + 8px);
            right: 0;
            background: rgba(18, 21, 27, 0.96);
            backdrop-filter: blur(14px);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 10px;
            padding: 6px;
            display: none;
            flex-direction: column;
            gap: 2px;
            min-width: 200px;
            box-shadow: 0 10px 32px rgba(0, 0, 0, 0.75);
            z-index: 1000;
            animation: mpFadeIn .14s ease-out;
        }
        .maxpland-action-menu.show {
            display: flex;
        }
        .maxpland-menu-item {
            background: none;
            border: none;
            color: #f8fafc;
            padding: 7px 11px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 9px;
            text-align: left;
            transition: background-color .12s, color .12s;
            white-space: nowrap;
        }
        .maxpland-menu-item:hover {
            background: #0284c7;
            color: #ffffff;
        }
        .maxpland-menu-item svg {
            width: 14px;
            height: 14px;
            flex-shrink: 0;
        }
        .maxpland-menu-divider {
            height: 1px;
            background: rgba(255, 255, 255, 0.08);
            margin: 3px 0;
        }

        @keyframes mpPulse {
            from { transform: scale(1); opacity: 0.6; }
            to { transform: scale(1.15); opacity: 1; color: #38bdf8; }
        }

        /* Floating Story Tools */
        .maxpland-story-tools {
            position: fixed; top: 18px; right: 80px; z-index: 10001;
            display: flex; align-items: center; gap: 6px; background: rgba(18, 21, 27, 0.85);
            backdrop-filter: blur(8px); border: 1px solid var(--mp-border-subtle); border-radius: 20px; padding: 4px 10px;
        }
        .maxpland-story-btn {
            background: none; border: none; color: #f8fafc; font-size: 12px; font-weight: 600; cursor: pointer;
            display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border-radius: 12px;
            transition: background .15s;
        }
        .maxpland-story-btn:hover { background: rgba(255,255,255,0.12); color: #38bdf8; }

        /* Profile Avatar HD Download Badge */
        .maxpland-avatar-badge {
            display: inline-flex; align-items: center; gap: 5px; margin-left: 10px;
            background: var(--mp-bg-panel); border: 1px solid var(--mp-border-card); border-radius: 6px;
            padding: 4px 10px; font-size: 11.5px; font-weight: 600; color: #38bdf8; cursor: pointer;
            transition: all .12s; vertical-align: middle;
        }
        .maxpland-avatar-badge:hover { background: var(--mp-bg-hover); border-color: #38bdf8; }

        @keyframes mpFadeIn {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Feature Cards & Switch Controllers */
        .maxpland-feature-card {
            display: flex; align-items: center; justify-content: space-between; gap: 16px;
            padding: 14px 16px; background: var(--mp-bg-card); border: 1px solid var(--mp-border-card);
            border-radius: 8px; margin-bottom: 10px; transition: border-color .15s;
        }
        .maxpland-feature-card:hover { border-color: var(--mp-border-active); }
        .maxpland-feature-info { flex: 1; }
        .maxpland-feature-title { font-size: 13.5px; font-weight: 600; color: var(--mp-text-primary); display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
        .maxpland-feature-desc { font-size: 11.5px; color: var(--mp-text-secondary); line-height: 1.45; }
        .maxpland-badge-emerald { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: var(--mp-emerald-bg); color: var(--mp-emerald); font-weight: 700; text-transform: uppercase; }

        /* Modern Toggle Switch */
        .maxpland-switch { position: relative; display: inline-block; width: 42px; height: 22px; flex-shrink: 0; }
        .maxpland-switch input { opacity: 0; width: 0; height: 0; }
        .maxpland-slider {
            position: absolute; cursor: pointer; inset: 0; background-color: var(--mp-bg-hover);
            transition: .2s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 22px; border: 1px solid var(--mp-border-card);
        }
        .maxpland-slider:before {
            position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px;
            background-color: var(--mp-text-secondary); transition: .2s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 50%;
        }
        .maxpland-switch input:checked + .maxpland-slider { background-color: var(--mp-blue); border-color: var(--mp-blue); }
        .maxpland-switch input:checked + .maxpland-slider:before { transform: translateX(20px); background-color: #fff; }

        /* Settings Panels */
        .maxpland-settings-group {
            background: var(--mp-bg-card); border: 1px solid var(--mp-border-card); border-radius: 8px;
            padding: 14px 16px; margin-bottom: 12px;
        }
        .maxpland-settings-group-title { font-size: 13px; font-weight: 700; color: var(--mp-text-primary); margin: 0 0 10px; display: flex; align-items: center; gap: 6px; }
        .maxpland-settings-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 0; border-top: 1px solid var(--mp-border-subtle); }
        .maxpland-settings-row:first-of-type { border-top: none; padding-top: 0; }
        .maxpland-select {
            background: var(--mp-bg-panel); color: var(--mp-text-primary); border: 1px solid var(--mp-border-card);
            border-radius: 6px; padding: 5px 10px; font-size: 12px; outline: none; cursor: pointer;
        }

        /* Health Dashboard Elements */
        .maxpland-health-hero {
            display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 14px;
        }
        .maxpland-health-card {
            background: var(--mp-bg-card); border: 1px solid var(--mp-border-card); border-radius: 8px; padding: 14px 16px;
        }
        .maxpland-health-title { font-size: 11px; font-weight: 700; color: var(--mp-text-muted); text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px; }
        .maxpland-health-val { font-size: 22px; font-weight: 800; color: var(--mp-text-primary); font-variant-numeric: tabular-nums; }
        .maxpland-health-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 3px 8px; border-radius: 5px; font-weight: 600; margin-top: 6px; }
        .maxpland-chart-box {
            background: var(--mp-bg-card); border: 1px solid var(--mp-border-card); border-radius: 8px; padding: 16px; margin-bottom: 14px;
        }
        .maxpland-sparkline { width: 100%; height: 130px; overflow: visible; }
    `;

    /* ==========================================================================
       2. DATABASE LAYER (IndexedDB with Whitelist Backup & Restore)
       ========================================================================== */

    class MaxPlandVault {
        static db = null;
        static opening = null;

        static async init() {
            if (this.db) return this.db;
            if (this.opening) return this.opening;
            this.opening = new Promise((resolve, reject) => {
                const req = indexedDB.open(APP_CONFIG.DB_NAME, APP_CONFIG.DB_VERSION);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('snapshots')) {
                        db.createObjectStore('snapshots', { keyPath: 'timestamp' });
                    }
                    if (!db.objectStoreNames.contains('whitelist')) {
                        db.createObjectStore('whitelist', { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains('media_vault')) {
                        const vault = db.createObjectStore('media_vault', { keyPath: 'key' });
                        vault.createIndex('downloaded_at', 'downloaded_at', { unique: false });
                    }
                    if (!db.objectStoreNames.contains('user_activity')) {
                        db.createObjectStore('user_activity', { keyPath: 'id' });
                    }
                };
                req.onsuccess = (e) => {
                    this.db = e.target.result;
                    this.db.onversionchange = () => { this.db.close(); this.db = null; };
                    resolve(this.db);
                };
                req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
            }).finally(() => { this.opening = null; });
            return this.opening;
        }

        static async getWhitelist() {
            const db = await this.init();
            return new Promise((resolve) => {
                const tx = db.transaction('whitelist', 'readonly');
                const store = tx.objectStore('whitelist');
                const req = store.getAll();
                req.onsuccess = () => resolve(new Map((req.result || []).map(item => [String(item.id), item])));
                req.onerror = () => resolve(new Map());
            });
        }

        static async toggleWhitelist(user) {
            const db = await this.init();
            const uid = String(user.pk || user.pk_id || user.id || '');
            if (!uid) throw new Error('Missing user ID');
            return new Promise((resolve, reject) => {
                const tx = db.transaction('whitelist', 'readwrite');
                const store = tx.objectStore('whitelist');
                let added = false;
                const req = store.get(uid);
                req.onsuccess = () => {
                    added = !req.result;
                    if (added) {
                        store.put({
                            id: uid,
                            username: user.username,
                            full_name: user.full_name || '',
                            profile_pic_url: user.profile_pic_url || '',
                            is_verified: Boolean(user.is_verified),
                            is_private: Boolean(user.is_private),
                            added_at: Date.now()
                        });
                    } else {
                        store.delete(uid);
                    }
                };
                tx.oncomplete = () => resolve(added);
                tx.onerror = () => reject(tx.error);
            });
        }

        static async importWhitelist(usersList) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('whitelist', 'readwrite');
                const store = tx.objectStore('whitelist');
                let count = 0;
                for (const u of usersList) {
                    const uid = String(u.id || u.pk || u.pk_id || '');
                    if (uid) {
                        store.put({
                            id: uid,
                            username: u.username || 'unknown',
                            full_name: u.full_name || '',
                            profile_pic_url: u.profile_pic_url || '',
                            is_verified: Boolean(u.is_verified),
                            is_private: Boolean(u.is_private),
                            added_at: u.added_at || Date.now()
                        });
                        count++;
                    }
                }
                tx.oncomplete = () => resolve(count);
                tx.onerror = () => reject(tx.error);
            });
        }

        static async saveSnapshot(followers, following, accountId = null, signal = null) {
            if (followers.completed !== true || following.completed !== true) throw new Error('ไม่บันทึก snapshot จากข้อมูลที่ยังไม่ครบ');
            const db = await this.init();
            IgBridge.assertAccount(accountId);
            if (signal?.aborted) throw new DOMException('หยุดการสแกนแล้ว', 'AbortError');
            return new Promise((resolve, reject) => {
                const tx = db.transaction('snapshots', 'readwrite');
                const abort = () => { try { tx.abort(); } catch (_) {} };
                signal?.addEventListener('abort', abort, { once: true });
                const cleanup = () => signal?.removeEventListener('abort', abort);
                const store = tx.objectStore('snapshots');
                const snap = {
                    timestamp: Date.now(),
                    complete: true,
                    account_id: accountId ? String(accountId) : null,
                    follower_count: followers.length,
                    following_count: following.length,
                    follower_ids: followers.map(u => String(u.pk || u.pk_id || u.id)),
                    following_ids: following.map(u => String(u.pk || u.pk_id || u.id)),
                    // ponytail: separate id->username maps (not one fat blob) so lost-follower
                    // rows can show real names without any extra API call; add an index when queried.
                    follower_usernames: Object.fromEntries(followers.map(u => [String(u.pk || u.pk_id || u.id), String(u.username || '')]).filter(pair => pair[1])),
                    following_usernames: Object.fromEntries(following.map(u => [String(u.pk || u.pk_id || u.id), String(u.username || '')]).filter(pair => pair[1]))
                };
                store.put(snap);
                tx.oncomplete = () => { cleanup(); resolve(snap); };
                tx.onerror = () => { cleanup(); reject(tx.error || new Error('Snapshot write failed')); };
                tx.onabort = () => { cleanup(); reject(signal?.aborted ? new DOMException('หยุดการสแกนแล้ว', 'AbortError') : tx.error || new Error('Snapshot transaction aborted')); };
            });
        }

        static async getLatestSnapshot(accountId = null) {
            const db = await this.init();
            return new Promise((resolve) => {
                const tx = db.transaction('snapshots', 'readonly');
                const store = tx.objectStore('snapshots');
                const req = store.openCursor(null, 'prev');
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (!cursor) { resolve(null); return; }
                    if (cursor.value.complete === true && (!accountId || String(cursor.value.account_id) === String(accountId))) {
                        resolve(cursor.value);
                    } else {
                        cursor.continue();
                    }
                };
                req.onerror = () => resolve(null);
            });
        }

        static async markMediaDownloaded(record) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('media_vault', 'readwrite');
                const store = tx.objectStore('media_vault');
                store.put({ ...record, downloaded_at: Date.now() });
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        }

        static async hasMedia(key) {
            const db = await this.init();
            return new Promise((resolve) => {
                const tx = db.transaction('media_vault', 'readonly');
                const req = tx.objectStore('media_vault').get(key);
                req.onsuccess = () => resolve(Boolean(req.result));
                req.onerror = () => resolve(false);
            });
        }

        static async getMediaVault(limit = 100) {
            const db = await this.init();
            return new Promise((resolve) => {
                const tx = db.transaction('media_vault', 'readonly');
                const store = tx.objectStore('media_vault');
                const index = store.index('downloaded_at');
                const results = [];
                const req = index.openCursor(null, 'prev');
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor && results.length < limit) {
                        results.push(cursor.value);
                        cursor.continue();
                    } else {
                        resolve(results);
                    }
                };
                req.onerror = () => resolve([]);
            });
        }

        static async getAllSnapshots(accountId = null, limit = 20) {
            const db = await this.init();
            return new Promise((resolve) => {
                const tx = db.transaction('snapshots', 'readonly');
                const store = tx.objectStore('snapshots');
                const req = store.openCursor(null, 'prev');
                const list = [];
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor && list.length < limit) {
                        if (cursor.value.complete === true && (!accountId || String(cursor.value.account_id) === String(accountId))) {
                            list.push(cursor.value);
                        }
                        cursor.continue();
                    } else {
                        resolve(list);
                    }
                };
                req.onerror = () => resolve([]);
            });
        }

        static async getUserActivity(userId) {
            const db = await this.init();
            return new Promise((resolve) => {
                const tx = db.transaction('user_activity', 'readonly');
                const req = tx.objectStore('user_activity').get(String(userId));
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            });
        }

        static async saveUserActivity(record) {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('user_activity', 'readwrite');
                tx.objectStore('user_activity').put(record);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        }

        static async clearActivityCache() {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction('user_activity', 'readwrite');
                tx.objectStore('user_activity').clear();
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        }
    }

    /* ==========================================================================
       3. API TRANSPORT ENGINE (Fetch + GM_xhr fallback + CSRF + Unfollow)
       ========================================================================== */

    class IgBridge {
        static currentUserId = null;
        static currentUsername = null;
        static wwwClaim = null;

        static getAppId() {
            return APP_CONFIG.INSTAGRAM_WEB_APP_ID || '936619743392459';
        }

        static getCookie(name) {
            const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
            return match ? decodeURIComponent(match[3]) : null;
        }

        static async resolveCurrentUser() {
            // Level 1: Standard authentication cookie 'ds_user_id'
            const cookieId = this.getCookie('ds_user_id');
            if (!cookieId) { this.currentUserId = null; this.currentUsername = null; return { id: null, username: null }; }
            if (cookieId) {
                if (this.currentUserId !== cookieId) {
                    this.currentUsername = null;
                }
                this.currentUserId = cookieId;
            }

            // Level 2: window globals (_sharedData, __initialData) with viewer validation
            try {
                const page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
                const sharedViewer = page._sharedData?.config?.viewer;
                const sharedViewerId = page._sharedData?.config?.viewerId || sharedViewer?.id;
                if (sharedViewerId) {
                    const svIdStr = String(sharedViewerId);
                    if (!this.currentUserId) this.currentUserId = svIdStr;
                    if (this.currentUserId === svIdStr && sharedViewer?.username) {
                        this.currentUsername = sharedViewer.username;
                    }
                }

                const initialViewer = page.__initialData?.data?.viewer;
                if (initialViewer?.id) {
                    const ivIdStr = String(initialViewer.id);
                    if (!this.currentUserId) this.currentUserId = ivIdStr;
                    if (this.currentUserId === ivIdStr && initialViewer.username) {
                        this.currentUsername = initialViewer.username;
                    }
                }
            } catch (_) {}

            // Level 3: Scan inline JSON script tags strictly tied to currentUserId
            try {
                const scripts = document.querySelectorAll('script[type="application/json"], script:not([src])');
                for (const s of scripts) {
                    const txt = s.textContent || '';
                    if (!this.currentUserId) {
                        const m = txt.match(/"(?:viewerId|actorID|userId)":\s*"(\d+)"/) 
                               || txt.match(/"viewer":\s*\{\s*"id":\s*"(\d+)"/);
                        if (m && m[1]) this.currentUserId = m[1];
                    }

                    if (this.currentUserId && !this.currentUsername && txt.includes('username')) {
                        const uid = this.currentUserId;
                        // Match username in tight proximity to user ID (JSON object level)
                        const m1 = txt.match(new RegExp(`"id"\\s*:\\s*"${uid}"[^{}]{0,300}"username"\\s*:\\s*"([a-zA-Z0-9._]+)"`));
                        const m2 = txt.match(new RegExp(`"username"\\s*:\\s*"([a-zA-Z0-9._]+)"[^{}]{0,300}"id"\\s*:\\s*"${uid}"`));
                        const m3 = txt.match(new RegExp(`"(?:viewerId|actorID)"\\s*:\\s*"${uid}"[^{}]{0,300}"username"\\s*:\\s*"([a-zA-Z0-9._]+)"`));
                        const m4 = txt.match(new RegExp(`"username"\\s*:\\s*"([a-zA-Z0-9._]+)"[^{}]{0,300}"(?:viewerId|actorID)"\\s*:\\s*"${uid}"`));
                        const found = m1?.[1] || m2?.[1] || m3?.[1] || m4?.[1];
                        if (found && !['null', 'undefined'].includes(found)) {
                            this.currentUsername = found;
                            break;
                        }
                    }
                }
            } catch (_) {}

            // Level 4: Navigation Bar ONLY (strictly desktop sidebar or mobile nav bar, NEVER feed/posts)
            if (!this.currentUsername) {
                try {
                    const navContainer = document.querySelector('nav, [role="navigation"], aside');
                    if (navContainer) {
                        const navAnchors = Array.from(navContainer.querySelectorAll('a[href^="/"]'));
                        const reserved = new Set([
                            '', 'explore', 'reels', 'direct', 'stories', 'your_activity', 
                            'settings', 'accounts', 'api', 'legal', 'about', 'p', 'reel', 'tv'
                        ]);

                        // 4a. Profile link with explicit aria-label or SVG Profile icon in nav
                        const profileLink = navAnchors.find(a => {
                            const svg = a.querySelector('svg[aria-label="Profile"], svg[aria-label="โปรไฟล์"]');
                            const aria = a.getAttribute('aria-label') || '';
                            return Boolean(svg || aria.includes('Profile') || aria.includes('โปรไฟล์'));
                        });

                        if (profileLink) {
                            const parts = (profileLink.getAttribute('href') || '').replace(/^\/|\/$/g, '').split('/');
                            if (parts.length === 1 && !reserved.has(parts[0].toLowerCase())) {
                                this.currentUsername = parts[0];
                            }
                        }

                        // 4b. Nav link that contains an avatar img inside the navigation container
                        if (!this.currentUsername) {
                            for (const a of navAnchors) {
                                const parts = (a.getAttribute('href') || '').replace(/^\/|\/$/g, '').split('/');
                                if (parts.length === 1 && !reserved.has(parts[0].toLowerCase())) {
                                    if (a.querySelector('img')) {
                                        this.currentUsername = parts[0];
                                        break;
                                    }
                                }
                            }
                        }
                    }
                } catch (_) {}
            }

            return { id: this.currentUserId, username: this.currentUsername };
        }

        static cooldownUntil = 0;
        static cooldownAccount = null;

        static error(message, code, status = 0) {
            return Object.assign(new Error(message), { code, status });
        }

        static assertAccount(accountId) {
            if (!accountId || this.getCookie('ds_user_id') !== String(accountId)) {
                throw this.error('บัญชีเปลี่ยนหรือออกจากระบบ กรุณารีเฟรชแล้วเริ่มใหม่', 'ACCOUNT_CHANGED');
            }
        }

        static isSessionError(err) {
            return ['AUTH', 'CHECKPOINT', 'RATE_LIMIT', 'ACCOUNT_CHANGED'].includes(err?.code);
        }

        static async request(url, options = {}) {
            const target = new URL(url, 'https://www.instagram.com');
            if (target.protocol !== 'https:' || !['www.instagram.com', 'instagram.com'].includes(target.hostname) || target.port || target.username || target.password) {
                throw this.error('Unsupported API origin', 'ORIGIN');
            }
            const accountId = options.accountId || this.getCookie('ds_user_id');
            this.assertAccount(accountId);
            if (this.cooldownAccount === accountId && Date.now() < this.cooldownUntil) {
                const seconds = Math.ceil((this.cooldownUntil - Date.now()) / 1000);
                throw this.error(`Instagram ขอให้พัก กรุณารออีก ${seconds} วินาที`, 'RATE_LIMIT', 429);
            }
            const page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            const fetchFn = typeof page.fetch === 'function' ? page.fetch.bind(page) : fetch;
            const method = String(options.method || 'GET').toUpperCase();
            const csrf = this.getCookie('csrftoken');
            // ponytail: align headers with real Instagram Web client (no X-Requested-With, add X-ASBD-ID and X-IG-WWW-Claim)
            const headers = {
                'X-IG-App-ID': this.getAppId(),
                'X-ASBD-ID': '129477',
                'X-IG-WWW-Claim': this.wwwClaim || '0',
                'Accept': '*/*',
                ...(csrf ? { 'X-CSRFToken': csrf } : {}),
                ...options.headers
            };
            const attempts = method === 'GET' ? 3 : 1;
                        // Account validation hoisted out of retry loop (P0 fix)
                        this.assertAccount(accountId);
                        for (let attempt = 0; attempt < attempts; attempt++) {
                            if (options.signal?.aborted) throw new DOMException('หยุดการทำงานแล้ว', 'AbortError');
                            const controller = new AbortController();
                            const abort = () => controller.abort();
                            options.signal?.addEventListener('abort', abort, { once: true });
                            let timedOut = false;
                            const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 30000);
                            try {
                                const res = await fetchFn(target.href, { method, headers, credentials: 'include',
                                    body: options.body ?? options.data, signal: controller.signal });
                                const newClaim = res.headers?.get('x-ig-www-claim');
                                if (newClaim) this.wwwClaim = newClaim;
                                const text = await res.text();
                    if (options.signal?.aborted) throw new DOMException('หยุดการทำงานแล้ว', 'AbortError');
                    let data = null;
                    try { data = JSON.parse(text); } catch (_) {}
                    const message = String(data?.message || data?.error_type || '');
                    const redirected = res.url || '';
                    if (/challenge|checkpoint|consent_required/i.test(message + redirected) || data?.challenge || data?.checkpoint_url) {
                        throw this.error('Instagram ต้องการยืนยันตัวตน กรุณาเปิด Instagram และดำเนินการให้ครบก่อนสแกนใหม่', 'CHECKPOINT', res.status);
                    }
                    if (res.status === 401 || /login_required|\/accounts\/login/i.test(message + redirected)) {
                        throw this.error('Session หมดอายุ กรุณาเข้าสู่ระบบ Instagram แล้วรีเฟรช', 'AUTH', res.status);
                    }
                    if (res.status === 429 || /feedback_required|please wait|try again later|rate.limit/i.test(message)) {
                        const retry = res.headers?.get('Retry-After');
                        const delay = retry && /^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
                        this.cooldownUntil = Date.now() + Math.max(60000, Number.isFinite(delay) ? delay : 60000);
                        this.cooldownAccount = accountId;
                        throw this.error('Instagram จำกัดคำขอชั่วคราว กรุณาพักแล้วลองใหม่', 'RATE_LIMIT', res.status);
                    }
                    if (res.status === 403) throw this.error('Instagram ไม่อนุญาตคำขอนี้ กรุณาตรวจสอบสถานะบัญชีในหน้าเว็บ', 'AUTH', 403);
                    if (/^\s*</.test(text)) throw this.error('Instagram ส่ง HTML แทนข้อมูล กรุณาตรวจสอบการล็อกอินแล้วรีเฟรช', 'HTML_RESPONSE', res.status);
                    if (!res.ok) throw this.error(`Instagram ตอบกลับ HTTP ${res.status}`, 'HTTP', res.status);
                    if (!data || typeof data !== 'object') throw this.error('Instagram ส่งรูปแบบข้อมูลไม่ถูกต้อง', 'PAYLOAD', res.status);
                                        if (data.status === 'fail' || (data.errors && data.errors.length)) throw this.error('Instagram ปฏิเสธคำขอข้อมูล', 'API', res.status);
                                        return data;
                } catch (err) {
                    if (options.signal?.aborted) throw new DOMException('หยุดการทำงานแล้ว', 'AbortError');
                    this.assertAccount(accountId);
                    if (timedOut) throw this.error('Instagram ไม่ตอบกลับภายใน 30 วินาที กรุณาลองใหม่', 'TIMEOUT');
                    const transient = err.status >= 500 || (!err.code && err.name === 'TypeError');
                    if (!transient || attempt + 1 >= attempts) throw err;
                } finally {
                    clearTimeout(timeout);
                    options.signal?.removeEventListener('abort', abort);
                }
                await sleep(1000 * (attempt + 1));
            }
        }

        static async unfollowUser(userId) {
            const uid = String(userId || '');
            if (!/^\d+$/.test(uid)) throw new Error('Invalid User ID to unfollow');
            const user = STATE.following.find(u => String(u.id || u.pk_id || u.pk || '') === uid);
            if (isProtectedUser(uid, user?.username)) throw new Error('บัญชีนี้อยู่ใน Whitelist');
            const accountId = STATE.relationshipAccountId || this.getCookie('ds_user_id');
                        // Validate account before unfollow attempt with helpful error (P0 fix)
                        try {
                            this.assertAccount(accountId);
                        } catch (e) {
                            throw this.error('บัญชีเปลี่ยนหรือออกจากระบบ — กรุณารีเฟรช Instagram แล้วลองใหม่', 'ACCOUNT_CHANGED');
                        }
                        const csrf = this.getCookie('csrftoken');
            if (!csrf) throw this.error('ไม่พบ CSRF token กรุณารีเฟรช Instagram', 'AUTH');

            const candidateRoutes = [
                { url: `/web/friendships/${uid}/unfollow/`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
                { url: `/api/v1/web/friendships/${uid}/unfollow/`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
                {
                    url: `/api/v1/friendships/destroy/${uid}/`,
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ user_id: uid, _uid: accountId, _csrftoken: csrf }).toString()
                }
            ];

            let lastError = null;
            for (let i = 0; i < candidateRoutes.length; i++) {
                this.assertAccount(accountId);
                if (i > 0) await sleep(1000);
                const route = candidateRoutes[i];
                try {
                    const res = await this.request(route.url, {
                        method: 'POST',
                        accountId,
                        headers: route.headers,
                        body: route.body
                    });
                    if (res?.friendship_status?.following === false || (res?.status === 'ok' && res.friendship_status === undefined)) {
                        return true;
                    }
                    throw this.error('Instagram ไม่ได้ยืนยันการเลิกติดตาม กรุณาตรวจสอบหน้าโปรไฟล์ก่อนลองใหม่', 'UNCONFIRMED');
                } catch (err) {
                    lastError = err;
                    // Never repeat an ambiguous write or a rejected session on another route.
                    if (err.code !== 'HTTP' || ![404, 405].includes(err.status)) throw err;
                }
            }
            throw lastError || new Error('Instagram ไม่ได้ยืนยันการเลิกติดตาม กรุณาตรวจสอบในหน้าโปรไฟล์ก่อนลองใหม่');
        }

        static async fetchRelationshipPage(endpoint, userId, cursor = null, options = {}) {
            const uid = String(userId || '');
            if (!/^\d+$/.test(uid) || !['followers', 'following'].includes(endpoint)) throw new Error('Invalid relationship target');
            this.assertAccount(uid);
            const count = Math.min(50, Math.max(1, Number(APP_CONFIG.PAGE_SIZE) || 50));
            if (options.transport === 'graphql') {
                // Compatibility route used by Instaloader's Profile.get_followers/get_followees.
                const hash = endpoint === 'followers' ? '37479f2b8209594dde7facb0d904896a' : '58712303d941c6855d4e888c5f0cd22f';
                const variables = { id: uid, first: count, ...(cursor ? { after: cursor } : {}) };
                const qs = new URLSearchParams({ query_hash: hash, variables: JSON.stringify(variables) });
                const data = await this.request(`/graphql/query/?${qs}`, { ...options, accountId: uid });
                const connection = data?.data?.user?.[endpoint === 'followers' ? 'edge_followed_by' : 'edge_follow'];
                if (!Array.isArray(connection?.edges) || typeof connection.page_info?.has_next_page !== 'boolean') throw new Error('Invalid GraphQL relationship page');
                return { users: connection.edges.map(edge => edge?.node),
                    has_more: connection.page_info.has_next_page,
                    next_max_id: connection.page_info.has_next_page ? connection.page_info.end_cursor : null };
            }
            const qs = new URLSearchParams({ count: String(count), search_surface: 'follow_list_page' });
            if (cursor) qs.set('max_id', cursor);
            return this.request(`/api/v1/friendships/${uid}/${endpoint}/?${qs}`, { ...options, accountId: uid });
        }

        static async fetchAllRelationships(endpoint, userId, pageSafetyLimit = 250, onProgress, speedMode = 'A') {
                    const all = [];
                    all.completed = false;
                    all.lastError = null;
                    all.pagesFetched = 0;
                    const seenUsers = new Set(), seenCursors = new Set();
                    let cursor = null, transport = 'rest';
                    const signal = STATE.scanController?.signal;
                    // Use endpoint-specific safety limits from APP_CONFIG (P0 fix)
                    const safetyLimit = endpoint === 'followers' ? APP_CONFIG.FOLLOWERS_PAGE_SAFETY_LIMIT : APP_CONFIG.FOLLOWING_PAGE_SAFETY_LIMIT;
                    const limit = Math.max(1, Math.min(safetyLimit, Number(pageSafetyLimit) || safetyLimit));
                    const fetchStats = { requestMs: 0, waitMs: 0 };
                    try {
                        while (!STATE.stopScanFlag) {
                            this.assertAccount(String(userId));
                            let data;
                    try {
                        const t0 = performance.now();
                        data = await this.fetchRelationshipPage(endpoint, userId, cursor, { transport, signal });
                        fetchStats.requestMs += performance.now() - t0;
                    } catch (err) {
                        // Only first-page endpoint incompatibility can switch routes. Never mix cursors,
                        // bypass session challenges, or repeat a rejected request unchanged.
                        if (all.pagesFetched || transport !== 'rest' || err.code !== 'HTTP' || ![400,404].includes(err.status)) throw err;
                        transport = 'graphql';
                        onProgress?.(0, 0, 'Instagram ไม่รับคำขอแบบเดิม กำลังลองเส้นทางอ่านสำรอง...');
                        if (STATE.stopScanFlag) break;
                        const t1 = performance.now();
                        data = await this.fetchRelationshipPage(endpoint, userId, null, { transport, signal });
                        fetchStats.requestMs += performance.now() - t1;
                    }
                    this.assertAccount(String(userId));
                                        if (STATE.stopScanFlag) { all.completed = false; break; }
                                        if (!Array.isArray(data?.users)) throw new Error('Invalid relationship page');
                    const next = data.next_max_id == null ? '' : String(data.next_max_id);
                    if ((data.has_more === true || data.more_available === true) && !next) throw new Error('Missing relationship cursor');
                    if (next && (data.has_more === false || data.more_available === false)) throw new Error('Conflicting relationship cursor');
                    if (!data.users.length && next) throw new Error('Empty relationship page with cursor');
                    const before = all.length;
                    for (const user of data.users) {
                                            const id = String(user?.id || user?.pk_id || user?.pk || '').trim();
                                            if (!/^\d+$/.test(id)) continue;
                                            if (!seenUsers.has(id)) {
                            seenUsers.add(id);
                            all.push({
                                id,
                                username: user.username || '',
                                full_name: user.full_name || '',
                                profile_pic_url: user.profile_pic_url || '',
                                is_verified: Boolean(user.is_verified),
                                is_private: Boolean(user.is_private),
                                has_anonymous_profile_picture: Boolean(user.has_anonymous_profile_picture)
                            });
                        }
                    }
                    all.pagesFetched++;
                    onProgress?.(all.length, all.pagesFetched, null);
                                        this.assertAccount(String(userId));
                                        if (STATE.stopScanFlag) { all.completed = false; break; }
                                        if (!next) { all.completed = true; break; }
                    if (seenCursors.has(next)) throw new Error('Repeated relationship cursor');
                    if (before === all.length) throw new Error('Relationship pagination made no progress');
                    if (all.pagesFetched >= limit) throw new Error(`สแกนถึงขีดจำกัด ${limit} หน้า ข้อมูลยังไม่ครบ`);
                    seenCursors.add(next);
                    cursor = next;
                    // Yield between pages and honor Stop without triggering automated activity detection
                    // ponytail: speedMode only shortens the inter-page pause (2-3s → 0.5-1s);
                    // PAGE_SIZE/headers/transports untouched. Upgrade path: per-mode presets object.
                    const pause = speedMode === 'C' ? 500 + Math.floor(Math.random() * 500) : 2000 + Math.floor(Math.random() * 1000);
                    const tw = performance.now();
                    for (let ms = 0; ms < pause && !STATE.stopScanFlag && !signal?.aborted; ms += 250) await sleep(250);
                    fetchStats.waitMs += performance.now() - tw;
                    if (STATE.stopScanFlag || signal?.aborted) break;
                }
            } catch (err) {
                all.lastError = err;
                onProgress?.(all.length, all.pagesFetched, err.message);
            }
            all.fetchStats = fetchStats;
            return all;
        }

        static shortcodeToMediaId(shortcode) {
            if (!/^[A-Za-z0-9_-]+$/.test(String(shortcode || ''))) throw new Error('Invalid shortcode');
            const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
            let value = 0n;
            for (const ch of String(shortcode || '')) {
                const index = alphabet.indexOf(ch);
                if (index < 0) throw new Error('Invalid shortcode');
                value = value * 64n + BigInt(index);
            }
            return value.toString();
        }

        static async fetchMediaInfo(shortcode) {
            const raw = String(shortcode || '').trim();
            const mediaId = /^\d+$/.test(raw) ? raw : this.shortcodeToMediaId(raw);
            const data = await this.request(`/api/v1/media/${mediaId}/info/`);
            const item = (data.items || [])[0];
            if (!item) throw new Error('ไม่พบข้อมูลสื่อนี้');
            return item;
        }

        static bestImage(item) {
            const c = item?.image_versions2?.candidates || [];
            return [...c].sort((a,b) => ((b.width||0)*(b.height||0))-((a.width||0)*(a.height||0)))[0]?.url || null;
        }

        static bestProgressiveVideo(item) {
            const v = item?.video_versions || [];
            return [...v].sort((a,b) => ((b.width||0)*(b.height||0))-((a.width||0)*(a.height||0)))[0]?.url || null;
        }

        static async resolveMedia(shortcode) {
            const item = await this.fetchMediaInfo(shortcode);
            const nodes = Array.isArray(item.carousel_media) && item.carousel_media.length ? item.carousel_media : [item];
            return {
                item, shortcode,
                username: item?.user?.username || '',
                caption: item?.caption?.text || '',
                nodes: nodes.map((node, index) => ({
                    index,
                    id: String(node.pk || node.id || item.pk || item.id || shortcode),
                    mediaType: node.media_type === 2 ? 'video' : 'image',
                    imageUrl: this.bestImage(node),
                    progressiveVideoUrl: this.bestProgressiveVideo(node)
                }))
            };
        }

        static async fetchUserProfileHD(username) {
            try {
                const data = await this.request(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`);
                const user = data?.data?.user;
                if (user) {
                    return user.profile_pic_url_hd || user.profile_pic_url || null;
                }
            } catch (_) {}
            return null;
        }

        static async fetchUserLastPost(userId, options = {}) {
            const uid = String(userId || '');
            if (!/^\d+$/.test(uid)) throw new Error('Invalid user ID');
            const accountId = STATE.relationshipAccountId || this.getCookie('ds_user_id');
            this.assertAccount(accountId);
            const data = await this.request(`/api/v1/feed/user/${uid}/?count=1`, { ...options, accountId });
            const item = (data?.items || [])[0];
            return {
                has_posts: Boolean(item),
                last_taken_at: item?.taken_at || null,
                total_posts: data?.num_results ?? (item ? 1 : 0)
            };
        }
    }

    /* ==========================================================================
       4. CONTROLLER & STATE
       ========================================================================== */

    const DEFAULT_PREFS = {
        stealthStory: true,
        cleanFeed: true,
        quickDownloadFeed: true,
        quickDownloadStory: true,
        inactiveThresholdDays: 180,
        scanSpeed: 'A'
    };

    function loadPrefs() {
        try {
            const raw = localStorage.getItem('maxpland_prefs');
            if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
        } catch (_) {}
        return { ...DEFAULT_PREFS };
    }

    function savePrefs(prefs) {
        try {
            localStorage.setItem('maxpland_prefs', JSON.stringify(prefs));
        } catch (_) {}
    }

    const STATE = {
        currentUser: { id: null, username: null },
        followers: [],
        following: [],
        notFollowingBack: [],
        fans: [],
        mutual: [],
        lostFollowers: [],
        ghostFollowers: [],
        inactiveFollowing: [],
        isScanningInactive: false,
        stopInactiveScanFlag: false,
        whitelist: new Map(),
        selectedIds: new Set(),
        isScanning: false,
        stopScanFlag: false,
        isUnfollowing: false,
        stopUnfollowFlag: false,
        activeTab: 'relationship',
        relationshipFilter: 'not_following_back',
        searchQuery: '',
        relationshipLimit: 100,
        subFilters: {
            excludeVerified: false,
            excludePrivate: false,
            excludeNoAvatar: false,
            excludeWhitelist: false,
            onlyFollowing: false,
            onlyNotFollowed: false
        },
        scanStartTime: 0,
        prefs: loadPrefs()
    };

    // STEALTH STORY SEEN INTERCEPTOR (Ponytail: multi-channel stealth — fetch, XHR, sendBeacon masked)
    let stealthSeenCount = 0;
    function isStorySeenRequest(url, body) {
        if (!STATE.prefs?.stealthStory) return false;
        const urlStr = String(url || '');
        const bodyStr = typeof body === 'string' ? body : (body ? JSON.stringify(body) : '');

        // Safety Guard: never block read queries (drawing story rings, viewing profiles, feed)
        const isRead = /web_profile_info|users\/web_profile|PolarisProfile|ProfilePage|[A-Za-z0-9_]*Query\b/i.test(urlStr) ||
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

    // ponytail: StoryMediaRegistry caches reels_media and GraphQL story payloads intercepted at document-start
    // skipped: IndexedDB persistent cross-session media blob cache, add when offline reel playback is required
    const StoryMediaRegistry = {
        items: new Map(),
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
            if (id) this.items.set(id, entry);
        },
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
        },
        scanDomScripts() {
            try {
                const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
                const doc = win.document || document;
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
    };

    function installStorySeenInterceptor() {
        try {
            const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
            const hookSym = Symbol.for('mp_seen_hooked');
            if (win[hookSym]) return;
            win[hookSym] = true;

            const FAKE_JSON = JSON.stringify({ status: 'ok' });
            const isStoryDataUrl = (u) => Boolean(u && typeof u === 'string' && (/reels?_?media|graphql\/query|\/api\/v1\/media\//i.test(u)));

            // 1. Intercept fetch
            if (typeof win.fetch === 'function') {
                const rawFetch = win.fetch;
                const stealthFetch = function(resource, init = {}) {
                    let url = '';
                    let body = init?.body || null;

                    if (typeof resource === 'string') {
                        url = resource;
                    } else if (resource && typeof resource.url === 'string') {
                        url = resource.url;
                    }

                    if (isStorySeenRequest(url, body)) {
                        stealthSeenCount++;
                        console.info(`[MaxPland Stealth] Blocked story seen ping #${stealthSeenCount}:`, url);
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
                                        res.clone().json().then(data => StoryMediaRegistry.parseAndCache(data)).catch(() => {});
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
                        if (isStorySeenRequest(url, body)) {
                            stealthSeenCount++;
                            console.info(`[MaxPland Stealth] Blocked XHR story seen ping #${stealthSeenCount}:`, url);
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
                            const self = this;
                            const origOnLoad = self.onload;
                            self.onload = function(...args) {
                                try {
                                    if (self.status === 200 && self.responseText) {
                                        const data = JSON.parse(self.responseText);
                                        StoryMediaRegistry.parseAndCache(data);
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
                const rawSendBeacon = win.navigator.sendBeacon.bind(win.navigator);
                win.navigator.sendBeacon = function(url, data) {
                    try {
                        if (isStorySeenRequest(url, data)) {
                            stealthSeenCount++;
                            console.info(`[MaxPland Stealth] Blocked Beacon story seen ping #${stealthSeenCount}:`, url);
                            return true;
                        }
                    } catch (_) {}
                    return rawSendBeacon(url, data);
                };
            }
        } catch (_) {}
    }
    installStorySeenInterceptor();

    // CLEAN FEED MODE CONTROLLER
    let cleanFeedObserver = null;
    function applyCleanFeedMode() {
        const isEnabled = Boolean(STATE.prefs?.cleanFeed);
        let styleTag = document.getElementById('maxpland-clean-feed-style');

        if (!isEnabled) {
            if (styleTag) styleTag.remove();
            if (cleanFeedObserver) {
                cleanFeedObserver.disconnect();
                cleanFeedObserver = null;
            }
            document.querySelectorAll('article[data-mp-hidden-ad="true"]').forEach(el => {
                delete el.dataset.mpHiddenAd;
            });
            return;
        }

        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'maxpland-clean-feed-style';
            // ponytail: avoid display:none layout collapse which causes browser scroll-anchor to jump to top (0, 0)
            styleTag.textContent = `
                article:has(a[href*="/ads/ig_redirect/"]),
                article:has(a[href*="/ads/about/"]),
                article:has(a[href*="facebook.com/ads/"]),
                article[data-mp-hidden-ad="true"] {
                    visibility: hidden !important;
                    height: 0 !important;
                    min-height: 0 !important;
                    max-height: 0 !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    border: none !important;
                    overflow: hidden !important;
                    overflow-anchor: none !important;
                    pointer-events: none !important;
                    opacity: 0 !important;
                }
            `;
            (document.head || document.documentElement).appendChild(styleTag);
        }

        const scanArticles = () => {
            if (!STATE.prefs?.cleanFeed) return;
            const AD_KEYWORDS = ['sponsored', 'ได้รับการสนับสนุน', 'suggested for you', 'แนะนำสำหรับคุณ'];
            const articles = document.querySelectorAll('article:not([data-mp-hidden-ad])');
            for (const article of articles) {
                const header = article.querySelector('header');
                const text = (header ? header.textContent : (article.textContent || '').slice(0, 300)).toLowerCase();
                const isAd = AD_KEYWORDS.some(kw => text.includes(kw));
                if (isAd) {
                    article.dataset.mpHiddenAd = 'true';
                }
            }
        };

        scanArticles();

        if (!cleanFeedObserver) {
            let debounceTimer = null;
            cleanFeedObserver = new MutationObserver(() => {
                if (debounceTimer) return;
                debounceTimer = setTimeout(() => {
                    debounceTimer = null;
                    scanArticles();
                }, 150);
            });
            cleanFeedObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
        }
    }

    /* ==========================================================================
       5. UI BUILDER (Mini Draggable Circle & Clean Precision Modal)
       ========================================================================== */

    function createUI() {
        const stylesheet = document.createElement('style');
        stylesheet.id = 'maxpland-styles';
        stylesheet.textContent = NATIVE_IG_CSS;
        (document.head || document.documentElement).append(stylesheet);

        // Mini Circular Floating Launcher Button
        const triggerBtn = document.createElement('button');
        triggerBtn.type = 'button';
        triggerBtn.setAttribute('aria-label', 'เปิด IG MaxPland');
        triggerBtn.id = 'maxpland-trigger-btn';
        triggerBtn.title = 'MaxPland · Alt+Shift+M (ลากย้ายได้)';
        triggerBtn.innerHTML = ICONS.LOGO;

        // Restore saved position
        try {
            const savedPos = JSON.parse(localStorage.getItem('maxpland_launcher_pos') || 'null');
            if (savedPos && typeof savedPos.x === 'number' && typeof savedPos.y === 'number') {
                const clampX = Math.min(window.innerWidth - 50, Math.max(10, savedPos.x));
                const clampY = Math.min(window.innerHeight - 50, Math.max(10, savedPos.y));
                triggerBtn.style.left = `${clampX}px`;
                triggerBtn.style.top = `${clampY}px`;
                triggerBtn.style.right = 'auto';
                triggerBtn.style.bottom = 'auto';
            }
        } catch (_) {}

        document.body.appendChild(triggerBtn);

        // Overlay & Modal Container
        const overlay = document.createElement('div');
        overlay.id = 'maxpland-studio-overlay';
        overlay.style.display = 'none';

        const modal = document.createElement('div');
        modal.id = 'maxpland-studio-modal';
        modal.style.display = 'none';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', 'IG MaxPland');

        modal.innerHTML = `
            <div class="maxpland-header">
                <div class="maxpland-brand">
                    ${ICONS.LOGO}
                    <span>MaxPland</span>
                    <span id="maxpland-account-badge" class="maxpland-user-pill">กำลังตรวจสอบบัญชี...</span>
                </div>
                <button class="maxpland-close-btn" id="maxpland-close-btn" aria-label="ปิด MaxPland">${ICONS.CLOSE}</button>
            </div>

            <nav class="maxpland-tabs" role="tablist" aria-label="เครื่องมือ MaxPland">
                <button class="maxpland-tab-btn active" data-tab="relationship">${ICONS.USERS} ผู้ติดตาม & เลิกฟอล</button>
                <button class="maxpland-tab-btn" data-tab="health">${ICONS.ANALYTICS} สุขภาพบัญชี & สถิติ</button>
                <button class="maxpland-tab-btn" data-tab="features">${ICONS.FEATURES} แผงควบคุมฟีเจอร์</button>
                <button class="maxpland-tab-btn" data-tab="settings">${ICONS.SETTINGS} การตั้งค่าระบบ</button>
                <button class="maxpland-tab-btn" data-tab="vault">${ICONS.DOWNLOAD} คลังดาวน์โหลด</button>
            </nav>

            <div class="maxpland-progress-container" id="maxpland-global-progress">
                <div class="maxpland-scan-row">
                    <span class="maxpland-scan-phase" id="maxpland-scan-phase">[1/2] เตรียมการสแกน...</span>
                    <div class="maxpland-scan-meta">
                        <span id="maxpland-scan-stat-count">บัญชี: 0</span>
                        <span id="maxpland-scan-stat-page">หน้า: 0</span>
                        <span id="maxpland-scan-stat-timer">⏱️ 00:00</span>
                        <button type="button" class="maxpland-btn-danger" id="maxpland-btn-stop-scan">${ICONS.STOP} หยุด</button>
                    </div>
                </div>
                <div class="maxpland-progress-track">
                    <div class="maxpland-progress-bar" id="maxpland-progress-fill"></div>
                </div>
                <div id="maxpland-scan-notice" class="maxpland-scan-notice"></div>
            </div>

            <div class="maxpland-body">
                <!-- TAB 1: Relationship & Unfollowers -->
                <div class="maxpland-tab-content active" id="tab-relationship">
                    <!-- Metric Cards -->
                    <div class="maxpland-stats-grid">
                        <div class="maxpland-stat-card card-not-following" data-target-filter="not_following_back">
                            <span class="maxpland-stat-label">ไม่ฟอลกลับ</span>
                            <span class="maxpland-stat-value" id="stat-not-following-back">-</span>
                            <span class="maxpland-stat-hint">เราฟอลเขา แต่เขาไม่ฟอล</span>
                        </div>
                        <div class="maxpland-stat-card card-fans" data-target-filter="fans">
                            <span class="maxpland-stat-label">แฟนคลับ</span>
                            <span class="maxpland-stat-value" id="stat-fans">-</span>
                            <span class="maxpland-stat-hint">เขาฟอลเรา แต่เราไม่ได้ฟอล</span>
                        </div>
                        <div class="maxpland-stat-card card-mutual" data-target-filter="mutual">
                            <span class="maxpland-stat-label">ฟอลกันและกัน</span>
                            <span class="maxpland-stat-value" id="stat-mutual">-</span>
                            <span class="maxpland-stat-hint">ติดตามซึ่งกันและกัน</span>
                        </div>
                        <div class="maxpland-stat-card card-lost" data-target-filter="lost">
                            <span class="maxpland-stat-label">เพิ่งเลิกฟอล</span>
                            <span class="maxpland-stat-value" id="stat-lost">-</span>
                            <span class="maxpland-stat-hint">นับจากสแกนรอบก่อนหน้า</span>
                        </div>
                        <div class="maxpland-stat-card card-ghost" data-target-filter="ghost">
                            <span class="maxpland-stat-label">👻 แอคหลุม</span>
                            <span class="maxpland-stat-value" id="stat-ghost">-</span>
                            <span class="maxpland-stat-hint">ไม่มีรูปโปรไฟล์</span>
                        </div>
                    </div>

                    <!-- Category Toolbar -->
                    <div class="maxpland-toolbar">
                        <div class="maxpland-filter-group">
                            <button class="maxpland-pill-btn active" data-filter="not_following_back">
                                ไม่ฟอลกลับ <span class="maxpland-pill-count" id="pill-count-not">-</span>
                            </button>
                            <button class="maxpland-pill-btn" data-filter="fans">
                                แฟนคลับ <span class="maxpland-pill-count" id="pill-count-fans">-</span>
                            </button>
                            <button class="maxpland-pill-btn" data-filter="mutual">
                                ฟอลทั้งคู่ <span class="maxpland-pill-count" id="pill-count-mutual">-</span>
                            </button>
                            <button class="maxpland-pill-btn" data-filter="lost">
                                เพิ่งเลิกฟอล <span class="maxpland-pill-count" id="pill-count-lost">-</span>
                            </button>
                            <button class="maxpland-pill-btn" data-filter="ghost">
                                👻 แอคหลุม <span class="maxpland-pill-count" id="pill-count-ghost">-</span>
                            </button>
                            <button class="maxpland-pill-btn" data-filter="inactive">
                                ⏱️ แอคดอง <span class="maxpland-pill-count" id="pill-count-inactive">-</span>
                            </button>
                            <button class="maxpland-pill-btn" data-filter="whitelist">
                                ⭐ Whitelist <span class="maxpland-pill-count" id="pill-count-white">-</span>
                            </button>
                        </div>
                        <div class="maxpland-search-box">
                            ${ICONS.SEARCH}
                            <input type="text" placeholder="ค้นหาชื่อบัญชีหรือชื่อเต็ม..." id="maxpland-user-search">
                        </div>
                    </div>

                    <!-- Sub-filters & Quick Toggles -->
                    <div class="maxpland-subfilters">
                        <span style="font-weight:600;color:var(--mp-text-muted);">ตัวกรอง:</span>
                        <div class="maxpland-chip-toggle" id="toggle-filter-whitelist" title="ซ่อนบัญชีที่อยู่ใน Whitelist">
                            ${ICONS.STAR} ซ่อน Whitelist
                        </div>
                        <div class="maxpland-chip-toggle" id="toggle-filter-verified" title="ซ่อนบัญชีที่มีเครื่องหมายยืนยันตัวตน">
                            ${ICONS.VERIFIED} ซ่อน Verified
                        </div>
                        <div class="maxpland-chip-toggle" id="toggle-filter-private" title="ซ่อนบัญชีที่เป็นส่วนตัว">
                            ${ICONS.LOCK} ซ่อน Private
                        </div>
                        <div class="maxpland-chip-toggle" id="toggle-filter-noavatar" title="ซ่อนบัญชีที่ไม่มีรูปโปรไฟล์">
                            ซ่อน No-Avatar
                        </div>
                        <div class="maxpland-chip-toggle" id="toggle-filter-following" title="แสดงเฉพาะบัญชีที่เรากดติดตามอยู่ (มีชื่อในรายการ Following ของเรา)">
                            ติดตามแล้ว
                        </div>
                        <div class="maxpland-chip-toggle" id="toggle-filter-notfollowing" title="แสดงเฉพาะบัญชีที่เรายังไม่ได้กดติดตาม">
                            ยังไม่ติดตาม
                        </div>
                    </div>
                    <div class="maxpland-export-actions">
                        <button class="maxpland-btn-secondary" id="maxpland-btn-copy-usernames" style="padding:4px 9px;font-size:11.5px;" title="คัดลอกรายชื่อ Username ทั้งหมดที่แสดงอยู่">
                            ${ICONS.COPY} คัดลอกชื่อ
                        </button>
                        <button class="maxpland-btn-secondary" id="maxpland-btn-export-csv" style="padding:4px 9px;font-size:11.5px;">
                            ${ICONS.DOWNLOAD} CSV
                        </button>
                        <button class="maxpland-btn-secondary" id="maxpland-btn-export-json" style="padding:4px 9px;font-size:11.5px;">
                            JSON
                        </button>
                    </div>

                    <!-- Action Bar -->
                    <div class="maxpland-toolbar" style="margin-bottom:10px;">
                        <div style="display:flex;gap:8px;align-items:center;">
                            <button class="maxpland-btn-primary" id="maxpland-btn-scan-relationships">
                                ${ICONS.USERS} เริ่มสแกนผู้ติดตาม
                            </button>
                            <button class="maxpland-btn-secondary" id="maxpland-btn-scan-inactive" title="ตรวจหาผู้ใช้ใน Following ที่ไม่มีความเคลื่อนไหวนานเกินเกณฑ์" style="padding:6px 10px;font-size:12px;">
                                ${ICONS.CLOCK} ตรวจจับแอคดอง
                            </button>
                            <div style="display:flex;gap:6px;" id="maxpland-whitelist-tools">
                                <button class="maxpland-btn-secondary" id="maxpland-btn-backup-whitelist" title="ส่งออกข้อมูล Whitelist สำรองเป็นไฟล์ JSON" style="padding:6px 10px;font-size:12px;">
                                    ${ICONS.BACKUP} สำรอง Whitelist
                                </button>
                                <button class="maxpland-btn-secondary" id="maxpland-btn-restore-whitelist" title="นำเข้าข้อมูล Whitelist จากไฟล์ JSON สำรอง" style="padding:6px 10px;font-size:12px;">
                                    ${ICONS.RESTORE} กู้คืน Whitelist
                                </button>
                                <input type="file" id="maxpland-whitelist-file-input" accept=".json" style="display:none;">
                            </div>
                        </div>
                        <span id="maxpland-scan-status-summary" style="font-size:12px;color:var(--mp-text-muted);font-variant-numeric:tabular-nums;"></span>
                    </div>

                    <!-- Floating Bulk Action Bar (Visible when users selected) -->
                    <div class="maxpland-bulk-bar" id="maxpland-bulk-bar">
                        <div class="maxpland-bulk-info">
                            <span id="maxpland-bulk-count-label">เลือกไว้ 0 คน</span>
                            <button type="button" class="maxpland-btn-secondary" id="maxpland-btn-select-all" style="padding:3px 8px;font-size:11px;">เลือกทั้งหมดในหน้านี้</button>
                            <button type="button" class="maxpland-btn-secondary" id="maxpland-btn-deselect-all" style="padding:3px 8px;font-size:11px;">ยกเลิกการเลือก</button>
                        </div>
                        <div class="maxpland-bulk-actions">
                            <button type="button" class="maxpland-btn-danger" id="maxpland-btn-batch-unfollow">
                                ${ICONS.UNFOLLOW} กดยกเลิกติดตามที่เลือก
                            </button>
                        </div>
                    </div>

                    <!-- User List -->
                    <div class="maxpland-user-list" id="maxpland-relationship-list">
                        <div style="padding: 48px; text-align: center; color: var(--mp-text-muted);">
                            กดปุ่ม <b>"เริ่มสแกนผู้ติดตาม"</b> เพื่อเปรียบเทียบ Following & Followers ของคุณ
                        </div>
                    </div>
                </div>

                <!-- TAB 2: Account Health Dashboard -->
                <div class="maxpland-tab-content" id="tab-health">
                    <div style="margin-bottom:14px;">
                        <h2 style="font-size:15px;font-weight:700;margin:0 0 4px;">สรุปสุขภาพบัญชีและสถิติ (Account Health Dashboard)</h2>
                        <p style="font-size:12px;color:var(--mp-text-muted);margin:0;">ประมวลผลสถิติและอัตราส่วนความสัมพันธ์จากฐานข้อมูล Snapshot ในเครื่อง (Zero Network Overhead)</p>
                    </div>

                    <div class="maxpland-health-hero">
                        <div class="maxpland-health-card">
                            <div class="maxpland-health-title">อัตราส่วนผู้ติดตาม (Follower Ratio)</div>
                            <div class="maxpland-health-val" id="health-ratio-val">-</div>
                            <div id="health-ratio-badge" class="maxpland-health-badge" style="background:var(--mp-cyan-bg);color:var(--mp-cyan);">กำลังรอข้อมูลสแกน</div>
                        </div>
                        <div class="maxpland-health-card">
                            <div class="maxpland-health-title">ความสัมพันธ์เหนียวแน่น (Mutual Rate)</div>
                            <div class="maxpland-health-val" id="health-mutual-val">-</div>
                            <div id="health-mutual-badge" class="maxpland-health-badge" style="background:var(--mp-emerald-bg);color:var(--mp-emerald);">สัดส่วนคนฟอลกลับ</div>
                        </div>
                        <div class="maxpland-health-card">
                            <div class="maxpland-health-title">คนไม่ฟอลกลับ (Unrequited Outbound)</div>
                            <div class="maxpland-health-val" id="health-notback-val">-</div>
                            <div id="health-notback-badge" class="maxpland-health-badge" style="background:var(--mp-rose-bg);color:var(--mp-rose);">เราฟอลแต่เขาไม่ฟอล</div>
                        </div>
                        <div class="maxpland-health-card">
                            <div class="maxpland-health-title">ความเสี่ยงแอคหลุม/ร้าง (Ghost Impact)</div>
                            <div class="maxpland-health-val" id="health-ghost-val">-</div>
                            <div id="health-ghost-badge" class="maxpland-health-badge" style="background:var(--mp-amber-bg);color:var(--mp-amber);">ไม่มีรูปโปรไฟล์</div>
                        </div>
                    </div>

                    <!-- Historical Sparkline Chart -->
                    <div class="maxpland-chart-box">
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                            <div>
                                <span style="font-size:13px;font-weight:700;">📈 แนวโน้มจำนวนผู้ติดตาม (Historical Follower Drift)</span>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">บันทึกย้อนหลังจากแต่ละรอบการสแกนใน IndexedDB</div>
                            </div>
                            <span id="health-drift-delta" style="font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;"></span>
                        </div>
                        <div id="health-chart-container" style="min-height:130px;display:grid;place-items:center;color:var(--mp-text-muted);font-size:12px;">
                            สแกนผู้ติดตามอย่างน้อย 1 ครั้งเพื่อเริ่มต้นสร้างกราฟแนวโน้ม
                        </div>
                    </div>

                    <!-- Health Advice Box -->
                    <div style="background:var(--mp-bg-card);border:1px solid var(--mp-border-card);border-radius:8px;padding:14px 16px;">
                        <span style="font-size:13px;font-weight:700;color:#38bdf8;">💡 คำแนะนำด้านสุขภาพบัญชี:</span>
                        <div id="health-advice-text" style="font-size:12px;color:var(--mp-text-secondary);margin-top:6px;line-height:1.5;">
                            เริ่มสแกนผู้ติดตามในแท็บแรกเพื่อรับการวิเคราะห์โครงสร้างบัญชีของคุณค่ะ
                        </div>
                    </div>
                </div>

                <!-- TAB 3: Features Control Panel (Switches) -->
                <div class="maxpland-tab-content" id="tab-features">
                    <div style="margin-bottom:16px;">
                        <h2 style="font-size:15px;font-weight:700;margin:0 0 4px;">แผงควบคุมฟีเจอร์ (Feature Controller)</h2>
                        <p style="font-size:12px;color:var(--mp-text-muted);margin:0;">เปิดหรือปิดการทำงานของแต่ละระบบได้ตามต้องการ การเปลี่ยนแปลงมีผลทันที</p>
                    </div>

                    <div class="maxpland-feature-card">
                        <div class="maxpland-feature-info">
                            <div class="maxpland-feature-title">
                                ${ICONS.EYE} โหมดแอบส่อง Story เนียน (Stealth Story Viewer)
                                <span class="maxpland-badge-emerald">แนะนำ</span>
                            </div>
                            <div class="maxpland-feature-desc">
                                ดักสกัดกั้นคำขอ Seen ไปยังเซิร์ฟเวอร์ Instagram 100% ทำให้คุณสามารถเปิดดูสตอรี่ของใครก็ได้โดยที่ชื่อบัญชีของคุณจะไม่ไปปรากฏในรายชื่อผู้เข้าชมของเขา
                            </div>
                        </div>
                        <label class="maxpland-switch" title="เปิด/ปิดโหมดส่องเนียน">
                            <input type="checkbox" id="pref-switch-stealth-story">
                            <span class="maxpland-slider"></span>
                        </label>
                    </div>

                    <div class="maxpland-feature-card">
                        <div class="maxpland-feature-info">
                            <div class="maxpland-feature-title">
                                ${ICONS.SHIELD} โหมดฟีดสะอาด (Clean Feed Mode)
                            </div>
                            <div class="maxpland-feature-desc">
                                ซ่อนโพสต์โฆษณา "ได้รับการสนับสนุน (Sponsored)" และ "แนะนำสำหรับคุณ (Suggested Posts)" บนหน้าฟีดหลักโดยอัตโนมัติ เพื่อให้เห็นเฉพาะโพสต์จากผู้ที่คุณติดตามจริง ๆ
                            </div>
                        </div>
                        <label class="maxpland-switch" title="เปิด/ปิดโหมดฟีดสะอาด">
                            <input type="checkbox" id="pref-switch-clean-feed">
                            <span class="maxpland-slider"></span>
                        </label>
                    </div>

                    <div class="maxpland-feature-card">
                        <div class="maxpland-feature-info">
                            <div class="maxpland-feature-title">
                                ${ICONS.DOWNLOAD} ปุ่มดาวน์โหลดมีเดียบนหน้าฟีด (In-Feed Download)
                            </div>
                            <div class="maxpland-feature-desc">
                                แสดงปุ่มดาวน์โหลดรูปภาพ วิดีโอ และอัลบั้ม Carousel ความละเอียดสูงสุดข้างปุ่มบันทึกในทุกโพสต์บนหน้าฟีด
                            </div>
                        </div>
                        <label class="maxpland-switch" title="เปิด/ปิดปุ่มดาวน์โหลดบนฟีด">
                            <input type="checkbox" id="pref-switch-feed-download">
                            <span class="maxpland-slider"></span>
                        </label>
                    </div>

                    <div class="maxpland-feature-card">
                        <div class="maxpland-feature-info">
                            <div class="maxpland-feature-title">
                                ${ICONS.THUMBNAIL} แถบเครื่องมือดาวน์โหลดสตอรี่ (Story Toolbar)
                            </div>
                            <div class="maxpland-feature-desc">
                                แสดงแถบเครื่องมือลอยที่มุมบนขวาของหน้าสตอรี่สำหรับดาวน์โหลดวิดีโอสตอรี่, ภาพปก, และเปิดแท็บใหม่
                            </div>
                        </div>
                        <label class="maxpland-switch" title="เปิด/ปิดแถบเครื่องมือสตอรี่">
                            <input type="checkbox" id="pref-switch-story-toolbar">
                            <span class="maxpland-slider"></span>
                        </label>
                    </div>
                </div>

                <!-- TAB 4: Settings & Configuration -->
                <div class="maxpland-tab-content" id="tab-settings">
                    <div style="margin-bottom:16px;">
                        <h2 style="font-size:15px;font-weight:700;margin:0 0 4px;">การตั้งค่าและระบบความปลอดภัย (Settings & Safety)</h2>
                        <p style="font-size:12px;color:var(--mp-text-muted);margin:0;">ปรับแต่งเกณฑ์ตรวจวัด พารามิเตอร์ความปลอดภัย และจัดการข้อมูลสำรอง</p>
                    </div>

                    <div class="maxpland-settings-group">
                        <h3 class="maxpland-settings-group-title">${ICONS.CLOCK} เกณฑ์ตรวจจับแอคเคาท์ดอง (Inactive Following Radar)</h3>
                        <div class="maxpland-settings-row">
                            <div>
                                <div style="font-weight:600;font-size:13px;">ระยะเวลาที่ถือว่าดอง/เลิกเล่น</div>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">นับจากวันเวลาของโพสต์ล่าสุดที่ผู้ใช้ลงในบัญชี</div>
                            </div>
                            <select id="pref-setting-inactive-threshold" class="maxpland-select">
                                <option value="90">90 วัน (3 เดือน)</option>
                                <option value="180">180 วัน (6 เดือน - แนะนำ)</option>
                                <option value="365">365 วัน (1 ปี)</option>
                            </select>
                        </div>
                    </div>

                    <div class="maxpland-settings-group">
                        <h3 class="maxpland-settings-group-title">🛡️ ความปลอดภัยและการหน่วงเวลา (Anti-Detection Guard)</h3>
                        <div class="maxpland-settings-row">
                            <div>
                                <div style="font-weight:600;font-size:13px;">หน่วงเวลาการยกเลิกติดตาม (Unfollow Jitter Delay)</div>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">สุ่มช่วงเวลาหน่วงระหว่างคำขอ เพื่อเลียนแบบพฤติกรรมมนุษย์และป้องกัน Rate Limit</div>
                            </div>
                            <span style="font-size:12px;font-weight:600;color:var(--mp-emerald);">${APP_CONFIG.UNFOLLOW_DELAY_MIN.toLocaleString()} - ${APP_CONFIG.UNFOLLOW_DELAY_MAX.toLocaleString()} ms (สุ่มอัตโนมัติ)</span>
                        </div>
                        <div class="maxpland-settings-row">
                            <div>
                                <div style="font-weight:600;font-size:13px;">ความเร็วการสแกน (Scan Speed)</div>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">A ทยอยทีละรายการ · B ดึง 2 ฝั่งพร้อมกัน (~2 เท่า) · C เร็วสุด แต่ลดเว้นจังหวะระหว่างหน้า เสี่ยงถูกจำกัด (429) มากขึ้น</div>
                            </div>
                            <select id="pref-setting-scan-speed" class="maxpland-select" aria-label="ความเร็วการสแกน" title="A: ปกติ (ทยอยทีละรายการ) · B: เร็วขึ้น ~2 เท่า (ดึง 2 ฝั่งพร้อมกัน) · C: เร็วสุด (ลดเว้นจังหวะระหว่างหน้า เสี่ยงถูกจำกัดมากขึ้น)">
                                <option value="A" selected>A — ปกติ</option>
                                <option value="B">B — เร็ว ~2x</option>
                                <option value="C">C — เร็วสุด ~4x (เสี่ยงสูง)</option>
                            </select>
                        </div>
                        <div class="maxpland-settings-row">
                            <div>
                                <div style="font-weight:600;font-size:13px;">ขีดจำกัดหน้าสแกน Following / Followers</div>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">จำกัดหน้าสูงสุดต่อรอบเพื่อป้องกันเซสชันการเชื่อมต่อสะดุด</div>
                            </div>
                            <span style="font-size:12px;font-weight:600;color:var(--mp-blue);">60 หน้า (3,000 คน) / 250 หน้า (12,500 คน)</span>
                        </div>
                    </div>

                    <div class="maxpland-settings-group">
                        <h3 class="maxpland-settings-group-title">💾 การจัดการข้อมูลสำรองและแคช (Data Vault)</h3>
                        <div class="maxpland-settings-row">
                            <div>
                                <div style="font-weight:600;font-size:13px;">สำรองและกู้คืน Whitelist</div>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">ส่งออกหรือนำเข้ารายชื่อบัญชีที่ได้รับการปกป้อง (JSON)</div>
                            </div>
                            <div style="display:flex;gap:6px;">
                                <button type="button" class="maxpland-btn-secondary" id="setting-btn-backup-whitelist" style="padding:5px 10px;font-size:12px;">${ICONS.BACKUP} สำรอง Whitelist</button>
                                <button type="button" class="maxpland-btn-secondary" id="setting-btn-restore-whitelist" style="padding:5px 10px;font-size:12px;">${ICONS.RESTORE} กู้คืน Whitelist</button>
                            </div>
                        </div>
                        <div class="maxpland-settings-row">
                            <div>
                                <div style="font-weight:600;font-size:13px;">แคชข้อมูลความเคลื่อนไหว (Activity Cache)</div>
                                <div style="font-size:11.5px;color:var(--mp-text-muted);">ล้างข้อมูลวันที่โพสต์ล่าสุดที่บันทึกไว้ใน IndexedDB เพื่อบังคับสแกนใหม่ทั้งหมด</div>
                            </div>
                            <button type="button" class="maxpland-btn-danger" id="setting-btn-clear-cache" style="padding:5px 10px;font-size:12px;">ล้างแคช Radar</button>
                        </div>
                    </div>
                </div>

                <!-- TAB 5: Media Vault -->
                <div class="maxpland-tab-content" id="tab-vault">
                    <div style="margin-bottom:12px;">
                        <h2 style="font-size:15px;font-weight:700;margin:0 0 4px;">คลังดาวน์โหลดมีเดีย (Direct Media Downloader)</h2>
                        <p style="font-size:12px;color:var(--mp-text-muted);margin:0;">วางลิงก์โพสต์/Reel แล้วเลือกดาวน์โหลดไฟล์ความละเอียดสูงสุด หรือดูประวัติไฟล์ที่เคยโหลด</p>
                    </div>

                    <textarea id="maxpland-media-queue-input" placeholder="วางลิงก์โพสต์หรือ Reels ทีละบรรทัด เช่น&#10;https://www.instagram.com/p/ABC123xyz/&#10;https://www.instagram.com/reel/XYZ789abc/" style="width:100%;min-height:100px;resize:vertical;background:var(--mp-bg-panel);border:1px solid var(--mp-border-card);color:var(--mp-text-primary);border-radius:6px;padding:10px;font-family:ui-monospace,monospace;font-size:12px;"></textarea>
                    
                    <div class="maxpland-toolbar" style="margin-top:10px;">
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <button class="maxpland-btn-primary" id="maxpland-btn-run-media-queue">${ICONS.DOWNLOAD} ดาวน์โหลดรายการใหม่</button>
                            <button class="maxpland-btn-secondary" id="maxpland-btn-run-media-all">ดาวน์โหลดทั้งหมดซ้ำ</button>
                            <button class="maxpland-btn-secondary" id="maxpland-btn-refresh-vault">รีเฟรชประวัติ</button>
                        </div>
                        <span id="maxpland-media-queue-status" style="font-size:12px;color:var(--mp-text-secondary);font-variant-numeric:tabular-nums;"></span>
                    </div>
                    <div class="maxpland-user-list" id="maxpland-vault-list">
                        <div style="padding:48px;text-align:center;color:var(--mp-text-muted);">ยังไม่มีประวัติดาวน์โหลด</div>
                    </div>
                </div>

                <!-- Toast Element -->
                <div class="maxpland-toast" id="maxpland-toast">ข้อความแจ้งเตือน</div>
            </div>

            <div class="maxpland-footer">
                <span>MaxPland v3.0.0 · Clean Minimal Precision (Anti-Slop)</span>
                <span>Toggle <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd></span>
            </div>
        `;

        document.body.appendChild(overlay);
        document.body.appendChild(modal);

        bindUIEvents(triggerBtn, overlay, modal);
    }

    function showToast(message, duration = 2500) {
        const toast = document.getElementById('maxpland-toast');
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), duration);
    }

    /* ==========================================================================
       6. UI EVENTS & MODULE HANDLERS
       ========================================================================== */

    function bindUIEvents(triggerBtn, overlay, modal) {
        const openModal = async () => {
            overlay.style.display = 'block';
            modal.style.display = 'grid';
            triggerBtn.style.visibility = 'hidden';
            document.getElementById('maxpland-close-btn').focus();

            // Resolve and show active account
            const user = await IgBridge.resolveCurrentUser();
            const badge = document.getElementById('maxpland-account-badge');
            if (user && user.username) {
                badge.textContent = `@${user.username}`;
                STATE.currentUser = user;
            } else if (user && user.id) {
                badge.textContent = `UID: ${user.id}`;
                STATE.currentUser = user;
            } else {
                badge.textContent = 'ไม่พบบัญชี (กรุณาล็อกอิน IG)';
            }

            syncFeaturesTab();
            syncSettingsTab();
            if (STATE.activeTab === 'health') renderHealthDashboard();
        };

        const closeModal = () => {
            if (STATE.isScanning || STATE.isUnfollowing || STATE.isScanningInactive) {
                if (!confirm('มีกระบวนการทำงานค้างอยู่ ต้องการปิดหน้าต่างใช่หรือไม่?')) return;
            }
            overlay.style.display = 'none';
            modal.style.display = 'none';
            triggerBtn.style.visibility = 'visible';
            triggerBtn.focus();
        };

        // Expose open/close functions globally for feed buttons & commands
        window.openMaxPlandStudio = openModal;
        window.closeMaxPlandStudio = closeModal;

        // DRAGGABLE LOGIC FOR LAUNCHER BUTTON
        let isPointerDown = false;
        let isDragging = false;
        let startX = 0, startY = 0;
        let startLeft = 0, startTop = 0;

        triggerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isDragging) {
                openModal();
            }
        });

        triggerBtn.addEventListener('pointerdown', (e) => {
            isPointerDown = true;
            isDragging = false;
            startX = e.clientX;
            startY = e.clientY;
            const rect = triggerBtn.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            triggerBtn.setPointerCapture(e.pointerId);
        });

        triggerBtn.addEventListener('pointermove', (e) => {
            if (!isPointerDown) return;
            const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
            if (dist > 4) {
                isDragging = true;
                const newLeft = Math.min(window.innerWidth - 48, Math.max(8, startLeft + (e.clientX - startX)));
                const newTop = Math.min(window.innerHeight - 48, Math.max(8, startTop + (e.clientY - startY)));
                triggerBtn.style.left = `${newLeft}px`;
                triggerBtn.style.top = `${newTop}px`;
                triggerBtn.style.right = 'auto';
                triggerBtn.style.bottom = 'auto';
            }
        });

        const handlePointerEnd = (e) => {
            if (!isPointerDown) return;
            isPointerDown = false;
            try { triggerBtn.releasePointerCapture(e.pointerId); } catch (_) {}
            if (isDragging) {
                const rect = triggerBtn.getBoundingClientRect();
                localStorage.setItem('maxpland_launcher_pos', JSON.stringify({ x: Math.round(rect.left), y: Math.round(rect.top) }));
            } else {
                openModal();
            }
        };

        triggerBtn.addEventListener('pointerup', handlePointerEnd);
        triggerBtn.addEventListener('pointercancel', handlePointerEnd);

        modal.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
        });

        document.addEventListener('keydown', e => {
            if (e.altKey && e.shiftKey && e.code === 'KeyM' && !e.repeat) {
                e.preventDefault();
                if (modal.style.display === 'none') openModal(); else closeModal();
            }
        });
        overlay.addEventListener('click', closeModal);
        document.getElementById('maxpland-close-btn').addEventListener('click', closeModal);

        // Tab Switching
        const tabs = modal.querySelectorAll('.maxpland-tab-btn');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
                modal.querySelectorAll('.maxpland-tab-content').forEach(c => c.classList.remove('active'));

                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');
                const target = document.getElementById(`tab-${tab.dataset.tab}`);
                if (target) target.classList.add('active');
                STATE.activeTab = tab.dataset.tab;
                if (tab.dataset.tab === 'vault') renderMediaVault();
                if (tab.dataset.tab === 'health') renderHealthDashboard();
                if (tab.dataset.tab === 'features') syncFeaturesTab();
                if (tab.dataset.tab === 'settings') syncSettingsTab();
            });
        });

        // Filter Switching (Pills)
        const filterBtns = document.getElementById('tab-relationship').querySelectorAll('.maxpland-pill-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                STATE.relationshipFilter = btn.dataset.filter;
                STATE.selectedIds.clear();
                updateBulkActionBar();
                renderRelationshipList();
            });
        });

        // Stat Card Quick Clicks
        modal.querySelectorAll('.maxpland-stat-card').forEach(card => {
            card.addEventListener('click', () => {
                const target = card.dataset.targetFilter;
                const pill = modal.querySelector(`.maxpland-pill-btn[data-filter="${target}"]`);
                if (pill) pill.click();
            });
        });

        // Sub-filter Chips Toggles
        const toggleWhitelist = document.getElementById('toggle-filter-whitelist');
        toggleWhitelist.addEventListener('click', () => {
            STATE.subFilters.excludeWhitelist = !STATE.subFilters.excludeWhitelist;
            toggleWhitelist.classList.toggle('active', STATE.subFilters.excludeWhitelist);
            renderRelationshipList();
        });

        const toggleVerified = document.getElementById('toggle-filter-verified');
        toggleVerified.addEventListener('click', () => {
            STATE.subFilters.excludeVerified = !STATE.subFilters.excludeVerified;
            toggleVerified.classList.toggle('active', STATE.subFilters.excludeVerified);
            renderRelationshipList();
        });

        const togglePrivate = document.getElementById('toggle-filter-private');
        togglePrivate.addEventListener('click', () => {
            STATE.subFilters.excludePrivate = !STATE.subFilters.excludePrivate;
            togglePrivate.classList.toggle('active', STATE.subFilters.excludePrivate);
            renderRelationshipList();
        });

        const toggleNoAvatar = document.getElementById('toggle-filter-noavatar');
        toggleNoAvatar.addEventListener('click', () => {
            STATE.subFilters.excludeNoAvatar = !STATE.subFilters.excludeNoAvatar;
            toggleNoAvatar.classList.toggle('active', STATE.subFilters.excludeNoAvatar);
            renderRelationshipList();
        });

        document.getElementById('toggle-filter-following').addEventListener('click', () => setFollowStateChip('onlyFollowing'));

        document.getElementById('toggle-filter-notfollowing').addEventListener('click', () => setFollowStateChip('onlyNotFollowed'));

        // Search Input
        document.getElementById('maxpland-user-search').addEventListener('input', (e) => {
            STATE.searchQuery = e.target.value.trim().toLowerCase();
            renderRelationshipList();
        });

        // Scan Actions
        document.getElementById('maxpland-btn-scan-relationships').addEventListener('click', runRelationshipScan);
        document.getElementById('maxpland-btn-stop-scan').addEventListener('click', () => {
            STATE.stopScanFlag = true;
            STATE.scanController?.abort();
            STATE.stopInactiveScanFlag = true;
            STATE.inactiveController?.abort();
            STATE.stopUnfollowFlag = true;
            document.getElementById('maxpland-scan-phase').textContent = 'กำลังหยุดการทำงานตามคำสั่ง...';
        });

        // Whitelist Backup & Restore
        document.getElementById('maxpland-btn-backup-whitelist').addEventListener('click', exportWhitelistBackup);
        const restoreInput = document.getElementById('maxpland-whitelist-file-input');
        document.getElementById('maxpland-btn-restore-whitelist').addEventListener('click', () => restoreInput.click());
        restoreInput.addEventListener('change', handleWhitelistRestoreFile);

        // Bulk Selection Actions
        document.getElementById('maxpland-btn-select-all').addEventListener('click', selectAllVisible);
        document.getElementById('maxpland-btn-deselect-all').addEventListener('click', () => {
            STATE.selectedIds.clear();
            updateBulkActionBar();
            renderRelationshipList();
        });
        document.getElementById('maxpland-btn-batch-unfollow').addEventListener('click', runBatchUnfollow);

        // Export Actions
        document.getElementById('maxpland-btn-copy-usernames').addEventListener('click', copyVisibleUsernames);
        document.getElementById('maxpland-btn-export-csv').addEventListener('click', exportRelationshipCSV);
        document.getElementById('maxpland-btn-export-json').addEventListener('click', exportRelationshipJSON);

        // Media Downloader Actions
        document.getElementById('maxpland-btn-run-media-queue').addEventListener('click', () => runMediaQueue({ skipExisting: true }));
        document.getElementById('maxpland-btn-run-media-all').addEventListener('click', () => runMediaQueue({ skipExisting: false }));
        document.getElementById('maxpland-btn-refresh-vault').addEventListener('click', renderMediaVault);

        // Feature Switches (Master Toggles)
        const swStealth = document.getElementById('pref-switch-stealth-story');
        if (swStealth) {
            swStealth.addEventListener('change', (e) => {
                STATE.prefs.stealthStory = e.target.checked;
                savePrefs(STATE.prefs);
                showToast(e.target.checked ? 'เปิดโหมดส่องเนียน (ไม่ขึ้น Seen) แล้วค่ะ' : 'ปิดโหมดส่องเนียน');
            });
        }
        const swCleanFeed = document.getElementById('pref-switch-clean-feed');
        if (swCleanFeed) {
            swCleanFeed.addEventListener('change', (e) => {
                STATE.prefs.cleanFeed = e.target.checked;
                savePrefs(STATE.prefs);
                applyCleanFeedMode();
                showToast(e.target.checked ? 'เปิดโหมดฟีดสะอาด ซ่อนโฆษณาแล้วค่ะ' : 'ปิดโหมดฟีดสะอาด');
            });
        }
        const swFeedDl = document.getElementById('pref-switch-feed-download');
        if (swFeedDl) {
            swFeedDl.addEventListener('change', (e) => {
                STATE.prefs.quickDownloadFeed = e.target.checked;
                savePrefs(STATE.prefs);
                showToast(e.target.checked ? 'เปิดปุ่มดาวน์โหลดบนฟีดแล้วค่ะ' : 'ปิดปุ่มดาวน์โหลดบนฟีด');
            });
        }
        const swStoryTb = document.getElementById('pref-switch-story-toolbar');
        if (swStoryTb) {
            swStoryTb.addEventListener('change', (e) => {
                STATE.prefs.quickDownloadStory = e.target.checked;
                savePrefs(STATE.prefs);
                if (!e.target.checked) {
                    const bar = document.getElementById('maxpland-story-bar');
                    if (bar) bar.remove();
                }
                showToast(e.target.checked ? 'เปิดแถบเครื่องมือสตอรี่แล้วค่ะ' : 'ปิดแถบเครื่องมือสตอรี่');
            });
        }

        // Settings Threshold & Actions
        const selInactive = document.getElementById('pref-setting-inactive-threshold');
        if (selInactive) {
            selInactive.addEventListener('change', (e) => {
                STATE.prefs.inactiveThresholdDays = Number(e.target.value);
                savePrefs(STATE.prefs);
                showToast(`ตั้งเกณฑ์แอคดองเป็น ${e.target.value} วันแล้วค่ะ`);
            });
        }
        const selSpeed = document.getElementById('pref-setting-scan-speed');
        if (selSpeed) {
            selSpeed.addEventListener('change', (e) => {
                STATE.prefs.scanSpeed = e.target.value;
                savePrefs(STATE.prefs);
                showToast(`ตั้งความเร็วการสแกนเป็นโหมด ${e.target.value} แล้วค่ะ`);
            });
        }
        const btnSettingBackup = document.getElementById('setting-btn-backup-whitelist');
        if (btnSettingBackup) btnSettingBackup.addEventListener('click', exportWhitelistBackup);
        const btnSettingRestore = document.getElementById('setting-btn-restore-whitelist');
        if (btnSettingRestore) btnSettingRestore.addEventListener('click', () => restoreInput.click());
        const btnClearCache = document.getElementById('setting-btn-clear-cache');
        if (btnClearCache) {
            btnClearCache.addEventListener('click', async () => {
                if (confirm('คุณต้องการล้างข้อมูลแคชความเคลื่อนไหวทั้งหมดใช่หรือไม่?')) {
                    await MaxPlandVault.clearActivityCache();
                    STATE.inactiveFollowing = [];
                    const countEl = document.getElementById('pill-count-inactive');
                    if (countEl) countEl.textContent = '-';
                    showToast('ล้างแคช Radar เรียบร้อยแล้วค่ะ');
                }
            });
        }

        // Inactive Radar Scan Trigger
        const btnScanInactive = document.getElementById('maxpland-btn-scan-inactive');
        if (btnScanInactive) btnScanInactive.addEventListener('click', runInactiveScan);

        // ponytail: Native Event Delegation for Relationship List (Zero Memory Leaks & 60fps Search)
        const relList = document.getElementById('maxpland-relationship-list');
        if (relList) {
            relList.addEventListener('change', (e) => {
                const box = e.target.closest('.user-select-checkbox');
                if (!box) return;
                const uid = box.dataset.id;
                if (box.checked) STATE.selectedIds.add(uid);
                else STATE.selectedIds.delete(uid);
                updateBulkActionBar();
            });

            relList.addEventListener('click', async (e) => {
                // 1. Star Toggle
                const star = e.target.closest('.maxpland-star-btn');
                if (star && !star.disabled) {
                    const uid = star.dataset.id;
                    const pool = getFilteredUsers();
                    const user = pool.find(u => String(u.id || u.pk || u.pk_id) === uid) || STATE.whitelist.get(uid);
                    if (user) {
                        star.disabled = true;
                        try {
                            const added = await MaxPlandVault.toggleWhitelist(user);
                            STATE.whitelist = await MaxPlandVault.getWhitelist();
                            const whiteCountEl = document.getElementById('pill-count-white');
                            if (whiteCountEl) whiteCountEl.textContent = STATE.whitelist.size.toLocaleString();
                            if (added) STATE.selectedIds.delete(uid);
                            showToast(added ? `เพิ่ม @${user.username} ใน Whitelist แล้ว` : `ลบ @${user.username} ออกจาก Whitelist แล้ว`);
                            updateBulkActionBar();
                            renderRelationshipList();
                        } catch (err) { alert(err.message || String(err)); }
                        finally { star.disabled = false; }
                    }
                    return;
                }

                // 2. Single Unfollow
                const btn = e.target.closest('.maxpland-row-unfollow-btn');
                if (btn && !btn.disabled) {
                    if (STATE.isScanning || STATE.isUnfollowing || STATE.isScanningInactive || STATE.scanIncomplete) return;
                    const uid = btn.dataset.id;
                    const uname = btn.dataset.user;
                    if (!confirm(`ยืนยันการเลิกติดตาม (Unfollow) @${uname} หรือไม่?`)) return;

                    STATE.isUnfollowing = true;
                    btn.disabled = true;
                    btn.textContent = 'กำลังดำเนินการ...';
                    try {
                        await IgBridge.unfollowUser(uid);
                        showToast(`เลิกติดตาม @${uname} เรียบร้อยแล้ว`);
                        applyUnfollowResult(uid, uname);
                        STATE.selectedIds.delete(uid);
                        const notBackEl = document.getElementById('stat-not-following-back');
                        if (notBackEl) notBackEl.textContent = STATE.notFollowingBack.length.toLocaleString();
                        const pillNotEl = document.getElementById('pill-count-not');
                        if (pillNotEl) pillNotEl.textContent = STATE.notFollowingBack.length.toLocaleString();
                        updateBulkActionBar();
                        renderRelationshipList();
                    } catch (err) {
                        alert(`เลิกติดตามล้มเหลว: ${err.message || err}`);
                        btn.disabled = false;
                        btn.innerHTML = `${ICONS.UNFOLLOW} เลิกติดตาม`;
                    } finally {
                        STATE.isUnfollowing = false;
                    }
                    return;
                }
            });
        }
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[ch]);
    }

    function csvCell(value) {
        let s = String(value ?? '');
        if (/^[\s\x00-\x1f]*[=+\-@]/.test(s)) s = "'" + s;
        return `"${s.replace(/"/g, '""')}"`;
    }

    function isProtectedUser(uid, username = '') {
        const id = String(uid);
        const name = String(username || '').toLowerCase();
        if (!name) return STATE.whitelist.has(id);
        if (STATE.whitelistByNameRef !== STATE.whitelist) { // rebuild once per whitelist instance, not per row
            STATE.whitelistByNameRef = STATE.whitelist;
            STATE.whitelistByName = new Map([...STATE.whitelist.values()]
                .filter(w => w.username)
                .map(w => [String(w.username).toLowerCase(), w]));
        }
        return STATE.whitelistByName.has(name) || STATE.whitelist.has(id);
    }

    function hasNoAvatar(user) {
        if (!user.profile_pic_url) return true;
        if (user.has_anonymous_profile_picture === true) return true;
        return APP_CONFIG.DEFAULT_AVATAR_PATTERNS.some(p => user.profile_pic_url.includes(p));
    }

    function extractShortcodesFromText(text) {
        const raw = String(text || '');
        const codes = new Set();
        const urlRx = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/gi;
        let match;
        while ((match = urlRx.exec(raw))) codes.add(match[1]);
        raw.split(/\r?\n/).forEach(line => {
            const clean = line.trim().replace(/^["']+|["']+$/g, '');
            if (/^[A-Za-z0-9_-]{5,}$/.test(clean)) codes.add(clean);
        });
        return [...codes];
    }

    function shortcodeFromArticle(article) {
        const links = [...article.querySelectorAll('a[href*="/p/"],a[href*="/reel/"],a[href*="/tv/"]')];
        for (const a of links) {
            const m = (a.href || a.getAttribute('href') || '').match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
            if (m) return m[1];
        }
        const m = location.href.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
        return m ? m[1] : null;
    }

    function safeFilename(value) {
        return String(value || 'instagram')
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .slice(0, 150);
    }

    function extensionFromUrl(url, fallback) {
        try {
            const ext = new URL(url).pathname.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
            if (ext && ['jpg','jpeg','png','webp','mp4','m4a','mp3','aac','webm'].includes(ext)) return ext;
        } catch (_) {}
        return fallback;
    }

    function gmDownload(url, name) {
        return new Promise((resolve, reject) => {
            GM_download({
                url,
                name,
                saveAs: false,
                timeout: 120000,
                ontimeout: () => reject(new Error('Download timed out')),
                onabort: () => reject(new Error('Download aborted')),
                onload: () => resolve(name),
                onerror: err => reject(err)
            });
        });
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        return filename;
    }

    /* ==========================================================================
       7. RELATIONSHIP SCANNER LOGIC
       ========================================================================== */

    async function runRelationshipScan() {
        if (STATE.isScanning || STATE.isUnfollowing || STATE.isScanningInactive) return;
        if (STATE.prefs?.scanSpeed === 'C'
            && !confirm('⚠️ โหมด C ลดเว้นจังหวะระหว่างหน้าเหลือ 0.5–1 วินาที\nเสี่ยงถูก Instagram จำกัดชั่วคราว (429) มากขึ้น\nยืนยันจะเริ่มสแกนความเร็วสูงหรือไม่?')) return;
        STATE.isScanning = true;
        STATE.stopScanFlag = false;
        STATE.scanController = new AbortController();
        STATE.scanStartTime = Date.now();
        clearTimeout(STATE.progressHideTimer);
        const el = id => document.getElementById(id);
        const btn = el('maxpland-btn-scan-relationships');
        const progress = el('maxpland-global-progress');
        const phase = el('maxpland-scan-phase');
        const notice = el('maxpland-scan-notice');
        const summary = el('maxpland-scan-status-summary');
        STATE.scanIncomplete = true;
        for (const key of ['followers','following','notFollowingBack','fans','mutual','lostFollowers','ghostFollowers']) STATE[key] = [];
        STATE.selectedIds.clear();
        updateBulkActionBar();
        for (const id of ['stat-not-following-back','stat-fans','stat-mutual','stat-lost','stat-ghost','pill-count-not','pill-count-fans','pill-count-mutual','pill-count-lost','pill-count-ghost']) {
            if (el(id)) el(id).textContent = '-';
        }
        renderRelationshipList();
        const timer = setInterval(() => { el('maxpland-scan-stat-timer').textContent = `⏱️ ${formatTime(Math.floor((Date.now() - STATE.scanStartTime) / 1000))}`; }, 1000);
        try {
            btn.disabled = true;
            progress.style.display = 'block';
            phase.textContent = 'กำลังยืนยันบัญชี...';
            notice.style.display = 'none';
            summary.textContent = '';
            el('maxpland-progress-fill').style.width = '0%';
            el('maxpland-scan-stat-count').textContent = 'บัญชี: 0';
            el('maxpland-scan-stat-page').textContent = 'หน้า: 0';
            el('maxpland-scan-stat-timer').textContent = '⏱️ 00:00';
            const currentUser = await IgBridge.resolveCurrentUser();
            IgBridge.assertAccount(currentUser.id);
            STATE.currentUser = currentUser;
            STATE.relationshipAccountId = currentUser.id;
            el('maxpland-account-badge').textContent = currentUser.username ? `@${currentUser.username}` : `UID: ${currentUser.id}`;
            const lists = {};
            const speedMode = ['B', 'C'].includes(STATE.prefs?.scanSpeed) ? STATE.prefs.scanSpeed : 'A';
            const startList = endpoint => {
                if (STATE.stopScanFlag) throw new DOMException('หยุดการสแกนแล้ว', 'AbortError');
                phase.textContent = endpoint === 'followers' ? 'กำลังดึง Followers...' : 'กำลังดึง Following...';
                return IgBridge.fetchAllRelationships(endpoint, currentUser.id,
                    endpoint === 'followers' ? APP_CONFIG.FOLLOWERS_PAGE_SAFETY_LIMIT : APP_CONFIG.FOLLOWING_PAGE_SAFETY_LIMIT,
                    (count, page, message) => {
                        el('maxpland-scan-stat-count').textContent = `${endpoint}: ${count.toLocaleString()}`;
                        el('maxpland-scan-stat-page').textContent = `หน้า: ${page}`;
                        el('maxpland-progress-fill').style.width = `${Math.min(95, Math.min(45, page * 3) + (lists.followers ? 45 : 0) + (lists.following ? 45 : 0))}%`;
                        if (message) { notice.textContent = message; notice.style.display = 'block'; }
                    }, speedMode);
            };
            const finishList = (endpoint, result) => {
                if (STATE.stopScanFlag) throw new DOMException('หยุดการสแกนแล้ว', 'AbortError');
                if (!result.completed) throw result.lastError || new Error(`ดึง ${endpoint} ไม่ครบ`);
                lists[endpoint] = result;
            };
            if (speedMode === 'A') {
                for (const endpoint of ['followers', 'following']) {
                    finishList(endpoint, await startList(endpoint));
                }
            } else {
                // B/C: the only two list endpoints run concurrently. fetchAllRelationships
                // resolves (never rejects), so a failure is a non-completed result: race a
                // first-failure watcher, abort the sibling, drain, then surface the error.
                const stagePromises = [startList('followers'), startList('following')];
                try {
                    const firstFailure = Promise.race(stagePromises.map(p => p.then(r => {
                        if (!r.completed) throw r.lastError || new Error('ดึงข้อมูลไม่ครบ');
                        return null;
                    })));
                    await Promise.race([Promise.all(stagePromises), firstFailure]);
                    const results = await Promise.all(stagePromises);
                    finishList('followers', results[0]);
                    finishList('following', results[1]);
                } catch (err) {
                    STATE.scanController?.abort();
                    await Promise.allSettled(stagePromises);
                    throw err;
                }
            }
            const { followers, following } = lists;
            const getUid = u => String(u?.id || u?.pk_id || u?.pk || '').trim();
            const getUname = u => String(u?.username || '').trim().toLowerCase();

            const followerIdSet = new Set();
            const followerUsernameSet = new Set();
            for (const u of followers) {
                const uid = getUid(u);
                const uname = getUname(u);
                if (uid) followerIdSet.add(uid);
                if (uname) followerUsernameSet.add(uname);
            }

            const followingIdSet = new Set();
            const followingUsernameSet = new Set();
            for (const u of following) {
                const uid = getUid(u);
                const uname = getUname(u);
                if (uid) followingIdSet.add(uid);
                if (uname) followingUsernameSet.add(uname);
            }

            const isFollower = u => {
                if (u?.friendship_status?.followed_by === true) return true;
                const uid = getUid(u);
                const uname = getUname(u);
                return (Boolean(uid) && followerIdSet.has(uid)) || (Boolean(uname) && followerUsernameSet.has(uname));
            };

            const isFollowing = u => {
                if (u?.friendship_status?.following === true) return true;
                const uid = getUid(u);
                const uname = getUname(u);
                return (Boolean(uid) && followingIdSet.has(uid)) || (Boolean(uname) && followingUsernameSet.has(uname));
            };

            const prev = await MaxPlandVault.getLatestSnapshot(currentUser.id);
                        const whitelist = await MaxPlandVault.getWhitelist();
                        IgBridge.assertAccount(currentUser.id);
                        if (STATE.stopScanFlag) throw new DOMException('หยุดการสแกนแล้ว', 'AbortError');
                        // Migration: pre-v6 snapshots lack follower_usernames — fallback to placeholder (P0 fix)
                        const lostFollowers = (prev?.follower_ids || []).filter(id => !followerIdSet.has(String(id))).map(id => {
                            const uname = prev?.follower_usernames?.[String(id)] || prev?.usernames?.[String(id)];
                            return {
                                pk: String(id), id: String(id),
                                username: uname || `user_${id}`,
                                full_name: uname ? '' : 'เลิกติดตามหลังจากสแกนครั้งก่อน (username ไม่พบ)',
                                profile_pic_url: ''
                            };
                        });
                        await MaxPlandVault.saveSnapshot(followers, following, currentUser.id, STATE.scanController.signal);
            IgBridge.assertAccount(currentUser.id);
            if (STATE.stopScanFlag) throw new DOMException('หยุดการสแกนแล้ว', 'AbortError');
            Object.assign(STATE, { followers, following, whitelist, lostFollowers, scanIncomplete: false,
                notFollowingBack: following.filter(u => !isFollower(u)),
                fans: followers.filter(u => !isFollowing(u)),
                mutual: following.filter(u => isFollower(u)),
                ghostFollowers: followers.filter(u => hasNoAvatar(u)) });
            for (const [stat, pill, key] of [['not-following-back','not','notFollowingBack'],['fans','fans','fans'],['mutual','mutual','mutual'],['lost','lost','lostFollowers'],['ghost','ghost','ghostFollowers']]) {
                if (el(`stat-${stat}`)) el(`stat-${stat}`).textContent = STATE[key].length.toLocaleString();
                if (el(`pill-count-${pill}`)) el(`pill-count-${pill}`).textContent = STATE[key].length.toLocaleString();
            }
            el('pill-count-white').textContent = whitelist.size.toLocaleString();
            el('maxpland-progress-fill').style.width = '100%';
            phase.textContent = 'สแกนเสร็จสมบูรณ์';
            notice.style.display = 'none';
            const fs = lists.followers.fetchStats || { requestMs: 0, waitMs: 0 };
            const fw = lists.following.fetchStats || { requestMs: 0, waitMs: 0 };
            STATE.scanStatus = { requestMs: fs.requestMs + fw.requestMs, waitMs: fs.waitMs + fw.waitMs, wallMs: Date.now() - STATE.scanStartTime };
            const fmtMs = ms => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)} นาที ${s % 60} วิ` : `${s} วิ`; };
            summary.textContent = `Followers ${followers.length.toLocaleString()} · Following ${following.length.toLocaleString()} · ดึงข้อมูล ${fmtMs(STATE.scanStatus.requestMs)} · รอเว้นจังหวะ ${fmtMs(STATE.scanStatus.waitMs)} · รวม ${fmtMs(STATE.scanStatus.wallMs)}`;
            showToast('สแกนเสร็จสมบูรณ์แล้วค่ะ');
        } catch (err) {
            phase.textContent = STATE.stopScanFlag || err.name === 'AbortError' ? 'หยุดการสแกนแล้ว' : 'สแกนไม่สำเร็จ';
            notice.textContent = `⚠️ ${err.message} · ยังไม่ได้อัปเดตผลความสัมพันธ์`;
            notice.style.display = 'block';
            summary.textContent = phase.textContent;
        } finally {
            clearInterval(timer);
            btn.disabled = false;
            STATE.isScanning = false;
            STATE.scanController = null;
            renderRelationshipList();
            // Keep failed scan diagnostics visible until the next action.
            if (!STATE.scanIncomplete) STATE.progressHideTimer = setTimeout(() => { progress.style.display = 'none'; }, 2500);
        }
    }

    /* ==========================================================================
       8. FILTER & RENDER ENGINE
       ========================================================================== */

    function getFilteredUsers() {
        let pool = [];
        if (STATE.relationshipFilter === 'not_following_back') pool = STATE.notFollowingBack;
        else if (STATE.relationshipFilter === 'fans') pool = STATE.fans;
        else if (STATE.relationshipFilter === 'mutual') pool = STATE.mutual;
        else if (STATE.relationshipFilter === 'lost') pool = STATE.lostFollowers;
        else if (STATE.relationshipFilter === 'ghost') pool = STATE.ghostFollowers;
        else if (STATE.relationshipFilter === 'inactive') pool = STATE.inactiveFollowing;
        else if (STATE.relationshipFilter === 'whitelist') pool = Array.from(STATE.whitelist.values());

        const followedIds = new Set(STATE.following.map(x => String(x.id || x.pk_id || x.pk || '').trim()));
        return pool.filter(u => {
            const uid = String(u.id || u.pk_id || u.pk || '');
            const uname = String(u.username || '').toLowerCase();
            const isFollowedByUs = uid !== '' && followedIds.has(uid);
            if (STATE.subFilters.onlyFollowing && !isFollowedByUs) return false;
            if (STATE.subFilters.onlyNotFollowed && isFollowedByUs) return false;
            const isWhitelisted = isProtectedUser(uid, uname);
            if (STATE.subFilters.excludeWhitelist && isWhitelisted) return false;
            if (STATE.subFilters.excludeVerified && u.is_verified) return false;
            if (STATE.subFilters.excludePrivate && u.is_private) return false;
            if (STATE.subFilters.excludeNoAvatar && hasNoAvatar(u)) return false;
            if (STATE.searchQuery) {
                const q = STATE.searchQuery;
                const matchUser = u.username && u.username.toLowerCase().includes(q);
                const matchName = u.full_name && u.full_name.toLowerCase().includes(q);
                if (!matchUser && !matchName) return false;
            }
            return true;
        });
    }

    function setFollowStateChip(which) {
        const next = !STATE.subFilters[which];
        STATE.subFilters.onlyFollowing = which === 'onlyFollowing' && next;
        STATE.subFilters.onlyNotFollowed = which === 'onlyNotFollowed' && next;
        document.getElementById('toggle-filter-following').classList.toggle('active', STATE.subFilters.onlyFollowing);
        document.getElementById('toggle-filter-notfollowing').classList.toggle('active', STATE.subFilters.onlyNotFollowed);
        renderRelationshipList();
    }

    function renderRelationshipList() {
        const listEl = document.getElementById('maxpland-relationship-list');
        const currentPool = getFilteredUsers();

        let tagClass = 'not_following';
        let tagText = 'ไม่ฟอลกลับ';
        if (STATE.relationshipFilter === 'fans') { tagClass = 'fan'; tagText = 'แฟนคลับ'; }
        else if (STATE.relationshipFilter === 'mutual') { tagClass = 'mutual'; tagText = 'ฟอลทั้งคู่'; }
        else if (STATE.relationshipFilter === 'lost') { tagClass = 'lost'; tagText = 'เลิกฟอล'; }
        else if (STATE.relationshipFilter === 'ghost') { tagClass = 'ghost'; tagText = '👻 แอคหลุม'; }
        else if (STATE.relationshipFilter === 'inactive') { tagClass = 'ghost'; tagText = '⏱️ แอคดอง'; }
        else if (STATE.relationshipFilter === 'whitelist') { tagClass = 'mutual'; tagText = '⭐ Whitelist'; }

        if (STATE.scanIncomplete && STATE.followers.length === 0 && (STATE.relationshipFilter === 'not_following_back' || STATE.relationshipFilter === 'mutual' || STATE.relationshipFilter === 'fans')) {
            listEl.innerHTML = `
                <div style="padding: 48px 24px; text-align: center; color: var(--mp-rose); line-height: 1.6;">
                    <div style="font-size: 15px; font-weight: 600; margin-bottom: 8px;">${STATE.isScanning ? 'กำลังสแกนข้อมูลความสัมพันธ์...' : 'ยังไม่มีผลการสแกนที่สมบูรณ์'}</div>
                    <div style="color: var(--mp-text-secondary); font-size: 13px; max-width: 500px; margin: 0 auto;">
                        ${STATE.isScanning ? 'กรุณารอให้ดึง Followers และ Following ครบก่อนแสดงผล' : 'ดูรายละเอียดจากสถานะการสแกนด้านบน แล้วกดสแกนเพื่อลองใหม่ได้ค่ะ'}
                    </div>
                </div>
            `;
            return;
        }

        if (currentPool.length === 0) {
            listEl.innerHTML = `<div style="padding: 48px; text-align: center; color: var(--mp-text-muted);">ไม่พบรายชื่อในเงื่อนไขนี้</div>`;
            return;
        }

        const visibleUsers = currentPool.slice(0, STATE.relationshipLimit || 100);
        let html = '';

        visibleUsers.forEach(user => {
            const uid = String(user.id || user.pk_id || user.pk || '');
            const uname = String(user.username || '').toLowerCase();
            const isWhitelisted = isProtectedUser(uid, uname);
            const isChecked = STATE.selectedIds.has(uid);
            const avatar = user.profile_pic_url || '';
            const initial = String(user.username || '?').slice(0, 1).toUpperCase();
            let displayTag = tagText;
            if (STATE.relationshipFilter === 'inactive' && user.dormant_days !== undefined) {
                displayTag = typeof user.dormant_days === 'number' ? `⏱️ ดอง ${user.dormant_days} วัน` : `⏱️ ${user.dormant_days}`;
            }

            html += `
                <div class="maxpland-user-row" data-id="${escapeHtml(uid)}">
                    <div class="maxpland-user-left">
                        <input type="checkbox" class="maxpland-checkbox user-select-checkbox" data-id="${escapeHtml(uid)}" aria-label="เลือก @${escapeHtml(user.username || uid)}" ${isChecked ? 'checked' : ''} ${isWhitelisted ? 'disabled title="อยู่ใน Whitelist (ปลอดภัยจากการ Unfollow)"' : ''}>
                        ${avatar ? `<img class="maxpland-avatar" src="${escapeHtml(avatar)}" loading="lazy" alt="">` : `<span class="maxpland-avatar">${escapeHtml(initial)}</span>`}
                        <div class="maxpland-user-names">
                            <div class="maxpland-username-wrap">
                                <a href="https://www.instagram.com/${encodeURIComponent(user.username || '')}/" target="_blank" rel="noopener noreferrer" class="maxpland-username">${escapeHtml(user.username || 'unknown')}</a>
                                ${user.is_verified ? `<span title="Verified">${ICONS.VERIFIED}</span>` : ''}
                                ${user.is_private ? `<span title="Private Account" style="color:var(--mp-text-muted);display:flex;align-items:center;">${ICONS.LOCK}</span>` : ''}
                                <span class="maxpland-status-tag ${tagClass}">${escapeHtml(displayTag)}</span>
                            </div>
                            <span class="maxpland-fullname">${escapeHtml(user.full_name || '')}</span>
                        </div>
                    </div>
                    <div class="maxpland-user-actions">
                        <a href="https://www.instagram.com/${encodeURIComponent(user.username || '')}/" target="_blank" rel="noopener noreferrer" class="maxpland-icon-action" title="เปิดหน้าโปรไฟล์ Instagram">
                            ${ICONS.EXTERNAL}
                        </a>
                        <button type="button" class="maxpland-icon-action maxpland-star-btn" data-id="${escapeHtml(uid)}" title="${isWhitelisted ? 'ลบออกจาก Whitelist' : 'เพิ่มใน Whitelist'}">
                            ${isWhitelisted ? ICONS.STAR_FILLED : ICONS.STAR}
                        </button>
                        ${STATE.relationshipFilter === 'not_following_back' || STATE.relationshipFilter === 'mutual' || STATE.relationshipFilter === 'inactive' ? `
                            <button type="button" class="maxpland-row-unfollow-btn" data-id="${escapeHtml(uid)}" data-user="${escapeHtml(user.username || '')}" ${isWhitelisted ? 'disabled title="Whitelist"' : ''}>
                                ${ICONS.UNFOLLOW} เลิกติดตาม
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        listEl.innerHTML = html;

        if (visibleUsers.length < currentPool.length) {
            const more = document.createElement('button');
            more.type = 'button';
            more.className = 'maxpland-btn-secondary';
            more.style.margin = '10px auto';
            more.style.display = 'block';
            more.textContent = `แสดงเพิ่ม (${visibleUsers.length.toLocaleString()} / ${currentPool.length.toLocaleString()})`;
            more.onclick = () => { STATE.relationshipLimit += 100; renderRelationshipList(); };
            listEl.append(more);
        }
    }

    function applyUnfollowResult(uid, username = '') {
        const idOf = u => String(u?.id || u?.pk_id || u?.pk || '');
        const nameOf = u => String(u?.username || '').toLowerCase();
        const targetName = String(username || '').toLowerCase();
        const isTarget = u => (uid && idOf(u) === uid) || (targetName && nameOf(u) === targetName);
        STATE.following = STATE.following.filter(u => !isTarget(u));
        STATE.notFollowingBack = STATE.notFollowingBack.filter(u => !isTarget(u));
        STATE.mutual = STATE.mutual.filter(u => !isTarget(u));
        const fan = STATE.followers.find(isTarget);
        if (fan && !STATE.fans.some(isTarget)) STATE.fans.push(fan);
        for (const key of ['fans', 'mutual']) {
            const stat = document.getElementById('stat-' + key), pill = document.getElementById('pill-count-' + key);
            if (stat) stat.textContent = STATE[key].length.toLocaleString();
            if (pill) pill.textContent = STATE[key].length.toLocaleString();
        }
    }

    function updateBulkActionBar() {
        const bar = document.getElementById('maxpland-bulk-bar');
        const countLabel = document.getElementById('maxpland-bulk-count-label');
        const count = STATE.selectedIds.size;

        if (count > 0) {
            bar.style.display = 'flex';
            countLabel.textContent = `เลือกไว้ ${count.toLocaleString()} คน`;
        } else {
            bar.style.display = 'none';
        }
    }

    function selectAllVisible() {
        const visiblePool = getFilteredUsers().slice(0, STATE.relationshipLimit || 100);
        visiblePool.forEach(u => {
            const uid = String(u.id || u.pk_id || u.pk || '');
            const uname = String(u.username || '').toLowerCase();
            const isWhitelisted = isProtectedUser(uid, uname);
            if (!isWhitelisted) {
                STATE.selectedIds.add(uid);
            }
        });
        updateBulkActionBar();
        renderRelationshipList();
    }

    /* ==========================================================================
       9. UNFOLLOW ENGINE (Batch with Safe Random Pacing)
       ========================================================================== */

    async function runBatchUnfollow() {
        if (STATE.isUnfollowing || STATE.isScanning || STATE.isScanningInactive || STATE.scanIncomplete) return;
        const count = STATE.selectedIds.size;
        if (count === 0) {
            alert('กรุณาเลือกบัญชีที่ต้องการเลิกติดตามก่อน');
            return;
        }

        const estSeconds = Math.round(count * ((APP_CONFIG.UNFOLLOW_DELAY_MIN + APP_CONFIG.UNFOLLOW_DELAY_MAX) / 2000));
        const proceed = confirm(`⚠️ คำเตือนความปลอดภัย:\nคุณกำลังจะกดยกเลิกติดตาม ${count} บัญชี\nเพื่อป้องกัน Instagram ตรวจจับ จะใช้เวลาประมาณ ${Math.ceil(estSeconds / 60)} นาที (สุ่มหน่วง ${APP_CONFIG.UNFOLLOW_DELAY_MIN / 1000}-${APP_CONFIG.UNFOLLOW_DELAY_MAX / 1000} วิ/คน)\n\nต้องการเริ่มดำเนินการทันทีหรือไม่?`);
        if (!proceed) return;

        STATE.isUnfollowing = true;
        STATE.stopUnfollowFlag = false;
        clearTimeout(STATE.progressHideTimer);

        const progressCont = document.getElementById('maxpland-global-progress');
        const progressFill = document.getElementById('maxpland-progress-fill');
        const phaseEl = document.getElementById('maxpland-scan-phase');
        const statCount = document.getElementById('maxpland-scan-stat-count');
        const statPage = document.getElementById('maxpland-scan-stat-page');
        const noticeEl = document.getElementById('maxpland-scan-notice');

        progressCont.style.display = 'block';
        phaseEl.textContent = 'เตรียมการ Unfollow แบบปลอดภัย...';
        noticeEl.style.display = 'none';

        const idsToUnfollow = Array.from(STATE.selectedIds);
        let successCount = 0;
        let failCount = 0;

        try {
            for (let i = 0; i < idsToUnfollow.length; i++) {
                if (STATE.stopUnfollowFlag) {
                    phaseEl.textContent = 'หยุดการ Unfollow ตามคำสั่ง';
                    break;
                }

                const uid = idsToUnfollow[i];
                const userObj = STATE.notFollowingBack.find(u => String(u.id || u.pk_id || u.pk || '') === uid)
                    || STATE.following.find(u => String(u.id || u.pk_id || u.pk || '') === uid);
                if (isProtectedUser(uid, userObj?.username)) { STATE.selectedIds.delete(uid); continue; }
                const uname = userObj ? `@${userObj.username}` : `UID ${uid}`;

                phaseEl.textContent = `กำลังเลิกติดตาม [${i + 1}/${idsToUnfollow.length}]: ${uname}`;
                statCount.textContent = `สำเร็จ: ${successCount} | ล้มเหลว: ${failCount}`;
                statPage.textContent = `เหลือ: ${idsToUnfollow.length - i}`;
                progressFill.style.width = `${Math.round(((i + 1) / idsToUnfollow.length) * 100)}%`;

                try {
                    await IgBridge.unfollowUser(uid);
                    successCount++;
                    STATE.selectedIds.delete(uid);
                    applyUnfollowResult(uid, userObj?.username);
                } catch (err) {
                    console.error('[Unfollow Error]', uid, err);
                    failCount++;
                    noticeEl.textContent = err.message || 'Unfollow ไม่สำเร็จ';
                    noticeEl.style.display = 'block';
                    STATE.stopUnfollowFlag = true;
                    break;
                }

                if (i < idsToUnfollow.length - 1 && !STATE.stopUnfollowFlag) {
                    const delay = Math.floor(Math.random() * (APP_CONFIG.UNFOLLOW_DELAY_MAX - APP_CONFIG.UNFOLLOW_DELAY_MIN + 1)) + APP_CONFIG.UNFOLLOW_DELAY_MIN;
                    for (let s = Math.ceil(delay / 1000); s > 0; s--) {
                        if (STATE.stopUnfollowFlag) break;
                        phaseEl.textContent = `พักความปลอดภัยคนถัดไป... ${s} วิ (${uname} เสร็จแล้ว)`;
                        await sleep(1000);
                    }
                }
            }

            document.getElementById('stat-not-following-back').textContent = STATE.notFollowingBack.length.toLocaleString();
            document.getElementById('pill-count-not').textContent = STATE.notFollowingBack.length.toLocaleString();
            updateBulkActionBar();
            renderRelationshipList();
            showToast(`Unfollow เสร็จสิ้น: สำเร็จ ${successCount}, ล้มเหลว ${failCount}`);
        } finally {
            STATE.isUnfollowing = false;
            if (!STATE.stopUnfollowFlag) STATE.progressHideTimer = setTimeout(() => { progressCont.style.display = 'none'; }, 2500);
        }
    }

    /* ==========================================================================
       10. EXPORT & BACKUP UTILITIES
       ========================================================================== */

    async function copyVisibleUsernames() {
        const pool = getFilteredUsers();
        if (!pool.length) {
            alert('ไม่พบรายชื่อในเงื่อนไขปัจจุบันสำหรับคัดลอก');
            return;
        }
        const text = pool.map(u => u.username || '').filter(Boolean).join('\n');
        try {
            await navigator.clipboard.writeText(text);
            showToast(`คัดลอกรายชื่อ ${pool.length.toLocaleString()} คน ลง Clipboard เรียบร้อย`);
        } catch (_) {
            alert('ไม่สามารถคัดลอกได้อัตโนมัติ กรุณาลองใหม่');
        }
    }

    function exportRelationshipCSV() {
        const pool = getFilteredUsers();
        if (!pool.length) {
            alert('ไม่มีข้อมูลในหมวดนี้สำหรับส่งออก');
            return;
        }
        const rows = [['User ID', 'Username', 'Full Name', 'Is Verified', 'Is Private']];
        pool.forEach(u => rows.push([
            u.pk || u.pk_id || u.id || '',
            u.username || '',
            u.full_name || '',
            u.is_verified ? 'Yes' : 'No',
            u.is_private ? 'Yes' : 'No'
        ]));
        const csv = '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(blob, `IG_MaxPland_${STATE.relationshipFilter}_${new Date().toISOString().slice(0,10)}.csv`);
    }

    function exportRelationshipJSON() {
        const pool = getFilteredUsers();
        if (!pool.length) {
            alert('ไม่มีข้อมูลในหมวดนี้สำหรับส่งออก');
            return;
        }
        const data = JSON.stringify(pool, null, 2);
        const blob = new Blob([data], { type: 'application/json;charset=utf-8;' });
        downloadBlob(blob, `IG_MaxPland_${STATE.relationshipFilter}_${new Date().toISOString().slice(0,10)}.json`);
    }

    function exportWhitelistBackup() {
        const whitelistArr = Array.from(STATE.whitelist.values());
        if (!whitelistArr.length) {
            alert('ยังไม่มีรายชื่อใน Whitelist สำหรับสำรองข้อมูล');
            return;
        }
        const json = JSON.stringify(whitelistArr, null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
        downloadBlob(blob, `IG_MaxPland_Whitelist_Backup_${new Date().toISOString().slice(0,10)}.json`);
        showToast('สำรองข้อมูล Whitelist เรียบร้อย');
    }

    async function handleWhitelistRestoreFile(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (!Array.isArray(data)) throw new Error('ไฟล์สำรองไม่ถูกต้อง (ต้องเป็น JSON Array)');
            const count = await MaxPlandVault.importWhitelist(data);
            STATE.whitelist = await MaxPlandVault.getWhitelist();
            document.getElementById('pill-count-white').textContent = STATE.whitelist.size.toLocaleString();
            showToast(`กู้คืนรายชื่อ Whitelist แล้ว ${count} บัญชี`);
            renderRelationshipList();
        } catch (err) {
            alert(`นำเข้าล้มเหลว: ${err.message || err}`);
        } finally {
            e.target.value = '';
        }
    }

    /* ==========================================================================
       11. MEDIA DOWNLOADER ENGINE
       ========================================================================== */

    async function downloadResolvedMedia(resolved, { allCarousel = false, skipExisting = false } = {}) {
            const accountId = IgBridge.getCookie('ds_user_id');
            // Account already validated in downloadByShortcode caller (P0 fix)
            const completed = [];
            const nodesToDownload = allCarousel ? resolved.nodes : [resolved.nodes[0]];

            for (const node of nodesToDownload) {
                // Account already validated in downloadByShortcode caller
                const key = `${resolved.shortcode}:${node.id || node.index}:media`;
                if (skipExisting && await MaxPlandVault.hasMedia(key)) {
                    completed.push({ key, status: 'skipped' });
                    continue;
                }

                const base = safeFilename(`${resolved.username || 'instagram'}_${resolved.shortcode}_${node.index + 1}`);
                const files = [];

            if (node.mediaType === 'image') {
                if (!node.imageUrl) throw new Error(`No image URL for ${resolved.shortcode}`);
                const ext = extensionFromUrl(node.imageUrl, 'jpg');
                files.push(await gmDownload(node.imageUrl, `${base}.${ext}`));
            } else if (node.progressiveVideoUrl) {
                const ext = extensionFromUrl(node.progressiveVideoUrl, 'mp4');
                files.push(await gmDownload(node.progressiveVideoUrl, `${base}.${ext}`));
            } else if (node.imageUrl) {
                // Video stream unavailable: the thumbnail is stored under its own type
                // so the next run still retries the real video instead of skipping it.
                const thumbType = node.mediaType === 'video' ? 'video_thumb' : node.mediaType;
                const ext = extensionFromUrl(node.imageUrl, node.mediaType === 'video' ? 'jpg' : 'jpg');
                files.push(await gmDownload(node.imageUrl, `${base}.${ext}`));
                node.mediaType = thumbType;
            } else {
                throw new Error(`No downloadable stream for ${resolved.shortcode}`);
            }

            IgBridge.assertAccount(accountId);
            await MaxPlandVault.markMediaDownloaded({
                key,
                shortcode: resolved.shortcode,
                username: resolved.username || '',
                item_index: node.index,
                media_type: node.mediaType,
                files
            });
            completed.push({ key, status: 'done', files });
        }
        return completed;
    }

    async function downloadByShortcode(shortcode, options = {}) {
            const resolved = await IgBridge.resolveMedia(shortcode);
            // Retry logic for transient network failures (P0 fix)
            let lastErr;
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    return downloadResolvedMedia(resolved, options);
                } catch (err) {
                    lastErr = err;
                    if (IgBridge.isSessionError(err) || err.name === 'AbortError') throw err;
                    await sleep(500 * (attempt + 1));
                }
            }
            throw lastErr;
        }

    /* ==========================================================================
       9. HEALTH DASHBOARD, INACTIVE RADAR & SETTINGS SYNC
       ========================================================================== */

    function syncFeaturesTab() {
        const el = id => document.getElementById(id);
        const p = STATE.prefs || {};
        if (el('pref-switch-stealth-story')) el('pref-switch-stealth-story').checked = Boolean(p.stealthStory);
        if (el('pref-switch-clean-feed')) el('pref-switch-clean-feed').checked = Boolean(p.cleanFeed);
        if (el('pref-switch-feed-download')) el('pref-switch-feed-download').checked = Boolean(p.quickDownloadFeed);
        if (el('pref-switch-story-toolbar')) el('pref-switch-story-toolbar').checked = Boolean(p.quickDownloadStory);
    }

    function syncSettingsTab() {
        const el = id => document.getElementById(id);
        const p = STATE.prefs || {};
        if (el('pref-setting-inactive-threshold')) el('pref-setting-inactive-threshold').value = String(p.inactiveThresholdDays || 180);
        if (el('pref-setting-scan-speed')) el('pref-setting-scan-speed').value = ['B', 'C'].includes(p.scanSpeed) ? p.scanSpeed : 'A';
    }

    async function runInactiveScan() {
        if (STATE.isScanning || STATE.isUnfollowing || STATE.isScanningInactive) return;
        if (STATE.scanIncomplete || !STATE.following.length) {
            alert('กรุณาสแกนผู้ติดตามให้ครบก่อนตรวจความเคลื่อนไหวค่ะ');
            return;
        }
        const accountId = STATE.relationshipAccountId;
        const thresholdSeconds = Number(STATE.prefs?.inactiveThresholdDays || 180) * 86400;
        const nowSec = Math.floor(Date.now() / 1000);
        const pool = [...STATE.following];
        STATE.isScanningInactive = true;
        STATE.stopInactiveScanFlag = false;
        STATE.stopScanFlag = false;
        STATE.inactiveController = new AbortController();
        const signal = STATE.inactiveController.signal;
        STATE.inactiveFollowing = [];
        clearTimeout(STATE.progressHideTimer);
        const el = id => document.getElementById(id);
        const progress = el('maxpland-global-progress');
        const phase = el('maxpland-scan-phase');
        const btn = el('maxpland-btn-scan-inactive');
        btn.disabled = true;
        progress.style.display = 'block';
        phase.textContent = '[เรดาร์แอคดอง] เริ่มตรวจสอบ...';
        el('maxpland-scan-notice').style.display = 'none';
        el('maxpland-scan-stat-count').textContent = 'พบแอคดอง: 0';
        el('maxpland-scan-stat-page').textContent = `ตรวจ: 0/${pool.length}`;
        el('maxpland-scan-stat-timer').textContent = '⏱️ 00:00';
        el('maxpland-progress-fill').style.width = '0%';
        const started = Date.now();
        const timer = setInterval(() => {
            el('maxpland-scan-stat-timer').textContent = `⏱️ ${formatTime(Math.floor((Date.now() - started) / 1000))}`;
        }, 1000);
        let checked = 0, failed = 0, newFetches = 0;
        try {
                    // Hoist account validation out of loop (P0 fix)
                    IgBridge.assertAccount(accountId);
                    for (const user of pool) {
                        if (signal.aborted) break;
                        const uid = String(user.id || user.pk_id || user.pk || '');
                        const cached = await MaxPlandVault.getUserActivity(uid);
                        if (signal.aborted) break;
                        const cacheValid = cached?.checked_at && Date.now() - cached.checked_at < 14 * 86400 * 1000;
                // ponytail: preserve the 20-request ceiling; cached rows need no new request.
                if (!cacheValid && newFetches >= 20) break;
                phase.textContent = `[เรดาร์แอคดอง] กำลังตรวจ @${user.username || uid} (${checked + 1}/${pool.length})...`;
                let lastTakenAt = cached?.last_post_taken_at;
                let hasPosts = cached?.has_posts !== false;
                let known = Boolean(cacheValid);
                if (!cacheValid) {
                    newFetches++;
                    try {
                        const info = await IgBridge.fetchUserLastPost(uid, { signal });
                        if (signal.aborted) break;
                        IgBridge.assertAccount(accountId);
                        lastTakenAt = info.last_taken_at;
                        hasPosts = info.has_posts;
                        known = true;
                        await MaxPlandVault.saveUserActivity({ id: uid, username: user.username || '',
                            last_post_taken_at: lastTakenAt, has_posts: hasPosts, checked_at: Date.now() });
                    } catch (err) {
                        if (signal.aborted || err.name === 'AbortError' || IgBridge.isSessionError(err)) throw err;
                        failed++;
                        known = false;
                    }
                }
                if (signal.aborted) break;
                IgBridge.assertAccount(accountId);
                checked++;
                if (known && (!hasPosts || (lastTakenAt && nowSec - lastTakenAt > thresholdSeconds))) {
                    STATE.inactiveFollowing.push({ ...user,
                        dormant_days: lastTakenAt ? Math.floor((nowSec - lastTakenAt) / 86400) : 'ไม่พบโพสต์ใหม่' });
                }
                el('maxpland-progress-fill').style.width = `${Math.round(checked / pool.length * 100)}%`;
                el('maxpland-scan-stat-page').textContent = `ตรวจ: ${checked}/${pool.length}`;
                el('maxpland-scan-stat-count').textContent = `พบแอคดอง: ${STATE.inactiveFollowing.length} · ตรวจไม่ได้: ${failed}`;
                if (!cacheValid && checked < pool.length && newFetches < 20) {
                    const jitter = 3500 + Math.floor(Math.random() * 2500);
                    for (let ms = 0; ms < jitter && !signal.aborted; ms += 250) await sleep(250);
                }
            }
            const state = signal.aborted ? 'หยุดตามคำสั่ง' : checked < pool.length ? 'พัก — กดตรวจต่อได้' : failed ? 'ตรวจครบรายการ แต่มีรายการตรวจไม่ได้' : 'ตรวจสอบเสร็จสิ้น';
            phase.textContent = `[เรดาร์แอคดอง] ${state} (${checked}/${pool.length}) · พบ ${STATE.inactiveFollowing.length} · ตรวจไม่ได้ ${failed}`;
            showToast(phase.textContent, 5000);
            if (!signal.aborted && checked === pool.length && !failed) {
                STATE.progressHideTimer = setTimeout(() => { progress.style.display = 'none'; }, 3000);
            }
        } catch (err) {
            phase.textContent = signal.aborted || err.name === 'AbortError'
                ? `[เรดาร์แอคดอง] หยุดตามคำสั่ง (${checked}/${pool.length})`
                : `[เรดาร์แอคดอง] หยุด: ${err.message} (${checked}/${pool.length})`;
            showToast(phase.textContent, 4000);
        } finally {
            clearInterval(timer);
            btn.disabled = false;
            STATE.isScanningInactive = false;
            STATE.inactiveController = null;
            el('pill-count-inactive').textContent = STATE.inactiveFollowing.length;
            document.querySelector('.maxpland-pill-btn[data-filter="inactive"]')?.click();
        }
    }

    async function renderHealthDashboard() {
        const el = id => document.getElementById(id);
        const followerCount = STATE.followers.length;
        const followingCount = STATE.following.length;

        // 1. Ratio
        const ratio = followingCount > 0 ? (followerCount / followingCount) : 0;
        const ratioVal = el('health-ratio-val');
        const ratioBadge = el('health-ratio-badge');
        if (ratioVal && ratioBadge) {
            if (followerCount === 0 && followingCount === 0) {
                ratioVal.textContent = '-';
                ratioBadge.textContent = 'กรุณาสแกนผู้ติดตามก่อน';
                ratioBadge.style.background = 'var(--mp-bg-hover)';
                ratioBadge.style.color = 'var(--mp-text-secondary)';
            } else {
                ratioVal.textContent = `${ratio.toFixed(2)}x`;
                if (ratio >= 1.5) {
                    ratioBadge.textContent = '⭐ ผู้มีอิทธิพล / ครีเอเตอร์';
                    ratioBadge.style.background = 'var(--mp-emerald-bg)';
                    ratioBadge.style.color = 'var(--mp-emerald)';
                } else if (ratio >= 0.8) {
                    ratioBadge.textContent = '⚖️ บัญชีสมดุล (Healthy Balance)';
                    ratioBadge.style.background = 'var(--mp-cyan-bg)';
                    ratioBadge.style.color = 'var(--mp-cyan)';
                } else {
                    ratioBadge.textContent = '🔍 บัญชีเน้นติดตาม (Consumer heavy)';
                    ratioBadge.style.background = 'var(--mp-amber-bg)';
                    ratioBadge.style.color = 'var(--mp-amber)';
                }
            }
        }

        // 2. Mutual Rate
        const mutualVal = el('health-mutual-val');
        const mutualBadge = el('health-mutual-badge');
        if (mutualVal && mutualBadge) {
            if (followingCount === 0) {
                mutualVal.textContent = '-';
                mutualBadge.textContent = 'ยังไม่มีข้อมูล';
            } else {
                const rate = Math.round((STATE.mutual.length / followingCount) * 100);
                mutualVal.textContent = `${rate}%`;
                mutualBadge.textContent = `${STATE.mutual.length} จาก ${followingCount} คน`;
            }
        }

        // 3. Not Back Outbound
        const notbackVal = el('health-notback-val');
        const notbackBadge = el('health-notback-badge');
        if (notbackVal && notbackBadge) {
            if (followingCount === 0) {
                notbackVal.textContent = '-';
                notbackBadge.textContent = 'ยังไม่มีข้อมูล';
            } else {
                const rate = Math.round((STATE.notFollowingBack.length / followingCount) * 100);
                notbackVal.textContent = `${rate}%`;
                notbackBadge.textContent = `${STATE.notFollowingBack.length} คนไม่ฟอลกลับ`;
            }
        }

        // 4. Ghost & Inactive Impact
        const ghostVal = el('health-ghost-val');
        const ghostBadge = el('health-ghost-badge');
        if (ghostVal && ghostBadge) {
            const totalGhost = STATE.ghostFollowers.length + STATE.inactiveFollowing.length;
            if (followerCount === 0 && followingCount === 0) {
                ghostVal.textContent = '-';
                ghostBadge.textContent = 'ยังไม่มีข้อมูล';
            } else {
                const rate = Math.round((totalGhost / (followerCount || 1)) * 100);
                ghostVal.textContent = `${totalGhost} บัญชี`;
                ghostBadge.textContent = `แอคหลุม ${STATE.ghostFollowers.length} / แอคดอง ${STATE.inactiveFollowing.length}`;
            }
        }

        // 5. Historical Snapshots & Pure SVG Sparkline
        const chartBox = el('health-chart-container');
        const deltaLabel = el('health-drift-delta');
        try {
            const accountId = STATE.relationshipAccountId || STATE.currentUser?.id;
            const snapshots = await MaxPlandVault.getAllSnapshots(accountId, 8);
            if (snapshots.length >= 2) {
                const sorted = [...snapshots].reverse();
                const counts = sorted.map(s => s.follower_count || 0);
                const min = Math.min(...counts);
                const max = Math.max(...counts);
                const diff = counts[counts.length - 1] - counts[0];

                if (deltaLabel) {
                    deltaLabel.textContent = `${diff >= 0 ? '+' : ''}${diff} followers`;
                    deltaLabel.style.color = diff >= 0 ? 'var(--mp-emerald)' : 'var(--mp-rose)';
                }

                const w = 700, h = 110;
                const pad = 24;
                const range = (max - min) || 1;
                const points = counts.map((c, i) => {
                    const x = pad + (i / (counts.length - 1)) * (w - pad * 2);
                    const y = h - pad - ((c - min) / range) * (h - pad * 2);
                    return { x, y, val: c, date: new Date(sorted[i].timestamp).toLocaleDateString('th-TH') };
                });

                const polyline = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
                const dots = points.map(p => `
                    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#38bdf8" stroke="#0b0d10" stroke-width="2">
                        <title>${p.date}: ${p.val} คน</title>
                    </circle>
                    <text x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(1)}" font-size="10" fill="#94a3b8" text-anchor="middle">${p.val}</text>
                `).join('');

                chartBox.innerHTML = `
                    <svg viewBox="0 0 ${w} ${h}" class="maxpland-sparkline">
                        <defs>
                            <linearGradient id="mp-chart-grad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.3"/>
                                <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.0"/>
                            </linearGradient>
                        </defs>
                        <polyline fill="none" stroke="#0284c7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${polyline}" />
                        ${dots}
                    </svg>
                `;
            } else if (snapshots.length === 1) {
                if (deltaLabel) deltaLabel.textContent = 'บันทึกแล้ว 1 รอบ';
                chartBox.innerHTML = `<div style="padding:20px;text-align:center;color:var(--mp-text-muted);">บันทึกสแกนแรกเรียบร้อย (${snapshots[0].follower_count} คน) สแกนเพิ่มอีก 1 ครั้งเพื่อดูเส้นกราฟเปรียบเทียบค่ะ</div>`;
            } else {
                if (deltaLabel) deltaLabel.textContent = '';
                chartBox.innerHTML = `<div style="padding:20px;text-align:center;color:var(--mp-text-muted);">ยังไม่มีประวัติ Snapshot กรุณาสแกนผู้ติดตามเพื่อเริ่มต้นค่ะ</div>`;
            }
        } catch (_) {}

        // 6. Advice Box
        const advice = el('health-advice-text');
        if (advice) {
            if (STATE.notFollowingBack.length > 50) {
                advice.textContent = `พบผู้ใช้ที่ไม่ฟอลกลับคุณถึง ${STATE.notFollowingBack.length} บัญชี แนะนำให้ตรวจสอบในแท็บผู้ติดตาม และทยอยเคลียร์บัญชีที่ไม่ได้อยู่ใน Whitelist ออกเพื่อปรับสมดุลบัญชีค่ะ`;
            } else if (ratio >= 1.0) {
                advice.textContent = `โครงสร้างบัญชีของคุณอยู่ในเกณฑ์ดีเยี่ยม มีอัตราส่วนผู้ติดตามสูงกว่าคนที่คุณติดตาม (${ratio.toFixed(2)}x) และมีสัดส่วนความสัมพันธ์ที่สมดุลค่ะ`;
            } else {
                advice.textContent = `คุณติดตามผู้อื่นมากกว่าจำนวนผู้ติดตาม หากต้องการเพิ่มความคลีน แนะนำให้ใช้ฟังก์ชัน "ตรวจจับแอคดอง" เพื่อเคลียร์บัญชีที่ไม่ได้ลงโพสต์นานเกิน 6 เดือนออกค่ะ`;
            }
        }
    }

    async function renderMediaVault() {
        const list = document.getElementById('maxpland-vault-list');
        if (!list) return;
        let rows;
        try { rows = await MaxPlandVault.getMediaVault(100); }
        catch (err) { list.textContent = `History unavailable: ${err.message || err}`; return; }
        if (!rows.length) {
            list.innerHTML = '<div style="padding:48px;text-align:center;color:var(--mp-text-muted);">ยังไม่มีประวัติดาวน์โหลด</div>';
            return;
        }
        list.innerHTML = rows.map(r => `
            <div class="maxpland-user-row">
                <div class="maxpland-user-names">
                    <span class="maxpland-username">${escapeHtml(r.username || 'instagram')} · ${escapeHtml(r.shortcode || '')}</span>
                    <span class="maxpland-fullname">${escapeHtml(r.media_type || '')}${r.audio_only ? ' · audio' : ''} · ${new Date(r.downloaded_at).toLocaleString()}</span>
                </div>
                <a class="maxpland-btn-secondary" target="_blank" rel="noopener noreferrer" href="https://www.instagram.com/p/${encodeURIComponent(r.shortcode || '')}/" style="text-decoration:none;padding:3px 8px;font-size:11px;">เปิดดู</a>
            </div>`).join('');
    }

    async function runMediaQueue({ skipExisting = false } = {}) {
            if (STATE.isMediaQueueRunning) return;
            const input = document.getElementById('maxpland-media-queue-input');
            const status = document.getElementById('maxpland-media-queue-status');
            const codes = extractShortcodesFromText(input.value || '');
            if (!codes.length) { alert('กรุณาวางลิงก์โพสต์ Instagram หรือ shortcodes ก่อน'); return; }
            const accountId = IgBridge.getCookie('ds_user_id');
            // Stable queue key using hash to avoid collision (P0 fix)
            const queueKey = [accountId, codes.join(','), skipExisting].join('|');
            const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(queueKey));
            const key = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('').slice(0,32);
            if (STATE.mediaQueue?.key !== key) STATE.mediaQueue = { key, finished: new Set(), attempted: new Set() };
            const queue = STATE.mediaQueue;
            STATE.isMediaQueueRunning = true;
            const buttons = ['maxpland-btn-run-media-queue', 'maxpland-btn-run-media-all'].map(id => document.getElementById(id)).filter(Boolean);
            buttons.forEach(btn => { btn.disabled = true; });
            input.disabled = true;
            let done = 0, skipped = 0, failed = 0, stopped = false;
            try {
                // Account validated in downloadByShortcode
                for (let i = 0; i < codes.length; i++) {
                const code = codes[i];
                if (queue.finished.has(code)) continue;
                status.textContent = (i + 1) + '/' + codes.length + ' · กำลังโหลด ' + code + '...';
                try {
                    IgBridge.assertAccount(accountId);
                    const retry = queue.attempted.has(code);
                    queue.attempted.add(code);
                    const result = await downloadByShortcode(code, { skipExisting: skipExisting || retry, allCarousel: true });
                    IgBridge.assertAccount(accountId);
                    for (const item of result) {
                        if (item.status === 'done') done++;
                        else if (item.status === 'skipped') skipped++;
                    }
                    queue.finished.add(code);
                } catch (err) {
                    failed++;
                    if (IgBridge.isSessionError(err)) {
                        stopped = true;
                        status.textContent = 'หยุดคิว: ' + err.message + ' · คงเหลือ ' + (codes.length - queue.finished.size) + ' โพสต์ กดดาวน์โหลดเพื่อลองต่อ';
                        break;
                    }
                }
                if (i < codes.length - 1) await sleep(800);
            }
            if (!stopped) status.textContent = 'โหลดใหม่ ' + done + ', ข้าม ' + skipped + ', ล้มเหลว ' + failed + ' · เสร็จ ' + queue.finished.size + '/' + codes.length + ' โพสต์';
        } catch (err) { status.textContent = err.message; }
        finally {
            STATE.isMediaQueueRunning = false;
            if (queue.finished.size === codes.length) STATE.mediaQueue = null;
            buttons.forEach(btn => { btn.disabled = false; });
            input.disabled = false;
            await renderMediaVault();
        }
    }

    // In-Feed Media Native Action Bar Integration (Zero Vertical Space Waste)
    function injectInFeedDownloadButtons(root = document) {
        if (STATE.prefs && STATE.prefs.quickDownloadFeed === false) {
            document.querySelectorAll('.maxpland-action-wrap').forEach(el => el.remove());
            return;
        }
        const articles = root instanceof Element && root.matches('article') ? [root] : root.querySelectorAll('article');
        articles.forEach(article => {
            const section = article.querySelector('section');
            if (!section) return;

            // Remove legacy banner if present
            const oldBanner = article.querySelector('.maxpland-feed-tools');
            if (oldBanner) oldBanner.remove();

            // Prevent duplicate insertion
            if (section.querySelector('.maxpland-action-wrap')) return;

            const wrap = document.createElement('div');
            wrap.className = 'maxpland-action-wrap';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'maxpland-action-btn';
            btn.setAttribute('aria-label', 'ดาวน์โหลดมีเดีย (MaxPland)');
            btn.title = 'ดาวน์โหลดมีเดีย (MaxPland) · คลิกเพื่อเปิดตัวเลือก';
            btn.innerHTML = ICONS.DOWNLOAD;

            const menu = document.createElement('div');
            menu.className = 'maxpland-action-menu';

            // 1. Single Media Download (Dynamic: Video or Photo)
            const dlSingle = document.createElement('button');
            dlSingle.type = 'button';
            dlSingle.className = 'maxpland-menu-item maxpland-menu-dl-single';
            dlSingle.innerHTML = ICONS.DOWNLOAD + '<span>ดาวน์โหลด (HD)</span>';
            dlSingle.onclick = (e) => {
                e.stopPropagation();
                closeAllMenus();
                runFeedAction(article, btn, { allCarousel: false });
            };

            // 2. Carousel All Download (only if multi-item post)
            const dlAll = document.createElement('button');
            dlAll.type = 'button';
            dlAll.className = 'maxpland-menu-item maxpland-menu-dl-all';
            dlAll.innerHTML = ICONS.DOWNLOAD_ALL + '<span>ดาวน์โหลดทั้งหมดในโพสต์</span>';
            dlAll.onclick = (e) => {
                e.stopPropagation();
                closeAllMenus();
                runFeedAction(article, btn, { allCarousel: true });
            };

            // 3. Open in new tab
            const openTab = document.createElement('button');
            openTab.type = 'button';
            openTab.className = 'maxpland-menu-item';
            openTab.innerHTML = ICONS.EXTERNAL + '<span>เปิดมีเดียในแท็บใหม่</span>';
            openTab.onclick = (e) => {
                e.stopPropagation();
                closeAllMenus();
                openMediaDirectLink(article);
            };

            // 4. Divider
            const divider = document.createElement('div');
            divider.className = 'maxpland-menu-divider';

            // 5. Open MaxPland Studio
            const openStudio = document.createElement('button');
            openStudio.type = 'button';
            openStudio.className = 'maxpland-menu-item';
            openStudio.innerHTML = ICONS.LOGO + '<span>เปิด MaxPland Studio</span>';
            openStudio.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeAllMenus();
                if (typeof window.openMaxPlandStudio === 'function') {
                    window.openMaxPlandStudio();
                } else {
                    const tb = document.getElementById('maxpland-trigger-btn');
                    if (tb) tb.click();
                }
            };

            menu.append(dlSingle, dlAll, openTab, divider, openStudio);

            btn.onclick = (e) => {
                e.stopPropagation();
                const isShown = menu.classList.contains('show');
                closeAllMenus();
                if (!isShown) {
                    const hasVideo = Boolean(article.querySelector('video'));
                    const isCarousel = Boolean(article.querySelector('ul li') || article.querySelectorAll('button[aria-label*="Next"], button[aria-label*="ต่อไป"]').length);

                    dlSingle.innerHTML = ICONS.DOWNLOAD + `<span>${hasVideo ? 'ดาวน์โหลดวิดีโอ (HD)' : 'ดาวน์โหลดรูปภาพ (HD)'}</span>`;
                    dlAll.style.display = isCarousel ? 'flex' : 'none';
                    menu.classList.add('show');
                }
            };

            btn.ondblclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                closeAllMenus();
                runFeedAction(article, btn, { allCarousel: false });
            };

            wrap.append(btn, menu);

            // Integrate into section alongside bookmark/save or at the end
            const bookmarkIcon = section.querySelector('svg[aria-label*="Save"], svg[aria-label*="บันทึก"], svg[aria-label*="Remove"], svg[aria-label*="ลบออก"], polygon');
            const bookmarkContainer = bookmarkIcon ? bookmarkIcon.closest('button, div[role="button"]') : null;
            if (bookmarkContainer && bookmarkContainer.parentElement) {
                bookmarkContainer.parentElement.insertBefore(wrap, bookmarkContainer);
            } else {
                const lastChild = section.lastElementChild;
                if (lastChild && lastChild !== section) {
                    lastChild.appendChild(wrap);
                } else {
                    section.appendChild(wrap);
                }
            }
        });
    }

    function closeAllMenus() {
        document.querySelectorAll('.maxpland-action-menu.show').forEach(m => m.classList.remove('show'));
    }

    async function runFeedAction(article, btn, options) {
        if (btn.classList.contains('loading')) return;
        btn.classList.add('loading');
        const origIcon = btn.innerHTML;
        btn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5"><circle cx="12" cy="12" r="9" stroke-dasharray="28" stroke-linecap="round"/></svg>`;
        try {
            await handleDirectMediaDownload(article, options);
        } catch (err) {
            alert(err.message || String(err));
        } finally {
            btn.classList.remove('loading');
            btn.innerHTML = origIcon;
        }
    }

    async function handleDirectMediaDownload(article, { allCarousel = false } = {}) {
        const accountId = IgBridge.getCookie('ds_user_id');
        IgBridge.assertAccount(accountId);
        const shortcode = shortcodeFromArticle(article);
        if (shortcode) {
            try {
                const results = await downloadByShortcode(shortcode, { allCarousel, skipExisting: false });
                const done = results.filter(x => x.status === 'done').length;
                if (!done) throw new Error('ไม่พบ Stream ไฟล์ที่สามารถดาวน์โหลดได้');
                if (typeof GM_notification === 'function') GM_notification({ title: APP_CONFIG.APP_NAME, text: `ดาวน์โหลด ${done} ไฟล์จาก ${shortcode} สำเร็จ`, timeout: 2500 });
                return;
            } catch (err) {
                IgBridge.assertAccount(accountId);
                if (IgBridge.isSessionError(err) || allCarousel) throw err;
                console.warn('[IG MaxPland] API Resolver failed, trying DOM fallback');
            }
        }

        // DOM Fallback
        IgBridge.assertAccount(accountId);
        const video = article.querySelector('video');
        const img = article.querySelector('img[srcset]') || article.querySelector('img');
        const mediaUrl = video?.currentSrc || video?.src || img?.currentSrc || img?.src || null;
        if (!mediaUrl || !/^https?:\/\//i.test(mediaUrl)) {
            alert('ไม่พบ HTTP(S) media URL ที่ดาวน์โหลดได้จากโพสต์นี้');
            return;
        }
        const isVideo = Boolean(video && (video.currentSrc || video.src));
        const ext = extensionFromUrl(mediaUrl, isVideo ? 'mp4' : 'jpg');
        const filename = `IG_MaxPland_${Date.now()}.${ext}`;
        try { await gmDownload(mediaUrl, filename); }
        catch (_) { window.open(mediaUrl, '_blank', 'noopener,noreferrer'); }
    }

    function openMediaDirectLink(article) {
        const video = article.querySelector('video');
        const img = article.querySelector('img[srcset]') || article.querySelector('img');
        const mediaUrl = video?.currentSrc || video?.src || img?.currentSrc || img?.src || null;
        if (mediaUrl) window.open(mediaUrl, '_blank', 'noopener,noreferrer');
        else alert('ไม่พบ Media URL ของรายการนี้');
    }

    // Story & Highlight Tools
    // ponytail: resolveCurrentStoryMedia extracts pristine image/poster directly from center active story section
    // skipped: video stream scraping and open-tab actions to prevent UI freezing and blob errors; add when Instagram opens unencrypted public streams
    function findCenterElement(selector, root = document) {
        const viewportCenterX = (window.innerWidth || 800) / 2;
        let best = null;
        let minDistance = Infinity;

        for (const el of root.querySelectorAll(selector)) {
            if (typeof el.checkVisibility === 'function' && !el.checkVisibility({ checkVisibilityCSS: true })) continue;
            if (typeof el.getBoundingClientRect !== 'function') continue;
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            if (r.bottom <= 0 || r.top >= (window.innerHeight || 600)) continue;

            const elCenterX = (r.left + r.right) / 2;
            const dist = Math.abs(elCenterX - viewportCenterX);
            if (dist < minDistance) {
                minDistance = dist;
                best = el;
            }
        }
        return best;
    }

    function getActiveStorySection() {
        const viewportCenterX = (window.innerWidth || 800) / 2;
        const sections = [...document.querySelectorAll('section')];
        let best = null;
        let minDistance = Infinity;

        for (const sec of sections) {
            if (typeof sec.checkVisibility === 'function' && !sec.checkVisibility({ checkVisibilityCSS: true })) continue;
            if (typeof sec.getBoundingClientRect !== 'function') continue;
            const r = sec.getBoundingClientRect();
            if (r.width < 50 || r.height < 50) continue;
            if (r.bottom <= 0 || r.top >= (window.innerHeight || 600)) continue;

            const secCenterX = (r.left + r.right) / 2;
            const dist = Math.abs(secCenterX - viewportCenterX);
            if (dist < minDistance) {
                minDistance = dist;
                best = sec;
            }
        }
        return best;
    }

    function visibleStoryElement(selector) {
        const activeSec = getActiveStorySection();
        if (activeSec && typeof activeSec.querySelector === 'function') {
            const inner = activeSec.querySelector(selector);
            if (inner) return inner;
        }
        return findCenterElement(selector);
    }

    function getActiveStoryUsername() {
        const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const doc = win.document || document;
        const centerX = (win.innerWidth || 800) / 2;

        const headers = [...doc.querySelectorAll('section header, [role="dialog"] header, header')];
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

        const activeSec = getActiveStorySection();
        const headerLink = typeof activeSec?.querySelector === 'function' ? activeSec.querySelector('header a')?.getAttribute?.('href') : null;
        if (headerLink) {
            const parts = headerLink.split('/').filter(Boolean);
            if (parts.length > 0 && !['stories', 'explore', 'reels', 'direct'].includes(parts[0])) {
                return parts[0];
            }
        }

        const match = location.pathname.match(/\/stories\/([^\/]+)/);
        if (match && match[1] && match[1] !== 'highlights') return match[1];

        return 'story';
    }

    function pickStoryMedia(selectorVideo, selectorImg) {
        const activeSection = getActiveStorySection();

        // 1. Video in active section or centered
        let video = (typeof activeSection?.querySelector === 'function' ? activeSection.querySelector('video') : null) || null;
        if (!video) {
            video = findCenterElement(selectorVideo || 'section video, video');
        }

        // 2. Story image in active section or centered (avatar-proof)
        let img = null;
        const imgCandidates = (activeSection && typeof activeSection.querySelectorAll === 'function')
            ? activeSection.querySelectorAll(selectorImg || 'img._aa63, img[crossorigin], img[referrerpolicy], img')
            : document.querySelectorAll(selectorImg || 'section img._aa63, section img[crossorigin], section img[referrerpolicy], img');

        let maxArea = 0;
        const viewportCenterX = (window.innerWidth || 800) / 2;

        for (const candidate of imgCandidates) {
            if (typeof candidate.checkVisibility === 'function' && !candidate.checkVisibility({ checkVisibilityCSS: true })) continue;
            if (typeof candidate.getBoundingClientRect !== 'function') continue;
            const r = candidate.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            if (r.bottom <= 0 || r.top >= (window.innerHeight || 600)) continue;

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
            img = findCenterElement(selectorImg || 'img');
        }

        let mediaUrl = video?.getAttribute?.('poster') || video?.poster || img?.currentSrc || img?.src || '';
        if (!/^https?:\/\//i.test(mediaUrl)) mediaUrl = '';
        return { video, img, mediaUrl, activeSection };
    }

    // ponytail: extractMediaFromFiber walks React Fiber return chain with strict bounds (no recursion, zero UI freeze)
    // skipped: recursive fiber graph walking to prevent browser freeze; add when React moves item props off parent return chain
    function extractMediaFromFiber(el) {
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

    // ponytail: resolveCurrentStoryMedia extracts pristine 1080p story MP4/JPG via bounded Fiber, network registry, or DOM
    // skipped: third-party proxy fetchers to prevent auth leak and 429 checkpoint; add when client-side extraction fails entirely
    async function resolveCurrentStoryMedia(isThumb = false) {
        const activeSection = getActiveStorySection();
        const { video, img } = pickStoryMedia('section video', 'section img._aa63, section img[crossorigin], section img[referrerpolicy]');

        // 1. Direct video poster from active story if specifically requested
        if (isThumb) {
            const poster = video?.getAttribute?.('poster') || video?.poster;
            if (poster && /^https?:\/\//i.test(poster)) {
                return { url: poster, isVideo: false, source: 'dom-poster', isBlob: false };
            }
        }

        // 2. React Fiber extraction (lightning fast, bounded parent return loop, 0ms, zero-freeze)
        const fiberCandidates = [video, img, activeSection].filter(Boolean);
        for (const cand of fiberCandidates) {
            const fiber = extractMediaFromFiber(cand);
            if (fiber?.url) {
                if (isThumb && fiber.source.includes('fiber')) {
                    const poster = video?.getAttribute?.('poster') || video?.poster;
                    if (poster && /^https?:\/\//i.test(poster)) return { url: poster, isVideo: false, source: 'dom-poster', isBlob: false };
                }
                return fiber;
            }
        }

        // 3. Network Cache lookup (StoryMediaRegistry)
        let mediaId = null;
        if (activeSection && typeof activeSection.querySelector === 'function') {
            const storyLink = activeSection.querySelector('a[href*="/stories/"]');
            const hrefMatch = storyLink?.getAttribute?.('href')?.match(/\/stories\/[^\/]+\/(\d+)/);
            if (hrefMatch) mediaId = hrefMatch[1];
        }
        if (!mediaId) {
            const pathMatch = location.pathname.match(/\/stories\/[^\/]+\/(\d+)/);
            if (pathMatch) mediaId = pathMatch[1];
        }

        if (mediaId && StoryMediaRegistry.items.has(mediaId)) {
            const cached = StoryMediaRegistry.items.get(mediaId);
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

        // 5. API Fallback (IgBridge.fetchMediaInfo)
        if (mediaId) {
            try {
                const item = await IgBridge.fetchMediaInfo(mediaId);
                const isVideo = Boolean(item.video_versions && item.video_versions.length > 0);
                const videoUrl = IgBridge.bestProgressiveVideo(item);
                const imageUrl = IgBridge.bestImage(item);
                if (isThumb && imageUrl) return { url: imageUrl, isVideo: false, source: 'api', isBlob: false };
                const url = isVideo ? (videoUrl || imageUrl) : (imageUrl || videoUrl);
                if (url) return { url, isVideo, source: 'api', isBlob: false };
            } catch (err) {
                console.warn('[MaxPland] Story API info unavailable', err);
            }
        }

        // 6. Video poster fallback if video blob could not be resolved
        const poster = video?.getAttribute?.('poster') || video?.poster;
        if (poster && /^https?:\/\//i.test(poster)) {
            return { url: poster, isVideo: false, source: 'dom-poster', isBlob: false };
        }

        return { url: null, isVideo: Boolean(video), isBlob: Boolean(video?.currentSrc?.startsWith('blob:')), source: 'none' };
    }

    async function resolveCurrentStoryCover() {
        return resolveCurrentStoryMedia(true);
    }

    // ponytail: downloadCurrentStoryMedia handles one-click story media download (MP4 video or HD photo, zero UI freeze)
    // skipped: multi-format transcoding, add when WebP/AVIF to PNG convert is requested
    async function downloadCurrentStoryMedia(isThumb = false) {
        try {
            const resolved = await resolveCurrentStoryMedia(isThumb);
            if (!resolved?.url) {
                alert('ไม่พบสื่อหรือ URL ของสตอรี่ที่กำลังดูอยู่');
                return;
            }

            const username = getActiveStoryUsername();
            const ext = extensionFromUrl(resolved.url, resolved.isVideo ? 'mp4' : 'jpg');
            const filename = `${username}_story_${Date.now()}.${ext}`;

            await gmDownload(resolved.url, filename);
            showToast(resolved.isVideo ? 'เริ่มดาวน์โหลดวิดีโอสตอรี่แล้วค่ะ' : 'เริ่มดาวน์โหลดภาพสตอรี่แล้วค่ะ');
        } catch (err) {
            console.error('[MaxPland] downloadCurrentStoryMedia error:', err);
            alert('เกิดข้อผิดพลาดในการดาวน์โหลดสตอรี่');
        }
    }

    async function downloadCurrentStoryCover() {
        return downloadCurrentStoryMedia(true);
    }

    // ponytail: Story toolbar dedicated strictly to Ghost/Stealth Seen blocking
    // skipped: story media downloads removed per user direction due to unstable Instagram MSE blob stream encryption; add when a non-fragile public media API is available
    function injectStoryDownloadTools() {
        if (!location.pathname.startsWith('/stories/')) {
            const existing = document.getElementById('maxpland-story-bar');
            if (existing) existing.remove();
            return;
        }

        if (STATE.prefs && STATE.prefs.quickDownloadStory === false) {
            const existing = document.getElementById('maxpland-story-bar');
            if (existing) existing.remove();
            return;
        }

        StoryMediaRegistry.scanDomScripts();

        if (document.getElementById('maxpland-story-bar')) return;

        const storyContainer = visibleStoryElement('section');
        if (!storyContainer) return;

        const bar = document.createElement('div');
        bar.id = 'maxpland-story-bar';
        bar.className = 'maxpland-story-tools';

        const stealthBtn = document.createElement('button');
        stealthBtn.type = 'button';
        stealthBtn.id = 'maxpland-story-stealth-toggle';
        stealthBtn.className = 'maxpland-story-btn';
        const isStealth = STATE.prefs?.stealthStory !== false;
        stealthBtn.style.background = isStealth ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
        stealthBtn.style.border = `1px solid ${isStealth ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`;
        stealthBtn.innerHTML = `<span>${isStealth ? '👁️ แอบส่อง: เปิด' : '👁️ แอบส่อง: ปิด'}</span>`;
        stealthBtn.title = isStealth ? 'โหมดแอบส่องเนียนเปิดอยู่ (ไม่ส่ง Seen)' : 'โหมดแอบส่องเนียนปิดอยู่ (ส่ง Seen ตามปกติ)';
        stealthBtn.onclick = () => {
            const next = !(STATE.prefs?.stealthStory !== false);
            STATE.prefs.stealthStory = next;
            savePrefs();
            stealthBtn.style.background = next ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
            stealthBtn.style.border = `1px solid ${next ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`;
            stealthBtn.innerHTML = `<span>${next ? '👁️ แอบส่อง: เปิด' : '👁️ แอบส่อง: ปิด'}</span>`;
            stealthBtn.title = next ? 'โหมดแอบส่องเนียนเปิดอยู่ (ไม่ส่ง Seen)' : 'โหมดแอบส่องเนียนปิดอยู่ (ส่ง Seen ตามปกติ)';
            const modalSwitch = document.getElementById('pref-switch-stealth-story');
            if (modalSwitch) modalSwitch.checked = next;
            showToast(next ? 'เปิดโหมดแอบส่องสตอรี่ (ไม่ขึ้น Seen)' : 'ปิดโหมดแอบส่องสตอรี่ (ส่ง Seen ตามปกติ)');
        };

        bar.append(stealthBtn);
        document.body.appendChild(bar);
    }

    // Profile HD Avatar Downloader
    function injectProfileAvatarBadge() {
        const pathParts = location.pathname.split('/').filter(Boolean);
        if (pathParts.length !== 1 || ['explore','stories','reels','direct','accounts'].includes(pathParts[0])) {
            const b = document.getElementById('maxpland-profile-avatar-btn');
            if (b) b.remove();
            return;
        }

        if (document.getElementById('maxpland-profile-avatar-btn')) return;

        const headerActions = document.querySelector('header section') || document.querySelector('header h2')?.parentElement;
        if (!headerActions) return;

        const uname = pathParts[0];
        const btn = document.createElement('button');
        btn.id = 'maxpland-profile-avatar-btn';
        btn.type = 'button';
        btn.className = 'maxpland-avatar-badge';
        btn.title = `ดาวน์โหลดรูปโปรไฟล์ HD ของ @${uname}`;
        btn.innerHTML = ICONS.AVATAR + '<span>รูปโปรไฟล์ HD</span>';
        btn.onclick = async () => {
            btn.disabled = true;
            btn.textContent = 'กำลังดึง HD...';
            try {
                const hdUrl = await IgBridge.fetchUserProfileHD(uname);
                const fallbackImg = document.querySelector('header img[alt*="profile"]');
                const finalUrl = hdUrl || fallbackImg?.currentSrc || fallbackImg?.src;
                if (!finalUrl) throw new Error('ไม่พบรูปโปรไฟล์');
                const filename = `${uname}_profile_hd_${Date.now()}.jpg`;
                await gmDownload(finalUrl, filename);
                showToast(`ดาวน์โหลดรูปโปรไฟล์ HD ของ @${uname} เรียบร้อย`);
            } catch (err) {
                alert(`ดาวน์โหลดรูปโปรไฟล์ล้มเหลว: ${err.message || err}`);
            } finally {
                btn.disabled = false;
                btn.innerHTML = ICONS.AVATAR + '<span>รูปโปรไฟล์ HD</span>';
            }
        };

        headerActions.appendChild(btn);
    }

    function startPageObserver() {
        let timer = null;
        const observer = new MutationObserver(() => {
            if (timer) return;
            timer = setTimeout(() => {
                timer = null;
                const path = location.pathname;
                injectStoryDownloadTools();
                if (!path.startsWith('/stories/')) {
                    injectInFeedDownloadButtons();
                    injectProfileAvatarBadge();
                }
            }, 300);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    /* ==========================================================================
       12. INITIALIZATION
       ========================================================================== */

    async function init() {
        if (document.getElementById('maxpland-trigger-btn')) return;
        createUI();
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand('เปิด MaxPland', () => {
                if (typeof window.openMaxPlandStudio === 'function') {
                    window.openMaxPlandStudio();
                } else {
                    document.getElementById('maxpland-trigger-btn')?.click();
                }
            });
        }
        try {
            await MaxPlandVault.init();
            STATE.whitelist = await MaxPlandVault.getWhitelist();
            const whiteCountEl = document.getElementById('pill-count-white');
            if (whiteCountEl) whiteCountEl.textContent = STATE.whitelist.size.toLocaleString();
        } catch (err) {
            console.warn('[MaxPland] Local vault unavailable', err);
        }

        installStorySeenInterceptor();
        applyCleanFeedMode();

        injectInFeedDownloadButtons();
        injectStoryDownloadTools();
        injectProfileAvatarBadge();
        startPageObserver();
        document.addEventListener('click', () => closeAllMenus());
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        init();
    } else {
        window.addEventListener('DOMContentLoaded', init);
    }

})();
