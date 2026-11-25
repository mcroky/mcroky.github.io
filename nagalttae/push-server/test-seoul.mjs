import test from 'node:test';
import assert from 'node:assert/strict';
import { seoulPredictions } from './seoul.js';

const station = 'SEB107900045', ars = '08528';
const row = {
  arsId: ars, stId: '107900045', rtNm: '성북09', busRouteId: '107900001',
  adirection: '미아사거리역', arrmsg1: '곧 도착', traTime1: '27', vehId1: '107063711',
  arrmsg2: '출발대기', traTime2: '0', vehId2: '0'
};

test('TOPIS normalizes approaching buses and ignores vehicles waiting to depart', () => {
  const payload = { rows: [row, { ...row, arrmsg1: '운행종료', traTime1: '99' },
    { ...row, rtNm: '120', arrmsg1: '2분10초후[1번째 전]', traTime1: '130', vehId1: '0' }] };
  assert.deepEqual(seoulPredictions(payload, station, ars, 1000), {
    station, source: 'TOPIS', updated: 1000, arrivals: [
      { name: '성북09', direction: '미아사거리역', trip: '107900001/107063711', at: 1000 },
      { name: '120', direction: '미아사거리역', trip: null, at: 131000 }
    ]
  });
});

test('TOPIS requires matching ARS and station IDs, keeps leading zero and distinguishes empty from error', () => {
  assert.throws(() => seoulPredictions({ rows: [row] }, 'SEB107900044', ars, 1000));
  assert.throws(() => seoulPredictions({ rows: [row] }, station, '8528', 1000));
  assert.throws(() => seoulPredictions({}, station, ars, 1000));
  assert.deepEqual(seoulPredictions({ rows: [] }, station, ars, 1000).arrivals, []);
});
