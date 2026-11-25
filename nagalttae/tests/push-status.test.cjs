const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { setImmediate: flush } = require('node:timers/promises');
const vm = require('node:vm');
const source = readFileSync(new URL('../push.js', require('node:url').pathToFileURL(__filename)), 'utf8');
const epoch = Date.UTC(2030, 6, 1, 12);
const active = { revision: 'first', ready: epoch - 60_000, leave: epoch,
  events: [{ kind: 'ready', at: epoch - 60_000 }, { kind: 'leave', at: epoch }] };

function stubTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) { listeners.set(type, listener); },
    fire(type) { return listeners.get(type)?.(); }
  };
}

function fixture() {
  const elements = new Map();
  for (const id of ['push-save', 'push-check', 'push-cancel', 'push-panel', 'push-title', 'push-status', 'push-preview']) {
    elements.set(id, { ...stubTarget(), textContent: '' });
  }
  const el = id => elements.get('push-' + id);
  const window = { ...stubTarget(), isSecureContext: true, PushManager: true, Notification: true };
  const document = { ...stubTarget(), querySelector: () => ({ content: 'https://worker.test' }),
    getElementById: id => elements.get(id), hidden: false };
  const requests = [];
  const pending = [];
  let subscription = null;
  const registration = {
    scope: 'https://app.test/', pushManager: { getSubscription: async () => subscription },
    active: { postMessage(_message, [port]) { port.postMessage('nagal-push-v1'); } }
  };
  const context = vm.createContext({ window, document, URL, Intl, Date, AbortSignal, MessageChannel,
    setTimeout: () => 1, clearTimeout() {}, matchMedia: () => ({ matches: false }),
    navigator: { userAgent: 'Chrome', serviceWorker: { getRegistration: async () => registration,
      register: async () => registration, ready: Promise.resolve(registration) } },
    location: { hostname: 'app.test', protocol: 'https:', href: 'https://app.test/' },
    fetch(url, options) {
      const request = { route: new URL(url).pathname, method: options.method, data: JSON.parse(options.body) };
      requests.push(request);
      let resolve;
      const promise = new Promise(next => { resolve = next; });
      pending.push({ route: request.route, resolve });
      return promise;
    }
  });
  vm.runInContext(source, context);
  let locale = 'ko';
  const mounted = context.NagalPush.mount({ plan: () => ({ ready: 60, leave: 120 }), date: () => '2030-07-01',
    language: () => locale });
  return { el, window, requests, pending,
    subscribe() { subscription = { endpoint: 'https://push.test/fixture' }; },
    setLocale(next) { locale = next; mounted.render(); },
    reply(route, data, code = 200) {
      const index = pending.findIndex(request => request.route === route);
      assert.notEqual(index, -1, route + ' request is pending');
      pending.splice(index, 1)[0].resolve({ status: code, ok: code >= 200 && code < 300, json: async () => data });
    }
  };
}

test('manual check reads the actual server result and distinguishes no subscription, empty and unavailable', async () => {
  const state = fixture();
  const button = state.el('check');
  const view = state.el('status');
  await flush();
  await button.fire('click');
  assert.match(view.textContent, /등록된 알림 구독이 없어요/);
  assert.doesNotMatch(view.textContent, /서버 확인 ·/);
  assert.equal(state.requests.length, 0);
  state.subscribe();
  const checked = button.fire('click');
  assert.equal(button.disabled, true);
  await flush();
  state.reply('/status', { plan: active, revision: active.revision });
  await checked;
  assert.match(view.textContent, /예약됨 · 준비 .+출발/);
  assert.match(view.textContent, /서버 확인 · .+/);
  assert.equal(button.disabled, false);
  for (const [locale, label] of [['en', 'Check reminders'], ['ja', '予約を確認'], ['zh', '查询预约']]) {
    state.setLocale(locale);
    assert.equal(button.textContent, label);
  }
  state.setLocale('ko');
  const failed = button.fire('click');
  await flush();
  state.reply('/status', {}, 503);
  await failed;
  assert.match(view.textContent, /예약을 확인할 수 없어요/);
  assert.match(view.textContent, /마지막으로 확인한 예약/);
  assert.doesNotMatch(view.textContent, /서버 확인 ·/);
  const cleared = button.fire('click');
  await flush();
  state.reply('/status', { plan: null, revision: 'closed' });
  await cleared;
  assert.match(view.textContent, /서버에 남은 예약이 없어요/);
  assert.match(view.textContent, /서버 확인 · .+/);
  assert.ok(state.requests.every(request => request.route === '/status' && request.method === 'POST'));
});

test('manual check wins over background reads and a subsequent cancel wins over an in-flight manual check', async () => {
  const state = fixture();
  const view = state.el('status');
  await flush();
  state.subscribe();
  const auto = state.window.fire('focus');
  await flush();
  const check = state.el('check').fire('click');
  await flush();
  await state.window.fire('focus');
  assert.equal(state.requests.length, 2);
  state.pending.reverse();
  state.reply('/status', { plan: active, revision: active.revision });
  await check;
  state.reply('/status', { plan: null, revision: 'old' });
  await auto;
  assert.match(view.textContent, /예약됨 · 준비/);
  assert.match(view.textContent, /서버 확인 ·/);
  const laterCheck = state.el('check').fire('click');
  await flush();
  const cancel = state.el('cancel').fire('click');
  for (let i = 0; i < 10 && !state.pending.some(request => request.route === '/cancel'); i++) await flush();
  assert.equal(state.requests.at(-1).data.expected, active.revision);
  state.reply('/cancel', { plan: null, revision: 'closed' });
  await cancel;
  state.reply('/status', { plan: active, revision: active.revision });
  await laterCheck;
  assert.match(view.textContent, /예약을 취소했어요/);
  assert.doesNotMatch(view.textContent, /서버 확인 ·|예약됨 ·/);
  assert.equal(state.el('check').disabled, false);
});
