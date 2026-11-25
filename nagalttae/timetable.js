(function () {
  'use strict';

  const node = typeof module === 'object' && module.exports;
  const planner = node && require('./planner.js');
  const minute = 60000, day = 86400000, koreaOffset = 9 * 60 * minute;
  const buffer = 2;
  const holidays = new Set([
    '2026-12-25',
    ...('01-01 02-06 02-07 02-08 02-09 03-01 05-01 05-03 05-05 05-13 06-06 07-17 07-19 08-15 08-16 ' +
       '09-14 09-15 09-16 10-03 10-04 10-09 10-11 12-25 12-27').split(' ').map(date => '2027-' + date)
  ]);

  function serviceStart(date) {
    if (!/^\d{4}-\d\d-\d\d$/.test(date)) return NaN;
    const utc = Date.parse(date + 'T00:00:00Z');
    if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== date) return NaN;
    return utc - koreaOffset;
  }

  function serviceKind(date) {
    const start = serviceStart(date);
    if (!Number.isFinite(start) || date < '2026-11-06' || date > '2027-12-31') return null;
    const weekday = new Date(start + koreaOffset).getUTCDay();
    return weekday === 0 || weekday === 6 || holidays.has(date) ? 'holiday' : 'weekday';
  }

  function planTrip(date, seconds, walk, prep, now = Date.now()) {
    const start = serviceStart(date);
    if (!Number.isFinite(start) || !Number.isInteger(seconds) || seconds < 0 || seconds >= 172800) return null;
    const { time, dayOffset } = planner.clockParts(Math.floor(seconds / 60));
    const plan = planner.calculatePlan({ target: time, prep, travel: walk, buffer });
    if (!plan) return null;
    const at = start + dayOffset * day;
    const leave = at + plan.leave * minute;
    return { board: start + seconds * 1000, ready: at + plan.ready * minute, leave,
      eligible: leave > now && leave <= now + 30 * day };
  }

  function koreanDate(now) {
    return new Date(now + koreaOffset).toISOString().slice(0, 10);
  }

  if (node) {
    module.exports = { planTrip, serviceKind };
    return;
  }

  const copy = {
    ko: {
      timetableStation:'정류장·역', timetableDate:'탑승 날짜 (한국 시간)', timetableDirection:'진행 방향',
      timetableNearbyTitle:'내 주변 지하철역', timetableQuery:'역 이름 검색', timetableNearby:'내 주변 역 보기', timetableRefresh:'시간표 다시 불러오기',
      timetableLive:'실시간 도착', timetableSchedule:'시간표', timetableLiveRefresh:'실시간 새로고침',
      liveLoading:'열차 도착 정보를 불러오고 있어요.', liveUnsupported:'이 역의 실시간 도착 정보는 제공되지 않아요. 시간표에서 예정 시각을 볼 수 있어요.', livePending:'이 역의 실시간 도착 조회 연결을 준비 중이에요.',
      liveFailed:'실시간 도착 정보를 불러오지 못했어요.', liveEmpty:'지금 도착 시각을 확인할 수 있는 열차가 없어요.', liveStale:'도착 정보가 오래됐어요. 다시 확인해 주세요.',
      liveSoon:'곧 도착', liveMinutes:'{v}분 뒤', liveSource:'서울시 열린데이터광장 · {v} 기준',
      stationPrompt:'지하철역 선택', stationTip:'위치 권한을 허용하거나 역 이름을 검색해 주세요.', noNearby:'반경 3km 안에 등록된 지하철역이 없어요. 역 이름으로 검색할 수 있어요.',
      loading:'시간표를 불러오고 있어요.', failed:'시간표를 불러오지 못했어요.', allDirections:'모든 방면', saturday:'토요일 시간표', lunar:'명절 시간표',
      weekday:'평일 시간표', holiday:'토·일·공휴일 시간표', railSource:'철도공단 공개 시간표',
      express:'급행', nextDay:'다음 날', unavailable:'이 날짜의 시간표가 없어요.', scheduleEmpty:'이 방면의 남은 열차가 없어요.'
    },
    en: {
      timetableStation:'Stop or station', timetableDate:'Travel date (Korea time)', timetableDirection:'Direction',
      timetableNearbyTitle:'Nearby subway stations', timetableQuery:'Search station names', timetableNearby:'Show nearby stations', timetableRefresh:'Reload timetable',
      timetableLive:'Live arrivals', timetableSchedule:'Timetable', timetableLiveRefresh:'Refresh arrivals',
      liveLoading:'Loading live arrivals…', liveUnsupported:'Live arrivals are unavailable at this station. You can open the timetable.', livePending:'Live arrivals are being set up for this station.',
      liveFailed:'Live arrivals could not be loaded.', liveEmpty:'There are no trains with a predicted arrival right now.', liveStale:'The prediction has expired. Refresh arrivals.',
      liveSoon:'Due', liveMinutes:'in {v} min', liveSource:'Seoul Open Data · updated {v}',
      stationPrompt:'Choose a station', stationTip:'Allow location access or search by station name.', noNearby:'No registered subway stations within 3 km. You can search by name.',
      loading:'Loading timetable…', failed:'The timetable could not be loaded.', allDirections:'All directions', saturday:'Saturday timetable', lunar:'Lunar holiday timetable',
      weekday:'Weekday timetable', holiday:'Weekend and holiday timetable', railSource:'Korea National Railway timetable',
      express:'Express', nextDay:'next day', unavailable:'No timetable is available for this date.', scheduleEmpty:'No more trains in this direction.'
    },
    ja: {
      timetableStation:'停留所・駅', timetableDate:'乗車日（韓国時間）', timetableDirection:'方面',
      timetableNearbyTitle:'近くの地下鉄駅', timetableQuery:'駅名で検索', timetableNearby:'近くの駅を表示', timetableRefresh:'時刻表を再取得',
      timetableLive:'リアルタイム到着', timetableSchedule:'時刻表', timetableLiveRefresh:'到着情報を更新',
      liveLoading:'列車の到着情報を取得中…', liveUnsupported:'この駅のリアルタイム情報は利用できません。時刻表を確認できます。', livePending:'この駅の到着情報は準備中です。',
      liveFailed:'到着情報を取得できませんでした。', liveEmpty:'到着予想のある列車はありません。', liveStale:'到着情報が古くなりました。更新してください。',
      liveSoon:'まもなく到着', liveMinutes:'{v}分後', liveSource:'ソウル公開データ · {v}時点',
      stationPrompt:'駅を選択', stationTip:'位置情報を許可するか、駅名で検索してください。', noNearby:'3km以内に登録された駅はありません。駅名で検索できます。',
      loading:'時刻表を取得中…', failed:'時刻表を取得できませんでした。', allDirections:'すべての方面', saturday:'土曜日の時刻表', lunar:'旧正月・秋夕の時刻表',
      weekday:'平日の時刻表', holiday:'土日祝の時刻表', railSource:'国家鉄道公団の時刻表',
      express:'急行', nextDay:'翌日', unavailable:'この日の時刻表はありません。', scheduleEmpty:'この方面の残りの列車はありません。'
    },
    zh: {
      timetableStation:'车站', timetableDate:'乘车日期（韩国时间）', timetableDirection:'方向',
      timetableNearbyTitle:'附近的地铁站', timetableQuery:'搜索站名', timetableNearby:'显示附近车站', timetableRefresh:'重新加载时刻表',
      timetableLive:'实时到站', timetableSchedule:'时刻表', timetableLiveRefresh:'刷新到站信息',
      liveLoading:'正在加载列车到站信息…', liveUnsupported:'此站暂无实时到站信息。可以查看时刻表。', livePending:'此站的实时到站查询正在准备中。',
      liveFailed:'无法加载到站信息。', liveEmpty:'暂无提供预计到站时刻的列车。', liveStale:'到站信息已过期，请刷新。',
      liveSoon:'即将到站', liveMinutes:'{v}分钟后', liveSource:'首尔开放数据 · {v} 更新',
      stationPrompt:'选择车站', stationTip:'请允许访问位置，或按站名搜索。', noNearby:'3公里内没有已收录的地铁站。可以按站名搜索。',
      loading:'正在加载时刻表…', failed:'无法加载时刻表。', allDirections:'所有方向', saturday:'星期六时刻表', lunar:'春节和中秋时刻表',
      weekday:'工作日时刻表', holiday:'周末和节假日时刻表', railSource:'韩国国家铁路公团时刻表',
      express:'快车', nextDay:'次日', unavailable:'没有该日期的时刻表。', scheduleEmpty:'当前方向没有剩余班次。'
    }
  };
  for (const [language, words] of Object.entries(copy)) {
    Object.assign(NagalCopy[language], Object.fromEntries(Object.entries(words).filter(([key]) => key.startsWith('timetable'))));
  }

  function mount({ language }) {
    const el = id => document.getElementById('timetable-' + id);
    const catalog = globalThis.NagalTimetableData;
    const byId = new Map(catalog.map(stop => [stop[0], stop]));
    const routeFiles = new Map();
    const api = location.hostname === '127.0.0.1' ? 'http://127.0.0.1:8791' : document.querySelector('meta[name="nagal-push-api"]').content;
    const dateInput = el('date'), station = el('station'), direction = el('direction');
    const today = koreanDate(Date.now());
    dateInput.min = today;
    dateInput.max = koreanDate(Date.now() + 30 * day);
    dateInput.value = today;
    let generation = 0, details = null, boardKey, phase = '';
    let nearby = [], candidates = [], manual = false, located = false;
    let mode = 'live', liveData = null, liveTimer;

    function stationOptions(chosen = station.value) {
      const w = copy[language()];
      station.replaceChildren(new Option(w.stationPrompt, ''), ...candidates.map(({ stop, meters }) => {
        const distance = meters == null ? '' : ' · ' + new Intl.NumberFormat(language()).format(meters) + ' m';
        return new Option(stop[1] + ' · ' + stop[2] + distance, stop[0]);
      }));
      station.value = candidates.some(({ stop }) => stop[0] === chosen) ? chosen : '';
      el('nearby').hidden = !located || !manual;
    }

    function showNearby() {
      manual = false;
      el('query').value = '';
      candidates = nearby;
      stationOptions(nearby[0]?.stop[0]);
      loadStation();
    }

    function receivePosition(coords) {
      located = true;
      nearby = catalog.map(stop => ({ stop, meters: NagalTransit.distance(coords.latitude, coords.longitude, stop) }))
        .filter(result => result.meters <= 3000).sort((a, b) => a.meters - b.meters).slice(0, 8);
      if (!manual) showNearby();
      else el('nearby').hidden = false;
    }

    async function loadStation() {
      const request = ++generation;
      const stop = byId.get(station.value);
      clearTimeout(liveTimer);
      liveData = null;
      details = null;
      boardKey = null;
      if (mode === 'live') {
        await loadLive(stop, request);
        return;
      }
      phase = stop?.[5] ? 'loading' : '';
      renderBoard();
      if (!stop?.[5]) return;
      const line = stop[0].split(':')[0];
      if (!routeFiles.has(line)) {
        const pending = fetch('./rail-times/' + encodeURIComponent(line) + '.json', { signal: AbortSignal.timeout(10000) })
          .then(response => {
            if (!response.ok) throw new Error('timetable');
            return response.json();
          }).catch(error => {
            routeFiles.delete(line);
            throw error;
          });
        routeFiles.set(line, pending);
      }
      try {
        const rows = await routeFiles.get(line);
        if (request !== generation) return;
        details = Object.hasOwn(rows, stop[0]) ? rows[stop[0]] : null;
        if (!details?.days) throw new Error('timetable');
        phase = '';
      } catch {
        if (request !== generation) return;
        details = null;
        routeFiles.delete(line);
        phase = 'failed';
      }
      renderBoard();
    }

    async function loadLive(stop, request) {
      phase = stop ? 'liveLoading' : '';
      renderLive();
      if (!stop || !api) return;
      try {
        // Station identifiers are from the published station index, including the line and station code.
        const response = await fetch(api + '/rail/arrivals/' + stop[0], {
          credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: AbortSignal.timeout(9500)
        });
        const body = await response.json();
        if (request !== generation || station.value !== stop[0] || mode !== 'live') return;
        if (!response.ok) {
          phase = body.code === 'unsupported' ? 'liveUnsupported' :
            ['notConfigured', 'authRejected'].includes(body.code) ? 'livePending' : 'liveFailed';
        } else {
          if (body.station !== stop[0] || !Number.isFinite(body.updated) || !Array.isArray(body.arrivals) ||
              !body.arrivals.every(row => Number.isSafeInteger(row?.at) && typeof row.direction === 'string')) throw new Error('arrival response');
          liveData = body;
          phase = '';
          liveTimer = setTimeout(() => {
            if (!document.hidden && request === generation) loadStation();
          }, 60000);
        }
      } catch {
        if (request !== generation || station.value !== stop[0] || mode !== 'live') return;
        phase = 'liveFailed';
      }
      renderLive();
    }

    function formatArrival(w, at, now) {
      const remaining = Math.ceil((at - now) / minute);
      return remaining > 0 ? w.liveMinutes.replace('{v}', remaining) : w.liveSoon;
    }

    function renderArrivals(list, rows) {
      list.hidden = !rows.length;
      list.replaceChildren(...rows.map(([label, time]) => {
        const row = document.createElement('li');
        const title = document.createElement('span');
        const eta = document.createElement('strong');
        title.textContent = label;
        eta.textContent = time;
        row.append(title, eta);
        return row;
      }));
    }

    function renderLive() {
      const w = copy[language()], now = Date.now();
      const { stale, arrivals } = NagalTransit.arrivalView(liveData, now);
      const status = !station.value ? stationHint(w) : w[phase] ||
        (stale ? w.liveStale : liveData && !arrivals.length ? w.liveEmpty : '');
      const source = liveData && new Intl.DateTimeFormat(language(), {
        timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).format(liveData.updated);
      el('live-status').textContent = [status, source && w.liveSource.replace('{v}', source)].filter(Boolean).join(' · ');
      el('live-refresh').hidden = !station.value || phase === 'liveUnsupported' || phase === 'livePending';
      el('live-refresh').disabled = phase === 'liveLoading';
      renderArrivals(el('live-arrivals'), arrivals.map(row => [row.direction, formatArrival(w, row.at, now)]));
    }

    function stationHint(w) {
      return located && !manual && !nearby.length ? w.noNearby : w.stationTip;
    }

    function renderBoard() {
      if (mode === 'live') {
        renderLive();
        return;
      }
      const w = copy[language()], date = dateInput.value;
      const service = serviceKind(date), start = serviceStart(date);
      const saturday = service === 'holiday' && !holidays.has(date) && new Date(start + koreaOffset).getUTCDay() === 6;
      const lunar = /^2027-(?:02-0[6-9]|09-1[4-6])$/.test(date);
      const dayKey = lunar && details?.days.lunar ? 'lunar' : saturday && details?.days.saturday ? 'saturday' : service;
      const allTrips = details?.days[dayKey] || [];
      const key = [station.value, date].join('/');
      const previousDestination = key === boardKey ? direction.value : '';
      boardKey = key;
      const destinations = [...new Set(allTrips.map(([, terminal]) => terminal))];
      direction.replaceChildren(new Option(w.allDirections, ''), ...destinations.map(terminal => new Option(terminal, terminal)));
      direction.value = destinations.includes(previousDestination) ? previousDestination : '';
      el('direction-field').hidden = !destinations.length;
      const now = Date.now();
      const trips = allTrips.filter(([seconds, terminal]) =>
        start + seconds * 1000 > now && (!direction.value || direction.value === terminal)).slice(0, 8);
      const clock = new Intl.DateTimeFormat(language(), { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
      renderArrivals(el('scheduled-arrivals'), trips.map(([seconds, terminal, note]) => {
        const time = clock.format(start + seconds * 1000);
        return [[terminal, w[note]].filter(Boolean).join(' · '), seconds >= 86400 ? w.nextDay + ' ' + time : time];
      }));
      const source = el('source');
      source.textContent = details?.sourceDate ? w.railSource + ' · ' + details.sourceDate : w.railSource;
      el('day-type').textContent = allTrips.length ? (w[dayKey] || w[service]) + ' · ' : '';
      const summary = w[phase] || (!station.value ? stationHint(w) : !allTrips.length ? w.unavailable : !trips.length ? w.scheduleEmpty : '');
      el('summary').textContent = summary;
      el('summary').hidden = !summary;
      el('refresh').hidden = phase !== 'failed';
    }

    station.addEventListener('change', () => { manual = true; el('nearby').hidden = !located; loadStation(); });
    dateInput.addEventListener('input', renderBoard);
    dateInput.addEventListener('change', renderBoard);
    direction.addEventListener('change', renderBoard);
    el('query').addEventListener('input', event => {
      const query = event.target.value.trim().toLowerCase();
      if (!query) { showNearby(); return; }
      manual = true;
      candidates = catalog.filter(stop => (stop[1] + ' ' + stop[2]).toLowerCase().includes(query)).slice(0, 16).map(stop => ({ stop }));
      stationOptions('');
      loadStation();
    });
    el('nearby').addEventListener('click', showNearby);
    el('refresh').addEventListener('click', loadStation);
    el('live-refresh').addEventListener('click', loadStation);
    for (const choice of ['live', 'schedule']) el('mode-' + choice).addEventListener('click', () => {
      if (mode === choice) return;
      mode = choice;
      el('mode-live').setAttribute('aria-pressed', String(mode === 'live'));
      el('mode-schedule').setAttribute('aria-pressed', String(mode === 'schedule'));
      el('live-panel').hidden = mode !== 'live';
      el('planned-fields').hidden = el('schedule-source').hidden = mode !== 'schedule';
      if (mode === 'live') {
        el('summary').hidden = el('scheduled-arrivals').hidden = el('refresh').hidden = true;
        el('scheduled-arrivals').replaceChildren();
      }
      loadStation();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (mode === 'live' && liveData && Date.now() - liveData.updated >= 60000) loadStation();
      else renderBoard();
    });
    const render = () => { stationOptions(); renderBoard(); };
    render();
    return { render, updateTimes: renderBoard, receivePosition };
  }


  globalThis.NagalTimetable = { mount };
})();
