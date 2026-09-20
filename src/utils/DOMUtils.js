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
