const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const scope = 'https://studio.example/nagalttae/';
const paths = ['index.html', 'app.css', 'studio.css', 'planner.js', 'session-plan.js', 'calendar.js', 'transit.js',
  ...[33, 34, 35, 36, 37, 38].map(band => 'stops/' + band + '.json'),
  'locale.js', 'studio.js', 'ticket-image.js', 'android-ui.js', 'push.js', 'app.js', 'icon.svg', 'morning.webp',
  'manifest.webmanifest', 'icons/app-192.png', 'icons/app-512.png', 'icons/app-maskable.png',
  'icons/apple-touch-icon.png'];
const bytes = name => fs.readFileSync(path.join(root, name));
const source = bytes('sw.js').toString('utf8');
const sha = buffer => 'sha256-' + crypto.createHash('sha256').update(buffer).digest('base64');

function worker() {
  const events = new Map();
  const cachesByName = new Map();
  const requests = [];
  const responses = new Map();
  const config = { offline: false };

  async function fetch(request) {
    requests.push(request);
    if (config.offline) throw new Error('offline');
    const key = new URL(request.url).pathname.slice(new URL(scope).pathname.length) || 'index.html';
    const data = responses.has(key) ? responses.get(key) : bytes(key);
    if (data === null) return new Response('', { status: 404 });
    if (!request.integrity.split(' ').includes(sha(data))) throw new Error('SRI mismatch');
    return new Response(data);
  }

  const storage = {
    async open(name) {
      if (!cachesByName.has(name)) cachesByName.set(name, new Map());
      const cache = cachesByName.get(name);
      return {
        async addAll(list) {
          const items = await Promise.all(list.map(async request => {
            const response = await fetch(request);
            if (!response.ok) throw new Error('Not 2xx');
            return [request.url, response];
          }));
          for (const [url, response] of items) cache.set(url, response);
        }
      };
    },
    async keys() { return [...cachesByName.keys()]; },
    async delete(key) { return cachesByName.delete(key); },
    async match(url, { cacheName }) { return cachesByName.get(cacheName)?.get(url)?.clone(); }
  };

  const self = { registration: { scope }, addEventListener: (key, cb) => events.set(key, cb) };
  vm.runInNewContext(source, { Request, Response, URL, caches: storage, self, fetch });
  function lifecycle(key) {
    let work;
    events.get(key)({ waitUntil: promise => { work = promise; } });
    return work;
  }
  function request(input, mode, method = 'GET') {
    let result;
    events.get('fetch')({ request: { url: new URL(input, scope).href, mode, method },
      respondWith: promise => { result = promise; } });
    return result;
  }
  return { lifecycle, request, cachesByName, config, requests, responses };
}

test('all pinned shell requests verify against actual deployable file bytes', async () => {
  const w = worker();
  await w.lifecycle('install');
  const cached = [...w.cachesByName.values()][0];
  assert.deepEqual([...cached.keys()].sort(), paths.map(name => scope + name).sort());
  for (const request of w.requests) {
    assert.equal(request.redirect, 'error');
    assert.equal(request.mode, 'same-origin');
    assert.match(request.integrity, /^sha256-/);
    const name = new URL(request.url).pathname.slice(new URL(scope).pathname.length);
    if (!/\.(png|webp)$/.test(name)) {
      const lf = bytes(name).toString('utf8').replaceAll('\r\n', '\n');
      for (const version of [lf, lf.replaceAll('\n', '\r\n')]) {
        assert.ok(request.integrity.split(' ').includes(sha(Buffer.from(version))), name);
      }
    }
  }
});

test('an incomplete update rejects installation and leaves an existing release intact', async () => {
  for (const error of [null, Buffer.from('inconsistent release')]) {
    const w = worker();
    w.cachesByName.set('older release', new Map([['working', true]]));
    w.responses.set('app.js', error);
    await assert.rejects(w.lifecycle('install'));
    assert.equal(w.cachesByName.get('older release').get('working'), true);
    assert.equal([...w.cachesByName.values()][1].size, 0);
  }
});

test('network-first navigation falls back to the matching release when disconnected or newer HTML is served', async () => {
  const w = worker();
  await w.lifecycle('install');
  const html = bytes('index.html').toString('utf8');
  const before = w.requests.length;
  assert.equal(await (await w.request('./?shared=1', 'navigate')).text(), html);
  assert.equal(w.requests.length, before + 1);
  w.responses.set('index.html', Buffer.from('new HTML'));
  assert.equal(await (await w.request('index.html?preview=1', 'navigate')).text(), html);
  w.config.offline = true;
  assert.equal(await (await w.request('./', 'navigate')).text(), html);
  assert.equal(await (await w.request('app.js?v=future', 'script')).text(), bytes('app.js').toString('utf8'));
});

test('only this registration and allowed GET routes are handled', async () => {
  const w = worker();
  await w.lifecycle('install');
  const name = [...w.cachesByName.keys()][0];
  const old = name.slice(0, name.lastIndexOf(':') + 1) + 'obsolete-release';
  const foreign = 'nagalttae-shell:' + encodeURIComponent(scope + 'child/') + ':older-release';
  for (const key of [old, foreign, 'unrelated-cache']) w.cachesByName.set(key, new Map());
  await w.lifecycle('activate');
  assert.deepEqual([...w.cachesByName.keys()].sort(), [name, foreign, 'unrelated-cache'].sort());
  for (const url of ['https://cdn.example/app.js', '/other/app.js', '/nagalttae-old/', 'child/', 'missing']) {
    assert.equal(w.request(url, 'navigate'), undefined);
    assert.equal(w.request(url, 'script'), undefined);
  }
  assert.equal(w.request('app.js', 'cors', 'POST'), undefined);
  assert.equal(w.request('index.html', 'navigate', 'HEAD'), undefined);
});
