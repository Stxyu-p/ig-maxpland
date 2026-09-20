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