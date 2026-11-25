import assert from 'node:assert/strict';
import test from 'node:test';
import { railPredictions } from './rail-arrivals.js';

const now = Date.parse('2026-11-25T14:00:00+09:00');
const station = 'I4101:0133';
const row = {
  statnNm: '서울', subwayId: '1001', recptnDt: '2026-11-25 13:59:00', barvlDt: '600', arvlCd: '99',
  trainLineNm: '광운대행 - 시청방면', btrainNo: '0640', updnLine: '상행'
};
const source = rows => ({ errorMessage: { code: 'INFO-000' }, realtimeArrivalList: rows });

test('resolves remaining seconds from the provider observation time and selects only the current line and station', () => {
  const cases = [row, { ...row }, { ...row, subwayId: '1004' }, { ...row, statnNm: '시청' },
    { ...row, arvlCd: '2', btrainNo: '0641' }, { ...row, recptnDt: '2026-11-25 13:57:59', btrainNo: '0650' },
    { ...row, barvlDt: '20', btrainNo: '0651' }, { ...row, barvlDt: '0', btrainNo: '0670' }];
  assert.deepEqual(railPredictions(source(cases), station, '서울', '1001', now), {
    station, updated: now - 60000, arrivals: [
      { trip: '1001/0640/상행', direction: row.trainLineNm, at: now + 9 * 60000 }
    ]
  });
});

test('shows an immediate arrival only with a recent observed arrival state', () => {
  const cases = [
    { ...row, recptnDt: '2026-11-25 13:59:52', barvlDt: '0', arvlCd: '1' },
    { ...row, recptnDt: '2026-11-25 13:59:10', barvlDt: '0', arvlCd: '0', btrainNo: '0642' }
  ];
  assert.deepEqual(railPredictions(source(cases), station, '서울', '1001', now).arrivals.map(entry => entry.at), [now - 8000]);
  assert.deepEqual(railPredictions({ errorMessage: { code: 'INFO-200' } }, station, '서울', '1001', now).arrivals, []);
  assert.throws(() => railPredictions({ errorMessage: { code: 'INFO-100' } }, station, '서울', '1001', now), /authRejected/);
});
