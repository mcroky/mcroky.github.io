'use strict';

// Refresh the release key and integrity table together when publishing the shell.
const release = '1.6.5-e5d6a4fdd5930b5163ee';
const integrity = {
  'timetable.js': 'sha256-8eJce5DFPL8IU0eZgeQSASsyaO2frVwhe6clRm34n/w= sha256-zvUdUHG+wo6Z9IQClavqu7NZgjsMvv/gF8KdrBM1c7o=',
  'timetable-data.js': 'sha256-1Q+yRMkl+euTplWIY6vlPPn7UgaP9pGrhe8JylLUHtc= sha256-YM+cvrHdzpaL69K0PCFGV5Jb6irdDVXHE74L7vQY0ik=',
  'transit.js': 'sha256-+AL6lhJYwGgn1tAbF41PJLu4X+Eku8rAGoi0Cz4Ihh0= sha256-oS5DzVTvZgh4UsdtwPGrb0/lHh0ClLX0HtruWhQatrY=',
  'stops/33.json': 'sha256-4YVFTRBkV5hNOQKkqoyoxSFrxeivBKTZgUfY9LM2YCo= sha256-VaWO1X2o9qODKaBcDQMzTJR9CRDk6K7TBU4tk0Kmjtw=',
  'stops/34.json': 'sha256-vP5dX7ZLRzqiAg3pMu15J6q8VNsliE3JQjydNz9QBJg= sha256-w1BU9ccKs2mUhmVA8eOl5OjGOVDfH/vG1Aw8gXOwaYA=',
  'stops/35.json': 'sha256-9Bpha4yrcpvrFPmGT8hnTNQgL+yS9d+pJeEK5TbF6QE= sha256-jeBdcndfXJAEwyqjlmVodw1rrbCUJzrVV++91Mw1rUY=',
  'stops/36.json': 'sha256-6GuXDUn548ko1xNg6r0yBgdvKVF/7swVVdflZAMZ5Uo= sha256-AC0eOO7GBYzFU0xCxOE0JvtwkXUBiNksbmBfCA5u+9c=',
  'stops/37.json': 'sha256-/PmSLtUL13RCtbkZsPXB4lBnXI7KafvfrZY+GXe+eXI= sha256-ttiSAjnKLva690TUui5T/cbDkuo+ycXxo4bXT+TbOjE=',
  'stops/38.json': 'sha256-PFsr3OVqBuEYUH+X9Z/7JRGxXu7Dca7nemAjT2dARp4= sha256-zYN1oxOq9bSy0EFZOBt3TFSXLAAya+ABrfGFPrf7i+A=',
  'index.html': 'sha256-SgqsN6ji0X0OHPJJwPFG4K1FZOFvTSqUikT4BQRoxhQ= sha256-W3OZaNYCYenQ1Xb1WrFjR/4B+YZA5pxIo5bnrjej+aw=',
  'app.css': 'sha256-f6ixNuZkymKNfFlvrwx/MPY21/itXbHznrooe7GET/w= sha256-iMhxQD3cjX4xI9hb3qeEzwFAZDAE40YVVoCyOF+y5ZM=',
  'studio.css': 'sha256-HnrBTsqr4PFz8UC2eRdNVUGVKHqWrui6bkYCUfwPiAw= sha256-oEwz56SiGgy82iE/GQn5+P/iGQRyLsbqP7AMWZaKueM=',
  'planner.js': 'sha256-EGPZadTtp0CWz/MDkWVdZtLx3sW5M/N0ZLOYkYOic+k= sha256-Ol3M2ylwgGau7CBWbYMvjF9IQaXMZ8Isw1q1EVjAV2A=',
  'session-plan.js': 'sha256-CSzAjNxzz6Aa5d+pnkoTv1gQ6fIlkpT4iz/9XnZlbrA= sha256-biIHVpnKd1VhhNHCRD5yxUogJm3yGvLMhbgpsXxME28=',
  'calendar.js': 'sha256-/BDTcmEPzbxusr01YjPnsuXjhhzAU819F4pQqWd6dcw= sha256-G1Y7VZnAfWUCRUT3I6Rc1PHWKTxQFXqbIHDIovjuBWQ=',
  'locale.js': 'sha256-4m/vzjwLM92XadqEaUQBfcgQe/G9jUQWfbPrmnrdDkM= sha256-Gffj3hRetY3YZP49bhvk75aaaNVCkvhBeHANcHjEcMk=',
  'studio.js': 'sha256-Vx5/4IUA6lNiBe9Llugc9W5FTmR4e1VQ8HTYggzlKak= sha256-iHjF1/qB0FlPNZiklbGyNKtL/p/9vbexc27YFzMN/5Y=',
  'ticket-image.js': 'sha256-AQEBfUUFDxPS6uFumo0wSUraTq/MTg4tplStID2bdhI= sha256-CZxo+Z10pBza0m7L/5GZmHitGSu/7QzjM74hcON8uB4=',
  'android-ui.js': 'sha256-YmKIXtwdq/RPFv7cC3+JjvOeB0zjsdrMZjDJd/nsxaQ= sha256-djaulnBQGBVhbRA00bVHPBJ39OUam1+AaqjKpxNm5xc=',
  'push.js': 'sha256-sEi5odIwCwYHDJ76T/p5InS/pMCMVXIdjbA37tQhSO8= sha256-v6lhn/SKXW7hItipnNDktyr+FzlwD8fCmIAAb9Or1jo=',
  'app.js': 'sha256-aDxnEw8uocNseYlXBVfrfpPIUP6k1iKqMpymcizKkMY= sha256-tTxDOZjb42nus0qIznkInM6udaNulheIwwqTcnE7O/I=',
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
const pagesCacheName = 'nagalttae-pages:' + encodeURIComponent(scope.href);
const indexURL = new URL('index.html', scope).href;
const stateURL = new URL('.shell/active', scope).href;
const pagesURL = new URL('.shell/pages/', scope).href;
const resources = new Map(Object.entries(integrity).map(([path, hash]) => [new URL(path, scope).href, hash]));
const canPinPages = 'resultingClientId' in FetchEvent.prototype;

function pageURL(id) {
  return pagesURL + encodeURIComponent(id);
}

async function pageCache(pages, id) {
  return id && (await pages.match(pageURL(id)))?.text();
}

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
    if (canPinPages) await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const owned = (await caches.keys()).filter(key => key.startsWith(cachePrefix) && key !== cacheName);
    if (!canPinPages) {
      await Promise.all(owned.map(key => caches.delete(key)));
      return;
    }
    const pages = await caches.open(pagesCacheName);
    const state = await (await pages.match(stateURL))?.json();
    let previous = state?.current;
    if (!previous) {
      // Before page pins existed, activation kept only the active release's complete cache.
      for (const key of owned) {
        if (await caches.match(indexURL, { cacheName: key })) {
          previous = key;
          break;
        }
      }
    }
    const legacy = state ? state.legacy : previous || null;
    const keep = new Set([previous, legacy]);
    await pages.put(stateURL, new Response(JSON.stringify({ current: cacheName, legacy })));
    const pins = (await pages.keys()).filter(request => request.url.startsWith(pagesURL));
    // A reserved client may take time to start. Uncertain results keep its release.
    let timer;
    const pending = new Promise(resolve => { timer = setTimeout(() => resolve(true), 250); });
    try {
      await Promise.all(pins.map(async request => {
        const id = decodeURIComponent(request.url.slice(pagesURL.length));
        const present = await Promise.race([self.clients.get(id).then(Boolean, () => true), pending]);
        if (present) keep.add(await (await pages.match(request))?.text());
        else await pages.delete(request);
      }));
    } finally {
      clearTimeout(timer);
    }
    await Promise.all(owned.filter(key => !keep.has(key)).map(key => caches.delete(key)));
  })());
});

async function navigation(url, clientId) {
  if (clientId) {
    const pages = await caches.open(pagesCacheName);
    await pages.put(pageURL(clientId), new Response(cacheName));
  }
  try {
    const response = await fetch(pinnedRequest(url, integrity['index.html']));
    if (response.ok) return response;
  } catch { /* An offline server or a newer HTML release uses the installed shell. */ }
  return (await caches.match(indexURL, { cacheName })) || Response.error();
}

async function asset(request, url, clientId) {
  let selected = cacheName;
  if (clientId) {
    const pages = await caches.open(pagesCacheName);
    const pinned = await pageCache(pages, clientId);
    const legacy = pinned ? null : (await (await pages.match(stateURL))?.json())?.legacy;
    selected = pinned || legacy || cacheName;
  }
  const cached = await caches.match(url, { cacheName: selected });
  if (cached) return cached;
  const hash = resources.get(url);
  if (!hash) return fetch(request);
  return selected === cacheName ? fetch(pinnedRequest(url, hash)) : Response.error();
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const file = url.origin + url.pathname;
  if (request.mode === 'navigate') {
    if (file === scope.href || file === indexURL) event.respondWith(navigation(url.href, canPinPages && event.resultingClientId));
    return;
  }
  const clientId = canPinPages && event.clientId;
  if (resources.has(file) || clientId) event.respondWith(asset(request, file, clientId));
});

self.addEventListener('message', event => {
  if (event.data === 'nagal-push-version') event.ports[0]?.postMessage('nagal-push-v1');
  if (event.data === 'nagal-shell-version') {
    event.source?.postMessage({ type: 'nagal-shell-version', version: release.split('-')[0] });
  }
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
