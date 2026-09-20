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
