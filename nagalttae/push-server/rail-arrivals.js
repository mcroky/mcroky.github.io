import '../timetable-data.js';

const lines = {
  I4101: '1001', I4102: '1001', I4401: '1001', I1101: '1001',
  S1102: '1002', S1121: '1002', S1122: '1002',
  I1103: '1003', I4106: '1003', I1104: '1004', I4103: '1004', I4104: '1004',
  S1105: '1005', S1106: '1006', S1107: '1007', S1108: '1008', S4108: '1008', S1109: '1009',
  I4108: '1063', I28A1: '1065', I41K2: '1067', I41K5: '1081',
  I28K1: '1075', I4105: '1075', I11D1: '1077', L11UI: '1092', I41WS: '1093'
};
const stations = new Map(globalThis.NagalTimetableData.map(stop => [stop[0], stop]));
const base = 'http://swopenapi.seoul.go.kr/api/subway/';
const maxAge = 120000;

function stationName(label) {
  return String(label ?? '').split('(')[0].trim().replace(/역$/, '');
}

function observationTime(value) {
  const time = String(value ?? '').replace(' ', 'T');
  return /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(time) ? Date.parse(time + '+09:00') : NaN;
}

export function railPredictions(payload, station, name, line, now) {
  const code = payload?.errorMessage?.code;
  if (code === 'INFO-100' || code === 'ERROR-301') throw new Error('authRejected');
  if (code === 'INFO-200') return { station, updated: now, arrivals: [] };
  if (code !== 'INFO-000' || !Array.isArray(payload.realtimeArrivalList)) throw new Error('unavailable');
  const arrivals = [];
  const seen = new Set();
  let updated = now;
  for (const row of payload.realtimeArrivalList) {
    if (String(row?.subwayId) !== line || stationName(row.statnNm) !== name || String(row.arvlCd) === '2') continue;
    const observed = observationTime(row.recptnDt);
    if (!Number.isFinite(observed) || now - observed > maxAge || observed - now > 30000) continue;
    const seconds = /^\d+$/.test(String(row.barvlDt)) ? Number(row.barvlDt) : NaN;
    const approaching = ['0', '1'].includes(String(row.arvlCd));
    const direction = String(row.trainLineNm || row.bstatnNm || '').trim();
    if (!direction || !Number.isFinite(seconds) || seconds > 3600 || (seconds === 0 && !approaching)) continue;
    const at = observed + seconds * 1000;
    if (at <= now && !(seconds === 0 && now - observed <= 30000)) continue;
    const train = String(row.btrainNo ?? '').trim();
    const trip = train && train !== '0' ? line + '/' + train + '/' + String(row.updnLine || '') : null;
    const key = trip || [direction, at].join('/');
    if (seen.has(key)) continue;
    seen.add(key);
    updated = Math.min(updated, observed);
    arrivals.push({ trip, direction, at });
  }
  return { station, updated, arrivals: arrivals.sort((a, b) => a.at - b.at).slice(0, 8) };
}

export async function railArrivalsResponse(request, env, headers, station) {
  const reply = (body, status) => Response.json(body, { status, headers });
  const stop = stations.get(station);
  if (!stop) return reply({ code: 'unknownStation' }, 404);
  const line = lines[station.split(':')[0]];
  if (!line) return reply({ code: 'unsupported' }, 422);
  const name = stationName(stop[1]);
  const key = env.SEOUL_SUBWAY_SERVICE_KEY?.trim() || (env.SEOUL_SUBWAY_SAMPLE === '1' && name === '서울' ? 'sample' : '');
  if (!key) return reply({ code: 'notConfigured' }, 503);

  const cacheKey = new Request(new URL('/rail/cache/' + encodeURIComponent(station), request.url));
  const cached = await caches.default.match(cacheKey);
  if (cached) return reply(await cached.json(), 200);
  const limit = await env.BUS_LOOKUPS.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
  if (!limit.success) return reply({ code: 'rateLimited' }, 429);
  try {
    const url = base + encodeURIComponent(key) + '/json/realtimeStationArrival/0/' + (key === 'sample' ? 5 : 40) + '/' + encodeURIComponent(name);
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(6500) });
    if (!response.ok) throw new Error([401, 403].includes(response.status) ? 'authRejected' : 'unavailable');
    const data = railPredictions(await response.json(), station, name, line, Date.now());
    await caches.default.put(cacheKey, Response.json(data, { headers: { 'Cache-Control': 'public, max-age=20' } }));
    return reply(data, 200);
  } catch (error) {
    return reply({ code: error.message === 'authRejected' ? 'authRejected' : 'unavailable' }, 503);
  }
}
