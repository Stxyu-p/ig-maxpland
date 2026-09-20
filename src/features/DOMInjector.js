/**
 * DOMInjector.js
 * Consolidated DOM Observer and UI Injector for IG MaxPland.
 * Manages in-feed download action menus, story stealth toolbars, and profile HD avatar badges.
 */

const DEFAULT_INJECTOR_ICONS = {
    DOWNLOAD: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    DOWNLOAD_ALL: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/><polyline points="12 12 15 15 18 12"/><line x1="15" y1="15" x2="15" y2="9"/></svg>`,
    EXTERNAL: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
    LOGO: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>`,
    AVATAR: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>`
};

class DOMInjector {
    /**
     * @param {Object} [options]
     * @param {Object} [options.stateManager]
     * @param {Object} [options.mediaDownloader]
     * @param {Object} [options.igProfile]
     * @param {Object} [options.icons]
     */
    constructor(options = {}) {
        this.stateManager = options.stateManager || (typeof window !== 'undefined' ? window.stateManager : null);
        this.mediaDownloader = options.mediaDownloader || (typeof window !== 'undefined' ? window.mediaDownloader : null);
        this.igProfile = options.igProfile || (typeof window !== 'undefined' ? (window.IgProfile || window.IgBridge) : null);
        this.icons = options.icons || (typeof window !== 'undefined' && window.ICONS ? window.ICONS : DEFAULT_INJECTOR_ICONS);

        this.observers = new Map(); // selector -> callback
        this.mutationObserver = null;
        this.debounceTimer = null;
        this.isStarted = false;
        this._handleClickOutside = this._handleClickOutside.bind(this);
    }

    /**
     * Register a custom selector observer
     * @param {string} selector
     * @param {Function} callback
     */
    observe(selector, callback) {
        if (typeof selector === 'string' && typeof callback === 'function') {
            this.observers.set(selector, callback);
        }
        return this;
    }

    /**
     * Start the DOM mutation observer loop
     * @param {Node} [targetNode]
     */
    start(targetNode) {
        if (typeof window === 'undefined' || typeof document === 'undefined') return this;
        if (this.isStarted) return this;

        const root = targetNode || document.body;
        if (!root) return this;

        this.isStarted = true;

        // Register default injectors
        if (!this.observers.has('article')) {
            this.observe('article', (el) => this.injectFeedButton(el));
        }
        if (!this.observers.has('section[story]')) {
            this.observe('section[story]', (el) => this.injectStoryToolbar(el));
        }
        if (!this.observers.has('header[profile]')) {
            this.observe('header[profile]', (el) => this.injectAvatarBadge(el));
        }

        // Global click to close popups
        document.addEventListener('click', this._handleClickOutside);

        // Initial scan
        this._runScan();

        if (typeof MutationObserver !== 'undefined') {
            this.mutationObserver = new MutationObserver(() => {
                if (this.debounceTimer) return;
                this.debounceTimer = setTimeout(() => {
                    this.debounceTimer = null;
                    this._runScan();
                }, 300);
            });
            this.mutationObserver.observe(root, { childList: true, subtree: true });
        }

        return this;
    }

    _runScan() {
        if (typeof document === 'undefined') return;
        const path = typeof location !== 'undefined' ? location.pathname : '';

        // Story page injection
        if (path.startsWith('/stories/')) {
            this.injectStoryDownloadTools();
        } else {
            // Feed & Profile page injections
            this.injectInFeedDownloadButtons();
            this.injectProfileAvatarBadge();
        }

        // Run custom observers
        for (const [selector, cb] of this.observers.entries()) {
            if (selector === 'article' || selector === 'section[story]' || selector === 'header[profile]') {
                continue;
            }
            try {
                const nodes = document.querySelectorAll(selector);
                nodes.forEach(node => cb(node));
            } catch (_) {}
        }
    }

    _handleClickOutside(e) {
        if (e && e.target && typeof e.target.closest === 'function') {
            if (e.target.closest('.maxpland-action-wrap')) return;
        }
        this.closeAllMenus();
    }

    closeAllMenus() {
        if (typeof document === 'undefined') return;
        document.querySelectorAll('.maxpland-action-menu.show').forEach(m => m.classList.remove('show'));
    }

    /* ==========================================================================
       In-Feed Action Bar Injection
       ========================================================================== */

    injectFeedButton(article) {
        if (!article || typeof article.querySelector !== 'function') return;

        const prefs = this.stateManager?.get?.('prefs') || (typeof window !== 'undefined' ? window.STATE?.prefs : null) || {};
        if (prefs.quickDownloadFeed === false) {
            const existing = article.querySelector('.maxpland-action-wrap');
            if (existing) existing.remove();
            return;
        }

        const section = article.querySelector('section');
        if (!section) return;

        // Remove legacy banner if present
        const oldBanner = article.querySelector('.maxpland-feed-tools');
        if (oldBanner) oldBanner.remove();

        // Prevent duplicate insertion
        if (section.querySelector('.maxpland-action-wrap')) return;

        const doc = article.ownerDocument || (typeof document !== 'undefined' ? document : null);
        if (!doc || typeof doc.createElement !== 'function') return;

        const wrap = doc.createElement('div');
        wrap.className = 'maxpland-action-wrap';

        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'maxpland-action-btn';
        btn.setAttribute('aria-label', 'ดาวน์โหลดมีเดีย (MaxPland)');
        btn.title = 'ดาวน์โหลดมีเดีย (MaxPland) · คลิกเพื่อเปิดตัวเลือก';
        btn.innerHTML = this.icons.DOWNLOAD || DEFAULT_INJECTOR_ICONS.DOWNLOAD;

        const menu = doc.createElement('div');
        menu.className = 'maxpland-action-menu';

        // 1. Single Media Download
        const dlSingle = doc.createElement('button');
        dlSingle.type = 'button';
        dlSingle.className = 'maxpland-menu-item maxpland-menu-dl-single';
        dlSingle.innerHTML = (this.icons.DOWNLOAD || DEFAULT_INJECTOR_ICONS.DOWNLOAD) + '<span>ดาวน์โหลด (HD)</span>';
        dlSingle.onclick = (e) => {
            e.stopPropagation();
            this.closeAllMenus();
            this._runFeedAction(article, btn, { allCarousel: false });
        };

        // 2. Carousel All Download
        const dlAll = doc.createElement('button');
        dlAll.type = 'button';
        dlAll.className = 'maxpland-menu-item maxpland-menu-dl-all';
        dlAll.innerHTML = (this.icons.DOWNLOAD_ALL || DEFAULT_INJECTOR_ICONS.DOWNLOAD_ALL) + '<span>ดาวน์โหลดทั้งหมดในโพสต์</span>';
        dlAll.onclick = (e) => {
            e.stopPropagation();
            this.closeAllMenus();
            this._runFeedAction(article, btn, { allCarousel: true });
        };

        // 3. Open in new tab
        const openTab = doc.createElement('button');
        openTab.type = 'button';
        openTab.className = 'maxpland-menu-item';
        openTab.innerHTML = (this.icons.EXTERNAL || DEFAULT_INJECTOR_ICONS.EXTERNAL) + '<span>เปิดมีเดียในแท็บใหม่</span>';
        openTab.onclick = (e) => {
            e.stopPropagation();
            this.closeAllMenus();
            this._openMediaDirectLink(article);
        };

        // 4. Divider
        const divider = doc.createElement('div');
        divider.className = 'maxpland-menu-divider';

        // 5. Open MaxPland Studio
        const openStudio = doc.createElement('button');
        openStudio.type = 'button';
        openStudio.className = 'maxpland-menu-item';
        openStudio.innerHTML = (this.icons.LOGO || DEFAULT_INJECTOR_ICONS.LOGO) + '<span>เปิด MaxPland Studio</span>';
        openStudio.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.closeAllMenus();
            if (typeof window !== 'undefined' && typeof window.openMaxPlandStudio === 'function') {
                window.openMaxPlandStudio();
            } else if (typeof document !== 'undefined') {
                const tb = document.getElementById('maxpland-trigger-btn');
                if (tb) tb.click();
            }
        };

        menu.append(dlSingle, dlAll, openTab, divider, openStudio);

        btn.onclick = (e) => {
            e.stopPropagation();
            const isShown = menu.classList.contains('show');
            this.closeAllMenus();
            if (!isShown) {
                const hasVideo = Boolean(article.querySelector('video'));
                const isCarousel = Boolean(article.querySelector('ul li') || article.querySelectorAll('button[aria-label*="Next"], button[aria-label*="ต่อไป"]').length);

                dlSingle.innerHTML = (this.icons.DOWNLOAD || DEFAULT_INJECTOR_ICONS.DOWNLOAD) + `<span>${hasVideo ? 'ดาวน์โหลดวิดีโอ (HD)' : 'ดาวน์โหลดรูปภาพ (HD)'}</span>`;
                dlAll.style.display = isCarousel ? 'flex' : 'none';
                menu.classList.add('show');
            }
        };

        btn.ondblclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.closeAllMenus();
            this._runFeedAction(article, btn, { allCarousel: false });
        };

        wrap.append(btn, menu);

        // Position inside section alongside bookmark or at end
        const bookmarkIcon = section.querySelector('svg[aria-label*="Save"], svg[aria-label*="บันทึก"], svg[aria-label*="Remove"], svg[aria-label*="ลบออก"], polygon');
        const bookmarkContainer = bookmarkIcon ? bookmarkIcon.closest('button, div[role="button"]') : null;
        if (bookmarkContainer && bookmarkContainer.parentElement) {
            bookmarkContainer.parentElement.insertBefore(wrap, bookmarkContainer);
        } else {
            const lastChild = section.lastElementChild;
            if (lastChild && lastChild !== section) {
                lastChild.appendChild(wrap);
            } else {
                section.appendChild(wrap);
            }
        }
    }

    injectInFeedDownloadButtons(root = (typeof document !== 'undefined' ? document : null)) {
        if (!root) return;
        const prefs = this.stateManager?.get?.('prefs') || (typeof window !== 'undefined' ? window.STATE?.prefs : null) || {};
        if (prefs.quickDownloadFeed === false) {
            if (typeof document !== 'undefined') {
                document.querySelectorAll('.maxpland-action-wrap').forEach(el => el.remove());
            }
            return;
        }
        const articles = root instanceof Element && root.matches('article')
            ? [root]
            : (typeof root.querySelectorAll === 'function' ? root.querySelectorAll('article') : []);
        articles.forEach(article => this.injectFeedButton(article));
    }

    async _runFeedAction(article, btn, options) {
        if (!btn || btn.classList.contains('loading')) return;
        btn.classList.add('loading');
        const origIcon = btn.innerHTML;
        btn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5"><circle cx="12" cy="12" r="9" stroke-dasharray="28" stroke-linecap="round"/></svg>`;

        try {
            if (this.mediaDownloader && typeof this.mediaDownloader.downloadFromArticle === 'function') {
                await this.mediaDownloader.downloadFromArticle(article, options);
            } else if (typeof window !== 'undefined' && typeof window.handleDirectMediaDownload === 'function') {
                await window.handleDirectMediaDownload(article, options);
            }
        } catch (err) {
            if (typeof alert === 'function') alert(err.message || String(err));
            else console.error(err);
        } finally {
            btn.classList.remove('loading');
            btn.innerHTML = origIcon;
        }
    }

    _openMediaDirectLink(article) {
        if (!article || typeof article.querySelector !== 'function') return;
        const video = article.querySelector('video');
        const img = article.querySelector('img[srcset]') || article.querySelector('img');
        const mediaUrl = video?.currentSrc || video?.src || img?.currentSrc || img?.src || null;
        if (mediaUrl && typeof window !== 'undefined') {
            window.open(mediaUrl, '_blank', 'noopener,noreferrer');
        } else if (typeof alert === 'function') {
            alert('ไม่พบ Media URL ของรายการนี้');
        }
    }

    /* ==========================================================================
       Story Toolbar Injection (Ghost/Stealth Seen Blocking)
       ========================================================================== */

    injectStoryToolbar(section) {
        this.injectStoryDownloadTools();
    }

    injectStoryDownloadTools() {
        if (typeof location === 'undefined' || typeof document === 'undefined') return;

        if (!location.pathname.startsWith('/stories/')) {
            const existing = document.getElementById('maxpland-story-bar');
            if (existing) existing.remove();
            return;
        }

        const prefs = this.stateManager?.get?.('prefs') || (typeof window !== 'undefined' ? window.STATE?.prefs : null) || {};
        if (prefs.quickDownloadStory === false) {
            const existing = document.getElementById('maxpland-story-bar');
            if (existing) existing.remove();
            return;
        }

        if (document.getElementById('maxpland-story-bar')) return;

        // Look for visible story section
        const storySections = document.querySelectorAll('section');
        let storyContainer = null;
        for (const s of storySections) {
            if (s.offsetWidth > 0 || s.offsetHeight > 0 || s.getClientRects().length > 0) {
                storyContainer = s;
                break;
            }
        }
        if (!storyContainer) storyContainer = document.querySelector('section');
        if (!storyContainer) return;

        const bar = document.createElement('div');
        bar.id = 'maxpland-story-bar';
        bar.className = 'maxpland-story-tools';

        const stealthBtn = document.createElement('button');
        stealthBtn.type = 'button';
        stealthBtn.id = 'maxpland-story-stealth-toggle';
        stealthBtn.className = 'maxpland-story-btn';

        const isStealth = prefs.stealthStory !== false;
        stealthBtn.style.background = isStealth ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
        stealthBtn.style.border = `1px solid ${isStealth ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`;
        stealthBtn.innerHTML = `<span>${isStealth ? '👁️ แอบส่อง: เปิด' : '👁️ แอบส่อง: ปิด'}</span>`;
        stealthBtn.title = isStealth ? 'โหมดแอบส่องเนียนเปิดอยู่ (ไม่ส่ง Seen)' : 'โหมดแอบส่องเนียนปิดอยู่ (ส่ง Seen ตามปกติ)';

        stealthBtn.onclick = () => {
            const next = !(this.stateManager?.get?.('prefs')?.stealthStory !== false);
            if (this.stateManager) {
                const curPrefs = this.stateManager.get('prefs') || {};
                this.stateManager.set('prefs', { ...curPrefs, stealthStory: next });
            } else if (typeof window !== 'undefined' && window.STATE) {
                window.STATE.prefs = window.STATE.prefs || {};
                window.STATE.prefs.stealthStory = next;
                if (typeof window.savePrefs === 'function') window.savePrefs();
            }

            stealthBtn.style.background = next ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)';
            stealthBtn.style.border = `1px solid ${next ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`;
            stealthBtn.innerHTML = `<span>${next ? '👁️ แอบส่อง: เปิด' : '👁️ แอบส่อง: ปิด'}</span>`;
            stealthBtn.title = next ? 'โหมดแอบส่องเนียนเปิดอยู่ (ไม่ส่ง Seen)' : 'โหมดแอบส่องเนียนปิดอยู่ (ส่ง Seen ตามปกติ)';

            const modalSwitch = document.getElementById('pref-switch-stealth-story');
            if (modalSwitch) modalSwitch.checked = next;

            if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
                window.showToast(next ? 'เปิดโหมดแอบส่องสตอรี่ (ไม่ขึ้น Seen)' : 'ปิดโหมดแอบส่องสตอรี่ (ส่ง Seen ตามปกติ)');
            }
        };

        bar.append(stealthBtn);
        document.body.appendChild(bar);
    }

    /* ==========================================================================
       Profile HD Avatar Badge Injection
       ========================================================================== */

    injectAvatarBadge(header) {
        this.injectProfileAvatarBadge();
    }

    injectProfileAvatarBadge() {
        if (typeof location === 'undefined' || typeof document === 'undefined') return;

        const pathParts = location.pathname.split('/').filter(Boolean);
        if (pathParts.length !== 1 || ['explore', 'stories', 'reels', 'direct', 'accounts'].includes(pathParts[0])) {
            const b = document.getElementById('maxpland-profile-avatar-btn');
            if (b) b.remove();
            return;
        }

        if (document.getElementById('maxpland-profile-avatar-btn')) return;

        const headerActions = document.querySelector('header section') || document.querySelector('header h2')?.parentElement;
        if (!headerActions) return;

        const uname = pathParts[0];
        const btn = document.createElement('button');
        btn.id = 'maxpland-profile-avatar-btn';
        btn.type = 'button';
        btn.className = 'maxpland-avatar-badge';
        btn.title = `ดาวน์โหลดรูปโปรไฟล์ HD ของ @${uname}`;
        btn.innerHTML = (this.icons.AVATAR || DEFAULT_INJECTOR_ICONS.AVATAR) + '<span>รูปโปรไฟล์ HD</span>';

        btn.onclick = async () => {
            btn.disabled = true;
            btn.textContent = 'กำลังดึง HD...';
            try {
                let hdUrl = null;
                if (this.igProfile && typeof this.igProfile.getProfileHD === 'function') {
                    hdUrl = await this.igProfile.getProfileHD(uname);
                } else if (typeof window !== 'undefined' && window.IgBridge?.fetchUserProfileHD) {
                    hdUrl = await window.IgBridge.fetchUserProfileHD(uname);
                }

                const fallbackImg = document.querySelector('header img[alt*="profile"]');
                const finalUrl = hdUrl || fallbackImg?.currentSrc || fallbackImg?.src;
                if (!finalUrl) throw new Error('ไม่พบรูปโปรไฟล์');

                const filename = `${uname}_profile_hd_${Date.now()}.jpg`;
                if (typeof GM_download === 'function') {
                    GM_download({ url: finalUrl, name: filename });
                } else if (typeof window !== 'undefined' && typeof window.gmDownload === 'function') {
                    await window.gmDownload(finalUrl, filename);
                }

                if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
                    window.showToast(`ดาวน์โหลดรูปโปรไฟล์ HD ของ @${uname} เรียบร้อย`);
                }
            } catch (err) {
                if (typeof alert === 'function') {
                    alert(`ดาวน์โหลดรูปโปรไฟล์ล้มเหลว: ${err.message || err}`);
                }
            } finally {
                btn.disabled = false;
                btn.innerHTML = (this.icons.AVATAR || DEFAULT_INJECTOR_ICONS.AVATAR) + '<span>รูปโปรไฟล์ HD</span>';
            }
        };

        headerActions.appendChild(btn);
    }

    /* ==========================================================================
       Teardown & Cleanup
       ========================================================================== */

    destroy() {
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        if (typeof document !== 'undefined') {
            document.removeEventListener('click', this._handleClickOutside);
            document.querySelectorAll('.maxpland-action-wrap, #maxpland-story-bar, #maxpland-profile-avatar-btn').forEach(el => el.remove());
        }
        this.observers.clear();
        this.isStarted = false;
    }
}

// Global & CommonJS Export Pattern
if (typeof window !== 'undefined') {
    window.DOMInjector = DOMInjector;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DOMInjector };
}
