'use strict';
const enabled = document.querySelector('#enabled');
const mode = document.querySelector('#mode');
const count = document.querySelector('#count');
const strict = document.querySelector('#strict');
const copyLog = document.querySelector('#copyLog');
const allowOnce = document.querySelector('#allowOnce');
const message = document.querySelector('#message');

function render(items) {
  enabled.checked = items.enabled !== false;
  mode.value = items.mode === 'premature' ? 'premature' : 'never';
  count.textContent = String(items.blockedCount || 0);
  mode.disabled = !enabled.checked;
  strict.checked = items.strict !== false;
  strict.disabled = !enabled.checked;
}
chrome.storage.local.get({ enabled: true, mode: 'never', strict: true, blockedCount: 0 }, render);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') chrome.storage.local.get({ enabled: true, mode: 'never', strict: true, blockedCount: 0 }, render);
});
enabled.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: enabled.checked });
  mode.disabled = !enabled.checked;
  strict.disabled = !enabled.checked;
});
mode.addEventListener('change', () => {
  chrome.storage.local.set({ mode: mode.value });
});
strict.addEventListener('change', () => {
  chrome.storage.local.set({ strict: strict.checked });
});
allowOnce.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || !tab.id) {
    message.textContent = 'Open Disney+ first.';
    return;
  }
  try {
    const answer = await chrome.tabs.sendMessage(tab.id, { type: 'allow-once' });
    message.textContent = answer && answer.ok ? 'Next switch permitted for 15 seconds.' : 'Open Disney+ first.';
  } catch {
    message.textContent = 'Open or refresh a Disney+ tab first.';
  }
});

copyLog.addEventListener('click', async () => {
  const { diagnostics = [], blockedCount = 0 } = await chrome.storage.local.get({ diagnostics: [], blockedCount: 0 });
  const report = JSON.stringify({ extension: 'Disney+ Episode Guard', version: '1.1.0',
    blockedCount, events: diagnostics }, null, 2);
  try {
    await navigator.clipboard.writeText(report);
    message.textContent = 'Diagnostic report copied.';
  } catch (_) {
    message.textContent = 'Could not copy report. Check clipboard permissions.';
  }
});
