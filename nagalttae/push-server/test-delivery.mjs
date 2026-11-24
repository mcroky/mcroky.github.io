import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import ece from 'http_ece';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const dir = fileURLToPath(new URL('./', import.meta.url));
const config = JSON.parse(await readFile(new URL('wrangler.jsonc', import.meta.url)));
const out = await mkdtemp(join(tmpdir(), 'nagal-push-test-'));
execFileSync(process.execPath, [dir + 'node_modules/wrangler/bin/wrangler.js', 'deploy', '--dry-run', '--outdir', out],
  { cwd: dir, env: { ...process.env, WRANGLER_LOG_PATH: join(out, 'wrangler.log') }, stdio: 'pipe' });
const bundle = await readFile(join(out, 'worker.js'), 'utf8');
const receiver = createECDH('prime256v1');
const subscription = { endpoint: 'https://fcm.googleapis.com/wp/local-fixture',
  keys: { p256dh: receiver.generateKeys().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
const delivered = [];
const mf = new Miniflare(convertV4MiniflareOptions({
  name: 'push-test',
  modules: true, script: bundle, compatibilityDate: config.compatibility_date,
  bindings: config.vars,
  durableObjects: Object.fromEntries(config.durable_objects.bindings.map(b => [b.name, { className: b.class_name, useSQLite: true }])),
  ratelimits: { WRITES: config.ratelimits[0] },
  outboundService: async req => {
    assert.equal(req.url, subscription.endpoint);
    assert.match(req.headers.get('Authorization'), /^vapid t=/);
    assert.equal(req.headers.get('Content-Encoding'), 'aes128gcm');
    const decrypted = ece.decrypt(Buffer.from(await req.arrayBuffer()), { version: 'aes128gcm',
      privateKey: receiver, authSecret: subscription.keys.auth });
    delivered.push(JSON.parse(decrypted));
    return new Response(null, { status: 201 });
  }
}));
const origin = config.vars.APP_ORIGIN;
async function call(route, fields, status = 200) {
  const init = { headers: { Origin: origin } };
  if (fields) Object.assign(init, { method: 'POST', headers: { ...init.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription, ...fields }) });
  const reply = await mf.dispatchFetch('https://service.test/' + route, init);
  assert.equal(reply.status, status, route);
  return reply.json();
}
try {
  const keys = await Promise.all([call('key'), call('key')]);
  assert.equal(keys[0].publicKey.length, 87);
  assert.deepEqual(keys[0], keys[1]);
  assert.equal((await mf.dispatchFetch('https://service.test/key', { headers: { Origin: 'https://unknown.test' } })).status, 403);
  await call('status', { subscription: { ...subscription, endpoint: 'http://127.0.0.1/' } }, 400);
  const ready = Date.now() + 1600, leave = ready + 900;
  const first = { expected: null, ready, leave, locale: 'ko' };
  const saved = await call('schedule', first);
  assert.deepEqual(await call('schedule', first), saved);
  await call('cancel', { expected: null }, 409);
  let latest;
  for (let i = 0; i < 45; i++) {
    await sleep(200);
    latest = await call('status', {});
    if (!latest.plan) break;
  }
  assert.deepEqual(delivered, [{ at: ready, kind: 'ready', locale: 'ko' }, { at: leave, kind: 'leave', locale: 'ko' }]);
  assert.equal(latest.plan, null);
  assert.notEqual(latest.revision, saved.revision);
  const second = { ready: Date.now() + 60000, leave: Date.now() + 120000, locale: 'en', expected: latest.revision };
  const active = await call('schedule', second);
  const canceled = await call('cancel', { expected: active.revision });
  assert.equal(canceled.plan, null);
  await call('schedule', second, 409);
  assert.equal((await call('status', {})).plan, null);
  console.log('PASS workerd: stable VAPID identity, two timed encrypted pushes decrypted by recipient, replay and cancellation.');
} finally { await mf.dispose(); }
