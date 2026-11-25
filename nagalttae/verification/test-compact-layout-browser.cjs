const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.NAGAL_PLAYWRIGHT || 'playwright');

const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

async function run() {
  const server = http.createServer(async (request, response) => {
    try {
      const name = /^\/nagalttae\/([\w./-]*)$/.exec(request.url.split('?')[0])?.[1];
      if (name === undefined || name.split('/').includes('..')) throw Error();
      const file = path.join(root, name || 'index.html');
      const content = await fs.readFile(file);
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(content);
    } catch {
      response.writeHead(404).end();
    }
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = process.env.NAGAL_LAYOUT_URL ?? `http://127.0.0.1:${server.address().port}/nagalttae/`;
    browser = await chromium.launch({ channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
      hasTouch: true, timezoneId: 'Asia/Seoul', locale: 'ko-KR' });
    await context.addInitScript(() => {
      window.locationChecks = 0;
      navigator.geolocation.getCurrentPosition = (_success, failure) => {
        window.locationChecks++;
        failure({code: 1});
      };
      Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
      const register = navigator.serviceWorker.register.bind(navigator.serviceWorker);
      navigator.serviceWorker.register = (...args) => window.delayPushRegistration
        ? new Promise(resolve => { window.finishPushRegistration = resolve; })
        : register(...args);
    });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-11-25T08:00:00Z'));
    await page.goto(url);
    assert.equal(await page.locator('#app-version').textContent(), 'v1.6.9');
    const timeRow = page.locator('#time-open');
    const timeDialog = page.locator('#time-dialog');
    for (const selector of ['#durations', '#stops', '#bus-panel', '#copy', '#saved-plans-details']) {
      assert.ok(await page.locator(selector).isHidden(), selector);
    }
    assert.equal(await page.evaluate(() => window.locationChecks), 0);
    await timeRow.tap({ position: {x: 12, y: 30} });
    assert.ok(await timeDialog.isVisible());
    await page.locator('#target').fill('18:30');
    await page.locator('#done-time').click();
    assert.equal(await page.locator('#depart-time').textContent(), '오후 5:50');
    assert.equal(await page.locator('#ready-time').textContent(), '오후 5:30');
    await timeRow.tap({ position: {x: 340, y: 30} });
    assert.ok(await timeDialog.isVisible());
    await page.keyboard.press('Escape');
    if (await timeDialog.isVisible()) await page.keyboard.press('Escape');
    assert.ok(await timeDialog.isHidden());
    assert.equal(await page.evaluate(() => document.activeElement.id), 'time-open');

    await page.locator('#date-adjust summary').click();
    await page.locator('[data-day="0"]').click();
    assert.match(await page.locator('#date-label').textContent(), /오늘.*11월 25일/);
    await page.locator('#date-adjust summary').click();
    await page.locator('#reminders-open').click();
    assert.match(await page.locator('#push-preview').innerText(), /11월 25일.*5:30.*11월 25일.*5:50/s);
    await page.clock.install({ time: new Date('2026-11-25T08:00:00Z') });
    const pushWrites = [];
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/schedule') pushWrites.push(request);
    });
    await page.evaluate(() => { window.delayPushRegistration = true; });
    await page.locator('#push-save').click();
    assert.ok(await page.locator('#push-check').isDisabled());
    await page.clock.fastForward(15_001);
    const notice = page.locator('#push-status[data-notice]');
    await notice.waitFor({ state: 'visible' });
    assert.match(await notice.innerText(), /알림 등록이 지연/);
    assert.ok(await page.locator('#push-save').isEnabled());
    assert.ok(await page.locator('#push-check').isEnabled());
    assert.ok(await notice.evaluate(element => getComputedStyle(element).borderTopWidth === '1px'));
    await page.evaluate(() => window.finishPushRegistration());
    assert.deepEqual(pushWrites, []);
    await page.locator('#close-reminders').click();
    const actions = await page.locator('.main-actions').boundingBox();
    assert.ok(actions.y + actions.height <= 630);
    if (process.env.NAGAL_LAYOUT_SCREENSHOT) await page.screenshot({ path: process.env.NAGAL_LAYOUT_SCREENSHOT });

    await page.locator('#date-adjust summary').click();
    await page.locator('[data-day="1"]').click();
    await page.locator('#reminders-open').click();
    assert.match(await page.locator('#push-preview').innerText(), /11월 26일/);
    await page.locator('#close-reminders').click();
    await page.locator('.timeline summary').click();
    assert.ok(await page.locator('#stops').isVisible());
    await page.locator('#nearby-details > summary').click();
    await page.waitForFunction(() => window.locationChecks === 1);
    assert.ok(await page.locator('#bus-panel').isVisible());
    assert.ok(await page.locator('#timetable-panel').isVisible());
    await page.locator('#nearby-details > summary').click();
    await page.locator('#nearby-details > summary').click();
    assert.equal(await page.evaluate(() => window.locationChecks), 1);
    await page.locator('#more-details summary').click();
    assert.ok(await page.locator('#copy').isVisible());
    await page.setViewportSize({ width: 320, height: 640 });
    for (const locale of ['ko', 'en', 'ja', 'zh']) {
      await page.locator('#language').selectOption(locale);
      assert.match(await timeRow.innerText(), /\d/);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), locale);
    }
    console.log('PASS mobile Chrome: both sides of time row, keyboard focus, exact alert date, grouped controls and four locales');
  } finally {
    await browser?.close();
    server.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
