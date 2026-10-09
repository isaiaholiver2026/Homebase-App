/* Scores from ESPN's public score feed. Which sports get a tab is chosen in Settings → Scores.
   ESPN doesn't officially support outside use of this feed, so it could change someday. */
(function () {
  const { $, $$, esc, lsGet, lsSet } = HB;
  const API = 'https://site.api.espn.com/apis/site/v2/sports/';
  // Every sport you can pick. College lists show Top 25 teams + your favorites unless you tap "Show all".
  const ALL = [
    { key: 'nfl',    label: 'NFL',          name: 'NFL',                         path: 'football/nfl', web: 'nfl' },
    { key: 'cfb',    label: 'College FB',   name: 'College football',            path: 'football/college-football', college: true, group: 80, web: 'college-football' },
    { key: 'nba',    label: 'NBA',          name: 'NBA',                         path: 'basketball/nba', web: 'nba' },
    { key: 'ncaab',  label: 'College BB',   name: "Men's college basketball",    path: 'basketball/mens-college-basketball', college: true, group: 50, web: 'mens-college-basketball' },
    { key: 'mlb',    label: 'MLB',          name: 'MLB',                         path: 'baseball/mlb', web: 'mlb' },
    { key: 'nhl',    label: 'NHL',          name: 'NHL',                         path: 'hockey/nhl', web: 'nhl' },
    { key: 'wnba',   label: 'WNBA',         name: 'WNBA',                        path: 'basketball/wnba', web: 'wnba' },
    { key: 'ncaaw',  label: "Women's CBB",  name: "Women's college basketball",  path: 'basketball/womens-college-basketball', college: true, group: 50, web: 'womens-college-basketball' },
    { key: 'mls',    label: 'MLS',          name: 'MLS',                         path: 'soccer/usa.1', web: 'soccer' },
    { key: 'epl',    label: 'Premier League', name: 'Premier League',            path: 'soccer/eng.1', web: 'soccer' },
    { key: 'ucl',    label: 'Champions League', name: 'Champions League',        path: 'soccer/uefa.champions', web: 'soccer' }
  ];
  const byKey = k => ALL.find(l => l.key === k);
  // The sports turned on in Settings, in the order you turned them on
  const DEFAULT_ON = ['nfl', 'cfb', 'nba', 'ncaab'];
  function active() {
    const on = (HB.settings().sports || {}).leagues;
    const list = (Array.isArray(on) ? on : DEFAULT_ON).map(byKey).filter(Boolean);
    return list.length ? list : DEFAULT_ON.map(byKey);
  }
  const TAB = 'home-base-scores-tab', CACHE = 'home-base-scores';
  let games = lsGet(CACHE) || {}, errors = {}, tab = lsGet(TAB) || 'nfl', showAll = {}, loading = false, timer = null;

  const favs = () => (HB.settings().sports && HB.settings().sports.favorites) || [];
  const isFav = (lg, id) => favs().some(f => f.league === lg && String(f.id) === String(id));
  const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

  // Which day to show: college football is a Saturday sport, so show the nearest Saturday.
  function dateFor(lg) {
    const d = new Date();
    if (lg.key === 'cfb') { const wd = d.getDay(); const off = wd === 6 ? 0 : wd === 0 ? -1 : wd === 1 ? -2 : 6 - wd; d.setDate(d.getDate() + off); }
    return ymd(d);
  }
  function url(lg) {
    if (lg.key === 'nfl') return API + lg.path + '/scoreboard';           // the current NFL week
    // College football: ESPN's current-week scoreboard, so Thursday and Friday night games show too
    if (lg.key === 'cfb') return API + lg.path + `/scoreboard?groups=${lg.group}&limit=400`;
    return API + lg.path + '/scoreboard?dates=' + dateFor(lg) + (lg.group ? `&groups=${lg.group}&limit=400` : '');
  }

  function parse(lg, j) {
    return (j.events || []).map(ev => {
      const c = (ev.competitions || [])[0] || {}, st = (c.status || ev.status || {}).type || {};
      const side = t => {
        const x = (c.competitors || []).find(k => k.homeAway === t) || {}, tm = x.team || {};
        const rank = x.curatedRank && x.curatedRank.current <= 25 ? x.curatedRank.current : null;
        const rec = (x.records || []).find(r => r.type === 'total') || (x.records || [])[0];
        return { id: tm.id, abbr: tm.abbreviation || '', name: tm.shortDisplayName || tm.displayName || '', full: tm.displayName || '', logo: tm.logo || '', score: x.score == null ? '' : (typeof x.score === 'object' ? x.score.displayValue : x.score), winner: !!x.winner, rank, rec: rec ? rec.summary : '' };
      };
      const tv = ((c.broadcasts || [])[0] || {}).names || [];
      return { id: ev.id, league: lg.key, date: ev.date, state: st.state || 'pre', detail: st.shortDetail || st.detail || '', tv: tv.join(', '), away: side('away'), home: side('home') };
    });
  }

  const getJson = async u => { const r = await HB.fetchWithTimeout(u); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
  async function loadLeague(lg) {
    try {
      let j = await getJson(url(lg)), day = null;
      if (lg.key === 'nfl') day = { kind: 'week', week: (j.week || {}).number };
      else if (lg.key === 'cfb') day = { kind: 'week', week: (j.week || {}).number };
      else {
        day = { kind: 'today' };
        // Basketball: nothing today? ESPN's default scoreboard jumps to the next day with games.
        if (!(j.events || []).length) {
          const next = await getJson(API + lg.path + '/scoreboard' + (lg.group ? `?groups=${lg.group}&limit=400` : ''));
          const nd = (next.day || {}).date, season = (((next.leagues || [])[0] || {}).season || {}).type;
          if (nd && (next.events || []).length && nd.replace(/-/g, '') > dateFor(lg)) { j = next; day = { kind: 'next', date: nd.replace(/-/g, ''), preseason: season === 1 }; }
          else day = { kind: 'none' };
        }
      }
      games[lg.key] = { at: Date.now(), list: parse(lg, j), day };
      delete errors[lg.key];
    } catch (e) { errors[lg.key] = e.message || String(e); console.warn('Scores for', lg.label, 'could not load:', errors[lg.key]); }
  }
  async function load() {
    if (loading) return; loading = true;
    await Promise.all(active().map(loadLeague));
    lsSet(CACHE, games); loading = false; render(); schedule();
  }
  // Refresh every 30 seconds while a game is live, otherwise every 5 minutes.
  function schedule() {
    clearTimeout(timer);
    const keys = active().map(l => l.key), live = keys.some(k => games[k] && games[k].list && games[k].list.some(x => x.state === 'in'));
    timer = setTimeout(() => { if (!document.hidden) load(); else schedule(); }, live ? 30000 : 300000);
  }

  const order = { in: 0, pre: 1, post: 2 };
  function sortGames(list) {
    return [...list].sort((a, b) => {
      const fa = isFav(a.league, a.away.id) || isFav(a.league, a.home.id), fb = isFav(b.league, b.away.id) || isFav(b.league, b.home.id);
      if (fa !== fb) return fa ? -1 : 1;
      if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
      return new Date(a.date) - new Date(b.date);
    });
  }

  function statusLine(g) {
    if (g.state === 'in') return `<span class="live"><i></i>${esc(g.detail)}</span>`;
    if (g.state === 'post') return `<span>${esc(g.detail || 'Final')}</span>`;
    const d = new Date(g.date), today = new Date().toDateString() === d.toDateString();
    const when = (today ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `<span>${/TBD|Postponed|Canceled|Delayed/i.test(g.detail) ? esc(g.detail) : when}</span>`;
  }
  function teamRow(g, t) {
    const lose = g.state === 'post' && !t.winner, fav = isFav(g.league, t.id);
    return `<div class="tm${lose ? ' lose' : ''}${fav ? ' fav' : ''}">
      ${t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy" data-hide-broken>` : '<span class="nologo"></span>'}
      <span class="nm">${t.rank ? `<small class="rk">${t.rank}</small>` : ''}${esc(t.name)}${t.rec ? `<small class="rec">${esc(t.rec)}</small>` : ''}</span>
      <b class="sc">${g.state === 'pre' ? '' : esc(t.score)}</b></div>`;
  }
  function tile(g) {
    const fav = isFav(g.league, g.away.id) || isFav(g.league, g.home.id);
    const web = (byKey(g.league) || {}).web || 'nfl';
    const link = `https://www.espn.com/${web}/${web === 'soccer' ? 'match' : 'game'}/_/gameId/${g.id}`;
    return `<a class="game${g.state === 'in' ? ' is-live' : ''}${fav ? ' is-fav' : ''}" href="${link}" target="_blank" rel="noopener">
      <div class="gs">${statusLine(g)}${g.tv && g.state !== 'post' ? `<span class="tv">${esc(g.tv)}</span>` : ''}</div>
      ${teamRow(g, g.away)}${teamRow(g, g.home)}</a>`;
  }

  function render() {
    const LEAGUES = active(), hasFavs = favs().some(f => LEAGUES.some(l => l.key === f.league));
    if ((tab === 'mine' && !hasFavs) || (tab !== 'mine' && !LEAGUES.some(l => l.key === tab))) tab = LEAGUES[0].key;
    const tabs = (hasFavs ? [{ key: 'mine', label: 'My teams' }] : []).concat(LEAGUES);
    $('#scoreTabs').innerHTML = tabs.map(t => `<button type="button" data-tab="${t.key}" aria-pressed="${t.key === tab}">${t.label}</button>`).join('');
    const box = $('#scoreList'), foot = $('#scoreNote');
    let list = [], lg = byKey(tab);
    if (tab === 'mine') list = LEAGUES.flatMap(l => ((games[l.key] || {}).list || []).filter(g => isFav(l.key, g.away.id) || isFav(l.key, g.home.id)));
    else list = (games[tab] || {}).list || [];
    let hidden = 0;
    if (lg && lg.college && !showAll[tab]) {   // college: show ranked teams and your favorites unless "Show all"
      const keep = list.filter(g => g.away.rank || g.home.rank || isFav(tab, g.away.id) || isFav(tab, g.home.id));
      hidden = list.length - keep.length; list = keep;
    }
    list = sortGames(list);
    const err = tab === 'mine' ? LEAGUES.every(l => errors[l.key]) : errors[tab];
    if (!list.length) {
      const had = tab === 'mine' ? true : (games[tab] || {}).list;
      box.innerHTML = `<div class="empty">${err && !had ? "Couldn't reach ESPN. Check your internet connection." : !Object.keys(games).length ? 'Loading scores…'
        : tab === 'mine' ? 'None of your teams have a game coming up in these lists.' : hidden ? `No ranked teams playing. <button class="ghost" data-showall>Show all ${hidden} games</button>` : lg && ((games[tab] || {}).day || {}).kind === 'none' ? 'Out of season. No games are scheduled yet.' : 'No games scheduled.'}</div>`;
    } else {
      box.innerHTML = list.map(tile).join('') + (hidden ? `<button class="ghost more" data-showall>Show all games (+${hidden})</button>` : '')
        + (lg && lg.college && showAll[tab] ? `<button class="ghost more" data-showless>Show Top 25 only</button>` : '');
    }
    // A short line saying which games these are
    const d = lg && (games[tab] || {}).day, fmt = s => new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    let ctx = '';
    if (d && d.kind === 'week' && d.week) ctx = `Week ${d.week}`;
    else if (d && d.kind === 'date') ctx = d.date === dateFor({ key: 'x' }) ? "Today's games" : `Games on ${fmt(d.date)}`;
    else if (d && d.kind === 'today') ctx = "Today's games";
    else if (d && d.kind === 'next') {
      const days = Math.round((new Date(+d.date.slice(0, 4), +d.date.slice(4, 6) - 1, +d.date.slice(6, 8)) - HB.today0()) / 864e5);
      ctx = days > 14 ? `Out of season · next games ${fmt(d.date)}${d.preseason ? ' (preseason)' : ''}` : `No games today · next games ${fmt(d.date)}${d.preseason ? ' (preseason)' : ''}`;
    }
    $('#scoreCtx').textContent = ctx; $('#scoreCtx').hidden = !ctx;
    const at = tab === 'mine' ? Math.max(0, ...LEAGUES.map(l => (games[l.key] || {}).at || 0)) : (games[tab] || {}).at;
    const live = list.some(g => g.state === 'in');
    foot.textContent = at ? `${live ? 'Live · updates every 30 seconds · ' : ''}Updated ${new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · from ESPN` : '';
  }

  $('#scoreTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; lsSet(TAB, tab); render(); } });
  $('#scoreList').addEventListener('click', e => {
    if (e.target.closest('[data-showall]')) { e.preventDefault(); showAll[tab] = true; render(); }
    if (e.target.closest('[data-showless]')) { e.preventDefault(); showAll[tab] = false; render(); }
  });
  $('#refreshScores').onclick = () => load();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { const at = Math.max(0, ...Object.values(games).map(g => g.at || 0)); if (Date.now() - at > 60000) load(); } });

  /* Favorite teams (Settings) */
  const teamLists = {};
  async function teamsFor(lg) {
    if (teamLists[lg.key]) return teamLists[lg.key];
    const r = await HB.fetchWithTimeout(API + lg.path + '/teams?limit=1000', 20000);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return teamLists[lg.key] = (((j.sports || [])[0] || {}).leagues || [])[0].teams.map(x => x.team).map(t => ({ league: lg.key, id: t.id, name: t.displayName, abbr: t.abbreviation, logo: ((t.logos || [])[0] || {}).href || '' }));
  }
  // Plan B: teams from the games already loaded (every team playing this week/today).
  function teamsFromGames(lg) {
    const seen = new Map();
    ((games[lg.key] || {}).list || []).forEach(g => [g.away, g.home].forEach(t => { if (t.id && !seen.has(t.id)) seen.set(t.id, { league: lg.key, id: t.id, name: t.full || t.name, abbr: t.abbr, logo: t.logo }); }));
    return [...seen.values()];
  }
  HB.searchTeams = async (q, leagueKey) => {
    const lg = byKey(leagueKey), s = q.trim().toLowerCase();
    const match = list => list.filter(t => t.name.toLowerCase().includes(s) || (t.abbr || '').toLowerCase() === s).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 8);
    let all = null, why = '';
    try { all = await teamsFor(lg); } catch (e) { why = e.message || String(e); console.warn('ESPN team list failed:', why); }
    if (all && all.length) return match(all);
    const fromGames = teamsFromGames(lg);
    if (fromGames.length) return match(fromGames);
    const err = new Error(why || 'no teams'); err.offseason = !((games[lg.key] || {}).list || []).length; throw err;
  };
  HB.sportsLeagues = ALL;          // every sport (for labels and the Settings list)
  HB.activeLeagues = active;       // the ones turned on

  let first = true, lastFavs = '', lastOn = '';
  HB.onChange(() => {
    const f = JSON.stringify(favs()), on = active().map(l => l.key).join();
    if (first) { first = false; lastFavs = f; lastOn = on; render(); load(); return; }
    if (on !== lastOn) {
      // Sports changed in Settings: load any newly added ones right away
      const added = active().filter(l => !lastOn.split(',').includes(l.key));
      lastOn = on; lastFavs = f; render();
      if (added.length) Promise.all(added.map(loadLeague)).then(() => { lsSet(CACHE, games); render(); schedule(); });
      return;
    }
    if (f !== lastFavs) { lastFavs = f; render(); }
  });
})();
