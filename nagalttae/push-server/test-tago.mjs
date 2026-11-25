import assert from 'node:assert/strict';
import test from 'node:test';
import { busResponse } from './anseong.js';
import { tagoPredictions, tagoResponse } from './tago.js';

const station = 'DJB8001793';
const request = new Request('https://worker.test/tago/arrivals/25/' + station);
const headers = { 'Access-Control-Allow-Origin': 'https://example.test' };
const allowed = { limit: async () => ({ success: true }) };
const env = { TAGO_SERVICE_KEY: 'fake%2Bkey%3D', BUS_LOOKUPS: allowed };
const row = { nodeid: station, routeno: 5, arrtime: 180, routeid: 'DJB30300002' };
const result = (items, code = '00') =>
  Response.json({ response: { header: { resultCode: code }, body: { items, totalCount: items ? 1 : 0 } } });

test('normalizes TAGO data in seconds without inventing a vehicle ID', () => {
  assert.deepEqual(tagoPredictions({ items: { item: row } }, station, station, 1000), {
    station, source: 'TAGO', updated: 1000, arrivals: [{ name: '5', direction: '', trip: null, at: 181000 }]
  });
  assert.deepEqual(tagoPredictions({ items: '' , totalCount: 0 }, station, station, 1000).arrivals, []);
  assert.throws(() => tagoPredictions({ items: { item: { ...row, nodeid: 'wrong' } } }, station, station, 1000));
  assert.throws(() => tagoPredictions({ items: { item: { ...row, arrtime: -1 } } }, station, station, 1000));
});

test('serves per-city results from cache and distinguishes unavailable cities and invalid keys', async t => {
  const memory = new Map();
  let retries = 0, unavailable = 0;
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://apis.data.go.kr');
    assert.equal(url.searchParams.get('serviceKey'), 'fake+key=');
    assert.equal(url.searchParams.get('_type'), 'json');
    assert.equal(options.redirect, 'manual');
    if (url.pathname.endsWith('/getCtyCodeList')) return result({ item: [{ citycode: 25 }, { citycode: 31220 }] });
    if (url.searchParams.get('cityCode') === '11') return result('', '20');
    if (url.searchParams.get('cityCode') === '26') return result('', '01');
    if (url.searchParams.get('cityCode') === '31220') return result({ item: { ...row, nodeid: 'GGB231000018' } });
    assert.equal(url.searchParams.get('cityCode'), '25');
    if (url.searchParams.get('nodeId') === 'DJB_RETRY') {
      return ++retries === 1 ? result('', '99') : result({ item: { ...row, nodeid: 'DJB_RETRY' } });
    }
    if (url.searchParams.get('nodeId') === 'DJB_DOWN') {
      unavailable++;
      return result('', '99');
    }
    if (url.searchParams.get('nodeId') === 'DJBEMPTY') return result('');
    assert.equal(url.searchParams.get('nodeId'), station);
    return result({ item: row });
  });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
    match: async req => memory.get(req.url)?.clone(),
    put: async (req, response) => { memory.set(req.url, response.clone()); }
  } } });
  try {
    const missing = await tagoResponse(request, {}, headers, '25', station);
    assert.equal(missing.status, 503);
    assert.deepEqual(await missing.json(), { code: 'notConfigured' });
    const blocked = await tagoResponse(request, { ...env, BUS_LOOKUPS: { limit: async () => ({ success: false }) } }, headers, '25', station);
    assert.equal(blocked.status, 429);
    const live = await tagoResponse(request, env, headers, '25', station);
    assert.equal(live.status, 200);
    assert.equal(live.headers.get('Access-Control-Allow-Origin'), headers['Access-Control-Allow-Origin']);
    const saved = await live.json();
    assert.equal(saved.arrivals[0].at - saved.updated, 180000);
    const cached = await tagoResponse(request, env, headers, '25', station);
    assert.deepEqual(await cached.json(), saved);
    assert.equal(fetch.mock.callCount(), 1);
    const denied = await tagoResponse(request, env, headers, '11', 'SEB107900045');
    assert.equal(denied.status, 503);
    assert.deepEqual(await denied.json(), { code: 'authRejected' });
    const unsupported = await tagoResponse(request, env, headers, '26', 'CITY26');
    assert.equal((await unsupported.json()).unsupportedCity, true);
    const empty = await tagoResponse(request, env, headers, '25', 'DJBEMPTY');
    const emptyBody = await empty.json();
    assert.equal(empty.status, 200);
    assert.deepEqual(emptyBody.arrivals, []);
    assert.equal(emptyBody.unsupportedCity, undefined);
    const anseong = await busResponse(new Request('https://worker.test/anseong/arrivals/231000018'), env, headers);
    const local = await anseong.json();
    assert.equal(local.station, '231000018');
    assert.equal(local.source, 'TAGO');
    assert.equal(local.arrivals[0].name, '5');
    const retry = await tagoResponse(request, env, headers, '25', 'DJB_RETRY');
    assert.equal(retries, 2);
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).arrivals.length, 1);
    const down = await tagoResponse(request, env, headers, '25', 'DJB_DOWN');
    assert.equal(unavailable, 2);
    assert.equal(down.status, 503);
    assert.deepEqual(await down.json(), { code: 'unavailable' });
  } finally {
    if (previous) Object.defineProperty(globalThis, 'caches', previous);
    else delete globalThis.caches;
  }
});
