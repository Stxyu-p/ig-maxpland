/* ==========================================================================
   TemplateEngine & ComponentRegistry
   Lightweight zero-dependency templating and component registry for Clean
   Architecture (v3.0.0)
   ========================================================================== */

const TemplateEngine = (() => {
    'use strict';

    const components = new Map();

    // ─── Sanitization & Escaping ────────────────────────────────────────────
    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Resolve nested object property e.g. "user.profile.name"
    function resolvePath(obj, path) {
        return path.split('.').reduce((acc, part) => (acc != null ? acc[part] : undefined), obj);
    }

    // ─── Template Interpolation ─────────────────────────────────────────────
    /**
     * Renders a template string by replacing {{key}} or {{!rawKey}} tokens.
     * Tokens prefixed with "!" (e.g. {{!htmlContent}}) are rendered unescaped.
     * All standard {{key}} tokens are automatically HTML-escaped.
     *
     * @param {string} template - Template string
     * @param {Object} data - Context object
     * @returns {string} Interpolated HTML string
     */
    function render(template, data = {}) {
        if (typeof template !== 'string') return '';

        return template.replace(/\{\{(!?)\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, rawFlag, key) => {
            const val = resolvePath(data, key);
            if (val === undefined || val === null) return '';
            return rawFlag === '!' ? String(val) : escapeHtml(val);
        });
    }

    // ─── Component Registry ─────────────────────────────────────────────────
    function registerComponent(name, renderer) {
        if (typeof renderer === 'function') {
            components.set(name, renderer);
        } else if (typeof renderer === 'string') {
            components.set(name, props => render(renderer, props));
        } else {
            throw new Error(`[TemplateEngine] Invalid renderer for component "${name}"`);
        }
    }

    function renderComponent(name, props = {}) {
        const renderer = components.get(name);
        if (!renderer) {
            console.warn(`[TemplateEngine] Component "${name}" not found`);
            return '';
        }
        return renderer(props);
    }

    // ─── Pre-registered MaxPland Components ─────────────────────────────────
    registerComponent('statCard', ({ cardClass = '', targetFilter = '', label = '', value = '-', id = '' }) => `
        <div class="maxpland-stat-card ${escapeHtml(cardClass)}" ${targetFilter ? `data-target-filter="${escapeHtml(targetFilter)}"` : ''}>
            <span class="maxpland-stat-label">${escapeHtml(label)}</span>
            <span class="maxpland-stat-value" ${id ? `id="${escapeHtml(id)}"` : ''}>${escapeHtml(value)}</span>
        </div>
    `);

    registerComponent('pillButton', ({ filter = '', icon = '', label = '', count = '-', countId = '', active = false }) => `
        <button class="maxpland-pill-btn ${active ? 'active' : ''}" data-filter="${escapeHtml(filter)}">
            ${icon ? `${icon} ` : ''}${escapeHtml(label)}
            <span class="maxpland-pill-count" ${countId ? `id="${escapeHtml(countId)}"` : ''}>${escapeHtml(count)}</span>
        </button>
    `);

    registerComponent('statusTag', ({ tagClass = '', text = '', icon = '' }) => `
        <span class="maxpland-status-tag ${escapeHtml(tagClass)}">
            ${icon ? `${icon} ` : ''}${escapeHtml(text)}
        </span>
    `);

    registerComponent('userRow', ({ user, tagClass = '', tagText = '', isSelected = false, isWhitelisted = false }) => {
        const uid = escapeHtml(user?.id || user?.pk_id || user?.pk || '');
        const uname = escapeHtml(user?.username || '');
        const fullName = escapeHtml(user?.full_name || '');
        const avatarUrl = user?.profile_pic_url ? escapeHtml(user.profile_pic_url) : '';

        return `
            <div class="maxpland-user-row" data-id="${uid}" data-username="${uname}">
                <div class="maxpland-user-check">
                    <input type="checkbox" class="maxpland-checkbox user-select-checkbox" data-id="${uid}" aria-label="เลือก @${uname}" ${isSelected ? 'checked' : ''}>
                </div>
                <div class="maxpland-user-avatar">
                    ${avatarUrl ? `<img src="${avatarUrl}" alt="${uname}" loading="lazy">` : '<div class="maxpland-avatar-placeholder">?</div>'}
                </div>
                <div class="maxpland-user-info">
                    <div class="maxpland-user-name-line">
                        <a href="https://www.instagram.com/${uname}/" target="_blank" rel="noopener noreferrer" class="maxpland-username">@${uname}</a>
                        ${user?.is_verified ? '<span class="maxpland-verified-badge" title="Verified">✓</span>' : ''}
                        ${user?.is_private ? '<span class="maxpland-private-badge" title="Private">🔒</span>' : ''}
                        ${tagText ? `<span class="maxpland-status-tag ${escapeHtml(tagClass)}">${escapeHtml(tagText)}</span>` : ''}
                    </div>
                    ${fullName ? `<div class="maxpland-fullname">${fullName}</div>` : ''}
                </div>
                <div class="maxpland-user-actions">
                    <button type="button" class="maxpland-icon-btn btn-toggle-whitelist" data-id="${uid}" data-username="${uname}" title="${isWhitelisted ? 'นำออกจาก Whitelist' : 'เพิ่มใน Whitelist'}">
                        ${isWhitelisted ? '★' : '☆'}
                    </button>
                    <button type="button" class="maxpland-btn-sm maxpland-btn-unfollow" data-id="${uid}" data-username="${uname}">
                        เลิกติดตาม
                    </button>
                </div>
            </div>
        `;
    });

    // ─── Public API ─────────────────────────────────────────────────────────
    return {
        escapeHtml,
        render,
        registerComponent,
        renderComponent,
        hasComponent(name) {
            return components.has(name);
        },
        listComponents() {
            return Array.from(components.keys());
        }
    };
})();

// ─── Global Exposure & Export ───────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.TemplateEngine = TemplateEngine;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TemplateEngine };
}
