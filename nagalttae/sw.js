'use strict';

// Refresh the release key and integrity table together when publishing the shell.
const release = '1.4.4-1de727fc7fa1988cc57c';
const integrity = {
  'index.html': 'sha256-WMuVVJTMHuiokH7UKRMA1VhECrOwYBQ35IbUspplK4Y= sha256-ccVYRH7805bVF5v7bUIc71gjfH5nxnuuCvMwQUns5Do=',
  'app.css': 'sha256-ohKjW0AG9WtvNAkt/QKByVeO4oB6P0U5HlovWlwFdmY= sha256-rAHvSk73yiYrxXjpUXO8VZgh04SDGhjfaS5t4AGUMHg=',
  'studio.css': 'sha256-HnrBTsqr4PFz8UC2eRdNVUGVKHqWrui6bkYCUfwPiAw= sha256-oEwz56SiGgy82iE/GQn5+P/iGQRyLsbqP7AMWZaKueM=',
  'planner.js': 'sha256-EGPZadTtp0CWz/MDkWVdZtLx3sW5M/N0ZLOYkYOic+k= sha256-Ol3M2ylwgGau7CBWbYMvjF9IQaXMZ8Isw1q1EVjAV2A=',
  'session-plan.js': 'sha256-CSzAjNxzz6Aa5d+pnkoTv1gQ6fIlkpT4iz/9XnZlbrA= sha256-biIHVpnKd1VhhNHCRD5yxUogJm3yGvLMhbgpsXxME28=',
  'calendar.js': 'sha256-/BDTcmEPzbxusr01YjPnsuXjhhzAU819F4pQqWd6dcw= sha256-G1Y7VZnAfWUCRUT3I6Rc1PHWKTxQFXqbIHDIovjuBWQ=',
  'locale.js': 'sha256-G+FnIZ3EhDLRuCTwWFivEau9maX1KZUD5qvcnzcLSSI= sha256-SD6QY2k0/NR0Lcygm4RK9Veqqp+ZaWKnl0+ZlyB8xVQ=',
  'studio.js': 'sha256-YzS6/pxdRFXkgfQa8llkwvUE5vChsKZnc0lXuDYVurM= sha256-syEzKENYgJgfPou8aYONyBRv6aWnY9TFPi5uVAtryz4=',
  'ticket-image.js': 'sha256-AQEBfUUFDxPS6uFumo0wSUraTq/MTg4tplStID2bdhI= sha256-CZxo+Z10pBza0m7L/5GZmHitGSu/7QzjM74hcON8uB4=',
  'android-ui.js': 'sha256-YmKIXtwdq/RPFv7cC3+JjvOeB0zjsdrMZjDJd/nsxaQ= sha256-djaulnBQGBVhbRA00bVHPBJ39OUam1+AaqjKpxNm5xc=',
  'app.js': 'sha256-7qI+HaZydyXo0HG9ufn5fk0pf9UI53Jaqq5Eb42wh0E= sha256-koh6OrRC69UqidmWRfvoQtw0UAAyfIkNea3As1t56+M=',
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
