/* ==========================================================================
   IgMedia — Media Resolution & Download Module
   Extracted from IgBridge for Clean Architecture (v3.0.0)
   Dependencies: IgAuth, IgTransport
   ========================================================================== */

const IgMedia = (() => {
    'use strict';

    // ─── Constants ──────────────────────────────────────────────────────────
    const VIDEO_FALLBACK_THRESHOLD = 1024 * 1024; // 1MB minimum for valid video
    const MAX_DOWNLOAD_RETRIES = 3;
    const BASE_RETRY_DELAY = 1000; // 1s, 2s, 4s

    // ─── Private State ──────────────────────────────────────────────────────
    const storyMediaRegistry = new Map(); // shortcode -> { items, timestamp }
    const STORY_REGISTRY_MAX = 200; // LRU cap

    // ─── Helpers ────────────────────────────────────────────────────────────
    async function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function trimRegistry() {
        if (storyMediaRegistry.size > STORY_REGISTRY_MAX) {
            const sorted = Array.from(storyMediaRegistry.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp);
            const toDelete = sorted.length - STORY_REGISTRY_MAX;
            for (let i = 0; i < toDelete; i++) {
                storyMediaRegistry.delete(sorted[i][0]);
            }
        }
    }

    // Unified download with retry logic
    async function downloadWithRetry(url, options = {}) {
        const { retries = MAX_DOWNLOAD_RETRIES, baseDelay = BASE_RETRY_DELAY } = options;
        let lastError = null;

        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const res = await fetch(url, { credentials: 'include' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const blob = await res.blob();
                if (blob.size === 0) throw new Error('Empty blob');
                return blob;
            } catch (err) {
                lastError = err;
                if (attempt < retries) {
                    const delay = baseDelay * Math.pow(2, attempt);
                    await sleep(delay);
                }
            }
        }
        throw lastError || new Error('Download failed after retries');
    }

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }

    // ─── Public API ─────────────────────────────────────────────────────────
    return {
        // Media selection helpers
        bestImage(item) {
            const c = item?.image_versions2?.candidates || [];
            return [...c].sort((a, b) =>
                ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))
            )[0]?.url || null;
        },

        bestProgressiveVideo(item) {
            const v = item?.video_versions || [];
            return [...v].sort((a, b) =>
                ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0))
            )[0]?.url || null;
        },

        bestDashVideo(item) {
            const v = item?.video_dash_manifest ? null : null; // placeholder for future
            return v;
        },

        shortcodeToMediaId(shortcode) {
            return IgTransport.shortcodeToMediaId(shortcode);
        },

        // Core resolution
        async fetchMediaInfo(shortcode) {
            const raw = String(shortcode || '').trim();
            const mediaId = /^\d+$/.test(raw) ? raw : IgTransport.shortcodeToMediaId(raw);
            const data = await IgTransport.request(`/api/v1/media/${mediaId}/info/`);
            const item = (data.items || [])[0];
            if (!item) throw new Error('ไม่พบข้อมูลสื่อนี้');
            return item;
        },

        async resolve(shortcode) {
            return this.resolveMedia(shortcode);
        },

        async resolveMedia(shortcode) {
            const item = await this.fetchMediaInfo(shortcode);
            const nodes = Array.isArray(item.carousel_media) && item.carousel_media.length
                ? item.carousel_media
                : [item];

            return {
                item,
                shortcode,
                username: item?.user?.username || '',
                caption: item?.caption?.text || '',
                nodes: nodes.map((node, index) => ({
                    index,
                    id: String(node.pk || node.id || item.pk || item.id || shortcode),
                    mediaType: node.media_type === 2 ? 'video' : 'image',
                    imageUrl: this.bestImage(node),
                    progressiveVideoUrl: this.bestProgressiveVideo(node)
                }))
            };
        },

        // User profile HD pic
        async fetchUserProfileHD(username) {
            try {
                const data = await IgTransport.request(
                    `/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`
                );
                const user = data?.data?.user;
                if (user) {
                    return user.profile_pic_url_hd || user.profile_pic_url || null;
                }
            } catch (_) {}
            return null;
        },

        // User last post
        async fetchUserLastPost(userId, options = {}) {
            const uid = String(userId || '');
            if (!/^\d+$/.test(uid)) throw new Error('Invalid user ID');
            const accountId = (typeof STATE !== 'undefined' && STATE.relationshipAccountId) || IgAuth.getCookie('ds_user_id');
            IgAuth.assertAccount(accountId);
            const data = await IgTransport.request(`/api/v1/feed/user/${uid}/?count=1`, { ...options, accountId });
            const item = (data?.items || [])[0];
            return {
                has_posts: Boolean(item),
                last_taken_at: item?.taken_at || null,
                total_posts: data?.num_results ?? (item ? 1 : 0)
            };
        },

        // Story media registry (for stealth download)
        registerStoryMedia(shortcode, items) {
            storyMediaRegistry.set(shortcode, {
                items,
                timestamp: Date.now()
            });
            trimRegistry();
        },

        getStoryMedia(shortcode) {
            const entry = storyMediaRegistry.get(shortcode);
            if (!entry) return null;
            // TTL: 30 minutes
            if (Date.now() - entry.timestamp > 30 * 60 * 1000) {
                storyMediaRegistry.delete(shortcode);
                return null;
            }
            return entry.items;
        },

        // Download by shortcode with retry (P0 fix)
        async downloadByShortcode(shortcode, options = {}) {
            const { filename, onProgress } = options;
            onProgress?.('กำลังดึงข้อมูลสื่อ...', 0);

            const resolved = await this.resolveMedia(shortcode);
            const node = resolved.nodes[0]; // first node for now

            if (node.mediaType === 'video') {
                onProgress?.('กำลังดาวน์โหลดวิดีโอ...', 30);
                const blob = await downloadWithRetry(node.progressiveVideoUrl);
                // Validate video size
                if (blob.size < VIDEO_FALLBACK_THRESHOLD && node.imageUrl) {
                    onProgress?.('วิดีโอเล็กผิดปกติ ลองใช้รูปแทน...', 60);
                    const imgBlob = await downloadWithRetry(node.imageUrl);
                    triggerDownload(imgBlob, filename || `${resolved.username}_${shortcode}.jpg`);
                    onProgress?.('ดาวน์โหลดสำเร็จ', 100);
                    return;
                }
                triggerDownload(blob, filename || `${resolved.username}_${shortcode}.mp4`);
            } else {
                onProgress?.('กำลังดาวน์โหลดรูปภาพ...', 30);
                const blob = await downloadWithRetry(node.imageUrl);
                triggerDownload(blob, filename || `${resolved.username}_${shortcode}.jpg`);
            }
            onProgress?.('ดาวน์โหลดสำเร็จ', 100);
        },

        // Batch download resolved media (carousel support)
        async downloadResolvedMedia(resolved, options = {}) {
            const { onProgress, accountId } = options;
            IgAuth.assertAccount(accountId || IgAuth.getCookie('ds_user_id'));

            let success = 0;
            for (let i = 0; i < resolved.nodes.length; i++) {
                const node = resolved.nodes[i];
                onProgress?.(`กำลังดาวน์โหลด ${i + 1}/${resolved.nodes.length}...`, Math.round((i / resolved.nodes.length) * 100));

                try {
                    if (node.mediaType === 'video') {
                        const blob = await downloadWithRetry(node.progressiveVideoUrl);
                        if (blob.size < VIDEO_FALLBACK_THRESHOLD && node.imageUrl) {
                            const imgBlob = await downloadWithRetry(node.imageUrl);
                            triggerDownload(imgBlob, `${resolved.username}_${resolved.shortcode}_${i}.jpg`);
                        } else {
                            triggerDownload(blob, `${resolved.username}_${resolved.shortcode}_${i}.mp4`);
                        }
                    } else {
                        const blob = await downloadWithRetry(node.imageUrl);
                        triggerDownload(blob, `${resolved.username}_${resolved.shortcode}_${i}.jpg`);
                    }
                    success++;
                    await sleep(300); // small delay between downloads
                } catch (err) {
                    console.error(`Download failed for node ${i}:`, err);
                    onProgress?.(`ล้มเหลว: ${err.message}`, Math.round((i / resolved.nodes.length) * 100));
                }
            }
            onProgress?.(`เสร็จสิ้น ${success}/${resolved.nodes.length}`, 100);
            return { success, total: resolved.nodes.length };
        },

        // Queue-based media download (for bulk operations)
        async runMediaQueue(queue, options = {}) {
            const { onProgress, accountId } = options;
            const validatedAccountId = accountId || IgAuth.getCookie('ds_user_id');
            IgAuth.assertAccount(validatedAccountId);

            const results = [];
            for (let i = 0; i < queue.length; i++) {
                const item = queue[i];
                onProgress?.(`คิว ${i + 1}/${queue.length}: ${item.shortcode}`, Math.round((i / queue.length) * 100));
                try {
                    await this.downloadByShortcode(item.shortcode, { ...options, filename: item.filename });
                    results.push({ shortcode: item.shortcode, success: true });
                } catch (err) {
                    results.push({ shortcode: item.shortcode, success: false, error: err.message });
                }
                await sleep(500); // respect rate limits
            }
            onProgress?.('คิวดาวน์โหลดเสร็จสิ้น', 100);
            return results;
        }
    };
})();

// ─── Global Exposure ────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.IgMedia = IgMedia;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { IgMedia };
}