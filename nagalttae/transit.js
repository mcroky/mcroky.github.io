(() => {
  'use strict';
  const text = {
    ko: {
      pushInstallBrowser:'홈 화면에 설치한 뒤 나갈때에서 알림을 허용해 주세요. 브라우저 알림이나 절전 설정에 따라 알림이 늦거나 오지 않을 수 있어요.',
      pushInstallApple:'아이폰·아이패드는 홈 화면에 추가하고 그 아이콘으로 열어야 푸시 알림을 받을 수 있어요.', pushInstallAction:'홈 화면에 설치',
      busHeading:'내 주변 정류장', busLocate:'현재 위치로 다시 찾기', busManual:'다른 정류장 검색', busMap:'카카오맵에서 정류장 보기', busSearch:'정류장 이름 또는 번호', busReload:'도착 정보 새로고침', busSeoul:'서울 TOPIS에서 보기', busOfficial:'경기버스정보에서 보기',
      locating:'현재 위치에서 가까운 정류장을 찾고 있어요.', denied:'주변 정류장을 보려면 위치를 허용해 주세요. 이름이나 번호로도 찾을 수 있어요.', unavailable:'현재 위치를 확인하지 못했어요. 다시 시도하거나 정류장을 검색해 주세요.', far:'반경 3km 안에 등록된 정류장이 없어요.', mapOnly:'이 정류장의 실시간 도착 정보는 아직 제공되지 않아요.',
      none:'일치하는 정류장이 없어요.', loading:'도착 정보를 확인하고 있어요.', failed:'도착 정보를 불러오지 못했어요. 새로고침하거나 아래 링크에서 정류장을 확인해 주세요.',
      dataError:'정류장 목록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.', pending:'앱 내 실시간 도착 정보를 준비 중이에요.',
      empty:'현재 도착 예측이 제공되는 버스가 없어요.', updated:'{v} 기준', busProvider:'경기버스정보', unsupportedCity:'이 지역의 실시간 버스 도착 정보는 TAGO에서 제공하지 않아요.', authRejected:'도착정보 조회 연결을 확인하고 있어요. 잠시 후 다시 시도해 주세요.', near:'직선거리 {v}m', bound:'{v} 방면', soon:'곧 도착', mins:'{v}분 뒤',
      stale:'도착 정보가 오래됐어요. 새로고침해 주세요.'
    },
    en: {
      pushInstallBrowser:'Install Nagalttae on your Home Screen, then allow notifications. Browser and battery settings may delay or block reminders.',
      pushInstallApple:'On iPhone and iPad, add Nagalttae to the Home Screen and open it from its icon to receive push reminders.', pushInstallAction:'Install on Home Screen',
      busHeading:'Nearby stops', busLocate:'Retry my location', busManual:'Search for another stop', busMap:'View stop on Kakao Map', busSearch:'Stop name or number', busReload:'Refresh arrivals', busSeoul:'Open Seoul TOPIS', busOfficial:'Open Gyeonggi Bus Info',
      locating:'Finding stops near your location…', denied:'Allow location access to see nearby stops, or search by name or number.', unavailable:'Could not get your location. Try again or search for a stop.', far:'No listed stops within 3 km.', mapOnly:'Live arrivals are not available for this stop yet.',
      none:'No matching stops.', loading:'Checking arrivals…', failed:'Couldn’t load live arrivals. Refresh or check the stop using the link below.', dataError:'Could not load stops. Check your connection.',
      pending:'In-app live arrivals are being set up.', empty:'No predicted arrivals for this stop.', updated:'updated {v}', busProvider:'Gyeonggi Bus Info', unsupportedCity:'TAGO does not provide live bus arrivals for this area.', authRejected:'The arrival feed could not be authorized. Try again later.', near:'{v} m straight-line distance',
      bound:'Toward {v}', soon:'Due', mins:'in {v} min', stale:'This prediction has expired. Refresh arrivals.'
    },
    ja: {
      pushInstallBrowser:'ホーム画面に追加し、アプリで通知を許可してください。ブラウザや省電力設定により通知が遅れたり届かない場合があります。',
      pushInstallApple:'iPhone・iPadではホーム画面に追加し、そのアイコンから開くと通知を受け取れます。', pushInstallAction:'ホーム画面に追加',
      busHeading:'近くの停留所', busLocate:'現在地で再検索', busManual:'別の停留所を検索', busMap:'カカオマップで停留所を見る', busSearch:'停留所名または番号', busReload:'到着情報を更新', busSeoul:'ソウルTOPISで見る', busOfficial:'京畿バス情報で見る',
      locating:'現在地の近くの停留所を検索中…', denied:'現在地の利用を許可するか、停留所名・番号で検索してください。', unavailable:'現在地を取得できませんでした。再試行するか停留所を検索してください。', far:'3km以内に登録された停留所がありません。', mapOnly:'この停留所のリアルタイム到着情報はまだ利用できません。',
      none:'該当する停留所がありません。', loading:'到着情報を確認中…', failed:'到着情報を取得できません。更新するか、下のリンクで停留所をご確認ください。', dataError:'停留所を読み込めません。接続を確認してください。',
      pending:'アプリ内のリアルタイム到着情報は準備中です。', empty:'到着予測がありません。', updated:'{v}時点', busProvider:'京畿バス情報', unsupportedCity:'この地域のリアルタイム到着情報はTAGOで提供されていません。', authRejected:'到着情報の接続を確認中です。しばらくしてから再試行してください。', near:'直線距離{v}m', bound:'{v}方面', soon:'まもなく到着', mins:'{v}分後',
      stale:'情報が古くなりました。更新してください。'
    },
    zh: {
      pushInstallBrowser:'请添加到主屏幕，再打开应用并允许通知。浏览器和省电设置可能导致提醒延迟或无法送达。',
      pushInstallApple:'在 iPhone 和 iPad 上，请先添加到主屏幕，再从图标打开以接收推送。', pushInstallAction:'添加到主屏幕',
      busHeading:'附近的公交站', busLocate:'重新定位', busManual:'搜索其他公交站', busMap:'在 Kakao 地图上查看车站', busSearch:'站名或站号', busReload:'刷新到站信息', busSeoul:'在首尔 TOPIS 查看', busOfficial:'打开京畿公交信息',
      locating:'正在查找当前位置附近的车站…', denied:'请允许访问位置，或按站名、站号搜索。', unavailable:'无法获取当前位置，请重试或搜索车站。', far:'3公里内没有已收录的车站。', mapOnly:'此车站暂未提供实时到站信息。', none:'没有匹配的车站。',
      loading:'正在获取到站信息…', failed:'无法获取到站信息。请刷新或通过下方链接查看车站。', dataError:'无法加载车站列表，请检查网络。',
      pending:'应用内实时到站功能正在准备中。', empty:'目前没有预计到站班次。', updated:'{v} 更新', busProvider:'京畿公交信息', unsupportedCity:'TAGO 暂未提供该地区的实时公交到站信息。', authRejected:'到站信息连接正在确认，请稍后再试。', near:'直线距离{v}米', bound:'开往{v}', soon:'即将到站', mins:'{v}分钟后',
      stale:'到站信息已过期，请刷新。'
    }
  };
  for (const [lang, words] of Object.entries(text)) Object.assign(NagalCopy[lang], words);

  function distance(lat, lon, stop) {
    const rad = Math.PI / 180;
    const a = Math.sin((stop[3] - lat) * rad / 2) ** 2 +
      Math.cos(lat * rad) * Math.cos(stop[3] * rad) * Math.sin((stop[4] - lon) * rad / 2) ** 2;
    return Math.round(12742000 * Math.asin(Math.min(1, Math.sqrt(a))));
  }

  function isSeoulStop(stop) {
    return stop[7] === '11' && /^SEB\d{9}$/.test(stop[0]) && /^\d{5}$/.test(stop[2]);
  }

  function arrivalView(data, now) {
    const stale = Boolean(data && now - data.updated > 120000);
    const arrivals = stale ? [] : (data?.arrivals || []).filter(entry => Number.isFinite(entry?.at) && entry.at >= now - 30000);
    return { stale, arrivals };
  }

  function mount({ language, onPosition }) {
    const el = id => document.getElementById('bus-' + id);
    const api = location.hostname === '127.0.0.1' ? 'http://127.0.0.1:8791' : document.querySelector('meta[name="nagal-push-api"]').content;
    const bands = [33, 34, 35, 36, 37, 38];
    const datasets = new Map();
    let generation = 0, refreshTimer, matches = [], station, data, status = '', boardStatus = '';
    const words = () => text[language()];
    const label = (key, value) => words()[key].replace('{v}', value);
    const time = at => new Intl.DateTimeFormat(language(), { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Seoul', hourCycle:'h23' }).format(at);
    const remaining = (at, now) => {
      const minutes = Math.ceil((at - now) / 60000);
      return minutes > 0 ? label('mins', minutes) : words().soon;
    };
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
        button.addEventListener('click', () => select(stop));
        return button;
      }));
      el('board').hidden = !station;
      if (!station) return;
      el('station-name').textContent = [station[1], station[2]].filter(Boolean).join(' · ');
      const local = Boolean(station[6]);
      const gyeonggi = local || /^GGB\d+$/.test(station[0]);
      const seoul = isSeoulStop(station);
      const link = el('official');
      if (gyeonggi) {
        const official = new URL('https://gbis.go.kr/gbis2014/schBus.action');
        official.search = new URLSearchParams({cmd:'mainSearchText', gubun:'stationInfo', searchText:station[2] || station[1], stationId:station[0].replace(/^GGB/, '')});
        link.href = official.href;
      } else if (seoul) {
        link.href = 'https://topis.seoul.go.kr/map/openBusMap.do';
      } else {
        link.href = 'https://map.kakao.com/link/map/' + encodeURIComponent(station[1]) + ',' + station[3] + ',' + station[4];
      }
      link.textContent = gyeonggi ? w.busOfficial : seoul ? w.busSeoul : w.busMap;
      el('reload').hidden = !local && !station[7];
      renderArrivals();
    }
    function renderArrivals() {
      if (!station) return;
      const w = words();
      const now = Date.now();
      const { stale, arrivals } = arrivalView(data, now);
      const message = boardStatus || (stale ? 'stale' : data && !arrivals.length ? 'empty' : '');
      const source = ['TOPIS', 'TAGO'].includes(data?.source) ? data.source : w.busProvider;
      el('arrivals').textContent = [w[message], data ? source + ' · ' + label('updated', time(data.updated)) : ''].filter(Boolean).join('\n');
      const next = el('next');
      next.hidden = !arrivals.length;
      next.replaceChildren(...arrivals.slice(0, 6).map(entry => {
        const row = document.createElement('li');
        const route = document.createElement('span');
        route.textContent = [entry.name, entry.direction && label('bound', entry.direction)].filter(Boolean).join(' · ');
        const eta = document.createElement('strong');
        eta.textContent = remaining(entry.at, now);
        row.append(route, eta);
        return row;
      }));
    }
    function reset() {
      clearTimeout(refreshTimer);
      ++generation;
      station = data = null; matches = []; status = boardStatus = '';
      return generation;
    }
    function readBand(band) {
      if (!datasets.has(band)) {
        const request = fetch('./stops/' + band + '.json').then(async res => {
          if (!res.ok) throw new Error('stops');
          const {areas, cityCodes, stops} = await res.json();
          for (const stop of stops) {
            const area = stop[5];
            stop[5] = areas[area];
            stop[7] = cityCodes?.[area];
          }
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
      const path = station[6] ? '/anseong/arrivals/' + sid :
        isSeoulStop(station) ? '/seoul/arrivals/' + sid + '/' + station[2] :
        station[7] ? '/tago/arrivals/' + encodeURIComponent(station[7]) + '/' + encodeURIComponent(sid) : '';
      if (!path) {
        data = null; boardStatus = 'mapOnly'; render(); return;
      }
      data = null; boardStatus = 'loading'; render();
      try {
        const response = await fetch(api + path, {
          credentials:'omit', referrerPolicy:'no-referrer', cache:'no-store', signal:AbortSignal.timeout(13000)
        });
        const body = await response.json();
        if (id !== generation || station?.[0] !== sid) return;
        if (!response.ok) {
          const status = body.code === 'notConfigured' ? 'pending' : body.code;
          throw new Error(status === 'pending' || status === 'authRejected' ? status : 'failed');
        }
        if (body.station !== sid || !Number.isFinite(body.updated) || !Array.isArray(body.arrivals)) throw new Error('failed');
        data = body;
        boardStatus = data.unsupportedCity === true ? 'unsupportedCity' : '';
        if (!data.unsupportedCity) refreshTimer = setTimeout(() => { if (!document.hidden && id === generation) load(); }, 60000);
      } catch (error) {
        if (id !== generation || station?.[0] !== sid) return;
        boardStatus = ['pending', 'authRejected'].includes(error.message) ? error.message : 'failed';
      }
      render();
    }
    function select(stop) {
      station = stop;
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
        onPosition?.({latitude, longitude});
        const groups = await Promise.all(nearbyBands(latitude).map(readBand));
        if (id !== generation) return;
        matches = groups.flatMap(rows => rows.filter(stop => Math.abs(latitude - stop[3]) <= 0.03)
          .map(stop => ({ stop, meters:distance(latitude, longitude, stop) }))).filter(x => x.meters <= 3000)
          .sort((a,b) => a.meters - b.meters).slice(0,5);
        status = matches.length ? '' : 'far';
        if (matches.length) select(matches[0].stop);
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
    document.addEventListener('visibilitychange', () => { if (!document.hidden && station && data && !data.unsupportedCity && Date.now() - data.updated >= 60000) load(); });
    locate();
    return { render, updateTimes: renderArrivals };
  }
  globalThis.NagalTransit = { mount, distance, arrivalView };
})();
