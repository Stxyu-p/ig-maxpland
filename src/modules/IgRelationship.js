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
