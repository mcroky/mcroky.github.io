'use strict';

// Refresh the release key and integrity table together when publishing the shell.
const release = '1.4.8-8c8f228ec84b3e4b69d5';
const integrity = {
  'index.html': 'sha256-/jrOj14+Wo04ip7dbu+zD9urGSbz6/y1krMxj9Vn3qU= sha256-0KxbICnWTw+15PP8XZH+PYccNl6EvClIc37wCjDvAC8=',
  'app.css': 'sha256-XT5N6ZA0Lup2TvYWk5vcm/WzU4YqaIc9u1t2adG8GXY= sha256-iIlIxpP/hLRqPYdof8I1RWiZxV5z8M0UU3fIa1ypOZk=',
  'studio.css': 'sha256-HnrBTsqr4PFz8UC2eRdNVUGVKHqWrui6bkYCUfwPiAw= sha256-oEwz56SiGgy82iE/GQn5+P/iGQRyLsbqP7AMWZaKueM=',
  'planner.js': 'sha256-EGPZadTtp0CWz/MDkWVdZtLx3sW5M/N0ZLOYkYOic+k= sha256-Ol3M2ylwgGau7CBWbYMvjF9IQaXMZ8Isw1q1EVjAV2A=',
  'session-plan.js': 'sha256-CSzAjNxzz6Aa5d+pnkoTv1gQ6fIlkpT4iz/9XnZlbrA= sha256-biIHVpnKd1VhhNHCRD5yxUogJm3yGvLMhbgpsXxME28=',
  'calendar.js': 'sha256-/BDTcmEPzbxusr01YjPnsuXjhhzAU819F4pQqWd6dcw= sha256-G1Y7VZnAfWUCRUT3I6Rc1PHWKTxQFXqbIHDIovjuBWQ=',
  'locale.js': 'sha256-+Zp6PF5nXIlpouV+mxXVgyrSsfrLq+KE6eDfwpg4pXw= sha256-eKUdaVrCpTU7X1Q17h34S00XudtD7jIjHfEFSzcMXEY=',
  'studio.js': 'sha256-MLqxk7cPlVrNiQwx5ptahTjJMKN3Iq8A7d+vA3fRZWY= sha256-ZrKFqKDr9vui15QtuHxqRIy5Bs7mp17Z6ijmYbsBkAs=',
  'ticket-image.js': 'sha256-AQEBfUUFDxPS6uFumo0wSUraTq/MTg4tplStID2bdhI= sha256-CZxo+Z10pBza0m7L/5GZmHitGSu/7QzjM74hcON8uB4=',
  'android-ui.js': 'sha256-YmKIXtwdq/RPFv7cC3+JjvOeB0zjsdrMZjDJd/nsxaQ= sha256-djaulnBQGBVhbRA00bVHPBJ39OUam1+AaqjKpxNm5xc=',
  'app.js': 'sha256-SEO+D6STTgG/b6b7EkkGDXmPRsS0ULBF5KdQmDVaJpU= sha256-cchkhGAc+1CD3m8aM4NG+IGNM7JCCNldhVTC4QR3DQg=',
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
