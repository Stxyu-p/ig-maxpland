/**
 * Utils.js
 * Pure utility functions for IG MaxPland.
 * Zero external dependencies, safe string escapes, timing, and formatting helpers.
 */

const Utils = {
    /**
     * Escapes HTML special characters for XSS prevention.
     * @param {*} value
     * @returns {string}
     */
    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[ch]);
    },

    /**
     * Sanitizes and quotes a cell value for safe CSV export (prevents spreadsheet formula injection).
     * @param {*} value
     * @returns {string}
     */
    csvCell(value) {
        let s = String(value ?? '');
        if (/^[\s\x00-\x1f]*[=+\-@]/.test(s)) {
            s = "'" + s;
        }
        return `"${s.replace(/"/g, '""')}"`;
    },

    /**
     * Sanitizes a string into a filesystem-safe filename.
     * @param {*} value
     * @returns {string}
     */
    safeFilename(value) {
        return String(value || 'instagram')
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .slice(0, 150);
    },

    /**
     * Extracts a known media file extension from a URL, or returns the fallback.
     * @param {string} url
     * @param {string} [fallback='jpg']
     * @returns {string}
     */
    extensionFromUrl(url, fallback = 'jpg') {
        try {
            const pathname = new URL(url).pathname;
            const ext = pathname.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase();
            if (ext && ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'm4a', 'mp3', 'aac', 'webm'].includes(ext)) {
                return ext;
            }
        } catch (_) {}
        return fallback;
    },

    /**
     * Formats seconds into MM:SS string representation.
     * @param {number} seconds
     * @returns {string}
     */
    formatTime(seconds) {
        const sec = Math.max(0, Math.floor(Number(seconds) || 0));
        const m = Math.floor(sec / 60).toString().padStart(2, '0');
        const s = (sec % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    },

    /**
     * Promise-based sleep timer.
     * @param {number} ms
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)));
    },

    /**
     * Extracts post/reel shortcodes from raw text or pasted URLs.
     * @param {string} text
     * @returns {string[]}
     */
    extractShortcodesFromText(text) {
        const raw = String(text || '');
        const codes = new Set();
        const urlRx = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/gi;
        let match;
        while ((match = urlRx.exec(raw))) {
            codes.add(match[1]);
        }
        raw.split(/\r?\n/).forEach(line => {
            const clean = line.trim().replace(/^["']+|["']+$/g, '');
            if (/^[A-Za-z0-9_-]{5,}$/.test(clean)) {
                codes.add(clean);
            }
        });
        return [...codes];
    }
};

// Global & CommonJS Export Pattern
if (typeof window !== 'undefined') {
    window.Utils = Utils;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        Utils,
        escapeHtml: Utils.escapeHtml,
        csvCell: Utils.csvCell,
        safeFilename: Utils.safeFilename,
        extensionFromUrl: Utils.extensionFromUrl,
        formatTime: Utils.formatTime,
        sleep: Utils.sleep,
        extractShortcodesFromText: Utils.extractShortcodesFromText
    };
}
