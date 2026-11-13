/* Disney+ Episode Guard isolated-world bridge; no remote telemetry. */
(() => {
  'use strict';
  const SOURCE = 'disneyplus-episode-guard-v1';
  const DEFAULTS = { enabled: true, mode: 'never', strict: true, keepPrompt: true, showExit: true, scriptedCountV13: 0, promptDismissV14: 0, diagnosticsV13: [] };
  function sendConfig(items) {
    window.postMessage({
      source: SOURCE, type: 'config',
      enabled: items.enabled !== false,
      mode: items.mode === 'premature' ? 'premature' : 'never',
      strict: items.strict !== false,
      keepPrompt: items.keepPrompt !== false,
      showExit: items.showExit !== false
    }, location.origin);
  }
  chrome.storage.local.get(DEFAULTS, sendConfig);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !('enabled' in changes || 'mode' in changes || 'strict' in changes || 'keepPrompt' in changes || 'showExit' in changes)) return;
    chrome.storage.local.get(DEFAULTS, sendConfig);
  });

  let pending = [];
  let flushTimer = 0;
  let flushing = false;
  function queueLog(msg) {
    pending.push({ at: msg.at || new Date().toISOString(), kind: msg.kind || 'unknown',
      reason: msg.reason || undefined, t: msg.t, d: msg.d,
      from: msg.from, to: msg.to, newVideo: msg.newVideo, watchToWatch: msg.watchToWatch,
      paused: msg.paused, manual: msg.manual, version: msg.version, strategy: msg.strategy });
    if (pending.length > 150) pending = pending.slice(-150);
    if (!flushTimer) flushTimer = setTimeout(flush, 250);
  }
  async function flush() {
    clearTimeout(flushTimer);
    flushTimer = 0;
    if (flushing) return;
    flushing = true;
    try {
      while (pending.length) {
        const batch = pending.splice(0, 150);
        const { diagnosticsV13 = [] } = await chrome.storage.local.get({ diagnosticsV13: [] });
        await chrome.storage.local.set({ diagnosticsV13: [...diagnosticsV13, ...batch].slice(-150) });
      }
    } catch (_error) {
      // Storage may be unavailable when the tab closes; do not break playback.
    } finally {
      flushing = false;
      if (pending.length && !flushTimer) flushTimer = setTimeout(flush, 250);
    }
  }

  let lastCountAt = 0;
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const msg = event.data;
    if (!msg || msg.source !== SOURCE) return;
    if (msg.type === 'page-ready') chrome.storage.local.get(DEFAULTS, sendConfig);
    if (msg.type === 'trace') queueLog(msg);
    if (msg.type === 'blocked') {
      const at = Date.now();
      if (at - lastCountAt < 400) return;
      lastCountAt = at;
      const key = msg.reason === 'prompt-dismiss' ? 'promptDismissV14' : 'scriptedCountV13';
      chrome.storage.local.get({ [key]: 0 }, result => {
        chrome.storage.local.set({ [key]: result[key] + 1 });
      });
    }
  });
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'allow-once') {
      window.postMessage({ source: SOURCE, type: 'allow-once' }, location.origin);
      sendResponse({ ok: true });
    }
  });
})();
