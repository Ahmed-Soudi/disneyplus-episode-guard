/* Disney+ Episode Guard v1.1
 * An independent, early MAIN-world player/SPA guard.
 * Does not access protected streams, license requests, or network traffic.
 */
(() => {
  'use strict';
  if (window.__disneyEpisodeGuardInstalled) return;
  Object.defineProperty(window, '__disneyEpisodeGuardInstalled', { value: true });

  const SOURCE = 'disneyplus-episode-guard-v1';
  const states = { enabled: true, mode: 'never', strict: true };
  const roots = new Set();
  const seenVideos = new WeakSet();
  const player = {
    hasMedia: false, ended: false, lastMediaAt: 0, lastPlayingAt: 0,
    video: null, lastTime: 0, lastDuration: 0, lastSrc: ''
  };
  let authorizedUntil = 0;
  let allowOnceUntil = 0;
  let lastBlockedUrl = '';
  let lastBlockedAt = 0;
  let scanPending = false;
  let lastScanAt = 0;
  let toastTimer = 0;
  let lastTimelineWarning = 0;

  const nextText = /next\s*(episode|ep\b)|up\s*next|play\s*next|following\s*episode|episode\s*suivant|prochain\s*[ée]pisode|pr[oó]ximo\s*epis[oó]dio|siguiente\s*episodio|n[aä]chste\s*folge|prossimo\s*episodio|volgende\s*aflevering|الحلقة\s*التالية|الحلقة\s*القادمة|эпизод\s*следующ|次のエピソード|다음\s*에피소드/i;
  const nextAttr = /next[-_\s]?(episode|ep\b)|up[-_\s]?next|play[-_\s]?next|skip[-_\s]?credits/i;
  const manualText = /\b(restart|start over|restart episode|episodes|play from beginning)\b/i;
  const now = () => Date.now();
  const inWatchPage = path => /(?:^|\/)play(?:\/|$)/i.test(path);
  const getUrl = value => {
    try { return new URL(value == null ? location.href : String(value), document.baseURI); }
    catch { return null; }
  };
  const finite = value => Number.isFinite(value) && value >= 0 ? Math.round(value * 10) / 10 : null;

  function announce(type, extra = {}) {
    window.postMessage({ source: SOURCE, type, ...extra }, location.origin);
  }
  function trace(kind, data = {}) {
    // Deliberately no source URLs, episode IDs, cookies, or account information in logs.
    announce('trace', { kind, at: new Date().toISOString(), ...data });
  }
  function mediaInfo(video = player.video) {
    if (!video) return {};
    return { t: finite(video.currentTime), d: finite(video.duration), paused: !!video.paused };
  }
  function warnBlocked(target, reason) {
    const at = now();
    if (lastBlockedUrl === target && at - lastBlockedAt <= 1800) return;
    lastBlockedUrl = target;
    lastBlockedAt = at;
    announce('blocked', { reason });
    trace('blocked', { reason, ...mediaInfo() });
    showToast('Unwanted episode transition blocked');
  }
  function showToast(message) {
    if (!document.documentElement) return;
    let toast = document.getElementById('disney-episode-guard-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'disney-episode-guard-toast';
      toast.setAttribute('role', 'status');
      Object.assign(toast.style, {
        position: 'fixed', zIndex: '2147483647', bottom: '26px', left: '50%',
        transform: 'translateX(-50%)', color: '#fff', background: '#132b45',
        border: '1px solid #4bc9d8', borderRadius: '10px', padding: '10px 16px',
        font: '600 13px system-ui, sans-serif', boxShadow: '0 10px 30px #0008',
        pointerEvents: 'none', opacity: '0', transition: 'opacity .2s'
      });
      document.documentElement.appendChild(toast);
    }
    toast.textContent = '🛡 ' + message;
    toast.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2600);
  }

  function recentMedia() {
    return player.hasMedia && now() - player.lastMediaAt < 600000;
  }
  function isManualOverride() {
    return now() < authorizedUntil || now() < allowOnceUntil;
  }
  function isPremature() { return states.mode !== 'premature' || !player.ended; }

  function shouldBlock(destination) {
    if (!states.enabled || !isPremature()) return false;
    const from = getUrl(location.href), to = getUrl(destination);
    if (!from || !to || from.origin !== to.origin) return false;
    if (from.pathname === to.pathname) return false;
    if (!inWatchPage(from.pathname) || !inWatchPage(to.pathname)) return false;
    if (!recentMedia() || isManualOverride()) return false;
    return true;
  }
  function onAllowedChange(target) {
    const from = getUrl(location.href), to = getUrl(target);
    if (!from || !to || from.pathname === to.pathname || !inWatchPage(to.pathname)) return;
    if (now() < allowOnceUntil) allowOnceUntil = 0;
    trace('watch-route-allowed', { manual: isManualOverride() });
    player.hasMedia = false;
    player.ended = false;
    player.video = null;
    player.lastMediaAt = 0;
    player.lastTime = 0;
    player.lastSrc = '';
  }
  function routeCheck(target, reason) {
    if (!shouldBlock(target)) { onAllowedChange(target); return false; }
    warnBlocked('navigation', reason);
    return true;
  }
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    if (typeof original !== 'function') continue;
    history[method] = function (_state, _unused, url) {
      const target = getUrl(url);
      if (target && routeCheck(target.href, method)) return;
      return Reflect.apply(original, this, arguments);
    };
  }
  if (window.navigation && typeof navigation.addEventListener === 'function') {
    navigation.addEventListener('navigate', event => {
      const target = event.destination && event.destination.url;
      if (!target) return;
      if (event.userInitiated) { authorizedUntil = now() + 3000; return; }
      if (shouldBlock(target) && event.cancelable) {
        event.preventDefault();
        warnBlocked('navigation', 'navigation-api');
      }
    }, { capture: true });
  }

  function isEpisodeChoice(nodes) {
    for (const node of nodes) {
      if (!(node instanceof Element)) continue;
      const tag = node.localName;
      const clickable = tag === 'a' || tag === 'button' || node.hasAttribute('role') && /button|link/i.test(node.getAttribute('role') || '');
      const attrs = [node.id, typeof node.className === 'string' ? node.className : '', node.getAttribute('aria-label'), node.getAttribute('data-testid'), node.getAttribute('title'), node.getAttribute('name')].filter(Boolean).join(' ');
      if (nextAttr.test(attrs)) return true;
      if (!clickable) continue;
      const href = node.getAttribute('href');
      if (href) {
        const url = getUrl(href);
        if (url && inWatchPage(url.pathname) && url.pathname !== location.pathname) return true;
      }
      const label = [node.getAttribute('aria-label'), node.getAttribute('title'), node.textContent && node.textContent.slice(0, 150)].filter(Boolean).join(' ');
      if (nextText.test(label)) return true;
    }
    return false;
  }
  function isManualPlayerControl(nodes) {
    for (const node of nodes) {
      if (!(node instanceof Element)) continue;
      const attrs = [node.getAttribute('aria-label'), node.getAttribute('title'), node.textContent && node.textContent.slice(0, 70)].filter(Boolean).join(' ');
      if (manualText.test(attrs) && ['button', 'a'].includes(node.localName)) return true;
    }
    return false;
  }
  function onInput(event) {
    if (!event.isTrusted) return;
    if (event.type === 'keydown' && !['Enter', ' ', 'Spacebar'].includes(event.key)) return;
    if (isEpisodeChoice(event.composedPath()) || isManualPlayerControl(event.composedPath())) {
      authorizedUntil = now() + 4000;
      trace('manual-control');
    }
  }
  function onClick(event) {
    if (!recentMedia() || !states.enabled) return;
    const nextChoice = isEpisodeChoice(event.composedPath());
    if (!nextChoice) return;
    if (event.isTrusted) { authorizedUntil = now() + 4000; return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    warnBlocked('synthetic-next-click', 'synthetic-click');
  }
  function listenOnRoot(root) {
    root.addEventListener('pointerdown', onInput, true);
    root.addEventListener('keydown', onInput, true);
    root.addEventListener('click', onClick, true);
  }
  listenOnRoot(window);

  // New in v1.1: protect the already-playing media element. Disney+ can change
  // episodes internally without a URL change or a visible Next Episode dialog.
  function canProtectMedia(video) {
    if (!states.enabled || !states.strict || !isPremature() || isManualOverride()) return false;
    if (!inWatchPage(location.pathname) || video !== player.video || !recentMedia() || player.ended) return false;
    const liveT = Number(video.currentTime), liveD = Number(video.duration);
    // During an internal handoff, Disney+ might clear currentTime/duration
    // BEFORE updating src. Retain the last measured progress for this case.
    const resetBeforeSource = player.lastTime > 8 && (!Number.isFinite(liveT) || liveT < 2);
    const t = resetBeforeSource ? player.lastTime : liveT;
    const d = Number.isFinite(liveD) && liveD > 0 ? liveD : player.lastDuration;
    if (!Number.isFinite(t) || !Number.isFinite(d) || t < 8 || d < 20 || t >= d - 0.2) return false;
    // Only lock once actual playback has been observed; a 2-minute idle pause
    // should not prevent the site recovering from a network failure.
    if (now() - player.lastPlayingAt > 120000) return false;
    return true;
  }
  function sourceChanging(video, before, after, reason) {
    if (!canProtectMedia(video)) return false;
    if ((before || '') === (after || '')) return false;
    // MediaSource teardown may already have emptied currentSrc.
    before = before || (video === player.video ? player.lastSrc : '');
    if (!before) return false; // Never block initial video attachment.
    warnBlocked('media-source', reason);
    return true;
  }
  function patchMediaSetter(prop) {
    const proto = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
    if (!proto) return;
    let owner = proto;
    while (owner && !Object.getOwnPropertyDescriptor(owner, prop)) owner = Object.getPrototypeOf(owner);
    if (!owner) return;
    const desc = Object.getOwnPropertyDescriptor(owner, prop);
    if (!desc || !desc.configurable || typeof desc.set !== 'function' || typeof desc.get !== 'function') return;
    Object.defineProperty(owner, prop, {
      ...desc,
      set(value) {
        if (this.localName === 'video' && sourceChanging(this, desc.get.call(this), value, `${prop}-setter`)) return;
        return desc.set.call(this, value);
      }
    });
  }
  patchMediaSetter('src');
  patchMediaSetter('srcObject');

  const nativeSetAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (this.localName === 'video' && String(name).toLowerCase() === 'src' &&
        sourceChanging(this, this.getAttribute('src') || this.currentSrc, String(value), 'setAttribute-src')) return;
    return Reflect.apply(nativeSetAttribute, this, arguments);
  };
  const nativeRemoveAttribute = Element.prototype.removeAttribute;
  Element.prototype.removeAttribute = function (name) {
    if (this.localName === 'video' && String(name).toLowerCase() === 'src' &&
        sourceChanging(this, this.getAttribute('src') || this.currentSrc, '', 'removeAttribute-src')) return;
    return Reflect.apply(nativeRemoveAttribute, this, arguments);
  };

  function noteVideo(video) {
    if (!inWatchPage(location.pathname)) return;
    const replaced = player.video && player.video !== video && recentMedia() && !player.ended;
    if (replaced) trace('video-replaced', { ...mediaInfo(player.video), newVideo: true, manual: isManualOverride() });
    player.video = video;
    player.hasMedia = true;
    player.ended = !!video.ended;
    player.lastMediaAt = now();
    if (!video.paused && !video.ended) player.lastPlayingAt = now();
    const t = Number(video.currentTime), d = Number(video.duration);
    // Preserve last good position/source during a suspicious internal reset.
    if (Number.isFinite(t) && (t > 2 || player.lastTime < 8 || player.video !== video)) player.lastTime = t;
    if (Number.isFinite(d) && d > 20) player.lastDuration = d;
    player.lastSrc = video.currentSrc || video.src || player.lastSrc;
  }
  function inspectTimeline(video) {
    if (video !== player.video) return;
    const t = Number(video.currentTime), d = Number(video.duration);
    if (Number.isFinite(t) && player.lastTime > 20 && t < 4 && player.lastTime - t > 20 &&
        !isManualOverride() && now() - lastTimelineWarning > 2000) {
      lastTimelineWarning = now();
      trace('unexpected-timeline-reset', { from: finite(player.lastTime), to: finite(t), d: finite(d) });
    }
    if (Number.isFinite(d) && player.lastDuration > 20 && Math.abs(d - player.lastDuration) > 12 &&
        !isManualOverride() && now() - lastTimelineWarning > 2000) {
      lastTimelineWarning = now();
      trace('duration-changed', { from: finite(player.lastDuration), to: finite(d) });
    }
  }
  function registerVideo(video) {
    if (seenVideos.has(video)) return;
    seenVideos.add(video);
    trace('video-detected');
    for (const name of ['playing', 'play', 'timeupdate', 'loadedmetadata', 'pause', 'ended', 'emptied', 'loadstart', 'durationchange', 'seeking']) {
      video.addEventListener(name, () => {
        if (name === 'ended') {
          if (player.video === video) { player.ended = true; player.lastMediaAt = now(); trace('ended', mediaInfo(video)); }
        } else if (name === 'playing' || name === 'play' || name === 'timeupdate') {
          inspectTimeline(video);
          if (!video.ended) noteVideo(video);
        } else if (name === 'loadedmetadata') {
          trace('metadata', mediaInfo(video));
          if (!video.paused) noteVideo(video);
        } else if (name === 'emptied' || name === 'loadstart') {
          if (video === player.video && recentMedia()) trace(name, mediaInfo(video));
        } else if (name === 'durationchange') {
          inspectTimeline(video);
        }
      });
    }
    if (!video.paused && video.readyState > 0) noteVideo(video);
  }
  function walkVideos(root, depth = 0) {
    if (depth > 12 || !root.querySelectorAll) return;
    for (const element of root.querySelectorAll('*')) {
      if (element.localName === 'video') registerVideo(element);
      if (element.shadowRoot) captureRoot(element.shadowRoot);
    }
  }
  function scan() {
    scanPending = false;
    lastScanAt = now();
    if (!inWatchPage(location.pathname)) return;
    walkVideos(document);
    for (const root of roots) walkVideos(root);
  }
  function queueScan() {
    if (scanPending) return;
    scanPending = true;
    setTimeout(scan, Math.max(200, 1500 - (now() - lastScanAt)));
  }
  function captureRoot(root) {
    if (roots.has(root)) return;
    roots.add(root);
    listenOnRoot(root);
    new MutationObserver(queueScan).observe(root, { childList: true, subtree: true });
    queueScan();
  }
  const attachShadow = Element.prototype.attachShadow;
  if (typeof attachShadow === 'function') {
    Element.prototype.attachShadow = function () {
      const root = Reflect.apply(attachShadow, this, arguments);
      captureRoot(root);
      return root;
    };
  }
  new MutationObserver(queueScan).observe(document, { childList: true, subtree: true });
  setInterval(queueScan, 3000);
  queueScan();
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const msg = event.data;
    if (!msg || msg.source !== SOURCE) return;
    if (msg.type === 'config') {
      states.enabled = msg.enabled !== false;
      states.mode = msg.mode === 'premature' ? 'premature' : 'never';
      states.strict = msg.strict !== false;
    } else if (msg.type === 'allow-once') {
      allowOnceUntil = now() + 15000;
      trace('temporary-override');
      showToast('Next episode allowed for 15 seconds');
    }
  });
  trace('guard-ready', { version: '1.1.0' });
  announce('page-ready');
})();
