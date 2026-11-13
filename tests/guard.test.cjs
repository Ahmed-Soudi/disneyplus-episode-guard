'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'page-guard.js'), 'utf8');

function harness() {
  let url = 'https://www.disneyplus.com/en-gb/play/ep-one';
  const messages = [];
  const listeners = {};
  const timers = [];
  class Element {
    constructor(tag, attrs = {}, text = '') {
      this.tagName = tag.toUpperCase(); this.nodeType = 1; this.localName = tag.toLowerCase();
      this.attrs = attrs; this.textContent = text; this.parentElement = null;
      this.handlers = {}; this.children = [];
      this.isConnected = true; this.shadowRoot = null; this.paused = false; this.ended = false;
      this.id = ''; this.style = {}; this._rect = { left: 640, top: 500, width: 24, height: 24 };
      this.currentTime = 50; this.duration = 100; this.currentSrc = 'blob:current'; this.src = 'blob:current';
    }
    appendChild(node) { this.append(node); node.isConnected = true; return node; }
    setAttribute(k, v) { this.attrs[k] = v; }
    getBoundingClientRect() { return this._rect; }
    append(...nodes) {
      for (const node of nodes) { node.parentElement = this; this.children.push(node); }
      return this;
    }
    getAttribute(k) { return this.attrs[k] || null; }
    addEventListener(k, fn) { (this.handlers[k] ||= []).push(fn); }
    emit(k, evt) { for (const fn of this.handlers[k] || []) fn(evt); }
    matches(selector) {
      if (selector === 'button, a, [role="button"]' || selector === 'button, a, [role="button"]') {
        return ['BUTTON', 'A'].includes(this.tagName) || this.attrs.role === 'button';
      }
      return false;
    }
    querySelectorAll(selector) {
      const descendants = [];
      function walk(node) { for (const child of node.children) { descendants.push(child); walk(child); } }
      walk(this);
      if (selector === '*') return descendants;
      if (selector === 'video') return descendants.filter(el => el.tagName === 'VIDEO');
      if (selector === 'video, nav') return descendants.filter(el => ['VIDEO', 'NAV'].includes(el.tagName));
      if (selector === 'button, a, [role="button"]') return descendants.filter(el => el.matches(selector));
      if (selector.startsWith('button')) return descendants.filter(el => el.matches('button, a, [role="button"]'));
      return [];
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  const video = new Element('video');
  const back = new Element('button', {'aria-label':'Back'});
  const rewind = new Element('button', {'aria-label':'Jump Back 10 Seconds'});
  const next = new Element('button', {'aria-label':'Next Episode'}, 'Next Episode');
  const promptNext = new Element('button', {'aria-label':'Next Episode'}, 'Next Episode');
  const popupDismiss = new Element('button', {'aria-label':'Close'}, '');
  const unrelatedClose = new Element('button', {'aria-label':'Close'}, '');
  const prompt = new Element('div', {role:'dialog'}).append(promptNext, popupDismiss);
  const player = new Element('div').append(video, back, rewind, next, prompt, unrelatedClose);
  const body = new Element('body').append(player);
  const document = {
    body, referrer: 'https://www.disneyplus.com/en-gb/browse/entity-example',
    createElement(tag) { const e = new Element(tag); e.isConnected = false; return e; },
    querySelectorAll(selector) { return body.querySelectorAll(selector); },
    addEventListener(k, fn) { (listeners[k] ||= []).push(fn); },
  };
  const location = { assign(p) { url = new URL(p, url).href; this.lastAssigned = url; }, get href() { return url; }, get origin() { return new URL(url).origin; }, get pathname() { return new URL(url).pathname; } };
  const history = {
    pushState(_a, _b, p) { url = new URL(p, url).href; return 'push-result'; },
    replaceState(_a, _b, p) { url = new URL(p, url).href; return 'replace-result'; }
  };
  const originalPush = history.pushState, originalReplace = history.replaceState;
  const window = {
    addEventListener(k, fn) { (listeners[k] ||= []).push(fn); },
    postMessage(msg) { messages.push(msg); }, innerWidth:1280, innerHeight:720, location
  };
  vm.runInNewContext(source, {window, location, history, document, URL, Date, Object, Number, Math,
    MutationObserver: class { observe() {} },
    setTimeout(fn) { timers.push(fn); return timers.length; },
    setInterval(fn) { timers.push(fn); },
  }, {filename:'page-guard.js'});
  for (const task of timers.splice(0)) task();
  video.emit('playing'); video.emit('timeupdate');
  function fire(k, e) { for (const fn of listeners[k] || []) fn(e); }
  function event(target, trusted, type='click') {
    return {
      type, isTrusted: trusted, target,
      composedPath() {
        const path=[]; for (let node=target; node; node=node.parentElement) path.push(node);
        return [...path,document,window];
      },
      preventDefault() { this.prevented = true; },
      stopImmediatePropagation() { this.stopped = true; },
      stopPropagation() { this.stopped = true; }
    };
  }
  function click(target, trusted) { const e=event(target,trusted); fire('click',e); if (!e.stopped) target.emit('click',e); return e; }
  function pointerdown(target, trusted) { const e=event(target,trusted,'pointerdown'); fire('pointerdown',e); return e; }
  function config({enabled=true,strict=true,keepPrompt=true,showExit=true,mode='never'}={}) {
    fire('message', {source:window,origin:location.origin,
      data:{source:'disneyplus-episode-guard-v1',type:'config',enabled,strict,keepPrompt,showExit,mode}});
  }
  return {history,originalPush,originalReplace,video,back,rewind,next,promptNext,popupDismiss,
    unrelatedClose,prompt,player,body,document,click,pointerdown,fire,location,messages,config,timers,window};
}

let count = 0;
function check(name, fn) { fn(); count++; console.log('PASS', name); }
check('History pushState is never intercepted', () => {
  const h=harness(); assert.strictEqual(h.history.pushState,h.originalPush);
  assert.equal(h.history.pushState({},'', '/en-gb/play/ep-two'),'push-result');
  assert.match(h.location.pathname,/ep-two$/);
});
check('History replaceState is never intercepted', () => {
  const h=harness(); assert.strictEqual(h.history.replaceState,h.originalReplace);
  assert.equal(h.history.replaceState({},'', '/en-gb/play/ep-two'),'replace-result');
});
check('Video sources are never intercepted', () => {
  const h=harness(); h.video.src='blob:next'; assert.equal(h.video.src,'blob:next');
});
check('User Next Episode clicks always work in player controls', () => {
  const h=harness(); assert.equal(h.click(h.next,true).prevented,undefined);
});
check('User Next Episode clicks always work inside prompt', () => {
  const h=harness(); assert.equal(h.click(h.promptNext,true).prevented,undefined);
});
check('User Back clicks always work', () => {
  const h=harness(); assert.equal(h.click(h.back,true).prevented,undefined);
  assert.equal(h.pointerdown(h.back,true).prevented,undefined);
});
check('User rewind clicks always work', () => {
  const h=harness(); assert.equal(h.click(h.rewind,true).prevented,undefined);
});
check('Close inside Next Episode prompt is shielded', () => {
  const h=harness(); const e=h.click(h.popupDismiss,true);
  assert.equal(e.prevented,true); assert.equal(e.stopped,true);
  assert.ok(h.messages.some(m=>m.kind==='prompt-dismiss-blocked'));
});
check('Popup and player pointerdown are never intercepted', () => {
  const h=harness();
  assert.equal(h.pointerdown(h.popupDismiss,true).prevented,undefined);
  assert.equal(h.pointerdown(h.back,true).prevented,undefined);
});
check('Close unrelated to prompt remains functional', () => {
  const h=harness(); assert.equal(h.click(h.unrelatedClose,true).prevented,undefined);
});
check('Do not block prompt close when protection disabled', () => {
  const h=harness(); h.config({enabled:false}); assert.equal(h.click(h.popupDismiss,true).prevented,undefined);
});
check('Do not block prompt close if keepPrompt disabled', () => {
  const h=harness(); h.config({keepPrompt:false}); assert.equal(h.click(h.popupDismiss,true).prevented,undefined);
});
check('Do not block unrelated Close if Next control is absent', () => {
  const h=harness(); h.prompt.children = [h.popupDismiss];
  assert.equal(h.click(h.popupDismiss,true).prevented,undefined);
});
check('Do not block ambiguous Close in player root with video', () => {
  const h=harness(); h.popupDismiss.parentElement = h.player;
  assert.equal(h.click(h.popupDismiss,true).prevented,undefined);
});
check('Synthetic Back clicks do not get blocked', () => {
  const h=harness(); assert.equal(h.click(h.back,false).prevented,undefined);
});
check('Synthetic rewind clicks do not get blocked', () => {
  const h=harness(); assert.equal(h.click(h.rewind,false).prevented,undefined);
});
check('Synthetic Next Episode clicks are blocked', () => {
  const h=harness(); const e=h.click(h.next,false);
  assert.equal(e.prevented,true); assert.ok(h.messages.some(m=>m.kind==='blocked-scripted-next'));
});
check('Protection off allows synthetic Next Episode', () => {
  const h=harness(); h.config({enabled:false}); assert.equal(h.click(h.next,false).prevented,undefined);
});
check('Strict option off allows synthetic Next Episode', () => {
  const h=harness(); h.config({strict:false}); assert.equal(h.click(h.next,false).prevented,undefined);
});
check('Video-ended mode allows synthetic Next after ended', () => {
  const h=harness(); h.config({mode:'premature'}); h.video.ended=true; h.video.emit('ended');
  assert.equal(h.click(h.next,false).prevented,undefined);
});
check('Never mode blocks synthetic Next even after ended', () => {
  const h=harness(); h.video.ended=true; h.video.emit('ended');
  assert.equal(h.click(h.next,false).prevented,true);
});
check('Keyboard is never intercepted', () => {
  const h=harness(); const e={isTrusted:true,key:'Escape'};
  h.fire('keydown',e); assert.equal(e.prevented,undefined);
});
check('Passive video timeline/source changes are logged', () => {
  const h=harness(); h.video.currentSrc='blob:updated'; h.video.currentTime=0;
  h.video.emit('timeupdate'); assert.ok(h.messages.some(m=>m.kind==='source-changed'));
});

check('Top-left X labeled Close is treated as player Back, not popup dismissal', () => {
  const h=harness();
  h.popupDismiss._rect = {left: 20, top: 20, width: 30, height: 30};
  assert.equal(h.click(h.popupDismiss,true).prevented,undefined);
});
check('Independent Exit Player appears near credits and navigates to prior catalog page', () => {
  const h=harness(); h.video.currentTime=94; h.video.emit('timeupdate');
  const exit=h.body.querySelectorAll('button').find(b=>b.id==='disney-episode-guard-exit');
  assert.ok(exit, 'Exit player fallback exists');
  assert.equal(exit.style.display,'block');
  h.click(exit,true);
  assert.equal(h.location.lastAssigned,'https://www.disneyplus.com/en-gb/browse/entity-example');
});
check('Independent Exit Player stays absent during mid-episode playback', () => {
  const h=harness(); h.prompt.children=[h.promptNext]; h.video.currentTime=40; h.video.emit('timeupdate');
  const exit=h.body.querySelectorAll('button').find(b=>b.id==='disney-episode-guard-exit');
  assert.ok(!exit || exit.style.display==='none');
});
check('Exit Player can be disabled independently', () => {
  const h=harness(); h.config({showExit:false}); h.video.currentTime=95; h.video.emit('timeupdate');
  const exit=h.body.querySelectorAll('button').find(b=>b.id==='disney-episode-guard-exit');
  assert.ok(!exit || exit.style.display==='none');
});
check('Scripted click on fallback Exit Player never navigates', () => {
  const h=harness(); h.video.currentTime=95; h.video.emit('timeupdate');
  const exit=h.body.querySelectorAll('button').find(b=>b.id==='disney-episode-guard-exit');
  h.click(exit,false);
  assert.equal(h.location.lastAssigned,undefined);
});
check('The native Back button stays unblocked after video ended', () => {
  const h=harness(); h.video.ended=true; h.video.emit('ended');
  assert.equal(h.click(h.back,true).prevented,undefined);
});

console.log(`PASS: ${count} regression checks.`);
