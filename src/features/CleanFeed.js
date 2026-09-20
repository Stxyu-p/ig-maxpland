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
