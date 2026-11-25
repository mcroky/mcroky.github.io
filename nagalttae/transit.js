(() => {
  'use strict';
  const text = {
    ko: {
      pushInstallBrowser:'홈 화면에 설치한 뒤 나갈때에서 알림을 허용해 주세요. 브라우저 알림이나 절전 설정에 따라 알림이 늦거나 오지 않을 수 있어요.',
      pushInstallApple:'아이폰·아이패드는 홈 화면에 추가하고 그 아이콘으로 열어야 푸시 알림을 받을 수 있어요.', pushInstallAction:'홈 화면에 설치',
      busHeading:'내 주변 정류장', busLocate:'현재 위치로 다시 찾기', busManual:'다른 정류장 검색', busMap:'카카오맵에서 정류장 보기', busSearch:'정류장 이름 또는 번호', busReload:'도착 정보 새로고침', busOfficial:'경기버스정보에서 보기',
      busRide:'탈 버스와 방면', busWalk:'정류장까지 걸리는 시간(분)', busReserve:'이 버스에 맞춰 알림 예약',
      locating:'현재 위치에서 가까운 정류장을 찾고 있어요.', denied:'주변 정류장을 보려면 위치를 허용해 주세요. 이름이나 번호로도 찾을 수 있어요.', unavailable:'현재 위치를 확인하지 못했어요. 다시 시도하거나 정류장을 검색해 주세요.', far:'반경 3km 안에 등록된 정류장이 없어요.', mapOnly:'이 정류장의 실시간 도착 정보는 아직 제공되지 않아요.',
      none:'일치하는 정류장이 없어요.', loading:'도착 정보를 확인하고 있어요.', failed:'도착 정보를 불러오지 못했어요. 다시 조회하거나 경기버스정보에서 확인해 주세요.',
      dataError:'정류장 목록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.', pending:'앱 내 실시간 조회를 준비 중이에요. 경기버스정보에서 이 정류장의 도착 정보를 확인해 주세요.',
      empty:'현재 도착 예측이 제공되는 버스가 없어요.', updated:'경기버스정보 · {v} 기준', near:'직선거리 {v}m', bound:'{v} 방면', soon:'곧 도착', mins:'{v}분 뒤',
      depart:'{v} 출발 · 도보 시간과 승차 여유 2분을 반영했어요.', missed:'도보 시간과 승차 여유 2분을 고려하면 이번 차는 촉박해요.', walkHint:'실제로 걸리는 시간을 입력해 주세요.', stale:'도착 정보가 오래됐어요. 새로고침해 주세요.'
    },
    en: {
      pushInstallBrowser:'Install Nagalttae on your Home Screen, then allow notifications. Browser and battery settings may delay or block reminders.',
      pushInstallApple:'On iPhone and iPad, add Nagalttae to the Home Screen and open it from its icon to receive push reminders.', pushInstallAction:'Install on Home Screen',
      busHeading:'Nearby stops', busLocate:'Retry my location', busManual:'Search for another stop', busMap:'View stop on Kakao Map', busSearch:'Stop name or number', busReload:'Refresh arrivals', busOfficial:'Open Gyeonggi Bus Info',
      busRide:'Bus and direction', busWalk:'Walking time to stop (min)', busReserve:'Schedule reminders for this bus',
      locating:'Finding stops near your location…', denied:'Allow location access to see nearby stops, or search by name or number.', unavailable:'Could not get your location. Try again or search for a stop.', far:'No listed stops within 3 km.', mapOnly:'Live arrivals are not available for this stop yet.',
      none:'No matching stops.', loading:'Checking arrivals…', failed:'Arrivals are unavailable. Retry or check Gyeonggi Bus Info.', dataError:'Could not load stops. Check your connection.',
      pending:'In-app live arrivals are being set up. Check this stop in Gyeonggi Bus Info.', empty:'No predicted arrivals for this stop.', updated:'Gyeonggi Bus Info · updated {v}', near:'{v} m straight-line distance',
      bound:'Toward {v}', soon:'Due', mins:'in {v} min', depart:'Leave at {v}, allowing for the walk and 2 minutes to board.', missed:'There is too little time to walk and board with a 2-minute buffer.',
      walkHint:'Enter your actual walking time.', stale:'This prediction has expired. Refresh arrivals.'
    },
    ja: {
      pushInstallBrowser:'ホーム画面に追加し、アプリで通知を許可してください。ブラウザや省電力設定により通知が遅れたり届かない場合があります。',
      pushInstallApple:'iPhone・iPadではホーム画面に追加し、そのアイコンから開くと通知を受け取れます。', pushInstallAction:'ホーム画面に追加',
      busHeading:'近くの停留所', busLocate:'現在地で再検索', busManual:'別の停留所を検索', busMap:'カカオマップで停留所を見る', busSearch:'停留所名または番号', busReload:'到着情報を更新', busOfficial:'京畿バス情報で見る',
      busRide:'乗車するバスと方面', busWalk:'停留所までの徒歩時間（分）', busReserve:'このバスに合わせて通知を予約',
      locating:'現在地の近くの停留所を検索中…', denied:'現在地の利用を許可するか、停留所名・番号で検索してください。', unavailable:'現在地を取得できませんでした。再試行するか停留所を検索してください。', far:'3km以内に登録された停留所がありません。', mapOnly:'この停留所のリアルタイム到着情報はまだ利用できません。',
      none:'該当する停留所がありません。', loading:'到着情報を確認中…', failed:'到着情報を取得できません。再試行するか京畿バス情報をご確認ください。', dataError:'停留所を読み込めません。接続を確認してください。',
      pending:'アプリ内の到着情報は準備中です。京畿バス情報で確認できます。', empty:'到着予測がありません。', updated:'京畿バス情報 · {v}時点', near:'直線距離{v}m', bound:'{v}方面', soon:'まもなく到着', mins:'{v}分後',
      depart:'{v}に出発。徒歩と乗車の余裕2分を含みます。', missed:'徒歩と乗車の余裕2分を考えると間に合いません。', walkHint:'停留所までの徒歩時間を入力してください。', stale:'情報が古くなりました。更新してください。'
    },
    zh: {
      pushInstallBrowser:'请添加到主屏幕，再打开应用并允许通知。浏览器和省电设置可能导致提醒延迟或无法送达。',
      pushInstallApple:'在 iPhone 和 iPad 上，请先添加到主屏幕，再从图标打开以接收推送。', pushInstallAction:'添加到主屏幕',
      busHeading:'附近的公交站', busLocate:'重新定位', busManual:'搜索其他公交站', busMap:'在 Kakao 地图上查看车站', busSearch:'站名或站号', busReload:'刷新到站信息', busOfficial:'打开京畿公交信息',
      busRide:'乘车线路与方向', busWalk:'步行至车站所需时间（分钟）', busReserve:'按此班车预约提醒',
      locating:'正在查找当前位置附近的车站…', denied:'请允许访问位置，或按站名、站号搜索。', unavailable:'无法获取当前位置，请重试或搜索车站。', far:'3公里内没有已收录的车站。', mapOnly:'此车站暂未提供实时到站信息。', none:'没有匹配的车站。',
      loading:'正在获取到站信息…', failed:'无法获取到站信息，请重试或前往京畿公交信息查看。', dataError:'无法加载车站列表，请检查网络。',
      pending:'应用内实时到站功能准备中，请在京畿公交信息查看。', empty:'目前没有预计到站班次。', updated:'京畿公交信息 · {v} 更新', near:'直线距离{v}米', bound:'开往{v}', soon:'即将到站', mins:'{v}分钟后',
      depart:'{v}出发，包括步行时间和2分钟上车余量。', missed:'步行后所剩时间不足以预留2分钟上车。', walkHint:'请输入实际步行时间。', stale:'到站信息已过期，请刷新。'
    }
  };
  for (const [lang, words] of Object.entries(text)) Object.assign(NagalCopy[lang], words);

  function distance(lat, lon, stop) {
    const rad = Math.PI / 180;
    const a = Math.sin((stop[3] - lat) * rad / 2) ** 2 +
      Math.cos(lat * rad) * Math.cos(stop[3] * rad) * Math.sin((stop[4] - lon) * rad / 2) ** 2;
    return Math.round(12742000 * Math.asin(Math.min(1, Math.sqrt(a))));
  }

  function mount({ language, reserve, prep }) {
    const el = id => document.getElementById('bus-' + id);
    const api = location.hostname === '127.0.0.1' ? 'http://127.0.0.1:8791' : document.querySelector('meta[name="nagal-push-api"]').content;
    const bands = [33, 34, 35, 36, 37, 38];
    const datasets = new Map();
    let generation = 0, refreshTimer, matches = [], station, data, status = '', boardStatus = '', ride = 0;
    let chosenTrip;
    const words = () => text[language()];
    const label = (key, value) => words()[key].replace('{v}', value);
    const time = at => new Intl.DateTimeFormat(language(), { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Seoul', hourCycle:'h23' }).format(at);
    const stale = () => !data || Date.now() - data.updated > 120000;
    function leaveTime() {
      const walk = el('walk').valueAsNumber, entry = data?.arrivals[ride];
      return entry && Number.isInteger(walk) && walk >= 0 && walk <= 180 ? Math.floor(entry.at / 60000) * 60000 - (walk + 2) * 60000 : NaN;
    }
    function renderTrip() {
      if (el('trip').hidden) return;
      const leave = leaveTime();
      const message = stale() ? 'stale' : !Number.isFinite(leave) ? 'walkHint' : leave <= Date.now() ? 'missed' : 'depart';
      el('leave').textContent = message === 'depart' ? label(message, time(leave)) : words()[message];
      el('reserve').hidden = !reserve;
      el('reserve').disabled = message !== 'depart' || !Number.isInteger(prep()) || prep() < 0 || prep() > 240;
    }
    function render() {
      const w = words();
      el('status').textContent = w[status] || '';
      el('locate').hidden = status === 'locating' || Boolean(station && !el('query').value);
      el('stops').replaceChildren(...matches.map(({ stop, meters }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('aria-pressed', String(station?.[0] === stop[0]));
        const direction = stop[6]?.length ? label('bound', stop[6].join(' / ')) : '';
        button.textContent = [stop[1], stop[2], direction, meters == null ? stop[5] : label('near', meters)].filter(Boolean).join(' · ');
        button.addEventListener('click', () => select(stop, meters));
        return button;
      }));
      el('board').hidden = !station;
      if (!station) return;
      el('station-name').textContent = [station[1], station[2]].filter(Boolean).join(' · ');
      const local = Boolean(station[6]);
      const gyeonggi = local || /^GGB\d+$/.test(station[0]);
      const link = el('official');
      if (gyeonggi) {
        const official = new URL('https://gbis.go.kr/gbis2014/schBus.action');
        official.search = new URLSearchParams({cmd:'mainSearchText', gubun:'stationInfo', searchText:station[2] || station[1], stationId:station[0].replace(/^GGB/, '')});
        link.href = official.href;
      } else {
        link.href = 'https://map.kakao.com/link/map/' + encodeURIComponent(station[1]) + ',' + station[3] + ',' + station[4];
      }
      link.textContent = gyeonggi ? w.busOfficial : w.busMap;
      el('reload').hidden = !local;
      el('arrivals').textContent = [w[boardStatus], data ? label('updated', time(data.updated)) : ''].filter(Boolean).join('\n');
      el('trip').hidden = !data?.arrivals.length;
      if (!el('trip').hidden) {
        const options = data.arrivals.map((e, i) => {
          const mins = Math.max(0, Math.ceil((e.at - Date.now()) / 60000));
          return new Option([e.name, e.direction && label('bound', e.direction), mins ? label('mins', mins) : w.soon, time(e.at)].filter(Boolean).join(' · '), i);
        });
        if (ride < 0) options.unshift(new Option(w.busRide, '-1'));
        el('ride').replaceChildren(...options);
        el('ride').value = String(ride);
        renderTrip();
      }
    }
    function reset() {
      clearTimeout(refreshTimer);
      ++generation;
      station = data = null; chosenTrip = undefined; matches = []; status = boardStatus = '';
      return generation;
    }
    function readBand(band) {
      if (!datasets.has(band)) {
        const request = fetch('./stops/' + band + '.json').then(async res => {
          if (!res.ok) throw new Error('stops');
          const {areas, stops} = await res.json();
          for (const stop of stops) stop[5] = areas[stop[5]];
          return stops;
        }).catch(error => { datasets.delete(band); throw error; });
        datasets.set(band, request);
      }
      return datasets.get(band);
    }
    function nearbyBands(latitude) {
      // 0.03 degrees latitude covers the 3 km search radius on both sides of a band boundary.
      return bands.filter(band => latitude + 0.03 >= band && latitude - 0.03 < band + 1);
    }
    async function load() {
      if (!station) return;
      const id = ++generation, sid = station[0];
      clearTimeout(refreshTimer);
      if (!station[6]) {
        data = null; boardStatus = 'mapOnly'; render(); return;
      }
      data = null; ride = 0; boardStatus = 'loading'; render();
      try {
        const response = await fetch(api + '/anseong/arrivals/' + sid, {
          credentials:'omit', referrerPolicy:'no-referrer', cache:'no-store', signal:AbortSignal.timeout(10000)
        });
        const body = await response.json();
        if (id !== generation || station?.[0] !== sid) return;
        if (!response.ok) throw new Error(body.code === 'notConfigured' ? 'pending' : 'failed');
        if (body.station !== sid || !Number.isFinite(body.updated) || !Array.isArray(body.arrivals)) throw new Error('failed');
        data = body;
        ride = chosenTrip === undefined ? 0 : chosenTrip ? data.arrivals.findIndex(e => e.trip === chosenTrip) : -1;
        if (ride >= 0 && data.arrivals[ride]) chosenTrip = data.arrivals[ride].trip ?? null;
        boardStatus = data.arrivals.length ? '' : 'empty';
        refreshTimer = setTimeout(() => { if (!document.hidden && id === generation) load(); }, 60000);
      } catch (error) {
        if (id !== generation || station?.[0] !== sid) return;
        boardStatus = error.message === 'pending' ? 'pending' : 'failed';
      }
      render();
    }
    function select(stop, meters) {
      data = null;
      chosenTrip = undefined;
      station = stop;
      el('walk').value = meters == null ? '' : String(Math.ceil(meters / 75));
      load();
    }
    async function locate() {
      const id = reset();
      el('manual').open = false;
      el('query').value = ''; status = 'locating'; render();
      let position;
      try {
        position = await new Promise((resolve,reject) => navigator.geolocation.getCurrentPosition(resolve,reject,{ timeout:12000, maximumAge:30000, enableHighAccuracy:true }));
      } catch (error) {
        if (id === generation) {
          status = error.code === 1 ? 'denied' : 'unavailable';
          el('manual').open = true;
          render();
        }
        return;
      }
      if (id !== generation) return;
      try {
        const {latitude, longitude} = position.coords;
        const groups = await Promise.all(nearbyBands(latitude).map(readBand));
        if (id !== generation) return;
        matches = groups.flatMap(rows => rows.filter(stop => Math.abs(latitude - stop[3]) <= 0.03)
          .map(stop => ({ stop, meters:distance(latitude, longitude, stop) }))).filter(x => x.meters <= 3000)
          .sort((a,b) => a.meters - b.meters).slice(0,5);
        status = matches.length ? '' : 'far';
        if (matches.length) select(matches[0].stop, matches[0].meters);
        else { el('manual').open = true; render(); }
      } catch {
        if (id === generation) { status = 'dataError'; el('manual').open = true; render(); }
      }
    }
    el('locate').addEventListener('click', locate);
    el('query').addEventListener('input', async e => {
      const id = reset(), query = e.target.value.trim().toLowerCase();
      render();
      if (!query) return;
      try {
        const groups = await Promise.all(bands.map(readBand));
        if (id !== generation) return;
        const exact = [], partial = [];
        const terms = query.split(/\s+/);
        for (const rows of groups) {
          for (const stop of rows) {
            const name = stop[1].toLowerCase();
            if (stop[2] === query || name === query || stop[0].toLowerCase() === query) exact.push({stop});
            else if (partial.length < 8 && terms.every(term =>
              name.includes(term) || stop[2].includes(term) || stop[5].includes(term))) partial.push({stop});
          }
        }
        matches = exact.concat(partial).slice(0,8);
        status = matches.length ? '' : 'none';
      } catch { if (id !== generation) return; status = 'dataError'; }
      render();
    });
    el('reload').addEventListener('click', load);
    el('ride').addEventListener('change', () => {
      ride = Number(el('ride').value);
      chosenTrip = data?.arrivals[ride]?.trip ?? null;
      renderTrip();
    });
    el('walk').addEventListener('input', renderTrip);
    document.getElementById('settings-form').addEventListener('input', renderTrip);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && station && data && Date.now() - data.updated >= 60000) load(); });
    el('reserve').addEventListener('click', () => {
      renderTrip();
      if (el('reserve').disabled || !reserve) return;
      const leave = leaveTime();
      reserve({ ready:leave - prep() * 60000, leave });
      document.getElementById('push-panel').scrollIntoView({ block:'center' });
    });
    locate();
    return render;
  }
  globalThis.NagalTransit = { mount, distance };
})();
