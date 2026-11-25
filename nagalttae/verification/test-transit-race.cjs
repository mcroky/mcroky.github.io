const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { chromium } = require(process.env.NAGAL_PLAYWRIGHT || 'playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://planner.test';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

async function serveLocal(route) {
  const url = new URL(route.request().url());
  if (url.origin !== origin) return route.abort();
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(root + path.sep)) return route.abort();
  try {
    await route.fulfill({ body: await fs.readFile(file), contentType: mime[path.extname(file)] || 'application/octet-stream' });
  } catch {
    await route.fulfill({ status: 404, body: '' });
  }
}

async function snapshot(page) {
  return page.evaluate(() => ({
    status: document.getElementById('bus-status').textContent,
    stops: document.getElementById('bus-stops').textContent,
    title: document.getElementById('bus-station-name').textContent,
    arrivals: document.getElementById('bus-arrivals').textContent,
    hidden: document.getElementById('bus-board').hidden,
    tripHidden: document.getElementById('bus-trip').hidden,
    rides: document.getElementById('bus-ride').textContent
  }));
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    page.setDefaultTimeout(4500);
    await page.route('**/*', serveLocal);
    await page.addInitScript(() => {
      const realFetch = window.fetch.bind(window);
      const gps = [];
      const requests = [];
      window.arrivalRequests = requests;
      window.geoCount = () => gps.length;
      Object.defineProperty(navigator, 'geolocation', { value: {
        getCurrentPosition(success, failure) { gps.push({ success, failure }); }
      } });
      window.releaseLocation = ({ index, ok }) => {
        if (ok) gps[index].success({ coords: { latitude: 37.0800667, longitude: 127.2510167 } });
        else gps[index].failure({ code: 1 });
      };
      window.fetch = function (url, options) {
        const pathname = new URL(url, location.href).pathname;
        if (pathname.endsWith('/anseong-stops.json')) {
          return new Promise((resolve, reject) => {
            window.releaseCatalog = () => realFetch(url, options).then(resolve, reject);
          });
        }
        if (pathname.includes('/anseong/arrivals/')) {
          return new Promise((resolve, reject) => requests.push({ sid: pathname.split('/').pop(), resolve, reject }));
        }
        return realFetch(url, options);
      };
      window.releaseArrival = ({ index, ok, label, wrongStation, trips }) => {
        const request = requests[index];
        if (!ok) return request.reject(new Error('simulated connection error'));
        const now = Date.now();
        const arrivals = (trips || [label]).map((trip, i) => ({
          trip, name: trip, direction: '테스트', at: now + (12 + i) * 60000
        }));
        request.resolve(Response.json({ station: wrongStation || request.sid, updated: now, arrivals }));
      };
    });
    await page.goto(origin + '/index.html');
    const click = id => page.locator('#bus-' + id).click();
    const search = q => page.locator('#bus-query').fill(q);
    const stops = page.locator('#bus-stops button');
    const waitRequests = n => page.waitForFunction(count => window.arrivalRequests.length === count, n);
    const finish = (index, ok, label, wrongStation, trips) => settle(page, 'releaseArrival', { index, ok, label, wrongStation, trips });
    const gps = (index, ok) => settle(page, 'releaseLocation', { index, ok });
    const containsRide = label => page.waitForFunction(s => document.querySelector('#bus-ride').textContent.includes(s), label);

    await click('locate');
    await gps(0, true);
    await page.waitForFunction(() => typeof window.releaseCatalog === 'function');
    await search('신창리');
    await page.evaluate(() => window.releaseCatalog());
    await page.waitForFunction(() => document.querySelectorAll('#bus-stops button').length >= 2);
    assert.ok((await snapshot(page)).hidden, 'old nearest-stop result cannot auto-select after manual search');
    await waitRequests(0);

    const stopA = stops.filter({ hasText: '33082' });
    const stopB = stops.filter({ hasText: '33081' });
    await stopA.click();
    await stopB.click();
    await waitRequests(2);
    await finish(1, true, 'R-B');
    await containsRide('R-B');
    const newest = await snapshot(page);
    await finish(0, true, 'OLD-A');
    assert.deepEqual(await snapshot(page), newest);

    await click('reload');
    await click('reload');
    await waitRequests(4);
    await finish(3, true, 'R-B2');
    await containsRide('R-B2');
    const refreshed = await snapshot(page);
    await finish(2, false);
    assert.deepEqual(await snapshot(page), refreshed, 'same-stop stale error cannot replace a newer arrival');

    await click('reload');
    await search('신창리 ');
    await stopA.waitFor();
    const cleared = await snapshot(page);
    assert.ok(cleared.hidden);
    await finish(4, true, 'OLD-QUERY');
    assert.deepEqual(await snapshot(page), cleared);

    for (const ok of [true, false]) {
      const count = await page.evaluate(() => window.geoCount());
      await click('locate');
      await search('신창리');
      await stopA.click();
      const before = await snapshot(page);
      await gps(count, ok);
      assert.deepEqual(await snapshot(page), before, 'old GPS completion left the searched station selected');
    }
    const current = await page.evaluate(() => window.arrivalRequests.length - 1);
    await finish(current, true, 'OTHER', 'not-the-requested-id');
    await page.waitForFunction(() => document.querySelector('#bus-arrivals').textContent.includes('불러오지 못'));
    const foreign = await snapshot(page);
    assert.ok(foreign.tripHidden, 'foreign response has no usable ETA or journey');

    await stopA.click();
    const firstTripRequest = await page.evaluate(() => window.arrivalRequests.length - 1);
    const routeSelect = page.locator('#bus-ride');
    const selectedTrip = () => routeSelect.locator('option:checked').innerText();
    await finish(firstTripRequest, true, '', '', ['T1', 'T2']);
    await routeSelect.selectOption('1');
    assert.match(await selectedTrip(), /T2/);
    await click('reload');
    await click('reload');
    await waitRequests(firstTripRequest + 3);
    await finish(firstTripRequest + 2, true, '', '', ['T3', 'T2']);
    await finish(firstTripRequest + 1, true, '', '', ['T1', 'T2']);
    assert.match(await selectedTrip(), /T2/, 'overlapping refreshes preserve an explicit trip even before the first fetch resolves');
    for (const [i, trips] of [['T3', 'T4'], ['T4', 'T3']].entries()) {
      await click('reload');
      await finish(firstTripRequest + 3 + i, true, '', '', trips);
      assert.equal(await routeSelect.inputValue(), '-1', 'a missing trip requires a new choice');
      assert.ok(await page.locator('#bus-reserve').isDisabled());
    }
    await click('reload');
    await finish(firstTripRequest + 5, false);
    await click('reload');
    await finish(firstTripRequest + 6, true, '', '', ['T2', 'T4']);
    assert.match(await selectedTrip(), /T2/, 'a retry recognizes the original trip when it returns');
    await stopB.click();
    await finish(firstTripRequest + 7, true, '', '', ['B1', 'B2']);
    assert.match(await selectedTrip(), /B1/, 'an explicit stop selection starts a new trip choice');
    console.log('PASS Chrome ' + browser.version() + ': stale location/list/arrival callbacks, foreign-station rejection, overlapping refreshes, missing/returning trip, retry and fresh stop choice');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

async function settle(page, action, value) {
  await page.evaluate(async ([name, input]) => {
    window[name](input);
    await new Promise(resolve => setTimeout(resolve, 0));
  }, [action, value]);
}
