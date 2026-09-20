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
