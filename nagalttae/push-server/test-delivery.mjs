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
  bindings: { ...config.vars, TAGO_SERVICE_KEY: 'mock-tago-key', GBIS_SERVICE_KEY: 'mock-gbis-key', SEOUL_SUBWAY_SAMPLE: '1' },
  durableObjects: Object.fromEntries(config.durable_objects.bindings.map(b => [b.name, { className: b.class_name, useSQLite: true }])),
  ratelimits: Object.fromEntries(config.ratelimits.map(limit => [limit.name, limit])),
  outboundService: async req => {
    const url = new URL(req.url);
    if (url.hostname === 'swopenapi.seoul.go.kr') {
      assert.equal(decodeURIComponent(url.pathname), '/api/subway/sample/json/realtimeStationArrival/0/5/서울');
      const recptnDt = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
      return Response.json({ errorMessage: { code:'INFO-000' }, realtimeArrivalList: [
        { statnNm:'서울', subwayId:'1001', recptnDt, barvlDt:'600', arvlCd:'99', trainLineNm:'광운대행', btrainNo:'0640', updnLine:'상행' },
        { statnNm:'서울', subwayId:'1004', recptnDt, barvlDt:'630', arvlCd:'99', trainLineNm:'사당행', btrainNo:'0400', updnLine:'하행' }
      ] });
    }
    if (url.hostname === 'topis.seoul.go.kr') {
      assert.equal(url.pathname, '/map/getBusStn.do');
      assert.equal(req.method, 'POST');
      assert.equal(await req.text(), 'url=%2FgetStationByUidDetourAt&arsId=08528');
      return Response.json({ rows: [{ arsId: '08528', stId: '107900045', rtNm: '성북09', adirection: '미아사거리역',
        arrmsg1: '곧 도착', traTime1: '29', arrmsg2: '출발대기', traTime2: '0' }] });
    }
    if (url.pathname.endsWith('/getBusArrivalListv2')) {
      assert.equal(url.hostname, 'apis.data.go.kr');
      assert.equal(url.searchParams.get('stationId'), '231000018');
      assert.equal(url.searchParams.get('serviceKey'), 'mock-gbis-key');
      const queryTime = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 19);
      return Response.json({ response: {
        msgHeader: { resultCode: 0, queryTime },
        msgBody: { busArrivalList: [{ stationId: 231000018, routeName: '380', predictTimeSec1: 300 }] }
      } });
    }
    if (url.hostname === 'apis.data.go.kr') {
      assert.equal(url.pathname, '/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList');
      assert.equal(url.searchParams.get('cityCode'), '25');
      assert.equal(url.searchParams.get('nodeId'), 'DJB8001793');
      assert.equal(url.searchParams.get('serviceKey'), 'mock-tago-key');
      return Response.json({ response: {
        header: { resultCode: '00' },
        body: { items: { item: { nodeid: 'DJB8001793', routeno: '5', arrtime: 180 } }, totalCount: 1 }
      } });
    }
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
  assert.equal(reply.status, status, route + ' ' + (reply.status === status ? '' : await reply.text()));
  return reply.json();
}
try {
  const keys = await Promise.all([call('key'), call('key')]);
  assert.equal(keys[0].publicKey.length, 87);
  assert.deepEqual(keys[0], keys[1]);
  assert.equal((await mf.dispatchFetch('https://service.test/key', { headers: { Origin: 'https://unknown.test' } })).status, 403);
  const tago = await call('tago/arrivals/25/DJB8001793');
  assert.equal(tago.station, 'DJB8001793');
  assert.equal(tago.source, 'TAGO');
  assert.equal(tago.arrivals[0].at - tago.updated, 180000);
  const gbis = await call('anseong/arrivals/231000018');
  assert.equal(gbis.station, '231000018');
  assert.equal(gbis.arrivals[0].name, '380');
  assert.equal(gbis.arrivals[0].at - gbis.updated, 300000);
  const seoul = await call('seoul/arrivals/SEB107900045/08528');
  assert.equal(seoul.station, 'SEB107900045');
  assert.equal(seoul.source, 'TOPIS');
  assert.equal(seoul.arrivals[0].name, '성북09');
  assert.equal(seoul.arrivals[0].at, seoul.updated);
  const rail = await call('rail/arrivals/I4101:0133');
  assert.equal(rail.station, 'I4101:0133');
  assert.deepEqual(rail.arrivals.map(row => row.direction), ['광운대행']);
  assert.equal(rail.arrivals[0].at - rail.updated, 600000);
  assert.deepEqual(await call('rail/arrivals/S2601:0113', undefined, 422), { code: 'unsupported' });
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
  console.log('PASS workerd: TAGO, GBIS and TOPIS routing, stable VAPID identity, encrypted push delivery, replay and cancellation.');
} finally { await mf.dispose(); }
