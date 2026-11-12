/* Habits: things you want to keep doing (read, gym, drink water). Each habit is a row with
   this week's days as dots: tap a dot to check that day off (past days too, if you forgot).
   A habit can be every day, on certain days (Mon/Wed/Fri), or a few times a week, and can
   count an amount (8 glasses) instead of just done / not done. The flame shows your streak.
   Days you mark skipped (sick, traveling) don't break it. The chart button opens a habit's
   history: streaks, this month, the last 6 months, and a calendar to fix any day.
   Saved in HB.state.habits, and each checked-off day is its own entry in HB.state.habitLog
   (id "<habit id>|<date>"), so a phone and a laptop checking off different days at the same
   time both keep their check-offs when they sync. */
(function () {
  const { $, esc, uid, localISO, parseD } = HB;
  let sec = null, editing = null, adding = false;
  const habits = () => { if (!Array.isArray(HB.state.habits)) HB.state.habits = []; return HB.state.habits; };
  const log = () => { if (!Array.isArray(HB.state.habitLog)) HB.state.habitLog = []; return HB.state.habitLog; };
  const active = () => habits().filter(h => !h.archived);
  const opts = () => Object.assign({ weekStart: 0 }, HB.settings().habits);
  const today = () => localISO();

  /* ---------- Dates ---------- */
  const addDays = (iso, n) => { const d = parseD(iso); d.setDate(d.getDate() + n); return localISO(d); };
  const dow = iso => parseD(iso).getDay();
  const weekOf = iso => addDays(iso, -((dow(iso) - opts().weekStart + 7) % 7));
  const weekDays = start => Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const dayName = (iso, f) => parseD(iso).toLocaleDateString(undefined, { weekday: f || 'long' });
  const niceDay = iso => parseD(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  /* ---------- Check-offs ---------- */
  let index = null;   // "<habit id>|<date>" → log entry, rebuilt after each change
  const entries = () => { if (!index) index = new Map(log().map(e => [e.id, e])); return index; };
  HB.onChange(() => { index = null; });
  const entry = (h, iso) => entries().get(`${h.id}|${iso}`);
  const target = h => h.count > 1 ? h.count : 1;
  const amount = (h, iso) => { const e = entry(h, iso); return !e || e.skip ? 0 : (e.n || 1); };
  const isDone = (h, iso) => amount(h, iso) >= target(h);
  const isSkip = (h, iso) => { const e = entry(h, iso); return !!(e && e.skip); };
  const scheduled = (h, iso) => h.goal !== 'days' || (h.days || []).includes(dow(iso));
  function setEntry(h, iso, e) {
    const id = `${h.id}|${iso}`, i = log().findIndex(x => x.id === id);
    if (i >= 0) log().splice(i, 1);
    if (e) log().push(Object.assign({ id }, e));
    index = null;
  }
  // The first day that counts: when you added the habit, or an earlier day you checked off
  function startOf(h) {
    let s = h.created || today();
    log().forEach(e => { if (e.id.startsWith(h.id + '|')) { const d = e.id.slice(h.id.length + 1); if (d < s) s = d; } });
    return s;
  }

  /* ---------- Streaks ---------- */
  /* Every day (or week, for "3 times a week") from the start until now, marked met, missed,
     pass (skipped, not one of its days, or a partial first week) or open (today / this week,
     still to do). The streak counts met ones back from now; a pass never breaks it. */
  function periods(h) {
    const t = today(), out = [], start = startOf(h);
    if (h.goal === 'weekly') {
      for (let w = weekOf(start); w <= t; w = addDays(w, 7)) {
        const days = weekDays(w).filter(d => d <= t);
        const done = days.filter(d => d >= start && isDone(h, d)).length;
        out.push({ key: w, s: done >= (h.times || 1) ? 'met' : w === weekOf(t) ? 'open' : (w < start || days.some(d => isSkip(h, d))) ? 'pass' : 'miss' });
      }
    } else {
      for (let d = start; d <= t; d = addDays(d, 1))
        out.push({ key: d, s: isDone(h, d) ? 'met' : isSkip(h, d) || !scheduled(h, d) ? 'pass' : d === t ? 'open' : 'miss' });
    }
    return out;
  }
  function streak(h) {
    const p = periods(h);
    let cur = 0, best = 0, run = 0, i = p.length - 1;
    while (i >= 0 && p[i].s === 'open') i--;
    for (; i >= 0 && p[i].s !== 'miss'; i--) if (p[i].s === 'met') cur++;
    p.forEach(x => { if (x.s === 'met') best = Math.max(best, ++run); else if (x.s === 'miss') run = 0; });
    return { cur, best, unit: h.goal === 'weekly' ? 'week' : 'day' };
  }
  const MILESTONES = { day: [7, 14, 21, 30, 50, 75, 100, 150, 200, 250, 300, 365, 500, 730, 1000], week: [4, 8, 12, 26, 52, 78, 104] };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const weekCount = (h, iso) => weekDays(weekOf(iso)).filter(d => isDone(h, d)).length;
  // Due today: an every-day habit, one of a habit's days, or a weekly habit you've already done today
  const dueToday = h => h.goal === 'weekly' ? isDone(h, today()) : scheduled(h, today()) && !isSkip(h, today());

  /* ---------- Colors ---------- */
  const COLORS = ['Green', 'Teal', 'Sky', 'Indigo', 'Purple', 'Magenta', 'Pink', 'Red', 'Coral', 'Orange', 'Amber', 'Lime', 'Cyan', 'Brown', 'Slate', 'Charcoal'];
  const colorOf = h => (HB.paletteColor && HB.paletteColor(h.color)) || 'var(--good)';
  const nextColor = () => { const used = new Set(habits().map(h => h.color)); return COLORS.find(c => !used.has(c)) || COLORS[habits().length % COLORS.length]; };

  /* ---------- Text ---------- */
  function goalText(h) {
    const amt = h.count > 1 ? `${h.count}${h.unit ? ' ' + h.unit : ''} ` : '';
    if (h.goal === 'weekly') return `${amt ? amt + 'on ' : ''}${h.times || 1}× a week`;
    if (h.goal === 'days') {
      const ds = (h.days || []).slice().sort((a, b) => ((a - opts().weekStart + 7) % 7) - ((b - opts().weekStart + 7) % 7));
      const names = ds.map(d => new Date(2026, 0, 4 + d).toLocaleDateString(undefined, { weekday: 'short' }));
      return `${amt}${amt ? 'on ' : ''}${names.join(', ') || 'No days picked'}`;
    }
    return amt ? `${amt}a day` : 'Every day';
  }

  /* ---------- Icons ---------- */
  const svg = (p, s = 13, w = 2.2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const pen = svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>');
  const chart = svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>');
  const check = svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', 14, 3);
  const flame = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2c.5 3.2 2.3 5 4 6.9 1.6 1.8 3 3.8 3 6.6A7 7 0 0 1 12 22a7 7 0 0 1-7-6.5c0-2.4 1-4.2 2.6-5.6.2 1.7.9 3 2.2 3.6C9.4 9.6 10.4 5.4 12 2z"/></svg>';

  /* ---------- One day's dot (the week strip and the history calendar) ---------- */
  function dotHtml(h, iso, label) {
    const t = today(), fut = iso > t, a = amount(h, iso), n = target(h), done = a >= n, skip = isSkip(h, iso);
    const cls = ['hb-dot', done && 'done', !done && a > 0 && 'part', skip && 'skip', !scheduled(h, iso) && 'off', iso === t && 'today'].filter(Boolean).join(' ');
    const state = skip ? 'skipped' : done ? 'done' : a ? `${a} of ${n}` : 'not done';
    const inner = label != null ? `<span>${label}</span>` : done ? check : skip ? '<i></i>' : a ? `<span>${a}</span>` : '';
    return `<button type="button" class="${cls}" data-hbday="${h.id}|${iso}"${fut ? ' disabled' : ''} style="--p:${Math.round(a / n * 100)}%"
      aria-label="${esc(h.name)}, ${esc(niceDay(iso))}: ${state}" aria-pressed="${done}" title="${esc(niceDay(iso))}${fut ? '' : ': ' + state}">${inner}</button>`;
  }

  /* ---------- The widget ---------- */
  const btns = h => `<button type="button" class="del edit" data-hbhist="${h.id}" aria-label="History for ${esc(h.name)}" title="History">${chart}</button>`
    + `<button type="button" class="del edit" data-hbedit="${h.id}" aria-label="Edit ${esc(h.name)}" title="Edit">${pen}</button>`;
  function rowHtml(h, week) {
    if (h.id === editing) return formHtml(h);
    const s = streak(h), t = today(), hit = s.cur && MILESTONES[s.unit].includes(s.cur) && (h.goal === 'weekly' ? weekCount(h, t) >= (h.times || 1) : isDone(h, t));
    const st = s.cur ? `<span class="hb-streak${hit ? ' hit' : ''}" title="${plural(s.cur, s.unit)} in a row (best: ${plural(s.best, s.unit)})">${flame}${s.cur}${s.unit === 'week' ? ' wk' : ''}</span>` : '';
    const wk = h.goal === 'weekly' ? `<span class="hb-wk${weekCount(h, t) >= (h.times || 1) ? ' met' : ''}">${weekCount(h, t)}/${h.times || 1} this week</span>` : '';
    return `<li class="hb-row" data-id="${h.id}" style="--hc:${colorOf(h)}">
      <div class="hb-txt">
        <div class="hb-name"><span class="hb-nm" title="${esc(h.name)}">${esc(h.name)}</span>${btns(h)}</div>
        <small>${[st, wk || esc(goalText(h))].filter(Boolean).join('<span class="hb-sep">·</span>')}</small>
      </div>
      <div class="hb-week">${week.map(d => dotHtml(h, d)).join('')}</div>
    </li>`;
  }
  function formHtml(h) {
    const x = h || { goal: 'daily', days: [1, 3, 5], times: 3, color: nextColor() };
    const ws = opts().weekStart, order = Array.from({ length: 7 }, (_, i) => (ws + i) % 7);
    const dayBtns = order.map(d => `<button type="button" data-hbpickday="${d}" aria-pressed="${(x.days || []).includes(d)}" title="${new Date(2026, 0, 4 + d).toLocaleDateString(undefined, { weekday: 'long' })}">${new Date(2026, 0, 4 + d).toLocaleDateString(undefined, { weekday: 'narrow' })}</button>`).join('');
    const goals = [['daily', 'Every day'], ['days', 'Some days'], ['weekly', 'Times a week']];
    return `<li class="hb-form-li"><form class="hb-form" data-hbform="${h ? h.id : ''}" data-goal="${x.goal}" data-color="${esc(x.color)}" data-amt="${x.count > 1 ? 1 : ''}">
      <input class="dl-in" name="title" value="${h ? esc(h.name) : ''}" placeholder="New habit (e.g. Read, Gym, Drink water)" aria-label="Habit name" maxlength="60" required>
      <div class="hb-f-row"><span class="hb-lbl">How often</span><div class="seg" role="group" aria-label="How often">${goals.map(([k, t]) => `<button type="button" data-hbgoal="${k}" aria-pressed="${x.goal === k}">${t}</button>`).join('')}</div></div>
      <div class="hb-f-row hb-only-days"><span class="hb-lbl">On</span><div class="hb-days" role="group" aria-label="Days">${dayBtns}</div></div>
      <div class="hb-f-row hb-only-weekly"><span class="hb-lbl">Goal</span><label class="hb-inline"><input class="dl-in hb-num" name="times" type="number" min="1" max="7" value="${x.times || 3}" aria-label="Times a week"> times a week</label></div>
      <div class="hb-f-row"><span class="hb-lbl">Amount</span><div class="seg" role="group" aria-label="Count an amount"><button type="button" data-hbamt="" aria-pressed="${!(x.count > 1)}">Just done</button><button type="button" data-hbamt="1" aria-pressed="${x.count > 1}">Count it</button></div></div>
      <div class="hb-f-row hb-only-amt"><span class="hb-lbl">Each day</span><label class="hb-inline"><input class="dl-in hb-num" name="count" type="number" min="2" max="999" value="${x.count > 1 ? x.count : 8}" aria-label="Amount each day"><input class="dl-in" name="unit" value="${esc(x.unit || '')}" placeholder="glasses, pages…" aria-label="Unit (optional)" maxlength="20"></label></div>
      <div class="hb-f-row"><span class="hb-lbl">Color</span><div class="hb-colors" role="radiogroup" aria-label="Color">${COLORS.map(c => `<button type="button" role="radio" data-hbcolor="${c}" style="--hc:${HB.paletteColor ? HB.paletteColor(c) : ''}" aria-checked="${x.color === c}" title="${c}" aria-label="${c}"></button>`).join('')}</div></div>
      <small class="dc-err" data-hberr></small>
      <div class="hb-f-btns">${h ? '<span><button type="button" class="btn sec" data-hbarchive>Archive</button> <button type="button" class="btn sec ev-del" data-hbdel>Delete</button></span>' : '<span></span>'}<span><button type="button" class="btn sec" data-hbcancel>Cancel</button> <button type="submit" class="btn">${h ? 'Save' : 'Add'}</button></span></div>
    </form></li>`;
  }

  function draw(force) {
    const body = sec && sec.querySelector('.hb-body'); if (!body) return;
    // Don't redraw while you're typing in the form (unless you just pressed Cancel, Add or Edit)
    if (!force && body.contains(document.activeElement) && document.activeElement.closest('.hb-form')) return;
    const t = today(), week = weekDays(weekOf(t)), hs = active();
    const due = hs.filter(dueToday), allDone = due.length > 0 && due.every(h => isDone(h, t));
    const head = hs.length ? `<div class="hb-head" aria-hidden="true"><span class="hb-allday">${allDone ? `${check}All done today` : ''}</span><div class="hb-week">${week.map(d => `<span class="${d === t ? 'today' : ''}">${dayName(d, 'narrow')}</span>`).join('')}</div></div>` : '';
    body.innerHTML = head
      + `<ul class="hb-list">${hs.map(h => rowHtml(h, week)).join('')}${adding ? formHtml(null) : ''}</ul>`
      + (!hs.length && !adding ? '<p class="dc-empty">Track the things you want to do regularly, like reading, the gym or drinking water. Click "+ Add".</p>' : '');
    const f = body.querySelector('.hb-form [name=title]'); if (f && (adding || editing) && !f.value) f.focus();
    if (dlg && dlg.classList.contains('on')) drawHistory();
  }

  /* Tap a day: check it off (or take the check back). A habit that counts goes up by one each
     tap; tapping a full day clears it, with Undo. A skipped day goes back to empty. */
  function tapDay(key, mode) {
    const i = key.lastIndexOf('|'), h = habits().find(x => x.id === key.slice(0, i)), iso = key.slice(i + 1);
    if (!h || iso > today()) return;
    const before = streak(h).cur, e = entry(h, iso), prev = e && Object.assign({}, e);
    if (mode === 'skip') setEntry(h, iso, e && e.skip ? null : { skip: 1 });
    else if (e && e.skip) setEntry(h, iso, null);
    else if (target(h) === 1) setEntry(h, iso, e ? null : {});
    else if (amount(h, iso) >= target(h)) {
      setEntry(h, iso, null); HB.commit();
      HB.undoable(`Cleared ${h.name} for ${niceDay(iso)}`, () => { setEntry(h, iso, prev); HB.commit(); });
      return;
    } else setEntry(h, iso, { n: amount(h, iso) + 1 });
    HB.commit();
    celebrate(h, before);
  }
  function celebrate(h, before) {
    const s = streak(h), t = today();
    if (s.cur > before && MILESTONES[s.unit].includes(s.cur)) { HB.toast(`${plural(s.cur, s.unit)} in a row: ${h.name}!`, 3500); return; }
    const due = active().filter(dueToday);
    if (isDone(h, t) && due.includes(h) && due.every(x => isDone(x, t)) && due.length > 1) HB.toast('All your habits are done for today!', 3000);
  }

  function remove(h, archive) {
    const hs = habits(), i = hs.indexOf(h); if (i < 0) return;
    if (editing === h.id) { editing = null; document.activeElement && document.activeElement.blur(); }
    if (archive) {
      h.archived = today(); HB.commit();
      HB.undoable(`Archived "${h.name}". Find it in Settings → Habits.`, () => { delete h.archived; HB.commit(); });
      return;
    }
    const mine = log().filter(e => e.id.startsWith(h.id + '|'));
    hs.splice(i, 1); HB.state.habitLog = log().filter(e => !mine.includes(e)); HB.commit();
    HB.undoable(`Deleted "${h.name}"`, () => { habits().splice(Math.min(i, habits().length), 0, h); log().push(...mine); HB.commit(); });
  }
  HB.habitRemove = remove;   // for Settings → Habits

  function submit(f) {
    const name = f.querySelector('[name=title]').value.trim(); if (!name) return;
    const goal = f.dataset.goal, err = f.querySelector('[data-hberr]');
    const days = [...f.querySelectorAll('[data-hbpickday][aria-pressed=true]')].map(b => +b.dataset.hbpickday);
    const times = Math.max(1, Math.min(7, Math.round(+f.querySelector('[name=times]').value || 1)));
    const count = f.dataset.amt ? Math.max(2, Math.min(999, Math.round(+f.querySelector('[name=count]').value || 2))) : 0;
    if (goal === 'days' && !days.length) { err.textContent = 'Pick at least one day.'; return; }
    const fields = { name, goal, color: f.dataset.color, days: goal === 'days' ? days : undefined, times: goal === 'weekly' ? times : undefined, count: count || undefined, unit: count ? f.querySelector('[name=unit]').value.trim() || undefined : undefined };
    const h = f.dataset.hbform && habits().find(x => x.id === f.dataset.hbform);
    if (h) { Object.keys(fields).forEach(k => { if (fields[k] === undefined) delete h[k]; else h[k] = fields[k]; }); }
    else habits().push(Object.assign({ id: uid(), created: today() }, JSON.parse(JSON.stringify(fields))));
    adding = false; editing = null; document.activeElement && document.activeElement.blur(); HB.commit();
  }

  // The form's buttons (how often, days, amount, color) change it in place, without a redraw
  function formClick(t, f) {
    const g = t.closest('[data-hbgoal]');
    if (g) { f.dataset.goal = g.dataset.hbgoal; f.querySelectorAll('[data-hbgoal]').forEach(b => b.setAttribute('aria-pressed', String(b === g))); return true; }
    const d = t.closest('[data-hbpickday]');
    if (d) { d.setAttribute('aria-pressed', String(d.getAttribute('aria-pressed') !== 'true')); f.querySelector('[data-hberr]').textContent = ''; return true; }
    const a = t.closest('[data-hbamt]');
    if (a) { f.dataset.amt = a.dataset.hbamt; f.querySelectorAll('[data-hbamt]').forEach(b => b.setAttribute('aria-pressed', String(b === a))); if (a.dataset.hbamt) f.querySelector('[name=count]').focus(); return true; }
    const c = t.closest('[data-hbcolor]');
    if (c) { f.dataset.color = c.dataset.hbcolor; f.querySelectorAll('[data-hbcolor]').forEach(b => b.setAttribute('aria-checked', String(b === c))); return true; }
    return false;
  }

  /* ---------- History window ---------- */
  let dlg = null, histId = null, histMonth = null, histMode = 'check', lastFocus = null;
  function buildDialog() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="g-scrim" id="hbmScrim"></div>
      <div class="evm hbm" id="hbm" role="dialog" aria-modal="true" aria-labelledby="hbmTitle" inert>
        <div class="g-h"><h2 id="hbmTitle">History</h2><button class="icon-btn g-x" id="hbmClose" type="button" aria-label="Close">&times;</button></div>
        <div class="evm-b" id="hbmBody"></div>
      </div>`;
    document.body.append(...wrap.children);
    dlg = $('#hbm');
    $('#hbmClose').onclick = closeHistory; $('#hbmScrim').onclick = closeHistory;
    window.addEventListener('keydown', e => { if (dlg.classList.contains('on') && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeHistory(); } }, true);
    $('#hbmBody').addEventListener('click', e => {
      const t = e.target, day = t.closest('[data-hbday]');
      if (day) { tapDay(day.dataset.hbday, histMode); return; }
      const m = t.closest('[data-hbmonth]');
      if (m) { const d = parseD(histMonth); d.setMonth(d.getMonth() + +m.dataset.hbmonth); histMonth = localISO(d); drawHistory(); return; }
      const md = t.closest('[data-hbmode]');
      if (md) { histMode = md.dataset.hbmode; drawHistory(); return; }
      if (t.closest('[data-hbhedit]')) { const id = histId; closeHistory(); editing = id; adding = false; draw(true); const i = sec.querySelector('.hb-form [name=title]'); i && (i.focus(), i.select()); }
    });
  }
  function openHistory(id) {
    if (!dlg) buildDialog();
    histId = id; histMode = 'check'; histMonth = today().slice(0, 8) + '01'; lastFocus = document.activeElement;
    drawHistory();
    dlg.inert = false; dlg.classList.add('on'); $('#hbmScrim').classList.add('on');
    setTimeout(() => $('#hbmClose').focus(), 60);
  }
  function closeHistory() {
    if (!dlg || !dlg.classList.contains('on')) return;
    dlg.classList.remove('on'); $('#hbmScrim').classList.remove('on'); dlg.inert = true; histId = null;
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  function drawHistory() {
    const h = habits().find(x => x.id === histId); if (!h) { closeHistory(); return; }
    const t = today(), s = streak(h), start = startOf(h);
    $('#hbmTitle').textContent = h.name;
    dlg.style.setProperty('--hc', colorOf(h));
    // This month: how many of its days so far you did (or check-offs, for times-a-week habits)
    const mStart = t.slice(0, 8) + '01';
    const mDays = []; for (let d = mStart < start ? start : mStart; d <= t; d = addDays(d, 1)) mDays.push(d);
    const doneM = mDays.filter(d => isDone(h, d)).length;
    const counted = mDays.filter(d => scheduled(h, d) && !isSkip(h, d) && (d < t || isDone(h, d))).length;
    const month = h.goal === 'weekly' ? `${doneM}` : counted ? `${Math.round(doneM / counted * 100)}%` : '–';
    const total = log().filter(e => e.id.startsWith(h.id + '|') && !e.skip && (e.n || 1) >= target(h)).length;
    const tile = (v, l) => `<div class="hbm-stat"><b class="mono">${v}</b><small>${l}</small></div>`;
    const stats = `<div class="hbm-stats">${tile(s.cur, `${s.unit === 'week' ? 'Week' : 'Day'} streak`)}${tile(s.best, 'Best streak')}${tile(month, h.goal === 'weekly' ? 'Times this month' : 'This month')}${tile(total, 'Total')}</div>`;

    // Last 6 months, one column per week
    const cols = 26, first = addDays(weekOf(t), -7 * (cols - 1));
    let grid = '', months = '', lastLabel = -9;
    for (let c = 0; c < cols; c++) {
      const w = addDays(first, 7 * c), days = weekDays(w);
      const m1 = days.find(d => d.endsWith('-01'));   // a month name over the week it starts (if there's room)
      const label = m1 && c - lastLabel > 2 ? parseD(m1).toLocaleDateString(undefined, { month: 'short' }) : '';
      if (label) lastLabel = c;
      months += `<span>${label}</span>`;
      grid += days.map(d => {
        const a = amount(h, d), cls = d > t || d < start ? 'none' : isDone(h, d) ? 'done' : isSkip(h, d) ? 'skip' : a ? 'part' : !scheduled(h, d) ? 'off' : 'miss';
        return `<i class="${cls}" style="--p:${Math.round(a / target(h) * 100)}%" title="${esc(niceDay(d))}${d > t ? '' : ': ' + ({ done: 'done', skip: 'skipped', part: `${a} of ${target(h)}`, off: 'not one of its days', miss: 'not done', none: '' })[cls]}"></i>`;
      }).join('');
    }
    const heat = `<div class="hbm-sec"><div class="hbm-h">Last 6 months</div><div class="hbm-heat-wrap"><div class="hbm-months" style="--cols:${cols}">${months}</div><div class="hbm-heat" style="--cols:${cols}" role="img" aria-label="Check-offs for the last 6 months">${grid}</div></div></div>`;

    // A month calendar to fix any day
    const m0 = parseD(histMonth), lead = (m0.getDay() - opts().weekStart + 7) % 7, dim = new Date(m0.getFullYear(), m0.getMonth() + 1, 0).getDate();
    const heads = weekDays(weekOf(t)).map(d => `<span>${dayName(d, 'narrow')}</span>`).join('');
    let cells = '<span></span>'.repeat(lead);
    for (let i = 1; i <= dim; i++) cells += dotHtml(h, histMonth.slice(0, 8) + String(i).padStart(2, '0'), i);
    const atNow = histMonth.slice(0, 7) >= t.slice(0, 7);
    const cal = `<div class="hbm-sec"><div class="hbm-calbar">
        <button type="button" class="icon-btn hbm-nav" data-hbmonth="-1" aria-label="Previous month">‹</button>
        <b>${m0.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b>
        <button type="button" class="icon-btn hbm-nav" data-hbmonth="1" aria-label="Next month"${atNow ? ' disabled' : ''}>›</button>
      </div>
      <div class="hbm-mode"><span>Tapping a day</span><div class="seg" role="group" aria-label="Tapping a day"><button type="button" data-hbmode="check" aria-pressed="${histMode === 'check'}">${target(h) > 1 ? 'Adds one' : 'Checks it off'}</button><button type="button" data-hbmode="skip" aria-pressed="${histMode === 'skip'}">Marks it skipped</button></div></div>
      <div class="hbm-cal"><div class="hbm-cal-h">${heads}</div><div class="hbm-cal-g">${cells}</div></div>
      <small class="hbm-note">Skipped days (sick, traveling) don't break your streak or count against you.</small></div>`;
    $('#hbmBody').innerHTML = `<p class="hbm-goal">${esc(goalText(h))} · since ${esc(parseD(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))} <button type="button" class="ghost hbm-edit" data-hbhedit>${pen} Edit</button></p>` + stats + heat + cal;
    const hw = $('#hbmBody .hbm-heat-wrap'); if (hw) hw.scrollLeft = hw.scrollWidth;
  }

  /* ---------- Settings → Habits ---------- */
  function drawSettings() {
    const ws = $('#hbWeekStart'), box = $('#hbArchived'); if (!ws || !box) return;
    ws.querySelectorAll('[data-ws]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.ws === opts().weekStart)));
    const arch = habits().filter(h => h.archived);
    box.innerHTML = arch.length ? arch.map(h => `<div class="hb-arow" style="--hc:${colorOf(h)}"><span><i class="hb-swatch"></i>${esc(h.name)}</span><small>Archived ${esc(parseD(h.archived).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))}</small>
      <button type="button" class="btn sec" data-hbrestore="${h.id}">Restore</button><button class="del" data-hbsetdel="${h.id}" aria-label="Delete ${esc(h.name)}" title="Delete">&times;</button></div>`).join('')
      : '<small>None. Archiving a habit (from its pencil) hides it but keeps its history.</small>';
  }
  function initSettings() {
    const ws = $('#hbWeekStart'), box = $('#hbArchived'); if (!ws || !box) return;
    ws.addEventListener('click', e => { const b = e.target.closest('[data-ws]'); if (b) { HB.state.settings.habits = Object.assign({}, HB.settings().habits, { weekStart: +b.dataset.ws }); HB.commit(); } });
    box.addEventListener('click', e => {
      const r = e.target.closest('[data-hbrestore]'), d = e.target.closest('[data-hbsetdel]'); if (!r && !d) return;
      const h = habits().find(x => x.id === (r ? r.dataset.hbrestore : d.dataset.hbsetdel)); if (!h) return;
      if (r) { delete h.archived; HB.commit(); HB.toast(`"${h.name}" is back on your dashboard`); }
      else remove(h);
    });
    drawSettings();
  }

  HB.registerWidget({
    id: 'habits', name: 'Habits', size: 's',
    desc: 'Check off your habits each day, with streaks, weekly goals and a history of every day.',
    icon: '<rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="m7.5 12 2.5 2.5 6-6"/><path d="M8 18h8"/>',
    render(section) {
      sec = section;
      sec.innerHTML = `<div class="card-h"><h2>Habits</h2><button type="button" class="ghost" data-hbadd>+ Add</button></div><div class="hb-body"></div>`;
      sec.addEventListener('click', e => {
        const t = e.target, f = t.closest('.hb-form');
        if (f && formClick(t, f)) return;
        if (t.closest('[data-hbadd]')) { adding = true; editing = null; draw(true); sec.querySelector('.hb-form [name=title]').focus(); return; }
        if (t.closest('[data-hbcancel]')) { adding = false; editing = null; draw(true); return; }
        if (t.closest('[data-hbarchive]') || t.closest('[data-hbdel]')) { const h = habits().find(x => x.id === f.dataset.hbform); h && remove(h, !!t.closest('[data-hbarchive]')); return; }
        const ed = t.closest('[data-hbedit]');
        if (ed) { editing = ed.dataset.hbedit; adding = false; draw(true); const i = sec.querySelector('.hb-form [name=title]'); i && (i.focus(), i.select()); return; }
        const hi = t.closest('[data-hbhist]'); if (hi) { openHistory(hi.dataset.hbhist); return; }
        const day = t.closest('[data-hbday]'); if (day) tapDay(day.dataset.hbday);
      });
      sec.addEventListener('submit', e => { const f = e.target.closest('[data-hbform]'); if (!f) return; e.preventDefault(); submit(f); });
      sec.addEventListener('keydown', e => { if (e.key === 'Escape' && (adding || editing)) { adding = false; editing = null; document.activeElement.blur(); draw(true); } });
      draw();
      // Roll over at midnight
      let day = today(); setInterval(() => { if (today() !== day) { day = today(); draw(); } }, 60 * 1000);
    }
  });
  HB.onChange(() => { draw(); drawSettings(); });
  initSettings();
})();
