/**
 * MediaDownloader.js
 * Comprehensive media download orchestrator for IG MaxPland.
 * Consolidates downloadResolvedMedia, downloadByShortcode, downloadFromArticle, and runMediaQueue.
 */

class MediaDownloader {
    /**
     * @param {Object} options
     * @param {Object} [options.stateManager]
     * @param {Object} [options.progressController]
     * @param {Object} [options.igMedia]
     * @param {Object} [options.igAuth]
     * @param {Object} [options.vault]
     * @param {Function} [options.gmDownloadFn]
     */
    constructor(options = {}) {
        this.stateManager = options.stateManager || (typeof window !== 'undefined' ? window.stateManager : null);
        this.progressController = options.progressController || (typeof window !== 'undefined' ? window.progressController : null);
        this.igMedia = options.igMedia || (typeof window !== 'undefined' ? (window.IgMedia || window.IgBridge) : null);
        this.igAuth = options.igAuth || (typeof window !== 'undefined' ? (window.IgAuth || window.IgBridge) : null);
        this.vault = options.vault || (typeof window !== 'undefined' ? window.MaxPlandVault : null);
        this.gmDownloadFn = options.gmDownloadFn || (typeof GM_download === 'function' ? GM_download : null);

        this.isQueueRunning = false;
        this.activeQueue = null;
    }

    /* ==========================================================================
       Static Helpers
       ========================================================================== */

    static extractShortcodesFromText(text) {
        const raw = String(text || '');
        const codes = new Set();
        const urlRx = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/gi;
        let match;
        while ((match = urlRx.exec(raw))) codes.add(match[1]);
        raw.split(/\r?\n/).forEach(line => {
            const clean = line.trim().replace(/^["']+|["']+$/g, '');
            if (/^[A-Za-z0-9_-]{5,}$/.test(clean)) codes.add(clean);
        });
        return [...codes];
    }

    static shortcodeFromArticle(article) {
        if (!article || typeof article.querySelectorAll !== 'function') return null;
        const links = [...article.querySelectorAll('a[href*="/p/"],a[href*="/reel/"],a[href*="/tv/"]')];
        for (const a of links) {
            const href = a.href || a.getAttribute('href') || '';
            const m = href.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
            if (m) return m[1];
        }
        if (typeof location !== 'undefined' && location.href) {
            const m = location.href.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
            if (m) return m[1];
        }
        return null;
    }

    static safeFilename(value) {
        return String(value || 'instagram')
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .slice(0, 150);
    }

    static extensionFromUrl(url, fallback = 'jpg') {
        try {
            const pathname = new URL(url).pathname;
            const ext = pathname.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
            if (ext && ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'm4a', 'mp3', 'aac', 'webm'].includes(ext)) {
                return ext;
            }
        } catch (_) {}
        return fallback;
    }

    static sleep(ms) {
        return new Promise(res => setTimeout(res, ms));
    }

    /* ==========================================================================
       Download Execution
       ========================================================================== */

    async _gmDownload(url, name) {
        if (typeof this.gmDownloadFn === 'function') {
            return new Promise((resolve, reject) => {
                try {
                    const ret = this.gmDownloadFn({
                        url,
                        name,
                        saveAs: false,
                        timeout: 120000,
                        ontimeout: () => reject(new Error('Download timed out')),
                        onabort: () => reject(new Error('Download aborted')),
                        onload: () => resolve(name),
                        onerror: err => reject(err)
                    });
                    if (ret && typeof ret.then === 'function') {
                        ret.then(() => resolve(name), reject);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }
        // Fallback for Node test or environments without GM_download
        return name;
    }

    async downloadResolvedMedia(resolved, { allCarousel = false, skipExisting = false } = {}) {
        if (!resolved || !Array.isArray(resolved.nodes) || resolved.nodes.length === 0) {
            throw new Error('Invalid resolved media object: missing nodes');
        }

        const accountId = this.igAuth && typeof this.igAuth.getCookie === 'function'
            ? this.igAuth.getCookie('ds_user_id')
            : null;

        const completed = [];
        const nodesToDownload = allCarousel ? resolved.nodes : [resolved.nodes[0]];

        for (const node of nodesToDownload) {
            const key = `${resolved.shortcode}:${node.id || node.index}:media`;
            if (skipExisting && this.vault && typeof this.vault.hasMedia === 'function') {
                if (await this.vault.hasMedia(key)) {
                    completed.push({ key, status: 'skipped' });
                    continue;
                }
            }

            const base = MediaDownloader.safeFilename(`${resolved.username || 'instagram'}_${resolved.shortcode}_${node.index + 1}`);
            const files = [];

            if (node.mediaType === 'image') {
                if (!node.imageUrl) throw new Error(`No image URL for ${resolved.shortcode}`);
                const ext = MediaDownloader.extensionFromUrl(node.imageUrl, 'jpg');
                files.push(await this._gmDownload(node.imageUrl, `${base}.${ext}`));
            } else if (node.progressiveVideoUrl) {
                const ext = MediaDownloader.extensionFromUrl(node.progressiveVideoUrl, 'mp4');
                files.push(await this._gmDownload(node.progressiveVideoUrl, `${base}.${ext}`));
            } else if (node.imageUrl) {
                const thumbType = node.mediaType === 'video' ? 'video_thumb' : node.mediaType;
                const ext = MediaDownloader.extensionFromUrl(node.imageUrl, 'jpg');
                files.push(await this._gmDownload(node.imageUrl, `${base}.${ext}`));
                node.mediaType = thumbType;
            } else {
                throw new Error(`No downloadable stream for ${resolved.shortcode}`);
            }

            if (accountId && this.igAuth && typeof this.igAuth.assertAccount === 'function') {
                this.igAuth.assertAccount(accountId);
            }

            if (this.vault && typeof this.vault.markMediaDownloaded === 'function') {
                await this.vault.markMediaDownloaded({
                    key,
                    shortcode: resolved.shortcode,
                    username: resolved.username || '',
                    item_index: node.index,
                    media_type: node.mediaType,
                    files
                });
            }

            completed.push({ key, status: 'done', files });
        }

        return completed;
    }

    async downloadShortcode(shortcode, options = {}) {
        if (!this.igMedia || (typeof this.igMedia.resolveMedia !== 'function' && typeof this.igMedia.resolve !== 'function')) {
            throw new Error('IgMedia service required to download by shortcode');
        }

        const resolveFn = this.igMedia.resolveMedia || this.igMedia.resolve;
        let lastErr;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const resolved = await resolveFn.call(this.igMedia, shortcode);
                return await this.downloadResolvedMedia(resolved, options);
            } catch (err) {
                lastErr = err;
                const isSession = this.igAuth && typeof this.igAuth.isSessionError === 'function'
                    ? this.igAuth.isSessionError(err)
                    : false;
                if (isSession || err.name === 'AbortError') throw err;
                await MediaDownloader.sleep(500 * (attempt + 1));
            }
        }
        throw lastErr;
    }

    // Alias for backward compatibility
    async downloadByShortcode(shortcode, options = {}) {
        return this.downloadShortcode(shortcode, options);
    }

    async downloadFromArticle(article, { allCarousel = false } = {}) {
        const accountId = this.igAuth && typeof this.igAuth.getCookie === 'function'
            ? this.igAuth.getCookie('ds_user_id')
            : null;

        if (accountId && this.igAuth && typeof this.igAuth.assertAccount === 'function') {
            this.igAuth.assertAccount(accountId);
        }

        const shortcode = MediaDownloader.shortcodeFromArticle(article);
        if (shortcode && this.igMedia) {
            try {
                const results = await this.downloadShortcode(shortcode, { allCarousel, skipExisting: false });
                const done = results.filter(x => x.status === 'done').length;
                if (!done) throw new Error('ไม่พบ Stream ไฟล์ที่สามารถดาวน์โหลดได้');
                if (typeof GM_notification === 'function') {
                    GM_notification({
                        title: 'IG MaxPland',
                        text: `ดาวน์โหลด ${done} ไฟล์จาก ${shortcode} สำเร็จ`,
                        timeout: 2500
                    });
                }
                return results;
            } catch (err) {
                if (accountId && this.igAuth && typeof this.igAuth.assertAccount === 'function') {
                    this.igAuth.assertAccount(accountId);
                }
                const isSession = this.igAuth && typeof this.igAuth.isSessionError === 'function'
                    ? this.igAuth.isSessionError(err)
                    : false;
                if (isSession || allCarousel) throw err;
                console.warn('[MediaDownloader] API resolver failed, falling back to DOM scraper');
            }
        }

        // DOM Fallback
        if (accountId && this.igAuth && typeof this.igAuth.assertAccount === 'function') {
            this.igAuth.assertAccount(accountId);
        }

        if (!article || typeof article.querySelector !== 'function') {
            throw new Error('Invalid article element');
        }

        const video = article.querySelector('video');
        const img = article.querySelector('img[srcset]') || article.querySelector('img');
        const mediaUrl = video?.currentSrc || video?.src || img?.currentSrc || img?.src || null;

        if (!mediaUrl || !/^https?:\/\//i.test(mediaUrl)) {
            throw new Error('ไม่พบ HTTP(S) media URL ที่ดาวน์โหลดได้จากโพสต์นี้');
        }

        const isVideo = Boolean(video && (video.currentSrc || video.src));
        const ext = MediaDownloader.extensionFromUrl(mediaUrl, isVideo ? 'mp4' : 'jpg');
        const filename = `IG_MaxPland_${Date.now()}.${ext}`;

        try {
            await this._gmDownload(mediaUrl, filename);
            return [{ key: `dom:${shortcode || 'direct'}`, status: 'done', files: [filename] }];
        } catch (_) {
            if (typeof window !== 'undefined') {
                window.open(mediaUrl, '_blank', 'noopener,noreferrer');
            }
            return [{ key: `dom:${shortcode || 'direct'}`, status: 'opened_in_tab', files: [] }];
        }
    }

    // Alias for backward compatibility
    async handleDirectMediaDownload(article, options = {}) {
        return this.downloadFromArticle(article, options);
    }

    async downloadQueue(codes, { skipExisting = false, onProgress, onStatus } = {}) {
        if (this.isQueueRunning) throw new Error('Media queue is already running');
        const list = Array.isArray(codes) ? codes : MediaDownloader.extractShortcodesFromText(codes);
        if (!list.length) throw new Error('กรุณาระบุ shortcodes หรือ URLs');

        const accountId = this.igAuth && typeof this.igAuth.getCookie === 'function'
            ? this.igAuth.getCookie('ds_user_id')
            : null;

        this.isQueueRunning = true;
        const queue = {
            codes: list,
            finished: new Set(),
            attempted: new Set()
        };
        this.activeQueue = queue;

        let done = 0, skipped = 0, failed = 0, stopped = false;

        try {
            for (let i = 0; i < list.length; i++) {
                const code = list[i];
                if (queue.finished.has(code)) continue;

                if (typeof onStatus === 'function') {
                    onStatus(`${i + 1}/${list.length} · กำลังโหลด ${code}...`);
                }

                try {
                    if (accountId && this.igAuth && typeof this.igAuth.assertAccount === 'function') {
                        this.igAuth.assertAccount(accountId);
                    }

                    const retry = queue.attempted.has(code);
                    queue.attempted.add(code);
                    const result = await this.downloadShortcode(code, {
                        skipExisting: skipExisting || retry,
                        allCarousel: true
                    });

                    if (accountId && this.igAuth && typeof this.igAuth.assertAccount === 'function') {
                        this.igAuth.assertAccount(accountId);
                    }

                    for (const item of result) {
                        if (item.status === 'done') done++;
                        else if (item.status === 'skipped') skipped++;
                    }
                    queue.finished.add(code);
                } catch (err) {
                    failed++;
                    const isSession = this.igAuth && typeof this.igAuth.isSessionError === 'function'
                        ? this.igAuth.isSessionError(err)
                        : false;
                    if (isSession) {
                        stopped = true;
                        if (typeof onStatus === 'function') {
                            onStatus(`หยุดคิว: ${err.message} · คงเหลือ ${list.length - queue.finished.size} โพสต์`);
                        }
                        break;
                    }
                }

                if (typeof onProgress === 'function') {
                    onProgress({ done, skipped, failed, total: list.length, completed: queue.finished.size });
                }

                if (i < list.length - 1) {
                    await MediaDownloader.sleep(800);
                }
            }
        } finally {
            this.isQueueRunning = false;
            this.activeQueue = null;
        }

        return { done, skipped, failed, stopped, total: list.length };
    }
}

// Global & CommonJS Export Pattern
if (typeof window !== 'undefined') {
    window.MediaDownloader = MediaDownloader;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MediaDownloader };
}
