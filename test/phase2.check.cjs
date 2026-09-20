// Run: node test/phase2.check.cjs — Comprehensive Phase 2 State & UI Architecture test runner
const assert = require('node:assert/strict');

console.log('--- Testing Phase 2 State & UI Architecture ---');

// Mock browser globals
const domElements = new Map();
global.document = {
    getElementById(id) {
        if (!domElements.has(id)) {
            domElements.set(id, { style: {}, textContent: '', innerHTML: '', classList: { add() {}, remove() {}, toggle() {} } });
        }
        return domElements.get(id);
    }
};

// 1. Test StateManager
const { StateManager } = require('../src/core/StateManager.js');
const { IgRelationship } = require('../src/modules/IgRelationship.js');
const sm = new StateManager();

assert.equal(sm.get('activeTab'), 'relationship');
assert.equal(sm.get('searchQuery'), '');

let stateEvents = [];
sm.on('change:activeTab', data => stateEvents.push(data));
sm.set('activeTab', 'health');
assert.equal(sm.get('activeTab'), 'health');
assert.equal(stateEvents.length, 1);
assert.equal(stateEvents[0].current, 'health');

// Relationships integration
sm.setRelationships(
    [{ id: '1', username: 'user1', profile_pic_url: '' }],
    [{ id: '1', username: 'user1' }, { id: '2', username: 'user2' }],
    null,
    IgRelationship
);
assert.equal(sm.get('followers').length, 1);
assert.equal(sm.get('following').length, 2);
assert.equal(sm.get('notFollowingBack').length, 1);
assert.equal(sm.get('mutual').length, 1);
assert.equal(sm.get('ghostFollowers').length, 1);

// Whitelist Undo / Redo
sm.toggleWhitelist('10', 'star_user');
assert.equal(sm.get('whitelist').has('10'), true);
assert.equal(sm.canUndo, true);
assert.equal(sm.undo(), true);
assert.equal(sm.get('whitelist').has('10'), false);
assert.equal(sm.canRedo, true);
assert.equal(sm.redo(), true);
assert.equal(sm.get('whitelist').has('10'), true);
console.log('PASS: StateManager (State, Events, Relationships diffing, Undo/Redo)');

// 2. Test ProgressController
const { ProgressController } = require('../src/ui/ProgressController.js');
ProgressController.start({ title: 'สแกนทดสอบ...', total: 200 });
assert.equal(domElements.get('maxpland-global-progress').style.display, 'block');
assert.equal(domElements.get('maxpland-scan-phase').textContent, 'สแกนทดสอบ...');

ProgressController.update({ current: 100, total: 200, page: 2 });
assert.equal(domElements.get('maxpland-progress-fill').style.width, '50%');
assert.equal(domElements.get('maxpland-scan-stat-page').textContent, 'หน้า: 2');

ProgressController.finish({ success: true, summary: 'ดึงข้อมูลสำเร็จ' });
assert.equal(domElements.get('maxpland-progress-fill').style.width, '100%');
assert.equal(domElements.get('maxpland-scan-status-summary').textContent, 'ดึงข้อมูลสำเร็จ');

ProgressController.hide();
assert.equal(domElements.get('maxpland-global-progress').style.display, 'none');
console.log('PASS: ProgressController (Start, Update, Finish, Hide)');

// 3. Test FilterEngine
const { FilterEngine } = require('../src/core/FilterEngine.js');
const filterSm = new StateManager({
    notFollowingBack: [
        { id: '101', username: 'alpha', is_verified: true, full_name: 'Alpha Guy' },
        { id: '102', username: 'beta', is_verified: false, full_name: 'Beta Tester' },
        { id: '103', username: 'gamma', is_verified: false, is_private: true }
    ],
    following: [{ id: '101' }, { id: '102' }]
});
const fe = new FilterEngine(filterSm);

let initialResults = fe.apply();
assert.equal(initialResults.length, 3);

// SubFilter: excludeVerified
fe.setSubFilter('excludeVerified', true);
assert.deepEqual(fe.apply().map(u => u.id), ['102', '103']);

// Chip: onlyFollowing
fe.setFollowStateChip('onlyFollowing');
assert.deepEqual(fe.apply().map(u => u.id), ['102']);

// Chip: switch to onlyNotFollowed
fe.setFollowStateChip('onlyNotFollowed');
assert.deepEqual(fe.apply().map(u => u.id), ['103']);

// Search Query
fe.setSearchQuery('tester');
fe.setFollowStateChip('onlyNotFollowed'); // toggle off
fe.setSubFilter('excludeVerified', false);
assert.deepEqual(fe.apply().map(u => u.id), ['102']);
console.log('PASS: FilterEngine (Faceted queries, Mutually exclusive chips, Subscriptions)');

// 4. Test TemplateEngine
const { TemplateEngine } = require('../src/ui/TemplateEngine.js');
const safeHtml = TemplateEngine.escapeHtml('<b>"quoted" & \'test\'</b>');
assert.equal(safeHtml, '&lt;b&gt;&quot;quoted&quot; &amp; &#39;test&#39;&lt;/b&gt;');

const interpolated = TemplateEngine.render('Welcome, {{user.name}}! ID: {{user.id}} {{!raw}}', {
    user: { name: '<Admin>', id: 42 },
    raw: '<span>raw</span>'
});
assert.equal(interpolated, 'Welcome, &lt;Admin&gt;! ID: 42 <span>raw</span>');

// Pre-registered components
const cardHtml = TemplateEngine.renderComponent('statCard', { label: 'Lost', value: '5', cardClass: 'card-lost' });
assert.ok(cardHtml.includes('card-lost'));
assert.ok(cardHtml.includes('Lost'));
assert.ok(cardHtml.includes('5'));

const rowHtml = TemplateEngine.renderComponent('userRow', {
    user: { id: '77', username: 'sam', is_verified: true }
});
assert.ok(rowHtml.includes('user-select-checkbox'));
assert.ok(rowHtml.includes('aria-label="เลือก @sam"'));
assert.ok(rowHtml.includes('✓'));
console.log('PASS: TemplateEngine (XSS Escaping, Variable Interpolation, Component Registry)');

console.log('All Phase 2 modules verified successfully!');
