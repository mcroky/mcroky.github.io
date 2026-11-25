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
    listHidden: document.getElementById('bus-next').hidden,
    rows: document.getElementById('bus-next').textContent,
    mapHidden: document.getElementById('bus-map').hidden,
    mapUrl: document.getElementById('bus-map').href
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
        if (pathname.endsWith('/stops/37.json')) {
          return new Promise((resolve, reject) => {
            window.releaseCatalog = () => realFetch(url, options).then(resolve, reject);
          });
        }
        if (/^\/(anseong|tago|seoul)\/arrivals\//.test(pathname)) {
          const parts = pathname.split('/');
          const sid = parts.at(parts[1] === 'seoul' ? -2 : -1);
          return new Promise((resolve, reject) => requests.push({ pathname, sid, resolve, reject }));
        }
        return realFetch(url, options);
      };
      window.releaseArrival = ({ index, ok, label, wrongStation, trips, age = 0, etaMinutes = 12, unsupportedCity = false }) => {
        const request = requests[index];
        if (!ok) return request.reject(new Error('simulated connection error'));
        const now = Date.now();
        const source = request.pathname.startsWith('/tago/') ? 'TAGO' : request.pathname.startsWith('/seoul/') ? 'TOPIS' : undefined;
        const arrivals = (unsupportedCity ? [] : trips || [label]).map((trip, i) => ({
          trip: source ? null : trip, name: trip, direction: source ? '' : '테스트', at: now + (etaMinutes + i) * 60000
        }));
        request.resolve(Response.json({ station: wrongStation || request.sid, source, updated: now - age, arrivals, unsupportedCity }));
      };
    });
    await page.goto(origin + '/index.html');
    await page.locator('#nearby-details > summary').click();
    const click = id => page.locator('#bus-' + id).click();
    async function search(q) {
      if (!(await page.locator('#bus-query').isVisible())) await page.locator('#bus-manual summary').click();
      await page.locator('#bus-query').fill(q);
    }
    const stops = page.locator('#bus-stops button');
    const waitRequests = n => page.waitForFunction(count => window.arrivalRequests.length === count, n);
    const finish = (index, ok, label, wrongStation, trips) => settle(page, 'releaseArrival', { index, ok, label, wrongStation, trips });
    const gps = (index, ok) => settle(page, 'releaseLocation', { index, ok });
    const containsArrival = label => page.waitForFunction(s => document.querySelector('#bus-next').textContent.includes(s), label);

    assert.equal(await page.evaluate(() => window.geoCount()), 1, 'mount requests GPS without a click');
    assert.ok(await page.locator('#bus-locate').isHidden());
    await gps(0, true);
    await page.waitForFunction(() => typeof window.releaseCatalog === 'function');
    await search('안성시 신창리');
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
    await containsArrival('R-B');
    const newest = await snapshot(page);
    await finish(0, true, 'OLD-A');
    assert.deepEqual(await snapshot(page), newest);

    await click('reload');
    await click('reload');
    await waitRequests(4);
    await finish(3, true, 'R-B2');
    await containsArrival('R-B2');
    const refreshed = await snapshot(page);
    await finish(2, false);
    assert.deepEqual(await snapshot(page), refreshed, 'same-stop stale error cannot replace a newer arrival');

    await click('reload');
    await search('안성시 신창리 ');
    await stopA.waitFor();
    const cleared = await snapshot(page);
    assert.ok(cleared.hidden);
    await finish(4, true, 'OLD-QUERY');
    assert.deepEqual(await snapshot(page), cleared);

    for (const ok of [true, false]) {
      const count = await page.evaluate(() => window.geoCount());
      await click('locate');
      await search('안성시 신창리');
      await stopA.click();
      const before = await snapshot(page);
      await gps(count, ok);
      assert.deepEqual(await snapshot(page), before, 'old GPS completion left the searched station selected');
    }
    const current = await page.evaluate(() => window.arrivalRequests.length - 1);
    await finish(current, true, 'OTHER', 'not-the-requested-id');
    await page.waitForFunction(() => document.querySelector('#bus-arrivals').textContent.includes('불러오지 못'));
    const foreign = await snapshot(page);
    assert.ok(foreign.listHidden, 'foreign response has no usable ETA');

    await stopA.click();
    const firstTripRequest = await page.evaluate(() => window.arrivalRequests.length - 1);
    await finish(firstTripRequest, true, '', '', ['T1', 'T2']);
    const arrivals = page.locator('#bus-next li');
    await arrivals.first().waitFor();
    assert.deepEqual(await arrivals.locator('span').allTextContents(), ['T1 · 테스트 방면', 'T2 · 테스트 방면']);
    assert.equal(await page.locator('#bus-panel :is(#bus-ride, #bus-walk, #bus-reserve, #bus-next button)').count(), 0);
    await click('reload');
    await click('reload');
    await waitRequests(firstTripRequest + 3);
    await finish(firstTripRequest + 2, true, '', '', ['T3', 'T2']);
    await finish(firstTripRequest + 1, true, '', '', ['T1', 'T2']);
    assert.deepEqual(await arrivals.locator('span').allTextContents(), ['T3 · 테스트 방면', 'T2 · 테스트 방면']);
    await click('reload');
    await settle(page, 'releaseArrival', { index: firstTripRequest + 3, ok: true, label: 'EXPIRED', age: 121000 });
    assert.match(await page.locator('#bus-arrivals').innerText(), /오래됐어요/);
    assert.ok(await page.locator('#bus-next').isHidden());
    await stopB.click();
    await finish(firstTripRequest + 4, true, '', '', ['B1', 'B2']);
    await containsArrival('B1');
    await click('reload');
    const outstanding = await page.evaluate(() => window.arrivalRequests.length);
    await search('JEB405000646');
    await stops.first().click();
    assert.match(await page.locator('#bus-official').getAttribute('href'), /map\.kakao\.com/);
    await waitRequests(outstanding + 1);
    assert.equal(await page.evaluate(() => window.arrivalRequests.at(-1).pathname), '/tago/arrivals/39/JEB405000646');
    await finish(outstanding - 1, true, 'OLD-ANSEONG');
    assert.ok(await page.locator('#bus-next').isHidden(), 'TAGO stop ignores older GBIS arrivals while loading');
    await finish(outstanding, true, '5');
    assert.match(await page.locator('#bus-next li').first().innerText(), /^5\s+12분 뒤/);
    assert.match(await page.locator('#bus-arrivals').innerText(), /TAGO/);
    await click('reload');
    await search('안성시 신창리');
    await stopA.click();
    await settle(page, 'releaseArrival', { index: outstanding + 1, ok: true, unsupportedCity: true });
    await finish(outstanding + 2, true, 'LAST-ANSEONG');
    await containsArrival('LAST-ANSEONG');
    await search('JEB405000646');
    await stops.first().click();
    await settle(page, 'releaseArrival', { index: outstanding + 3, ok: true, unsupportedCity: true });
    assert.match(await page.locator('#bus-arrivals').innerText(), /TAGO에서 제공하지 않아요/);
    assert.ok(await page.locator('#bus-next').isHidden());
    await click('reload');
    await search('SEB107900045');
    await stops.first().click();
    await waitRequests(outstanding + 6);
    assert.equal(await page.evaluate(() => window.arrivalRequests.at(-1).pathname), '/seoul/arrivals/SEB107900045/08528');
    await finish(outstanding + 5, true, '성북09');
    assert.match(await page.locator('#bus-next li').first().innerText(), /^성북09\s+12분 뒤/);
    assert.match(await page.locator('#bus-arrivals').innerText(), /TOPIS/);
    assert.match(await page.locator('#bus-official').getAttribute('href'), /topis\.seoul\.go\.kr/);
    const seoul = await snapshot(page);
    await finish(outstanding + 4, true, 'OLD-JEJU');
    assert.deepEqual(await snapshot(page), seoul);

    await search('33014');
    await stops.filter({ hasText: '신용정' }).click();
    const sinyongjeong = await page.evaluate(() => window.arrivalRequests.length - 1);
    const map = page.locator('#bus-map');
    assert.ok(await map.isHidden(), 'loading does not show an alternate link');
    await finish(sinyongjeong, true, '', '', []);
    assert.match(await page.locator('#bus-arrivals').innerText(), /연결된 데이터에서 이 정류장의 도착 예측을 받지 못했어요/);
    assert.ok(await map.isVisible());
    assert.equal(decodeURIComponent(new URL(await map.getAttribute('href')).pathname), '/link/search/신용정 33014');
    assert.match(await page.locator('#bus-official').getAttribute('href'), /gbis\.go\.kr/);
    await click('reload');
    await settle(page, 'releaseArrival', { index: sinyongjeong + 1, ok: true, label: 'EXPIRED', etaMinutes: -1 });
    assert.match(await page.locator('#bus-arrivals').innerText(), /오래됐어요/);
    assert.ok(await map.isVisible());
    await click('reload');
    await finish(sinyongjeong + 2, true, '7-3');
    await containsArrival('7-3');
    assert.ok(await map.isHidden(), 'fresh arrivals hide the alternate link');
    await search('JEB405000646');
    await stops.first().click();
    await finish(sinyongjeong + 3, true, '', '', []);
    assert.ok(await map.isHidden(), 'a stop with a primary map link has no duplicate link');
    assert.match(await page.locator('#bus-official').getAttribute('href'), /map\.kakao\.com/);
    console.log('PASS Chrome ' + browser.version() + ': stale callbacks, read-only arrivals, GBIS/TAGO/TOPIS switching and unsupported city state');
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
