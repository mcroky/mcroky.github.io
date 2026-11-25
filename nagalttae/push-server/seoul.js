// This HTTPS endpoint serves the public TOPIS map's bus-stop popup.
const endpoint = 'https://topis.seoul.go.kr/map/getBusStn.do';

export function seoulPredictions(payload, station, ars, updated) {
  if (!Array.isArray(payload?.rows)) throw new Error('unavailable');
  const verified = payload.rows.filter(row => String(row?.arsId) === ars && String(row.stId) === station.slice(3));
  if (payload.rows.length && !verified.length) throw new Error('unavailable');
  const arrivals = [];
  for (const row of verified) {
    const name = String(row.rtNm ?? '').trim();
    if (!name) continue;
    for (const index of [1, 2]) {
      const message = String(row['arrmsg' + index] ?? '').trim();
      if (!message || /대기|종료|미운행|정보 없음|운행 없음|막차 통과/.test(message)) continue;
      const time = String(row['traTime' + index] ?? '');
      const seconds = /^(?:곧\s*)?도착(?:\s|$|\[)/.test(message) ? 0 : /^[1-9]\d*$/.test(time) ? Number(time) : NaN;
      if (!Number.isFinite(seconds) || seconds > 86400) continue;
      const vehicle = String(row['vehId' + index] ?? '');
      const route = String(row.busRouteId ?? name);
      arrivals.push({
        name, direction: String(row.adirection || ''),
        trip: /^[1-9]\d*$/.test(vehicle) ? route + '/' + vehicle : null,
        at: updated + seconds * 1000
      });
    }
  }
  return { station, source: 'TOPIS', updated, arrivals: arrivals.sort((a, b) => a.at - b.at).slice(0, 40) };
}

export async function seoulResponse(request, env, headers, station, ars) {
  const reply = (body, status) => Response.json(body, { status, headers });
  const cacheKey = new Request(new URL('/seoul/cache/' + station + '/' + ars, request.url));
  const cached = await caches.default.match(cacheKey);
  if (cached) return reply(await cached.json(), 200);
  const limit = await env.BUS_LOOKUPS.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
  if (!limit.success) return reply({ code: 'rateLimited' }, 429);
  try {
    const res = await fetch(endpoint, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(6000),
      body: new URLSearchParams({ url: '/getStationByUidDetourAt', arsId: ars })
    });
    if (!res.ok) throw new Error('unavailable');
    const data = seoulPredictions(await res.json(), station, ars, Date.now());
    await caches.default.put(cacheKey, Response.json(data, { headers: { 'Cache-Control': 'public, max-age=30' } }));
    return reply(data, 200);
  } catch {
    return reply({ code: 'unavailable' }, 503);
  }
}
