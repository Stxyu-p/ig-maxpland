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