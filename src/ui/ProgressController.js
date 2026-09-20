/* ==========================================================================
   ProgressController — Unified Global Scanner & Progress UI Controller
   Consolidates progress updates across relationship scans, unfollow, radar,
   and media downloads for Clean Architecture (v3.0.0)
   ========================================================================== */

const ProgressController = (() => {
    'use strict';

    // ─── Private State ──────────────────────────────────────────────────────
    let startTime = 0;
    let timerInterval = null;
    let hideTimer = null;
    let isRunning = false;

    // ─── DOM Helpers ────────────────────────────────────────────────────────
    const dummyEl = {
        style: {},
        textContent: '',
        innerHTML: '',
        disabled: false
    };

    function el(id) {
        if (typeof document === 'undefined') return dummyEl;
        return document.getElementById(id) || dummyEl;
    }

    function formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function clearHideTimer() {
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }
    }

    // ─── Public API ─────────────────────────────────────────────────────────
    return {
        /**
         * Starts the progress UI for an operation.
         * @param {Object} options
         * @param {string} [options.title='กำลังเริ่มการทำงาน...'] - Initial phase title
         * @param {number} [options.total=0] - Total expected units
         * @param {string} [options.countText] - Custom count indicator
         */
        start({ title = 'กำลังเริ่มการทำงาน...', total = 0, countText = '' } = {}) {
            clearHideTimer();
            stopTimer();

            isRunning = true;
            startTime = Date.now();

            const container = el('maxpland-global-progress');
            container.style.display = 'block';

            el('maxpland-scan-phase').textContent = title;
            el('maxpland-scan-notice').style.display = 'none';
            el('maxpland-scan-notice').textContent = '';
            el('maxpland-scan-status-summary').textContent = '';
            el('maxpland-progress-fill').style.width = '0%';
            el('maxpland-scan-stat-count').textContent = countText || (total ? `0 / ${total}` : 'บัญชี: 0');
            el('maxpland-scan-stat-page').textContent = 'หน้า: 0';
            el('maxpland-scan-stat-timer').textContent = '⏱️ 00:00';

            timerInterval = setInterval(() => {
                const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
                el('maxpland-scan-stat-timer').textContent = `⏱️ ${formatTime(elapsedSec)}`;
            }, 1000);
        },

        /**
         * Updates progress status, percentage, counts, and messages.
         * @param {Object} options
         */
        update({ phase, current, total, page, message, percentage, countText } = {}) {
            if (!isRunning) return;

            if (phase) {
                el('maxpland-scan-phase').textContent = phase;
            }

            if (countText) {
                el('maxpland-scan-stat-count').textContent = countText;
            } else if (current != null && total != null) {
                el('maxpland-scan-stat-count').textContent = `${current.toLocaleString()} / ${total.toLocaleString()}`;
            } else if (current != null) {
                el('maxpland-scan-stat-count').textContent = `บัญชี: ${current.toLocaleString()}`;
            }

            if (page != null) {
                el('maxpland-scan-stat-page').textContent = `หน้า: ${page}`;
            }

            // Calculate or apply percentage width
            let pct = percentage;
            if (pct == null && current != null && total) {
                pct = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
            }
            if (pct != null) {
                el('maxpland-progress-fill').style.width = `${pct}%`;
            }

            // Optional notice / message display
            const noticeEl = el('maxpland-scan-notice');
            if (message) {
                noticeEl.textContent = message;
                noticeEl.style.display = 'block';
            }
        },

        /**
         * Marks operation as finished, updates summary and sets 100% width.
         * @param {Object} options
         */
        finish({ success = true, summary = '', delayHideMs = 0 } = {}) {
            stopTimer();
            isRunning = false;

            el('maxpland-progress-fill').style.width = success ? '100%' : el('maxpland-progress-fill').style.width;
            el('maxpland-scan-phase').textContent = success ? 'เสร็จสมบูรณ์' : 'หยุดการทำงานแล้ว';

            if (summary) {
                el('maxpland-scan-status-summary').textContent = summary;
            }

            if (delayHideMs > 0) {
                this.hide(delayHideMs);
            }
        },

        /**
         * Reports an error in the progress banner.
         * @param {string} message - Error description
         */
        error(message) {
            stopTimer();
            isRunning = false;

            el('maxpland-scan-phase').textContent = 'เกิดข้อผิดพลาด';
            const noticeEl = el('maxpland-scan-notice');
            noticeEl.textContent = message || 'ไม่สามารถดำเนินการต่อได้';
            noticeEl.style.display = 'block';
        },

        /**
         * Hides the progress UI after an optional delay.
         * @param {number} [delayMs=0] - Delay before hiding
         */
        hide(delayMs = 0) {
            clearHideTimer();
            stopTimer();
            isRunning = false;

            if (delayMs <= 0) {
                el('maxpland-global-progress').style.display = 'none';
            } else {
                hideTimer = setTimeout(() => {
                    el('maxpland-global-progress').style.display = 'none';
                    hideTimer = null;
                }, delayMs);
            }
        },

        get isRunning() {
            return isRunning;
        }
    };
})();

// ─── Global Exposure & Export ───────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.ProgressController = ProgressController;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ProgressController };
}
