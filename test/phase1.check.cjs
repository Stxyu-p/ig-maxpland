// Run: node test/phase1.check.cjs — Comprehensive Phase 1 Core Modules test runner
const assert = require('node:assert/strict');
const path = require('node:path');

console.log('--- Testing Phase 1 Core Modules ---');

// Mock browser environment for modules that check DOM/window
global.document = {
    cookie: 'ds_user_id=123456; csrftoken=csrftoken_val_123',
    createElement: () => ({ setAttribute() {}, appendChild() {}, click() {} })
};
global.window = {
    fetch: async () => ({ ok: true, status: 200, text: async () => '{}', json: async () => ({}) })
};
global.URL = globalThis.URL;
global.URLSearchParams = globalThis.URLSearchParams;

// 1. Test IgAuth
const { IgAuth } = require('../src/modules/IgAuth.js');
assert.equal(IgAuth.getAppId(), '936619743392459');
assert.equal(IgAuth.getCookie('ds_user_id'), '123456');
assert.equal(IgAuth.getCookie('csrftoken'), 'csrftoken_val_123');
assert.equal(IgAuth.isSessionError({ code: 'AUTH' }), true);
assert.equal(IgAuth.isSessionError({ code: 'CHECKPOINT' }), true);
assert.equal(IgAuth.isSessionError({ code: 'RATE_LIMIT' }), true);
assert.equal(IgAuth.isSessionError({ code: 'ACCOUNT_CHANGED' }), true);
assert.equal(IgAuth.isSessionError(new Error('something else')), false);
assert.doesNotThrow(() => IgAuth.validateAccount('123456'));
assert.throws(() => IgAuth.validateAccount('999999'), /บัญชีเปลี่ยน|ACCOUNT_CHANGED/);
console.log('PASS: IgAuth (Cookie, Account validation, Error types)');

// 2. Test IgTransport
global.IgAuth = IgAuth;
const { IgTransport } = require('../src/modules/IgTransport.js');
global.IgTransport = IgTransport;
assert.equal(typeof IgTransport.request, 'function');
assert.equal(typeof IgTransport.fetchAllRelationships, 'function');
console.log('PASS: IgTransport (Interface & signatures)');

// 3. Test IgRelationship
const { IgRelationship } = require('../src/modules/IgRelationship.js');
const followers = [
    { id: '10', username: 'user_fan', profile_pic_url: '' },
    { id: '20', username: 'user_mutual', profile_pic_url: 'https://cdn/valid.jpg' }
];
const following = [
    { id: '20', username: 'user_mutual' },
    { id: '30', username: 'user_not_following_back' }
];
const prevSnapshot = {
    follower_ids: ['20', '99'],
    follower_usernames: { '99': 'lost_buddy' }
};

const diff = IgRelationship.computeDiff(followers, following, prevSnapshot);
assert.deepEqual(diff.notFollowingBack.map(u => u.id), ['30'], 'notFollowingBack correct');
assert.deepEqual(diff.fans.map(u => u.id), ['10'], 'fans correct');
assert.deepEqual(diff.mutual.map(u => u.id), ['20'], 'mutual correct');
assert.equal(diff.lostFollowers.length, 1, 'lostFollowers found 1');
assert.equal(diff.lostFollowers[0].id, '99');
assert.equal(diff.lostFollowers[0].username, 'lost_buddy');

const ghosts = IgRelationship.detectGhostFollowers(followers);
assert.equal(ghosts.length, 1);
assert.equal(ghosts[0].id, '10');
console.log('PASS: IgRelationship (Diffing, Mutual, Fans, Lost migration, Ghost detection)');

// 4. Test IgMedia
const { IgMedia } = require('../src/modules/IgMedia.js');
assert.equal(IgMedia.shortcodeToMediaId('B_x1'), '523381');
console.log('PASS: IgMedia (Shortcode conversion & Media interface)');

// 5. Test IgProfile
const { IgProfile } = require('../src/modules/IgProfile.js');
assert.equal(typeof IgProfile.getProfileHD, 'function');
assert.equal(typeof IgProfile.getLastPost, 'function');
console.log('PASS: IgProfile (getProfileHD & getLastPost interfaces)');

// 6. Test IgUnfollow
const { IgUnfollow } = require('../src/modules/IgUnfollow.js');
assert.equal(typeof IgUnfollow.execute, 'function');
console.log('PASS: IgUnfollow (execute interface)');

console.log('All Phase 1 modules verified successfully!');
