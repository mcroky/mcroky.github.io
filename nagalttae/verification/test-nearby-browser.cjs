const assert = require('node:assert/strict');
const { chromium } = require(process.env.NAGAL_PLAYWRIGHT || 'playwright');

const url = process.argv[2] || 'https://mcroky.github.io/nagalttae/';
const mobile = {
  viewport: { width: 390, height: 844 }, locale: 'ko-KR', isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/157.0.0.0 Mobile Safari/537.36'
};

async function run() {
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const [latitude, longitude, name, provider] of [
      [37.0118167, 127.2576667, '안성CGV', 'gbis.go.kr'],
      [37.6111129, 127.0216763, 'e편한세상정문', 'map.kakao.com'],
      [33.503672, 126.496587, '제주국제공항입구[동]', 'map.kakao.com']
    ]) {
      const ctx = await browser.newContext({ ...mobile, permissions: ['geolocation'], geolocation: { latitude, longitude } });
      try {
        const page = await ctx.newPage();
        const lookups = [];
        page.on('request', request => lookups.push(request.url()));
        await page.goto(url);
        await page.locator('#nearby-details > summary').click();
        await page.waitForFunction(s => document.getElementById('bus-station-name').textContent.includes(s), name);
        assert.equal(await page.locator('#bus-heading').innerText(), '내 주변 정류장');
        assert.ok(await page.locator('#bus-locate').isHidden());
        assert.ok(await page.locator('#bus-query').isHidden());
        assert.match(await page.locator('#bus-stops button').first().innerText(), /직선거리 0m/);
        assert.equal(new URL(await page.locator('#bus-official').getAttribute('href')).hostname, provider);
        assert.equal(lookups.some(req => req.includes(String(latitude)) || req.includes(String(longitude))), false);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        if (name === '제주국제공항입구[동]') {
          await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
          await ctx.setOffline(true);
          await page.reload();
          await page.locator('#nearby-details > summary').click();
          await page.waitForFunction(s => document.getElementById('bus-station-name').textContent.includes(s), name);
        }
        console.log('PASS automatic nearest stop', name);
      } finally { await ctx.close(); }
    }
    const denied = await browser.newContext(mobile);
    try {
      await denied.grantPermissions([], { origin: new URL(url).origin });
      const page = await denied.newPage();
      await page.goto(url);
      await page.locator('#nearby-details > summary').click();
      await page.locator('#bus-query').waitFor();
      assert.match(await page.locator('#bus-status').innerText(), /위치를 허용/);
      await page.locator('#bus-query').fill('SEB107900045');
      await page.getByRole('button', { name: /e편한세상정문/ }).click();
      assert.match(await page.locator('#bus-station-name').innerText(), /08528/);
      await denied.setGeolocation({ latitude: 0, longitude: 0 });
      await denied.grantPermissions(['geolocation'], { origin: new URL(url).origin });
      await page.locator('#bus-locate').click();
      await page.waitForFunction(() => document.getElementById('bus-status').textContent.includes('3km'));
      assert.ok(await page.locator('#bus-board').isHidden());
      console.log('PASS denied permission, national manual search, retry and empty radius');
    } finally { await denied.close(); }
  } finally { await browser.close(); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
