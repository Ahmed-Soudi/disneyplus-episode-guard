'use strict';
const enabled = document.querySelector('#enabled');
const mode = document.querySelector('#mode');
const count = document.querySelector('#count');
const strict = document.querySelector('#strict');
const keepPrompt = document.querySelector('#keepPrompt');
const showExit = document.querySelector('#showExit');
const promptCount = document.querySelector('#promptCount');
const copyLog = document.querySelector('#copyLog');
const allowOnce = document.querySelector('#allowOnce');
const message = document.querySelector('#message');

function render(items) {
  enabled.checked = items.enabled !== false;
  mode.value = items.mode === 'premature' ? 'premature' : 'never';
  count.textContent = String(items.scriptedCountV13 || 0);
  promptCount.textContent = String(items.promptDismissV14 || 0);
  keepPrompt.checked = items.keepPrompt !== false;
  showExit.checked = items.showExit !== false;
  showExit.disabled = !enabled.checked;
  keepPrompt.disabled = !enabled.checked;
  showExit.disabled = !enabled.checked;
  mode.disabled = !enabled.checked;
  strict.checked = items.strict !== false;
  strict.disabled = !enabled.checked;
}
chrome.storage.local.get({ enabled: true, mode: 'never', strict: true, keepPrompt: true, showExit: true, scriptedCountV13: 0, promptDismissV14: 0 }, render);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') chrome.storage.local.get({ enabled: true, mode: 'never', strict: true, keepPrompt: true, showExit: true, scriptedCountV13: 0, promptDismissV14: 0 }, render);
});
enabled.addEventListener('change', () => {
  chrome.storage.local.set({ enabled: enabled.checked });
  mode.disabled = !enabled.checked;
  strict.disabled = !enabled.checked;
  keepPrompt.disabled = !enabled.checked;
  showExit.disabled = !enabled.checked;
});
mode.addEventListener('change', () => {
  chrome.storage.local.set({ mode: mode.value });
});
strict.addEventListener('change', () => {
  chrome.storage.local.set({ strict: strict.checked });
});
keepPrompt.addEventListener('change', () => {
  chrome.storage.local.set({ keepPrompt: keepPrompt.checked });
});
showExit.addEventListener('change', () => chrome.storage.local.set({ showExit: showExit.checked }));
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
  const { diagnostics = [], diagnosticsV13 = [], scriptedCountV13 = 0, promptDismissV14 = 0 } = await chrome.storage.local.get({ diagnostics: [], diagnosticsV13: [], scriptedCountV13: 0, promptDismissV14: 0 });
  const report = JSON.stringify({ extension: 'Disney+ Episode Guard', version: '1.5.0',
    scriptedClicksBlocked: scriptedCountV13, popupDismissalsBlocked: promptDismissV14, events: diagnosticsV13, priorVersionEvents: diagnostics.slice(-30) }, null, 2);
  try {
    await navigator.clipboard.writeText(report);
    message.textContent = 'Diagnostic report copied.';
  } catch (_) {
    message.textContent = 'Could not copy report. Check clipboard permissions.';
  }
});
