/* Disney+ Episode Guard v1.5.0: conservative prompt guard + manual exit fallback.
 * In particular, DO NOT cancel History API calls or media source setters.
 * The application's internal state must remain in sync with browser state.
 */
(() => {
  'use strict';
  if (window.__disneyEpisodeGuardInstalled) return;
  Object.defineProperty(window, '__disneyEpisodeGuardInstalled', { value: true });

  const SOURCE = 'disneyplus-episode-guard-v1';
  const settings = { enabled: true, mode: 'never', strict: true, keepPrompt: true, showExit: true };
  const watched = new WeakSet();
  const shadowRoots = new Set();
  const closePattern = /^(?:close|dismiss|close prompt|dismiss prompt|close next episode|dismiss next episode|×|✕|✖|x|اغلاق|إغلاق|fermer|cerrar|schlie[ßs]en|fechar|chiudi|닫기|閉じる)$/i;
  const closeIdPattern = /(?:up[-_ ]?next|next[-_ ]?episode)[-_ ]?(?:close|dismiss)|(?:close|dismiss)[-_ ]?(?:up[-_ ]?next|next[-_ ]?episode)/i;
  const nextPattern = /next\s*(episode|ep\b)|up\s*next|play\s*next|following\s*episode|episode\s*suivant|prochain\s*[ée]pisode|pr[oó]ximo\s*epis[oó]dio|siguiente\s*episodio|n[aä]chste\s*folge|prossimo\s*episodio|volgende\s*aflevering|الحلقة\s*التالية|الحلقة\s*القادمة|次のエピソード|다음\s*에피소드/i;
  let active = null;
  let lastUserActionAt = 0;
  let overrideUntil = 0;
  let lastUrl = location.href;
  let lastPromptAt = 0;
  let scanPending = false;
  let exitButton = null;
  let lastCatalogUrl = null;
  const EXIT_BUTTON_ID = 'disney-episode-guard-exit';

  const now = () => Date.now();
  const rounded = n => Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;
  const watching = () => /(?:^|\/)play(?:\/|$)/i.test(location.pathname);
  function safeCatalogUrl(url) {
    if (typeof url !== 'string' || !url.trim()) return null;
    try {
      const candidate = new URL(url, location.origin);
      if (candidate.origin !== location.origin || /(?:^|\/)play(?:\/|$)/i.test(candidate.pathname)) return null;
      return candidate.origin + candidate.pathname; // Do not retain query parameters.
    } catch (_) { return null; }
  }
  lastCatalogUrl = safeCatalogUrl(document.referrer);
  function catalogDestination() {
    if (lastCatalogUrl) return lastCatalogUrl;
    const locale = location.pathname.match(/^\/([a-z]{2}-[a-z]{2})(?=\/|$)/i);
    return location.origin + (locale ? `/${locale[1]}/home` : '/home');
  }
  function nearCredits() {
    if (!active) return false;
    if (active.ended || active.video.ended) return true;
    const d = Number(active.video.duration);
    const t = Number(active.video.currentTime);
    return Number.isFinite(d) && d > 30 && Number.isFinite(t) && t >= d - 20;
  }
  function hasNextPopup() {
    for (const candidate of document.querySelectorAll('button, [role="button"]')) {
      if (isCloseControl(candidate) && findNextPrompt(candidate)) return true;
    }
    return false;
  }
  function updateExitButton() {
    const show = settings.enabled && settings.showExit && watching() && (nearCredits() || hasNextPopup());
    if (!show) {
      if (exitButton) exitButton.style.display = 'none';
      return;
    }
    if (!document.body) return;
    if (!exitButton) {
      exitButton = document.createElement('button');
      exitButton.id = EXIT_BUTTON_ID;
      exitButton.type = 'button';
      exitButton.textContent = '← Exit player';
      exitButton.setAttribute('aria-label', 'Exit Disney+ player to browsing');
      exitButton.style.cssText = 'position:fixed;bottom:84px;left:20px;z-index:2147483647;pointer-events:auto;padding:9px 13px;border:1px solid #8be9fa;border-radius:9px;background:#112842;color:#fff;font:600 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 3px 14px #0009';
      exitButton.addEventListener('pointerdown', event => event.stopPropagation());
      exitButton.addEventListener('click', event => {
        if (!event.isTrusted) return; // No scripted navigation from page content.
        event.preventDefault();
        event.stopImmediatePropagation();
        trace('exit-button-used', mediaInfo());
        location.assign(catalogDestination());
      });
    }
    if (!exitButton.isConnected) document.body.appendChild(exitButton);
    exitButton.style.display = 'block';
  }
  const isPremature = () => settings.mode === 'never' || !active || !active.ended;
  const isManual = () => now() - lastUserActionAt < 8000 || now() < overrideUntil;
  const mediaInfo = () => active ? { t: rounded(active.video.currentTime), d: rounded(active.video.duration), paused: !!active.video.paused } : {};

  function message(type, args = {}) {
    window.postMessage({ source: SOURCE, type, ...args }, location.origin);
  }
  function trace(kind, args = {}) {
    // Intentionally does not log URLs, episode IDs, captions, account info or media sources.
    message('trace', { at: new Date().toISOString(), kind, ...args });
  }
  function linkedEpisode(node) {
    for (let e = node; e && e.nodeType === 1; e = e.parentElement) {
      if (!['BUTTON', 'A'].includes(e.tagName) && !/^(button|link)$/i.test(e.getAttribute('role') || '')) continue;
      const value = [e.getAttribute('aria-label'), e.getAttribute('title'), e.getAttribute('data-testid'), e.textContent?.slice(0, 110)].filter(Boolean).join(' ');
      return nextPattern.test(value);
    }
    return false;
  }
  // Guard only a locally identified Next Episode prompt. Avoid broad containers
  // (player / page / header) so the player's Back/Exit/rewind actions are untouched.
  function controlText(element) {
    return [element.getAttribute('aria-label'), element.getAttribute('title'),
      element.getAttribute('data-testid'), (element.textContent || '').trim().slice(0, 110)]
      .filter(Boolean).join(' ').trim();
  }
  function isCloseControl(element) {
    if (!element || element.nodeType !== 1) return false;
    const label = (element.getAttribute('aria-label') || element.getAttribute('title') ||
      (element.textContent || '').trim()).trim();
    const testid = element.getAttribute('data-testid') || '';
    return closePattern.test(label) || closeIdPattern.test(testid);
  }
  function isNextControl(element) {
    return element && element.nodeType === 1 && nextPattern.test(controlText(element));
  }
  function nearestControl(node) {
    for (let el = node; el && el.nodeType === 1; el = el.parentElement) {
      if (el.matches?.('button, a, [role="button"]')) return el;
    }
    return null;
  }
  function findNextPrompt(closeControl) {
    // A close button is protected only if a nearby, small popup also contains
    // a distinct Next Episode button. Refuse if a video, nav, or Back button is
    // inside that ancestor: it would be the full player instead of a prompt.
    let root = closeControl.parentElement;
    for (let depth = 0; root && depth < 5; depth++, root = root.parentElement) {
      if (['BODY', 'HTML', 'MAIN', 'NAV', 'HEADER'].includes(root.tagName)) break;
      if (!root.querySelectorAll) continue;
      const buttons = [...root.querySelectorAll('button, a, [role="button"]')];
      if (buttons.length > 10 || root.querySelector('video, nav')) break;
      if (buttons.some(button => /^(?:back|exit|go back|return)$/i.test(
        (button.getAttribute('aria-label') || button.getAttribute('title') || '').trim()))) break;
      if (buttons.some(button => button !== closeControl && isNextControl(button))) return root;
    }
    return null;
  }
  function blockPromptDismiss(event) {
    if (!settings.enabled || !settings.keepPrompt || !watching()) return false;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    // In shadow DOM, use the composed path instead of an outside retargeted node.
    const target = path.find(node => node && node.nodeType === 1 && nearestControl(node));
    const control = target && nearestControl(target);
    if (!control || control.id === EXIT_BUTTON_ID || !isCloseControl(control) || !findNextPrompt(control)) return false;
    // Disney's top-left player Back can be an X/Close control. Never intercept it.
    const rect = typeof control.getBoundingClientRect === 'function' ? control.getBoundingClientRect() : null;
    if (rect && rect.width > 0 && rect.height > 0 &&
        rect.left < window.innerWidth * .28 && rect.top < window.innerHeight * .3) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'click') {
      message('blocked', { reason: 'prompt-dismiss' });
      trace('prompt-dismiss-blocked', mediaInfo());
    }
    return true;
  }
  function onClick(event) {
    if (blockPromptDismiss(event)) return;
    if (!settings.enabled || !settings.strict || !watching() || !active || !isPremature() || now() < overrideUntil) return;
    if (event.isTrusted) return; // Humans can navigate Back, rewind, or choose Next Episode.
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
    if (!path.some(node => node && node.nodeType === 1 && linkedEpisode(node))) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    message('blocked', { reason: 'synthetic-next-click' });
    trace('blocked-scripted-next', { ...mediaInfo() });
  }
  function onUserInput(event) {
    if (event.isTrusted) lastUserActionAt = now();
  }
  function observeInput(root) {
    // Only observes human input; never cancels it. Capture early to classify transitions.
    root.addEventListener('pointerdown', onUserInput, true);
    root.addEventListener('keydown', onUserInput, true);
    root.addEventListener('click', onClick, true);
  }
  observeInput(window);

  function register(video) {
    if (watched.has(video)) return;
    watched.add(video);
    trace('video-found');
    const state = { video, lastTime: 0, duration: 0, ended: !!video.ended, src: video.currentSrc || '', progressTraceAt: 0 };
    if (!active || !active.video.isConnected || !active.video.paused) active = state;

    function update(eventType) {
      if (!watching()) return;
      const t = Number(video.currentTime);
      const d = Number(video.duration);
      const src = video.currentSrc || '';
      if (eventType === 'playing' || eventType === 'play' || (eventType === 'timeupdate' && !video.paused)) {
        if (active && active.video !== video && !active.ended && active.lastTime > 8) {
          trace('video-replaced', { t: rounded(active.lastTime), d: rounded(active.duration), manual: isManual() });
        }
        active = state;
      }
      if (active === state) {
        if (eventType === 'ended') {
          state.ended = true;
          trace('video-ended', { t: rounded(t), d: rounded(d) });
        }
        if (src && state.src && src !== state.src && state.lastTime > 8 && !state.ended) {
          trace('source-changed', { t: rounded(state.lastTime), d: rounded(state.duration), manual: isManual() });
        }
        if (Number.isFinite(t) && state.lastTime > 20 && t < 3 && state.lastTime - t > 20 && !isManual()) {
          trace('timeline-reset', { from: rounded(state.lastTime), to: rounded(t), d: rounded(d) });
        }
        if (Number.isFinite(t) && t >= 0) state.lastTime = t;
        if (Number.isFinite(d) && d > 0) state.duration = d;
        if (src) state.src = src;
        if (eventType === 'playing') state.ended = false;
        if (eventType === 'timeupdate' || eventType === 'ended') updateExitButton();
        if (eventType === 'timeupdate' && now() - state.progressTraceAt > 20000) {
          state.progressTraceAt = now();
          trace('progress', { t: rounded(t), d: rounded(d) });
        }
      }
    }
    for (const type of ['play', 'playing', 'timeupdate', 'ended', 'emptied', 'loadstart', 'loadedmetadata', 'durationchange']) {
      video.addEventListener(type, () => update(type));
    }
    if (!video.paused) update('playing');
  }

  function scanVideos(root) {
    if (!root.querySelectorAll) return;
    for (const video of root.querySelectorAll('video')) register(video);
    // Look for shadow roots without patching attachShadow (which can break player components).
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot && !shadowRoots.has(el.shadowRoot)) {
        shadowRoots.add(el.shadowRoot);
        observeInput(el.shadowRoot);
        scanVideos(el.shadowRoot);
      }
    }
  }
  function scan() {
    scanPending = false;
    if (!watching()) return;
    scanVideos(document);
    for (const root of shadowRoots) scanVideos(root);
    const popup = [...document.querySelectorAll('button, [role="button"]')]
      .some(e => nextPattern.test([e.getAttribute('aria-label'), e.textContent?.slice(0, 85)].filter(Boolean).join(' ')));
    updateExitButton();
    if (popup && now() - lastPromptAt > 30000) {
      lastPromptAt = now();
      trace('next-control-visible', mediaInfo());
    }
  }
  function scheduleScan() {
    if (scanPending) return;
    scanPending = true;
    setTimeout(scan, 350);
  }
  new MutationObserver(scheduleScan).observe(document, { childList: true, subtree: true });
  setInterval(() => {
    if (location.href !== lastUrl) {
      const wasWatching = /(?:^|\/)play(?:\/|$)/i.test(new URL(lastUrl).pathname);
      const stillWatching = watching();
      if (!wasWatching && stillWatching) lastCatalogUrl = safeCatalogUrl(lastUrl) || lastCatalogUrl;
      if (wasWatching) trace('route-changed', { watchToWatch: stillWatching, manual: isManual(), ...mediaInfo() });
      lastUrl = location.href;
      if (!stillWatching) active = null;
      updateExitButton();
    }
    scheduleScan();
  }, 1500);
  scheduleScan();

  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== SOURCE) return;
    if (data.type === 'config') {
      settings.enabled = data.enabled !== false;
      settings.mode = data.mode === 'premature' ? 'premature' : 'never';
      settings.strict = data.strict !== false;
      settings.keepPrompt = data.keepPrompt !== false;
      settings.showExit = data.showExit !== false;
      updateExitButton();
    } else if (data.type === 'allow-once') {
      overrideUntil = now() + 15000;
      trace('temporary-override');
    }
  });
  trace('guard-ready', { version: '1.5.0', strategy: 'popup-dismiss-shield-plus-manual-exit' });
  message('page-ready');
})();
