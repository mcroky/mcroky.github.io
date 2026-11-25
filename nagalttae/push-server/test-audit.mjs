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
const out = await mkdtemp(join(tmpdir(), 'nagal-reminder-audit-'));
execFileSync(process.execPath, [join(dir, 'node_modules/wrangler/bin/wrangler.js'),
  'deploy', '--config', configPath, '--dry-run', '--outdir', out], {
  cwd: dirname(configPath), env: { ...process.env, WRANGLER_LOG_PATH: join(out, 'wrangler.log') }, stdio: 'pipe'
});
const subscription = {
  endpoint: 'https://fcm.googleapis.com/wp/never-in-logs',
  keys: {
    p256dh: createECDH('prime256v1').generateKeys().toString('base64url'),
    auth: randomBytes(16).toString('base64url')
  }
};
const records = [];
const statuses = [201, 201, 503, 410];
const origin = config.vars.APP_ORIGIN;
const mf = new Miniflare({ ...convertV4MiniflareOptions({
  name: 'push-audit-test',
  modules: true, script: await readFile(join(out, 'worker.js'), 'utf8'),
  compatibilityDate: config.compatibility_date,
  bindings: config.vars,
  durableObjects: Object.fromEntries(config.durable_objects.bindings.map(binding =>
    [binding.name, { className: binding.class_name, useSQLite: true }])),
  ratelimits: Object.fromEntries(config.ratelimits.map(limit => [limit.name, limit])),
  outboundService: async request => {
    assert.equal(request.url, subscription.endpoint);
    return new Response(null, { status: statuses.shift() });
  }
}), handleStructuredLogs: ({ message }) => records.push(message) });

async function call(route, fields, status = 200) {
  const response = await mf.dispatchFetch('https://service.test/' + route, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription, ...fields })
  });
  assert.equal(response.status, status, route);
  return response.json();
}

async function waitForClosure() {
  for (let i = 0; i < 50; i++) {
    const result = await call('status', {});
    if (!result.plan) return result;
    await sleep(150);
  }
  assert.fail('Reservation did not close');
}

const flatten = message => message.replace(/\s+/g, ' ').trim();
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
    expected.map(record => flatten(inspect(record, { breakLength: Infinity }))));
  for (const secret of [subscription.endpoint, subscription.keys.auth, subscription.keys.p256dh, invalidSubscription.endpoint]) {
    assert.ok(records.every(record => !record.includes(secret)), 'A subscription credential appeared in a log');
  }
  console.log('PASS workerd: correlated schedule, replacement, cancellation, provider acceptance, retry and expired subscription logs.');
} finally { await mf.dispose(); }
