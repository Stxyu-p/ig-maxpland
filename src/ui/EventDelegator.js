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
