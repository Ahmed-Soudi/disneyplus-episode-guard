const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'page-guard.js'), 'utf8');

function makeHarness(startPlayback = true) {
  let current = 'https://www.disneyplus.com/en-gb/play/ep-1';
  const timers = [];
  const messages = [];
  class FakeElement {
    constructor(localName, attributes = {}, textContent = '') {
      this.localName = localName;
      this.attrs = attributes;
      this.textContent = textContent;
      this.id = attributes.id || '';
      this.className = attributes.class || '';
      this.style = {};
      this.listeners = {};
      this.readyState = 4;
      this.ended = false;
      this.paused = false;
      this.currentTime = 82;
      this.duration = 100;
      this.currentSrc = 'blob:playing-episode';
      this.shadowRoot = null;
    }
    getAttribute(name) { return this.attrs[name] || null; }
    hasAttribute(name) { return name in this.attrs; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    removeAttribute(name) { delete this.attrs[name]; }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    querySelectorAll() { return []; }
    appendChild() {}
    attachShadow() {return {addEventListener() {}, querySelectorAll() { return []; } };}
    dispatchEvent(name) { for (const fn of this.listeners[name] || []) fn({ type: name }); }
  }
  class FakeMediaElement extends FakeElement {}
  Object.defineProperty(FakeMediaElement.prototype, 'src', { configurable: true, get() { return this.attrs.src || 'blob:playing-episode'; }, set(v) { this.attrs.src = String(v); this.currentSrc = String(v); } });
  Object.defineProperty(FakeMediaElement.prototype, 'srcObject', { configurable: true, get() { return this._srcObject || null; }, set(v) { this._srcObject = v; } });
  const video = new FakeMediaElement('video', {src:'blob:playing-episode'});
  video.paused = true;
  const button = new FakeElement('button', { 'aria-label': 'Next Episode' }, 'Next Episode');
  const document = {
    get baseURI() { return current; },
    get documentElement() { return new FakeElement('html'); },
    querySelectorAll() { return [video, button]; },
    getElementById() { return null; },
    createElement(name) { return new FakeElement(name); }
  };
  const origin = new URL(current).origin;
  const location = {
    get href() { return current; },
    get pathname() { return new URL(current).pathname; },
    get origin() { return origin; }
  };
  const history = {
    pushState(_state, _unused, url) { current = new URL(url, current).href; },
    replaceState(_state, _unused, url) { current = new URL(url, current).href; }
  };
  const handlers = {};
  const window = {
    addEventListener(name, fn) { (handlers[name] ||= []).push(fn); },
    postMessage(payload) { messages.push(payload); },
    location,
    navigation: null, HTMLMediaElement: FakeMediaElement
  };
  const context = vm.createContext({
    window, location, document, history, Element: FakeElement, HTMLMediaElement: FakeMediaElement, URL,
    MutationObserver: class { observe() {} },
    setTimeout(fn) { timers.push(fn); return timers.length; },
    clearTimeout() {}, setInterval() {},
    console
  });
  vm.runInContext(source, context, { filename: 'page-guard.js' });
  // run initial scanning task without a perpetual loop
  for (let i = 0; i < 4; i++) {
    const tasks = timers.splice(0);
    for (const fn of tasks) fn();
  }
  if (startPlayback) { video.paused = false; video.dispatchEvent('playing'); }
  const event = (kind, isTrusted) => ({
    type: kind,
    isTrusted,
    key: undefined,
    composedPath: () => [button, document, window],
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; }
  });
  function fire(name, evt) { for (const fn of handlers[name] || []) fn(evt); }
  function setConfig(mode, enabled = true, strict = true) {
    fire('message', {source: window, origin, data: {source: 'disneyplus-episode-guard-v1', type: 'config', mode, enabled, strict}});
  }
  return { history, location, video, event, fire, setConfig, messages }; 
}

{
  const h = makeHarness();
  h.history.pushState({}, '', '/en-gb/play/ep-2');
  assert.equal(h.location.pathname, '/en-gb/play/ep-1', 'Automatic next episode should be blocked');
  assert.ok(h.messages.some(m => m.type === 'blocked'));
}
{
  const h = makeHarness();
  h.fire('pointerdown', h.event('pointerdown', true));
  h.fire('click', h.event('click', true));
  h.history.pushState({}, '', '/en-gb/play/ep-2');
  assert.equal(h.location.pathname, '/en-gb/play/ep-2', 'Real user click should allow next episode');
}
{
  const h = makeHarness();
  const e = h.event('click', false);
  h.fire('click', e);
  assert.ok(e.prevented && e.stopped, 'Synthetic next-episode click should be canceled');
  assert.equal(h.location.pathname, '/en-gb/play/ep-1');
}
{
  const h = makeHarness();
  h.history.pushState({}, '', '/en-gb/browse/entity-123');
  assert.equal(h.location.pathname, '/en-gb/browse/entity-123', 'Browsing is unaffected');
}
{
  const h = makeHarness();
  h.setConfig('premature');
  h.video.dispatchEvent('ended');
  h.history.pushState({}, '', '/en-gb/play/ep-2');
  assert.equal(h.location.pathname, '/en-gb/play/ep-2', 'Optional mode permits transitions after ended');
}
{
  const h = makeHarness();
  h.setConfig('never', false);
  h.history.replaceState({}, '', '/en-gb/play/ep-2');
  assert.equal(h.location.pathname, '/en-gb/play/ep-2', 'Disabled protection should not block');
}
{
  const h = makeHarness();
  h.fire('message', {source: h.messages, origin: 'https://www.disneyplus.com', data: {source:'disneyplus-episode-guard-v1', type:'allow-once'}});
  h.history.pushState({}, '', '/en-gb/play/ep-2');
  assert.equal(h.location.pathname, '/en-gb/play/ep-1', 'Other window messages should not authorize navigation');
}
{
  const h = makeHarness();
  h.video.src = 'blob:following-episode';
  assert.equal(h.video.src, 'blob:playing-episode', 'Changing active video source should be blocked');
  assert.ok(h.messages.some(m => m.kind === 'blocked' && m.reason === 'src-setter'));
}
{
  const h = makeHarness();
  h.video.setAttribute('src', 'blob:following-episode');
  assert.equal(h.video.getAttribute('src'), 'blob:playing-episode', 'setAttribute should not bypass media guard');
  h.video.removeAttribute('src');
  assert.equal(h.video.getAttribute('src'), 'blob:playing-episode', 'removeAttribute should not bypass media guard');
}
{
  const h = makeHarness();
  h.setConfig('never', true, false);
  h.video.src = 'blob:following-episode';
  assert.equal(h.video.src, 'blob:following-episode', 'Strict mode can be disabled');
}
{
  const h = makeHarness();
  h.setConfig('never', false, true);
  h.video.src = 'blob:following-episode';
  assert.equal(h.video.src, 'blob:following-episode', 'Disabled extension leaves media alone');
}
{
  const h = makeHarness();
  h.fire('pointerdown', h.event('pointerdown', true));
  h.video.src = 'blob:following-episode';
  assert.equal(h.video.src, 'blob:following-episode', 'Manual episode choice may change media source');
}
{
  const h = makeHarness();
  h.video.ended = true;
  h.video.dispatchEvent('ended');
  h.video.src = 'blob:following-episode';
  assert.equal(h.video.src, 'blob:following-episode', 'After video ends, content may change');
}
{
  const h = makeHarness(false);
  h.video.currentTime = 0;
  h.video.src = 'blob:following-episode';
  assert.equal(h.video.src, 'blob:following-episode', 'Initial media changes are not blocked before playback');
}
{
  const h = makeHarness();
  h.video.currentTime = 0;
  h.video.duration = NaN;
  h.video.currentSrc = '';
  h.video.dispatchEvent('timeupdate');
  h.video.src = 'blob:following-episode';
  assert.equal(h.video.src, 'blob:playing-episode', 'Media reset preceding a source swap is blocked');
}
console.log('PASS: 15 simulated guard tests.');
