// Injects the shipped userscript into the fixture page with GM_* stubs.
// Used by the bsk-driven browser test: `bsk evaluate --session X "(async()=>{...})()"`.
(async () => {
  const GM_STUBS = `
    window.unsafeWindow = window;
    window.__gmCalls = [];
    window.GM_download = (o) => { window.__gmCalls.push(['download', o.url, o.name]); o.onload && o.onload(); };
    window.GM_notification = (o) => { window.__gmCalls.push(['notify', o.text]); };
    window.GM_setClipboard = (t) => { window.__gmCalls.push(['clipboard', String(t).slice(0, 40)]); };
    window.GM_registerMenuCommand = (name, fn) => { window.__gmCalls.push(['menu', name]); };
  `;
  (0, eval)(GM_STUBS);
  const src = await (await fetch('/__fixture/userscript.js')).text();
  try {
    (0, eval)(src);
    return { ok: true, bytes: src.length };
  } catch (err) {
    return { ok: false, error: String(err && err.stack || err) };
  }
})()
