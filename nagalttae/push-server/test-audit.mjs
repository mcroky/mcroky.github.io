import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createECDH, randomBytes } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { inspect } from 'node:util';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const dir = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(process.env.NAGAL_AUDIT_CONFIG || join(dir, 'wrangler.jsonc'));
const config = JSON.parse(await readFile(configPath, 'utf8'));
let bundlePath = process.env.NAGAL_AUDIT_BUNDLE;
if (!bundlePath) {
  const out = await mkdtemp(join(tmpdir(), 'nagal-reminder-audit-'));
  execFileSync(process.execPath, [join(dir, 'node_modules/wrangler/bin/wrangler.js'),
    'deploy', '--config', configPath, '--dry-run', '--outdir', out], {
    cwd: dirname(configPath), env: { ...process.env, WRANGLER_LOG_PATH: join(out, 'wrangler.log') }, stdio: 'pipe'
  });
  bundlePath = join(out, 'worker.js');
}
const subscription = {
  endpoint: 'https://fcm.googleapis.com/wp/never-in-logs',
  keys: {
    p256dh: createECDH('prime256v1').generateKeys().toString('base64url'),
    auth: randomBytes(16).toString('base64url')
  }
};
const records = [];
const statuses = [201, 201, 503, 410];
const reasonGate = Promise.withResolvers();
const unexpectedReason = 'opaque-reason-never-in-logs';
let delayedAppleRequests = 0;
const testClients = new Map();
const origin = config.vars.APP_ORIGIN;
const mf = new Miniflare({ ...convertV4MiniflareOptions({
  name: 'push-audit-test',
  modules: true, script: await readFile(bundlePath, 'utf8'),
  compatibilityDate: config.compatibility_date,
  bindings: config.vars,
  durableObjects: Object.fromEntries(config.durable_objects.bindings.map(binding =>
    [binding.name, { className: binding.class_name, useSQLite: true }])),
  ratelimits: Object.fromEntries(config.ratelimits.map(limit => [limit.name, limit])),
  outboundService: async request => {
    const url = new URL(request.url);
    if (url.hostname === 'web.push.apple.com') {
      if (url.pathname === '/wp/audit-delayed') {
        if (++delayedAppleRequests === 2) return new Response(null, { status: 201 });
        const encoder = new TextEncoder();
        const body = new ReadableStream({
          start(controller) { controller.enqueue(encoder.encode('{')); },
          async pull(controller) {
            await reasonGate.promise;
            const text = JSON.stringify({ reason: 'BadWebPushRequest', ignored: unexpectedReason });
            controller.enqueue(encoder.encode(text.slice(1)));
            controller.close();
          }
        });
        return new Response(body, { status: 400 });
      }
      if (url.pathname === '/wp/audit-unknown') return Response.json({ reason: unexpectedReason }, { status: 400 });
      assert.equal(url.pathname, '/wp/audit-missing');
      return new Response(null, { status: 400 });
    }
    assert.equal(request.url, subscription.endpoint);
    return new Response(null, { status: statuses.shift() });
  }
}), handleStructuredLogs: ({ message }) => records.push(message) });

async function call(route, fields, status = 200) {
  const target = fields.subscription ?? subscription;
  if (!testClients.has(target.endpoint)) testClients.set(target.endpoint, '192.0.2.' + (testClients.size + 1));
  const response = await mf.dispatchFetch('https://service.test/' + route, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': testClients.get(target.endpoint) },
    body: JSON.stringify({ ...fields, subscription: target }), signal: AbortSignal.timeout(4000)
  });
  assert.equal(response.status, status, route);
  return response.json();
}

async function waitForClosure(target = subscription) {
  for (let i = 0; i < 50; i++) {
    const result = await call('status', { subscription: target });
    if (!result.plan) return result;
    await sleep(150);
  }
  assert.fail('Reservation did not close');
}

const flatten = message => message.replace(/\s+/g, ' ').trim();
const format = record => flatten(inspect(record, { breakLength: Infinity }));
try {
  const ready = Date.now() + 60_000, leave = ready + 60_000;
  const first = await call('schedule', { ready, leave, locale: 'ko', expected: null });
  await call('schedule', { ready, leave, locale: 'ko', expected: null });
  await call('cancel', { expected: null }, 409);
  const invalidSubscription = { ...subscription, endpoint: 'https://example.test/invalid' };
  await call('cancel', { expected: first.revision, subscription: invalidSubscription }, 400);
  const timedReady = Date.now() + 1_600, timedLeave = timedReady + 900;
  const timed = await call('schedule', { ready: timedReady, leave: timedLeave, locale: 'ko', expected: first.revision });
  const closed = await waitForClosure();
  await call('cancel', { expected: closed.revision });
  const active = await call('schedule', { ready, leave, locale: 'ko', expected: closed.revision });
  const canceled = await call('cancel', { expected: active.revision });
  const retryReady = Date.now() + 1_600, retryLeave = retryReady + 900;
  const retried = await call('schedule', { ready: retryReady, leave: retryLeave, locale: 'ko', expected: canceled.revision });
  await waitForClosure();
  assert.deepEqual(statuses, []);

  const schedule = (outcome, reservationId, readyAt, leaveAt) => ({ event: 'reminder_schedule', httpStatus: 200,
    outcome, reservationId, readyAt, leaveAt, pending: ['ready', 'leave'] });
  const cancel = (httpStatus, outcome, reservationId, times = {}) =>
    ({ event: 'reminder_cancel', httpStatus, outcome, reservationId, ...times });
  const delivery = (reservationId, reminder, scheduledAt, outcome, providerStatus, retryPlanned = false) =>
    ({ event: 'reminder_delivery', reservationId, reminder, scheduledAt, outcome, providerStatus, retryPlanned });
  const expected = [
    schedule('saved', first.revision, ready, leave),
    schedule('unchanged', first.revision, ready, leave),
    cancel(409, 'rejected', first.revision, { readyAt: ready, leaveAt: leave }),
    cancel(400, 'rejected', null),
    { ...schedule('saved', timed.revision, timedReady, timedLeave), previousReservationId: first.revision },
    delivery(timed.revision, 'ready', timedReady, 'provider_accepted', 201),
    delivery(timed.revision, 'leave', timedLeave, 'provider_accepted', 201),
    cancel(200, 'no_active_plan', null),
    schedule('saved', active.revision, ready, leave),
    cancel(200, 'canceled', active.revision, { readyAt: ready, leaveAt: leave }),
    schedule('saved', retried.revision, retryReady, retryLeave),
    delivery(retried.revision, 'ready', retryReady, 'provider_rejected', 503, true),
    delivery(retried.revision, 'leave', retryLeave, 'provider_rejected', 410)
  ];
  for (let i = 0; records.filter(text => text.includes('reminder_')).length < expected.length && i < 25; i++) await sleep(100);
  assert.deepEqual(records.filter(text => text.includes('reminder_')).map(flatten),
    expected.map(format));
  for (const secret of [subscription.endpoint, subscription.keys.auth, subscription.keys.p256dh, invalidSubscription.endpoint]) {
    assert.ok(records.every(record => !record.includes(secret)), 'A subscription credential appeared in a log');
  }

  const appleSubscriptions = ['delayed', 'unknown', 'missing'].map(kind => ({ ...subscription,
    endpoint: 'https://web.push.apple.com/wp/audit-' + kind }));
  const appleReady = Date.now() + 1_600;
  const appleDeparture = appleReady + 900;
  const [delayed, unknown, missing] = await Promise.all(appleSubscriptions.map((target, index) =>
    call('schedule', { subscription: target, ready: appleReady, leave: index === 0 ? appleDeparture : appleReady,
      locale: 'ko', expected: null })));
  await Promise.all(appleSubscriptions.map(target => waitForClosure(target)));
  assert.equal(delayedAppleRequests, 2, 'The later Apple alert ran while the earlier rejection body was paused');
  const replacement = await call('schedule', { subscription: appleSubscriptions[0], ready: Date.now() + 60_000,
    leave: Date.now() + 120_000, locale: 'ko', expected: (await call('status', { subscription: appleSubscriptions[0] })).revision });
  reasonGate.resolve();
  const appleReason = (reservationId, reminder, reason, reasonStatus) => ({ event: 'reminder_apple_rejection',
    reservationId, reminder, scheduledAt: appleReady, providerStatus: 400, reason, reasonStatus });
  const appleLogs = () => records.filter(text => text.includes('reminder_apple_rejection')).map(flatten).sort();
  for (let i = 0; appleLogs().length < 3 && i < 25; i++) await sleep(100);
  assert.deepEqual(appleLogs(), [appleReason(delayed.revision, 'ready', 'BadWebPushRequest', 'recorded'),
    appleReason(unknown.revision, 'both', null, 'unrecognized'),
    appleReason(missing.revision, 'both', null, 'missing_or_invalid')].map(format).sort());
  assert.ok(records.map(flatten).includes(format(delivery(delayed.revision, 'leave', appleDeparture, 'provider_accepted', 201))));
  assert.equal((await call('status', { subscription: appleSubscriptions[0] })).revision, replacement.revision);
  assert.ok(records.every(record => !record.includes(unexpectedReason)), 'An unexpected provider field appeared in a log');
  console.log('PASS workerd: ordinary push audit and Apple rejection reasons, including delayed, missing and unexpected responses.');
} finally { reasonGate.resolve(); await mf.dispose(); }
