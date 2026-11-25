import index from '../anseong-stops.json' with { type: 'json' };

const stations = new Set(index.stops.map(stop => stop[0]));
const endpoint = 'https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2';
const number = v => (v !== null && v !== undefined && /^\d+$/.test(String(v)) ? Number(v) : null);

export function readArrivals(data, station, now) {
  const header = data?.response?.msgHeader;
  if (!['0', '4'].includes(String(header?.resultCode))) throw new Error('GBIS unavailable');
  const stamp = String(header.queryTime || '').trim().replace(' ', 'T');
  const at = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?$/.test(stamp) ? Date.parse(stamp + '+09:00') : NaN;
  if (!Number.isFinite(at) || now - at > 120000 || at - now > 30000) throw new Error('GBIS stale');
  const items = data.response.msgBody?.busArrivalList;
  const rows = Array.isArray(items) ? items : items ? [items] : [];
  const arrivals = [];
  for (const row of rows) {
    if (String(row.stationId) !== station || row.flag === 'STOP') continue;
    for (const i of [1, 2]) {
      const sec = number(row['predictTimeSec' + i]), min = number(row['predictTime' + i]);
      if (sec === null && min === null) continue;
      const remaining = sec ?? min * 60;
      if (remaining === 0 && !Number(row['vehId' + i]) && !Number(row['locationNo' + i])) continue;
      const name = row.routeName ?? index.routes[row.routeId];
      if (!name || remaining > 86400) continue;
      const trip = Number(row['vehId' + i]) > 0 ? String(row.routeId) + '/' + String(row['vehId' + i]) : null;
      arrivals.push({ name: String(name), direction: String(row.routeDestName || ''), trip, at: at + remaining * 1000 });
    }
  }
  return { station, updated: at, arrivals: arrivals.sort((a, b) => a.at - b.at).slice(0, 40) };
}

export async function busResponse(request, env, headers) {
  const station = new URL(request.url).pathname.split('/').pop();
  const reply = (data, status) => Response.json(data, { status, headers });
  if (!stations.has(station)) return reply({}, 404);
  if (!env.GBIS_SERVICE_KEY) return reply({ code: 'notConfigured' }, 503);
  const cacheKey = new Request(new URL('/anseong/cache/' + station, request.url).href);
  const cached = await caches.default.match(cacheKey);
  if (cached) return reply(await cached.json(), 200);
  const allowed = await env.BUS_LOOKUPS.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
  if (!allowed.success) return reply({}, 429);
  try {
    const url = new URL(endpoint);
    const secret = env.GBIS_SERVICE_KEY.trim();
    url.search = new URLSearchParams({ serviceKey: secret.includes('%') ? decodeURIComponent(secret) : secret, stationId: station, format: 'json' });
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(7000) });
    if (!res.ok) throw new Error('upstream');
    const data = readArrivals(await res.json(), station, Date.now());
    await caches.default.put(cacheKey, Response.json(data, { headers: { 'Cache-Control': 'public, max-age=30' } }));
    return reply(data, 200);
  } catch { return reply({ code: 'unavailable' }, 503); }
}
