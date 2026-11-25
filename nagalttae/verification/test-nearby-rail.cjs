const assert = require('node:assert/strict');
const { chromium } = require(process.env.NAGAL_PLAYWRIGHT || 'playwright');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..'), origin = 'https://rail-local.test';
const now = Date.parse('2026-11-25T10:00:00+09:00');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json' };

async function serve(route) {
  const url = new URL(route.request().url());
  if (url.origin !== origin) return route.abort();
  const file = path.resolve(root, '.' + url.pathname);
  if (!file.startsWith(root + path.sep)) return route.abort();
  try { return await route.fulfill({ body: await readFile(file), contentType: mime[path.extname(file)] || 'application/octet-stream' }); }
  catch { return route.fulfill({ status: 404 }); }
}

async function open(browser, latitude, longitude, liveRoute) {
  const context = await browser.newContext({
    permissions: ['geolocation'], geolocation: { latitude, longitude }, serviceWorkers: 'block',
    locale: 'ko-KR', timezoneId: 'America/Los_Angeles', viewport: { width: 390, height: 800 }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  await page.clock.setFixedTime(now);
  await page.route('**/*', serve);
  if (liveRoute) await page.route('**/rail/arrivals/*', liveRoute);
  await page.goto(origin + '/index.html');
  await page.locator('#nearby-details > summary').click();
  if (!liveRoute) await page.locator('#timetable-mode-schedule').click();
  return { context, page };
}

async function waitStation(page, id) {
  await page.waitForFunction(key => document.querySelector('#timetable-station').value === key, id);
}

async function run() {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const [latitude, longitude, id, name] of [
      [37.563534, 126.975271, 'S1102:0201', '시청'],
      [35.11528, 129.03972, 'S2601:0113', '부산역'],
      [36.331583, 127.433118, 'S3001:104', '대전']
    ]) {
      const { context, page } = await open(browser, latitude, longitude);
      try {
        await waitStation(page, id);
        const rows = page.locator('#timetable-scheduled-arrivals li');
        await rows.first().waitFor();
        assert.match(await page.locator('#timetable-station option:checked').innerText(), new RegExp(name));
        assert.equal(await page.locator('#timetable-date').inputValue(), '2026-11-25');
        await page.locator('#timetable-date').fill('2026-11-28');
        await rows.first().waitFor();
        const line = id.split(':')[0];
        const schedule = JSON.parse(await readFile(path.join(root, 'rail-times', line + '.json'), 'utf8'))[id];
        const [seconds] = (schedule.days.saturday || schedule.days.holiday)[0];
        const expected = new Date(Date.parse('2026-11-28T00:00:00Z') + seconds * 1000).toISOString().slice(11, 16);
        assert.equal(await rows.first().locator('strong').innerText(), expected);
        assert.match(await page.locator('#timetable-day-type').innerText(), /시간표/);
        const direction = page.locator('#timetable-direction');
        const terminal = await direction.locator('option').nth(1).getAttribute('value');
        await direction.selectOption(terminal);
        const directions = await rows.locator('span').allTextContents();
        assert.ok(directions.length && directions.every(label => label.includes(terminal)));
        await page.locator('#timetable-date').fill('');
        assert.ok(await page.locator('#timetable-scheduled-arrivals').isHidden());
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        console.log('PASS nearby station, KST timetable, and direction filter', name);
      } finally { await context.close(); }
    }

    const { context, page } = await open(browser, 33.503672, 126.496587);
    try {
      await page.waitForFunction(() => document.querySelector('#timetable-summary').textContent.includes('3km'));
      await page.waitForFunction(() => document.querySelector('#bus-station-name').textContent.includes('제주'));
      let release;
      await page.route('**/rail-times/S1102.json', async route => {
        await new Promise(resolve => { release = resolve; });
        await serve(route);
      });
      await page.locator('#timetable-query').fill('시청');
      await page.locator('#timetable-station').selectOption('S1102:0201');
      await page.waitForFunction(() => document.querySelector('#timetable-summary').textContent.includes('불러오고'));
      await page.locator('#timetable-query').fill('부산역');
      await page.locator('#timetable-station').selectOption('S2601:0113');
      const rows = page.locator('#timetable-scheduled-arrivals li');
      await rows.first().waitFor();
      const ready = await rows.allTextContents();
      const settled = page.waitForResponse(/rail-times\/S1102.json/);
      release();
      await settled;
      assert.equal(await page.locator('#timetable-station').inputValue(), 'S2601:0113');
      assert.deepEqual(await rows.allTextContents(), ready);
      await page.route('**/rail/arrivals/S2601:0113', route => route.fulfill({ status: 422, json: { code:'unsupported' } }));
      await page.locator('#timetable-mode-live').click();
      await page.waitForFunction(() => document.querySelector('#timetable-live-status').textContent.includes('제공되지 않아요'));
      assert.ok(await page.locator('#timetable-scheduled-arrivals').isHidden());
      await page.locator('#timetable-mode-schedule').click();
      await rows.first().waitFor();
      console.log('PASS Jeju nearby bus, old rail response isolation, and Busan timetable fallback');
    } finally { await context.close(); }

    let fetches = 0;
    const live = await open(browser, 37.55585, 126.972103, route => {
      assert.match(route.request().url(), /I4101:0133$/);
      fetches++;
      const east = { trip:'one', direction:'광운대행', at: now + 9 * 60000 };
      const west = { trip:'two', direction:'구로행', at: now + 11 * 60000 };
      const departed = { direction:'지난 열차', at: now - 31000 };
      const due = { direction:'방금 진입', at: now - 30000 };
      const arrivals = fetches === 1 ? [departed, due, east, west] : fetches === 2 ? [west, east] : [east];
      return route.fulfill({ json: { station:'I4101:0133', updated:now - 60000, arrivals } });
    });
    try {
      const page = live.page, rows = page.locator('#timetable-live-arrivals li');
      await waitStation(page, 'I4101:0133');
      await rows.first().waitFor();
      assert.equal(await page.locator('#timetable-mode-live').getAttribute('aria-pressed'), 'true');
      assert.match(await rows.first().innerText(), /방금 진입.*곧 도착/s);
      assert.match(await rows.nth(1).innerText(), /광운대행.*9분 뒤/s);
      assert.equal(await rows.filter({hasText:'지난 열차'}).count(), 0);
      assert.equal(await page.locator('#timetable-panel :is(#timetable-reserve, #timetable-travel, #timetable-live-arrivals button)').count(), 0);
      await page.locator('#timetable-live-refresh').click();
      await rows.filter({hasText:'구로행'}).waitFor();
      assert.match(await rows.first().innerText(), /구로행.*11분 뒤/s);
      await page.locator('#timetable-live-refresh').click();
      await rows.first().waitFor();
      assert.equal(await rows.count(), 1);
      await page.clock.setFixedTime(now + 60000);
      await page.locator('#more-details > summary').click();
      await page.locator('#language').selectOption('en');
      assert.match(await rows.first().innerText(), /광운대행.*in 8 min/s);
      await page.clock.setFixedTime(now + 61000);
      for (const [language, message] of [['ja', /古く/], ['zh', /过期/], ['ko', /오래됐어요/]]) {
        await page.locator('#language').selectOption(language);
        assert.match(await page.locator('#timetable-live-status').innerText(), message);
        assert.ok(await page.locator('#timetable-live-arrivals').isHidden());
      }
      console.log('PASS read-only Seoul arrivals, refresh, boundaries, freshness, and localized status');
    } finally { await live.context.close(); }
  } finally { await browser.close(); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
