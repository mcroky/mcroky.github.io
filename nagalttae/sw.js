'use strict';

// Refresh the release key and integrity table together when publishing the shell.
const release = '1.6.0-0f6cbef384ebc268656f';
const integrity = {
  'transit.js': 'sha256-UItpTzoy7OIEmKD0Xj6TXBEWwk1Mmdmaej1l071Jd6I= sha256-h+lEhKhyOvUsqA5+mCXgZAb8juyEDBuucWGt9PGBB94=',
  'anseong-stops.json': 'sha256-7BrJk+WhlVqEyI3Sqbzw5ZTt5hGuh6SXr5W9E/AD4Ao= sha256-Ru8rcAs6IML9W5LkN3x+cZGGIwWCqrOV2Ov3B+NTX5I=',
  'index.html': 'sha256-cbcUTCb5FlvmSJz/wcOkRos4jBOGGpp+PEEaaritG2w= sha256-wiDu6SG/9u/Vb8c+WBYr+FduQMaMTSvqtv0DnDWnyRQ=',
  'app.css': 'sha256-86dUHVHP2RSKfGPsZOhzr6llpLC5WigXFlbTpBCnYMk= sha256-PslCKXD5l7mkIwCg8IHshTT+XCINhiruj0M7DvioU3k=',
  'studio.css': 'sha256-HnrBTsqr4PFz8UC2eRdNVUGVKHqWrui6bkYCUfwPiAw= sha256-oEwz56SiGgy82iE/GQn5+P/iGQRyLsbqP7AMWZaKueM=',
  'planner.js': 'sha256-EGPZadTtp0CWz/MDkWVdZtLx3sW5M/N0ZLOYkYOic+k= sha256-Ol3M2ylwgGau7CBWbYMvjF9IQaXMZ8Isw1q1EVjAV2A=',
  'session-plan.js': 'sha256-CSzAjNxzz6Aa5d+pnkoTv1gQ6fIlkpT4iz/9XnZlbrA= sha256-biIHVpnKd1VhhNHCRD5yxUogJm3yGvLMhbgpsXxME28=',
  'calendar.js': 'sha256-/BDTcmEPzbxusr01YjPnsuXjhhzAU819F4pQqWd6dcw= sha256-G1Y7VZnAfWUCRUT3I6Rc1PHWKTxQFXqbIHDIovjuBWQ=',
  'locale.js': 'sha256-2kxYE+XLXrrDXw6wwDsr9OIS+p1WslCeqQHoH3INVEU= sha256-SE8UHSr3I/dPGImvNr9y9hAel1l6iTLwQJPnrx8wboQ=',
  'studio.js': 'sha256-EOa22IIUPqFqNkwflbmF7H7VB0ZL0xxBSpGQ/ihgVd0= sha256-jBjO8TENTgZKMT2E1ABpFh2O7TSKexDVEHtCCgKlb/E=',
  'ticket-image.js': 'sha256-AQEBfUUFDxPS6uFumo0wSUraTq/MTg4tplStID2bdhI= sha256-CZxo+Z10pBza0m7L/5GZmHitGSu/7QzjM74hcON8uB4=',
  'android-ui.js': 'sha256-YmKIXtwdq/RPFv7cC3+JjvOeB0zjsdrMZjDJd/nsxaQ= sha256-djaulnBQGBVhbRA00bVHPBJ39OUam1+AaqjKpxNm5xc=',
  'push.js': 'sha256-3lSjtHx+RcyawQJ990hGvA5/SoFbA/Jl3+/RH6XK4Es= sha256-oPxt8TKIcn1969fHXVQStdmtDinAxT5ZmSz6QpXqaxc=',
  'app.js': 'sha256-OQ4J6Z5Oc8I0rn3yGvAu/qKOTtdQfJfKX7Hg1FeUA2g= sha256-vuCVY2n8OicawbuWoE7TBITdAzOsiwHbKyJoKnN09JU=',
  'icon.svg': 'sha256-/k7BE8OXeXKDtJrWQkmsriwD8ltdH4NPAppriIxU9yM= sha256-3cq8vvg4OzZB+PCctkZAKyA2nmCqqRarEh2NIG/O9c8=',
  'morning.webp': 'sha256-DbCuu0GEGWdIj6hxYfEkSxSOh4APYPQ44LLGmClOIaA=',
  'manifest.webmanifest': 'sha256-74FM068Knjz3Pjt5YVDuD+WBUJMu/SD02tCCVnltVJQ= sha256-tkvYfr0+2AZrWhc+UozWaXZyCyxMw7/GJvM4JkQWYto=',
  'icons/app-192.png': 'sha256-43pqZWXkB18T+5uB770L/loD0xJNygPNHUzovEIkYGI=',
  'icons/app-512.png': 'sha256-CmwfCWmu4+y8WusC1nKUyZ808EjEn6krT/7MmU0xUOA=',
  'icons/app-maskable.png': 'sha256-Cgz4sHLvOWHYVnXa7csb0Kzxef9Xm1SNwMAzBR9mSEo=',
  'icons/apple-touch-icon.png': 'sha256-HtQP3wErSexCWSMn9D9xxDSYUqww/sbEupN+E9dkr4E='
};

const scope = new URL(self.registration.scope);
const cachePrefix = 'nagalttae-shell:' + encodeURIComponent(scope.href) + ':';
const cacheName = cachePrefix + release;
const indexURL = new URL('index.html', scope).href;
const resources = new Map(Object.entries(integrity).map(([path, hash]) => [new URL(path, scope).href, hash]));

function pinnedRequest(url, hash) {
  if (!hash) throw new Error('Missing release integrity for ' + url);
  return new Request(url, { cache: 'reload', credentials: 'same-origin', mode: 'same-origin',
    redirect: 'error', integrity: hash });
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const requests = Array.from(resources, ([url, hash]) => pinnedRequest(url, hash));
    // addAll commits the list atomically, and SRI rejects a partially deployed release.
    const cache = await caches.open(cacheName);
    await cache.addAll(requests);
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const owned = (await caches.keys()).filter(key => key.startsWith(cachePrefix) && key !== cacheName);
    await Promise.all(owned.map(key => caches.delete(key)));
  })());
});

async function navigation(url) {
  try {
    const response = await fetch(pinnedRequest(url, integrity['index.html']));
    if (response.ok) return response;
  } catch { /* An offline server or a newer HTML release uses the installed shell. */ }
  return (await caches.match(indexURL, { cacheName })) || Response.error();
}

async function asset(url) {
  const cached = await caches.match(url, { cacheName });
  return cached || fetch(pinnedRequest(url, resources.get(url)));
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const file = url.origin + url.pathname;
  if (request.mode === 'navigate') {
    if (file === scope.href || file === indexURL) event.respondWith(navigation(url.href));
    return;
  }
  if (resources.has(file)) event.respondWith(asset(file));
});

self.addEventListener('message', event => {
  if (event.data === 'nagal-push-version') event.ports[0]?.postMessage('nagal-push-v1');
});

const reminderText = {
  ko: { app: '나갈때', ready: '준비를 시작할 시간이에요.', leave: '지금 출발할 시간이에요.', both: '준비하고 바로 출발할 시간이에요.' },
  en: { app: 'Nagalttae', ready: 'Time to get ready.', leave: 'Time to leave.', both: 'Time to get ready and leave.' },
  ja: { app: 'Nagalttae', ready: '支度を始める時間です。', leave: '出発の時間です。', both: '支度をして出発する時間です。' },
  zh: { app: 'Nagalttae', ready: '该开始准备了。', leave: '该出发了。', both: '该准备出发了。' }
};
self.addEventListener('push', event => {
  let item;
  try { item = event.data?.json(); } catch { return; }
  if (!item || !['ready', 'leave', 'both'].includes(item.kind) || !Number.isSafeInteger(item.at) ||
      Date.now() >= item.at + 300_000) return;
  const lang = Object.hasOwn(reminderText, item.locale) ? item.locale : 'ko';
  const words = reminderText[lang];
  const time = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(item.at);
  event.waitUntil(self.registration.showNotification(words.app, {
    body: time + ' · ' + words[item.kind], tag: 'nagal-' + item.kind + '-' + item.at,
    timestamp: item.at, icon: new URL('icons/app-192.png', scope).href
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window' });
    const existing = windows.find(client => {
      const url = new URL(client.url);
      return url.origin === scope.origin && [scope.pathname, new URL(indexURL).pathname].includes(url.pathname);
    });
    if (existing) return existing.focus();
    return self.clients.openWindow(scope.href);
  })());
});
