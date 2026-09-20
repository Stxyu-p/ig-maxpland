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
