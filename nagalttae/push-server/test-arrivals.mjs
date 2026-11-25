import assert from 'node:assert/strict';
import { readArrivals, busResponse } from './anseong.js';

const station = '231000018';
const time = Date.parse('2026-11-25T10:30:00+09:00');
const header = { queryTime:'2026-11-25 10:30:00.000', resultCode:0 };
const item = { stationId:station, routeId:231000118, routeName:380, routeDestName:'일죽터미널', flag:'RUN',
  vehId1:231000068, predictTimeSec1:180, vehId2:231000690, predictTime2:10 };
const sample = (msgHeader, busArrivalList) => ({response:{ msgHeader, msgBody:{ busArrivalList } }});
const data = readArrivals(sample(header, [item, {...item, flag:'STOP'}, {...item, stationId:999}]), station, time);
assert.deepEqual(data.arrivals.map(x => x.at), [time+180000,time+600000]);
assert.equal(data.arrivals[0].direction, '일죽터미널');
assert.equal(data.arrivals[0].trip, '231000118/231000068');
assert.deepEqual(readArrivals(sample(header, {...item, predictTimeSec1:'', predictTime2:null}), station, time).arrivals, []);
assert.deepEqual(readArrivals(sample({...header,resultCode:4}, null), station, time).arrivals, []);
assert.throws(() => readArrivals(sample(header, item), station, time+121000));
assert.throws(() => readArrivals(sample({...header, resultCode:1}, item), station, time));
const get = sid => new Request('https://example.test/anseong/arrivals/' + sid);
assert.equal((await busResponse(get(station), {}, {})).status,503);
assert.equal((await busResponse(get('999999999'), {}, {})).status,404);
console.log('PASS GBIS ETA fields, direction, two vehicles, missing predictions, upstream errors, stale data and stop validation.');
