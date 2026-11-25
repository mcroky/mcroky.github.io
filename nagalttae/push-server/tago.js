const base = 'https://apis.data.go.kr/1613000/ArvlInfoInqireService/';
const authErrors = new Set(['20', '30', '31', '32']);

async function query(env, method, parameters) {
  const key = env.TAGO_SERVICE_KEY.trim();
  const url = new URL(method, base);
  url.search = new URLSearchParams({ serviceKey: key.includes('%') ? decodeURIComponent(key) : key, _type: 'json', ...parameters });
  const attempts = method === 'getSttnAcctoArvlPrearngeInfoList' ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(4000) });
    if (!response.ok) throw new Error([401, 403].includes(response.status) ? 'authRejected' : 'unavailable');
    const payload = await response.json();
    const code = String(payload?.response?.header?.resultCode);
    if (code === '99' && attempt + 1 < attempts) {
      await new Promise(resolve => setTimeout(resolve, 250));
      continue;
    }
    if (authErrors.has(code)) throw new Error('authRejected');
    if (code === '03' && /no.?data/i.test(payload.response.header.resultMsg)) return { totalCount: 0 };
    if (!['00', '0'].includes(code) || !payload.response.body) throw new Error('unavailable');
    return payload.response.body;
  }
}

function items(body) {
  const item = body.items?.item;
  if (Array.isArray(item)) return item;
  if (item && typeof item === 'object') return [item];
  if (String(body.totalCount) === '0') return [];
  throw new Error('unavailable');
}

export function tagoPredictions(body, node, station, updated) {
  const rows = items(body);
  const arrivals = [];
  for (const row of rows) {
    if (String(row?.nodeid) !== node || !/^\d+$/.test(String(row.arrtime))) continue;
    const name = String(row.routeno ?? '').trim(), seconds = Number(row.arrtime);
    if (!name || seconds > 86400) continue;
    // TAGO provides a route ID but no stable vehicle ID for a particular arrival.
    arrivals.push({ name, direction: '', trip: null, at: updated + seconds * 1000 });
  }
  if (rows.length && !arrivals.length) throw new Error('unavailable');
  return { station, source: 'TAGO', updated, arrivals: arrivals.sort((a, b) => a.at - b.at).slice(0, 40) };
}

async function supportedCity(request, env, city) {
  const cacheKey = new Request(new URL('/tago/cache/cities', request.url));
  const cached = await caches.default.match(cacheKey);
  if (cached) return (await cached.json()).includes(city);
  const body = await query(env, 'getCtyCodeList', {});
  const codes = items(body).map(row => String(row.citycode)).filter(code => /^\d{1,9}$/.test(code));
  if (!codes.length) throw new Error('unavailable');
  await caches.default.put(cacheKey, Response.json(codes, { headers: { 'Cache-Control': 'public, max-age=86400' } }));
  return codes.includes(city);
}

export async function tagoResponse(request, env, headers, city, node, station = node) {
  const reply = (body, status) => Response.json(body, { status, headers });
  if (!env.TAGO_SERVICE_KEY?.trim()) return reply({ code: 'notConfigured' }, 503);
  const cacheKey = new Request(new URL('/tago/cache/' + city + '/' + node + '/' + station, request.url));
  const cached = await caches.default.match(cacheKey);
  if (cached) return reply(await cached.json(), 200);
  const limit = await env.BUS_LOOKUPS.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
  if (!limit.success) return reply({ code: 'rateLimited' }, 429);
  try {
    let data;
    try {
      const body = await query(env, 'getSttnAcctoArvlPrearngeInfoList', {
        cityCode: city, nodeId: node, numOfRows: '100', pageNo: '1'
      });
      data = tagoPredictions(body, node, station, Date.now());
    } catch (error) {
      if (error.message === 'authRejected') throw error;
      if (await supportedCity(request, env, city).catch(() => null) !== false) throw error;
    }
    if (!data || (!data.arrivals.length && await supportedCity(request, env, city).catch(() => null) === false)) {
      data = { station, source: 'TAGO', updated: Date.now(), arrivals: [], unsupportedCity: true };
    }
    await caches.default.put(cacheKey, Response.json(data, { headers: { 'Cache-Control': 'public, max-age=30' } }));
    return reply(data, 200);
  } catch (error) {
    return reply({ code: error.message === 'authRejected' ? 'authRejected' : 'unavailable' }, 503);
  }
}
