/* Focus timer: Focus / Deep / Break lengths come from Settings. */
(function () {
  const { $, $$, lsGet, lsSet } = HB;
  const C = 2 * Math.PI * 44, bar = $('#bar'); bar.style.strokeDasharray = C;
  let tLen = 25 * 60, tLeft = tLen, tRun = null, tEnd = 0, isBrk = false;
  const SESS = 'home-base-sessions';
  const labels = { focus: 'Focus', deep: 'Deep', brk: 'Break' };

  const sessions = () => { const s = lsGet(SESS); return s && s.day === new Date().toDateString() ? s.n : 0; };
  function showSess() { const n = sessions(); $('#sessions').textContent = n ? `${n} session${n > 1 ? 's' : ''} today` : ''; }
  function addSession() { lsSet(SESS, { day: new Date().toDateString(), n: sessions() + 1 }); showSess(); }

  function draw() {
    const h = Math.floor(tLeft / 3600), m = Math.floor((tLeft % 3600) / 60), s = tLeft % 60, p = n => String(n).padStart(2, '0');
    $('#tRead').textContent = h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
    $('#tRead').classList.toggle('long', !!h);
    $('#tMini').textContent = tRun || tLeft < tLen ? `${$('#tRead').textContent}${tRun ? '' : ' paused'}` : '';
    bar.style.strokeDashoffset = C * (1 - tLeft / tLen);
    $('#dial').classList.toggle('brk', isBrk);
  }
  function chime() {
    try {
      const a = new (window.AudioContext || window.webkitAudioContext)();
      [660, 880, 1320].forEach((f, i) => {
        const o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + i * .18;
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(.18, t0 + .02); g.gain.exponentialRampToValueAtTime(.001, t0 + .9);
        o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + 1);
      });
    } catch (e) {}
  }
  /* Focus stats: minutes focused per day (kept for 90 days, included in backups) */
  let lastTick = 0, pendingMs = 0;
  const log = () => { if (!HB.state.focusLog || typeof HB.state.focusLog !== 'object') HB.state.focusLog = {}; return HB.state.focusLog; };
  function credit(final) {
    // Count time spent focusing (not breaks); whole minutes go in as you go, the rest when you stop
    const now = Date.now();
    if (lastTick && !isBrk) pendingMs += Math.min(now - lastTick, 90000);
    lastTick = final ? 0 : now;
    let mins = Math.floor(pendingMs / 60000);
    if (final && pendingMs % 60000 >= 30000) mins++;
    pendingMs = final ? 0 : pendingMs - Math.floor(pendingMs / 60000) * 60000;
    if (mins > 0) { const l = log(), k = HB.localISO(); l[k] = (l[k] || 0) + mins; prune(l); HB.saveQuietly(); drawStats(); }
  }
  function prune(l) { const cut = HB.localISO(new Date(Date.now() - 90 * 864e5)); Object.keys(l).forEach(k => { if (k < cut) delete l[k]; }); }
  const fmtDur = m => m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}` : `${m}m`;
  function drawStats() {
    const l = log(), d = new Date(), key = x => HB.localISO(x);
    const today = l[key(d)] || 0;
    // Streak: days in a row with any focus time (today counts once you start)
    let streak = 0; const c = new Date(); if (!today) c.setDate(c.getDate() - 1);
    while (l[key(c)] > 0) { streak++; c.setDate(c.getDate() - 1); }
    // This week, Monday to Sunday
    const mon = new Date(); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
    const week = [...Array(7)].map((_, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); return { k: key(x), m: l[key(x)] || 0, lab: 'MTWTFSS'[i], name: x.toLocaleDateString(undefined, { weekday: 'long' }) }; });
    const max = Math.max(60, ...week.map(w => w.m)), total = week.reduce((a, w) => a + w.m, 0), tk = key(d);
    $('#fsToday').textContent = today; $('#fsStreak').textContent = streak;
    $('#fsWeek').innerHTML = week.map(w => `<div class="fs-day${w.k === tk ? ' today' : ''}${w.k > tk ? ' future' : ''}" title="${w.name}: ${w.m} min"><i style="height:${w.m ? Math.max(8, w.m / max * 100) : 0}%"></i><span>${w.lab}</span></div>`).join('');
    $('#fsTotal').textContent = total ? `${fmtDur(total)} this week` : 'No focus time yet this week';
  }
  function step() {
    credit(false);
    tLeft = Math.max(0, Math.round((tEnd - Date.now()) / 1000)); draw();
    if (tLeft === 0) {
      credit(true);
      clearInterval(tRun); tRun = null; $('#tStart').textContent = 'Start';
      $('#tState').textContent = isBrk ? 'Break over' : 'Nice work';
      if (!isBrk) addSession();
      chime(); tLeft = tLen; setTimeout(draw, 1500);
    }
  }
  $('#tStart').onclick = () => {
    if (tRun) { credit(true); clearInterval(tRun); tRun = null; $('#tStart').textContent = 'Resume'; $('#tState').textContent = 'Paused'; draw(); return; }
    tEnd = Date.now() + tLeft * 1000; tRun = setInterval(step, 250); lastTick = Date.now();
    $('#tStart').textContent = 'Pause'; $('#tState').textContent = isBrk ? 'On a break' : 'Focusing';
  };
  $('#tReset').onclick = () => { if (tRun) credit(true); clearInterval(tRun); tRun = null; tLeft = tLen; $('#tStart').textContent = 'Start'; $('#tState').textContent = 'Ready'; draw(); };
  function select(b) {
    $$('#timerSeg button').forEach(x => x.setAttribute('aria-pressed', x === b));
    isBrk = !!b.dataset.brk; tLen = +b.dataset.min * 60; $('#tReset').click();
  }
  $$('#timerSeg button').forEach(b => b.onclick = () => {
    if (b.dataset.kind === 'custom') { openCustom(); return; }
    $('#customForm').hidden = true; $('#customErr').hidden = true;
    select(b);
  });

  /* Custom length: type minutes ("45"), hours and minutes ("1:30"), or "1h 30m" */
  const CUSTOM = 'home-base-custom-timer';
  const fmtMin = m => m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` : `${m}`;
  function parseMinutes(v) {
    v = v.trim().toLowerCase(); let m = null, x;
    if ((x = /^(\d+):(\d{1,2})$/.exec(v))) m = +x[1] * 60 + +x[2];
    else if (/[hm]/.test(v) && /^\s*(\d+\s*h(ours?|rs?)?)?\s*(\d+\s*m(in(ute)?s?)?)?\s*$/.test(v)) { const hh = /(\d+)\s*h/.exec(v), mm = /(\d+)\s*m/.exec(v); m = (hh ? +hh[1] * 60 : 0) + (mm ? +mm[1] : 0); }
    else if (/^\d+(\.\d+)?$/.test(v)) m = Math.round(+v);
    return m && m >= 1 && m <= 600 ? m : null;
  }
  function openCustom() {
    const last = lsGet(CUSTOM);
    $('#customForm').hidden = false; $('#customErr').hidden = true;
    $('#customMin').value = last ? String(last) : '';
    setTimeout(() => { $('#customMin').focus(); $('#customMin').select(); }, 20);
  }
  function setCustomButton(m) { const b = $('#customBtn'); b.dataset.min = m; b.textContent = `Custom ${fmtMin(m)}`; }
  $('#customForm').addEventListener('submit', e => {
    e.preventDefault();
    const m = parseMinutes($('#customMin').value);
    if (!m) { $('#customErr').textContent = 'Enter a length between 1 minute and 10 hours, like 45 or 1:30.'; $('#customErr').hidden = false; return; }
    lsSet(CUSTOM, m); setCustomButton(m);
    $('#customForm').hidden = true; $('#customErr').hidden = true;
    select($('#customBtn'));
  });
  $('#customCancel').onclick = () => { $('#customForm').hidden = true; $('#customErr').hidden = true; };
  $('#customMin').addEventListener('keydown', e => { if (e.key === 'Escape') $('#customCancel').click(); });
  if (lsGet(CUSTOM)) setCustomButton(lsGet(CUSTOM));

  // Apply the lengths from Settings
  function applyLengths() {
    const t = HB.settings().timer;
    $$('#timerSeg button:not([data-kind="custom"])').forEach(b => { b.dataset.min = t[b.dataset.kind]; b.textContent = `${labels[b.dataset.kind]} ${t[b.dataset.kind]}`; });
    if (!tRun) { const on = document.querySelector('#timerSeg button[aria-pressed="true"]'); if (on) { tLen = +on.dataset.min * 60; if (tLeft > tLen || $('#tState').textContent === 'Ready') tLeft = tLen; draw(); } }
  }
  HB.onChange(applyLengths);
  HB.onChange(drawStats);
  setInterval(drawStats, 10 * 60 * 1000);   // roll over to a new day/week
  draw(); showSess();
})();
