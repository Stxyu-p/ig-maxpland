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
