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
  const attributes = new Set();
  return {
    addEventListener(type, listener) { listeners.set(type, listener); },
    fire(type) { return listeners.get(type)?.(); },
    toggleAttribute(name, enabled) {
      if (enabled) attributes.add(name);
      else attributes.delete(name);
    },
    hasAttribute(name) { return attributes.has(name); }
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
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
  const timers = new Map();
  let now = epoch - 86_400_000;
  let timerCount = 0;
  class ClockDate extends Date { static now() { return now; } }
  function scheduleTimer(run, delay) {
    const id = ++timerCount;
    timers.set(id, { run, at: now + delay });
    return id;
  }
  let subscription = null;
  const makeSubscription = () => ({ endpoint: 'https://push.test/fixture' });
  const registration = {
    scope: 'https://app.test/',
    pushManager: { getSubscription: async () => subscription, subscribe: async () => subscription = makeSubscription() },
    active: { postMessage(_message, [port]) { port.postMessage('nagal-push-v1'); } }
  };
  const notification = { permission: 'granted', requestPermission: async () => 'granted' };
  const serviceWorker = {
    getRegistration: async () => registration, register: async () => registration, ready: Promise.resolve(registration)
  };
  const context = vm.createContext({ window, document, URL, Intl, Date: ClockDate, MessageChannel, atob,
    performance: { now: () => now - epoch + 86_400_000 },
    Notification: notification, setTimeout: scheduleTimer, clearTimeout: id => timers.delete(id),
    matchMedia: () => ({ matches: false }), navigator: { userAgent: 'Chrome', serviceWorker },
    AbortSignal: { timeout(delay) {
      const controller = new AbortController();
      scheduleTimer(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), delay);
      return controller.signal;
    } },
    location: { hostname: 'app.test', protocol: 'https:', href: 'https://app.test/' },
    fetch(url, options) {
      const request = { route: new URL(url).pathname, method: options.method,
        data: options.body && JSON.parse(options.body) };
      requests.push(request);
      let resolve;
      const promise = new Promise((next, reject) => {
        resolve = next;
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
      });
      pending.push({ route: request.route, resolve });
      return promise;
    }
  });
  vm.runInContext(source, context);
  let locale = 'ko';
  const mounted = context.NagalPush.mount({ plan: () => ({ ready: 60, leave: 120 }), date: () => '2030-07-01',
    language: () => locale });
  return { el, window, requests, pending, notification, registration, serviceWorker,
    subscribe() { subscription = makeSubscription(); },
    async advance(ms) {
      now += ms;
      for (const [id, item] of timers) {
        if (item.at > now) continue;
        timers.delete(id);
        item.run();
      }
      await flush();
    },
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

test('a blocked or dismissed permission and an unanswered prompt show distinct guidance', async () => {
  const state = fixture();
  const save = state.el('save');
  const status = state.el('status');
  await flush();
  state.notification.permission = 'denied';
  state.notification.requestPermission = () => assert.fail('blocked permission must not be requested again');
  await save.fire('click');
  assert.match(status.textContent, /사이트 설정/);

  state.notification.permission = 'default';
  state.notification.requestPermission = async () => 'default';
  await save.fire('click');
  assert.match(status.textContent, /허용이 확인되지 않았어요/);

  const prompt = deferred();
  state.notification.requestPermission = () => prompt.promise;
  const attempt = save.fire('click');
  assert.match(status.textContent, /알림 요청에서 허용을 눌러/);
  await state.advance(29_999);
  assert.equal(save.disabled, true);
  await state.advance(1);
  await attempt;
  assert.equal(save.disabled, false);
  assert.equal(state.el('check').disabled, false);
  assert.equal(status.hasAttribute('data-notice'), true);
  assert.match(status.textContent, /권한 요청에 응답이 없어요/);
  for (const [locale, text] of [['en', /permission request timed out/], ['ja', /許可を確認する時間が過ぎ/],
    ['zh', /等待通知权限超时/]]) {
    state.setLocale(locale);
    assert.match(status.textContent, text);
  }
  prompt.resolve('granted');
  await flush();
  assert.deepEqual(state.requests, []);
});

test('a late push registration uses no schedule request and a retry uses the available subscription', async () => {
  const state = fixture();
  const save = state.el('save');
  const status = state.el('status');
  await flush();
  const subscription = deferred();
  state.registration.pushManager.subscribe = () => subscription.promise;
  const attempt = save.fire('click');
  for (let i = 0; i < 10 && !state.pending.some(request => request.route === '/key'); i++) await flush();
  await state.advance(7_000);
  state.reply('/key', { publicKey: 'AA' });
  await flush();
  await state.advance(8_000);
  await attempt;
  assert.match(status.textContent, /알림 등록이 지연/);
  assert.equal(save.disabled, false);
  state.subscribe();
  subscription.resolve({ endpoint: 'https://push.test/late' });
  await flush();
  assert.deepEqual(state.requests.map(request => request.route), ['/key']);

  const retry = save.fire('click');
  for (let i = 0; i < 10 && !state.pending.some(request => request.route === '/schedule'); i++) await flush();
  assert.equal(state.requests.at(-1).data.subscription.endpoint, 'https://push.test/fixture');
  state.reply('/schedule', { plan: active, revision: active.revision });
  await retry;
  assert.match(status.textContent, /예약됨/);
  assert.equal(status.hasAttribute('data-notice'), false);
});

test('an unanswered registration clears a manual lookup and cannot send a stale status request', async () => {
  const state = fixture();
  await flush();
  const registration = deferred();
  state.serviceWorker.getRegistration = () => registration.promise;
  const query = state.el('check').fire('click');
  await state.advance(15_000);
  await query;
  assert.match(state.el('status').textContent, /알림 정보를 가져오지 못했어요/);
  assert.equal(state.el('check').disabled, false);
  state.subscribe();
  registration.resolve(state.registration);
  await flush();
  assert.deepEqual(state.requests, []);
});

test('an unanswered server write asks for a lookup and lets it confirm the saved request', async () => {
  const state = fixture();
  const status = state.el('status');
  await flush();
  state.subscribe();
  const attempt = state.el('save').fire('click');
  for (let i = 0; i < 10 && !state.pending.some(request => request.route === '/schedule'); i++) await flush();
  assert.equal(state.requests.at(-1)?.route, '/schedule');
  await state.advance(10_000);
  await attempt;
  assert.match(status.textContent, /요청 결과를 확인하지 못했어요/);
  assert.doesNotMatch(status.textContent, /예약됨|서버 확인/);
  assert.equal(state.el('check').disabled, false);

  const lookup = state.el('check').fire('click');
  await flush();
  state.reply('/status', { plan: active, revision: active.revision });
  await lookup;
  assert.match(status.textContent, /예약됨.*\n서버 확인/);
  assert.deepEqual(state.requests.map(request => request.route), ['/schedule', '/status']);
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
