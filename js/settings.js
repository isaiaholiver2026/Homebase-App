/* Settings panel: profile, weather, stocks, focus timer, appearance and backup. */
(function () {
  const { $, $$, esc } = HB;
  let open = false, lastFocus = null, savedT, typeT;

  function fill(all) {
    const st = HB.settings(), a = document.activeElement;
    const set = (id, v) => { const el = $(id); if (all || el !== a) el.value = v == null ? '' : v; };
    set('#setName', st.name); set('#setAbout', st.about);
    set('#setFocus', st.timer.focus); set('#setDeep', st.timer.deep); set('#setBreak', st.timer.brk);
    set('#setCsv', st.sheetCsvUrl);
    $('#openSheet').href = st.sheetUrl || 'https://sheets.google.com';
    $('#locCurrent').innerHTML = st.wx ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg><b>${esc(st.wx.name)}</b>` : '<small>No location set yet.</small>';
    $$('#unitSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.u === st.unit));
    const theme = HB.lsGet(HB.THEME_KEY) || 'system';
    $$('#themeSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === theme));
    $$('#boardSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.b === (st.boardMode || 'packed')));
    drawFavs();
  }
  HB.fillSettings = () => { if (open) fill(false); };

  function openDrawer(section) {
    lastFocus = document.activeElement; open = true; fill(true);
    const d = $('#drawer'), sc = $('#scrim');
    sc.hidden = false; d.removeAttribute('inert'); d.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => { sc.classList.add('on'); d.classList.add('on'); });
    setTimeout(() => {
      const target = section && document.getElementById('set-' + section);
      if (target) { target.scrollIntoView({ block: 'start' }); const f = target.querySelector('input'); f && f.focus(); }
      else $('#setName').focus();
    }, 300);
  }
  function closeDrawer() {
    open = false; const d = $('#drawer'), sc = $('#scrim');
    sc.classList.remove('on'); d.classList.remove('on'); d.setAttribute('inert', ''); d.setAttribute('aria-hidden', 'true');
    setTimeout(() => { sc.hidden = true; }, 260); lastFocus && lastFocus.focus && lastFocus.focus();
  }
  HB.openSettings = openDrawer;
  $('#openSettings').onclick = () => openDrawer();
  $('#closeSettings').onclick = closeDrawer; $('#scrim').onclick = closeDrawer;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) closeDrawer(); });
  document.addEventListener('click', e => { const b = e.target.closest('[data-open-settings]'); if (b) openDrawer(b.dataset.openSettings); });

  function save(patch) {
    HB.saveSetting(patch);
    const n = $('#savedNote'); n.classList.add('on'); clearTimeout(savedT); savedT = setTimeout(() => n.classList.remove('on'), 1200);
  }

  // Profile
  [['#setName', 'name'], ['#setAbout', 'about']].forEach(([id, k]) =>
    $(id).addEventListener('input', () => { clearTimeout(typeT); typeT = setTimeout(() => save({ [k]: $(id).value.trim() }), 500); }));

  // Weather
  $('#locForm').addEventListener('submit', async e => {
    e.preventDefault();
    const q = $('#locInput').value.trim(), out = $('#locResults'); if (!q) return;
    out.innerHTML = '<small>Searching…</small>';
    try {
      const list = await HB.searchPlaces(q);
      out.innerHTML = list.length ? list.map((p, i) => `<button type="button" data-i="${i}">${esc(p.name)}</button>`).join('') : '<small>No places found. Try a city name, like "Iowa City".</small>';
      out._list = list;
    } catch (err) { out.innerHTML = "<small>Couldn't search right now. Check your internet connection.</small>"; }
  });
  $('#locResults').addEventListener('click', e => {
    const b = e.target.closest('button[data-i]'); if (!b) return;
    const p = $('#locResults')._list[+b.dataset.i];
    save({ wx: { name: p.name, lat: p.lat, lon: p.lon } });
    $('#locResults').innerHTML = ''; $('#locInput').value = ''; fill(false);
  });
  $$('#unitSeg button').forEach(b => b.onclick = () => { save({ unit: b.dataset.u }); fill(false); });

  // Stocks
  let csvT;
  $('#setCsv').addEventListener('input', () => { clearTimeout(csvT); csvT = setTimeout(() => $('#setCsv').dispatchEvent(new Event('change')), 700); });
  $('#setCsv').addEventListener('change', () => {
    const v = $('#setCsv').value.trim();
    const ok = !v || /^https:\/\/docs\.google\.com\/spreadsheets\/.+(output=csv|format=csv|tqx=out:csv)/i.test(v);
    $('#csvNote').textContent = ok ? '' : 'That doesn\'t look like the CSV link. In the Publish to web window, choose "Comma-separated values (.csv)" and copy that link.';
    if (ok) save({ sheetCsvUrl: v });
  });

  // Scores: favorite teams
  let favLg = 'cfb', favHits = [];
  function drawFavs() {
    const f = HB.settings().sports.favorites, lab = k => (HB.sportsLeagues.find(l => l.key === k) || {}).label || k;
    $('#favList').innerHTML = f.length ? f.map((t, i) => `<span class="chip">${t.logo ? `<img src="${esc(t.logo)}" alt="">` : ''}${esc(t.name)} <small>${esc(lab(t.league))}</small><button type="button" data-unfav="${i}" aria-label="Remove ${esc(t.name)}">&times;</button></span>`).join('') : '<small>No favorites yet.</small>';
    const on = HB.activeLeagues();
    if (!on.some(l => l.key === favLg)) favLg = on[0].key;
    $('#favLeague').innerHTML = on.map(l => `<button type="button" data-lg="${l.key}" aria-pressed="${l.key === favLg}">${l.label}</button>`).join('');
    // Sports to show
    const onKeys = on.map(l => l.key);
    $('#sportPicks').innerHTML = HB.sportsLeagues.map(l => `<button type="button" data-sport="${l.key}" aria-pressed="${onKeys.includes(l.key)}">${onKeys.includes(l.key) ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17 19 7"/></svg>' : '+'} ${esc(l.name)}</button>`).join('');
  }
  $('#sportPicks').addEventListener('click', e => {
    const b = e.target.closest('[data-sport]'); if (!b) return;
    const k = b.dataset.sport, sp = HB.settings().sports, on = HB.activeLeagues().map(l => l.key);
    $('#sportNote').textContent = '';
    if (on.includes(k)) {
      if (on.length === 1) { $('#sportNote').textContent = 'Keep at least one sport turned on.'; return; }
      on.splice(on.indexOf(k), 1);
    } else on.push(k);
    save({ sports: Object.assign({}, sp, { leagues: on }) }); drawFavs();
  });
  $('#favLeague').addEventListener('click', e => { const b = e.target.closest('[data-lg]'); if (b) { favLg = b.dataset.lg; drawFavs(); $('#favResults').innerHTML = ''; $('#favQ').focus(); } });
  $('#favForm').addEventListener('submit', async e => {
    e.preventDefault(); const q = $('#favQ').value.trim(), out = $('#favResults'); if (!q) return;
    out.innerHTML = '<small>Searching…</small>';
    try {
      favHits = await HB.searchTeams(q, favLg);
      out.innerHTML = favHits.length ? favHits.map((t, i) => `<button type="button" data-fav="${i}">${t.logo ? `<img src="${esc(t.logo)}" alt="" width="18" height="18" style="vertical-align:-4px;margin-right:6px">` : ''}${esc(t.name)}</button>`).join('') : '<small>No teams found in that league.</small>';
    } catch (err) {
      out.innerHTML = err.offseason
        ? `<small>ESPN's team list didn't load, and this league has no games right now to pick from. Try again once its season starts. (Details: ${esc(err.message)})</small>`
        : `<small>Couldn't load teams from ESPN. (Details: ${esc(err.message)})</small>`;
    }
  });
  $('#favResults').addEventListener('click', e => {
    const b = e.target.closest('[data-fav]'); if (!b) return;
    const t = favHits[+b.dataset.fav], sp = HB.settings().sports;
    if (!sp.favorites.some(f => f.league === t.league && f.id === t.id)) save({ sports: Object.assign({}, sp, { favorites: [...sp.favorites, t] }) });
    $('#favResults').innerHTML = ''; $('#favQ').value = ''; drawFavs();
  });
  $('#favList').addEventListener('click', e => {
    const b = e.target.closest('[data-unfav]'); if (!b) return;
    const sp = HB.settings().sports, f = sp.favorites.slice(); f.splice(+b.dataset.unfav, 1);
    save({ sports: Object.assign({}, sp, { favorites: f }) }); drawFavs();
  });

  // Focus timer
  [['#setFocus', 'focus', 180], ['#setDeep', 'deep', 240], ['#setBreak', 'brk', 60]].forEach(([id, k, max]) =>
    $(id).addEventListener('change', () => {
      const v = Math.min(max, Math.max(1, Math.round(+$(id).value || 0)));
      $(id).value = v; save({ timer: Object.assign({}, HB.settings().timer, { [k]: v }) });
    }));

  // Appearance
  $$('#themeSeg button').forEach(b => b.onclick = () => { HB.setTheme(b.dataset.t); fill(false); });
  $$('#boardSeg button').forEach(b => b.onclick = () => { save({ boardMode: b.dataset.b }); fill(false); });

  // Backup
  $('#exportBtn').onclick = () => HB.exportData();
  $('#importBtn').onclick = () => { $('#importFile').value = ''; $('#importFile').click(); };
  $('#importFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { await HB.importData(f); $('#backupNote').textContent = 'Backup loaded.'; fill(true); }
    catch (err) { $('#backupNote').textContent = "That file isn't a Home Base backup."; }
  });

  HB.onChange(HB.fillSettings);
})();
