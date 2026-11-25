// Start the local Worker on 127.0.0.1:8791 with APP_ORIGIN=http://127.0.0.1:8792 first.
const assert = require('node:assert/strict');
const { createECDH, randomBytes } = require('node:crypto');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require(process.env.NAGAL_PLAYWRIGHT || 'playwright');
const app = path.resolve(__dirname, '..');
const live = process.argv.includes('--public');
const origin = live ? 'https://mcroky.github.io' : 'http://127.0.0.1:8792';
const api = live ? 'https://nagalttae-push.cokyroky.workers.dev' : 'http://127.0.0.1:8791';
const pageUrl = origin + '/nagalttae/';
const mime = { js: 'text/javascript', css: 'text/css', html: 'text/html', png: 'image/png',
  webmanifest: 'application/manifest+json', svg: 'image/svg+xml', webp: 'image/webp' };
const server = createServer(async (req, res) => {
  if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }).end('<title>Test observer</title>'); return; }
  const match = /^\/nagalttae\/((?:icons\/)?[a-z0-9.-]*)$/.exec(req.url);
  if (!match) return res.writeHead(404).end();
  const name = match[1] || 'index.html';
  try { res.writeHead(200, { 'Content-Type': mime[name.split('.').pop()] || 'text/plain' }).end(await readFile(path.join(app, name))); }
  catch { res.end(); }
});

(async () => {
  if (!live) await new Promise(resolve => server.listen(8792, '127.0.0.1', resolve));
  const real = process.argv.includes('--real');
  const context = await chromium.launchPersistentContext('', { channel: 'chrome', headless: true,
    permissions: ['notifications'], viewport: { width: 390, height: 800 }, timezoneId: 'Asia/Seoul',
    userAgent: 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/157.0.0.0 Mobile Safari/537.36',
    ignoreDefaultArgs: real ? ['--disable-background-networking'] : [] });
  try {
    if (real) await context.addInitScript(() => {
      const subscribe = PushManager.prototype.subscribe;
      PushManager.prototype.subscribe = async function(options) {
        try { return await subscribe.call(this, options); }
        catch (error) { window.testSubscriptionError = error.name + ' ' + error.message; throw error; }
      };
    });
    if (!real) {
      const fixture = { endpoint: 'https://fcm.googleapis.com/wp/test-' + randomBytes(18).toString('base64url'),
        keys: { p256dh: createECDH('prime256v1').generateKeys().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
      await context.addInitScript(sub => {
        PushManager.prototype.getSubscription = async () => localStorage.getItem('test-subscribed') ? sub : null;
        PushManager.prototype.subscribe = async () => { localStorage.setItem('test-subscribed', '1'); return sub; };
      }, fixture);
    }
    const page = await context.newPage();
    await page.goto(pageUrl);
    if (live) {
      assert.equal(await page.locator('meta[name="nagal-push-api"]').getAttribute('content'), api);
      assert.equal(await page.locator('#app-version').innerText(), 'v1.6.0');
    }
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.locator('[data-day="1"]').click();
    await page.locator('#push-save').click();
    try { await page.waitForFunction(() => document.querySelector('#push-status').textContent.includes('예약됨'), null, { timeout: real ? 45000 : 6000 }); }
    catch (error) { throw Error('Reservation did not complete: ' + await page.locator('#push-status').innerText() +
      ' ' + (await page.evaluate(() => window.testSubscriptionError || '')), { cause: error }); }
    const first = await page.locator('#push-status').innerText();
    await page.locator('#target').fill('11:20');
    await page.locator('#push-save').click();
    await page.waitForFunction(prior => document.querySelector('#push-status').textContent !== prior &&
      document.querySelector('#push-status').textContent.includes('예약됨'), first);
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#push-cancel').hidden);
    await page.locator('#push-cancel').click();
    await page.waitForFunction(() => document.querySelector('#push-status').textContent.includes('취소했어요'));
    const sub = await page.evaluate(async () => JSON.parse(JSON.stringify(await (await navigator.serviceWorker.ready).pushManager.getSubscription())));
    const status = await fetch(api + '/status', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub }) }).then(r => r.json());
    assert.equal(status.plan, null);
    const observer = await context.newPage();
    await observer.goto(origin);
    const cdp = await context.newCDPSession(observer);
    let registration;
    cdp.on('ServiceWorker.workerRegistrationUpdated', msg => {
      for (const r of msg.registrations) if (!r.isDeleted && r.scopeURL === pageUrl) registration = r.registrationId;
    });
    await cdp.send('ServiceWorker.enable');
    await page.close();
    const now = Date.now();
    if (real) {
      const saved = await fetch(api + '/schedule', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub, expected: status.revision, ready: now + 1500, leave: now + 4500, locale: 'ko' }) });
      assert.equal(saved.status, 200);
    } else {
      assert.ok(registration);
      for (const [kind, at] of [['ready', now - 400], ['leave', now - 100]]) {
        await cdp.send('ServiceWorker.deliverPushMessage', { origin, registrationId: registration, data: JSON.stringify({ kind, at, locale: 'ko' }) });
      }
    }
    await observer.waitForFunction(async url => {
      const reg = await navigator.serviceWorker.getRegistration(url);
      const notes = await reg.getNotifications();
      return notes.some(n => n.body.includes('준비를 시작')) && notes.some(n => n.body.includes('출발할 시간'));
    }, pageUrl, { timeout: real ? 35000 : 7000 });
    console.log('PASS Galaxy-sized Chrome: reserve, edit, restore, cancel and two notifications after closing app.',
      real ? 'Real push provider.' : 'Simulated subscription and browser push transport.');
  } finally {
    await context.close();
    if (!live) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
