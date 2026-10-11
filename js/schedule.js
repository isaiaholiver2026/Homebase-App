/* Schedules: weekly time blocks you type in once (a class schedule, work shifts, practice…)
   that show on the Calendar widget. Create one from Settings → Schedules → Create schedule,
   or from the Calendar widget. Each schedule can have dates it runs between (like a semester)
   and days off (like a break), and can be hidden from the calendar without deleting it.
   Saved in HB.state.schedules, so it syncs and backs up with everything else. */
(function () {
  const { $, esc, uid, localISO, parseD } = HB;
  const DAYS = [1, 2, 3, 4, 5, 6, 0];                       // Mon…Sun order for the day buttons
  const dayName = (d, opt) => new Date(2026, 1, 1 + d).toLocaleDateString(undefined, { weekday: opt || 'short' });   // Feb 1 2026 = Sun
  // Colors for blocks (skips the blue used by deadlines and the green used by repeating tasks)
  const HUES = [265, 330, 20, 42, 185, 300, 0, 85];   // colors from before Oct 11 (it.hue); still understood
  // Colors for time blocks: [name, light-mode color, dark-mode color], clear of the blue used for
  // deadlines. it.color is one of these names, or '#rrggbb' picked with "Custom".
  const PALETTE = [
    ['Red', '#D9433B', '#F0736B'], ['Coral', '#E5603F', '#F28D74'], ['Orange', '#DD7A16', '#F2A05A'], ['Amber', '#C29104', '#E8C04A'],
    ['Lime', '#78A01A', '#A8CB52'], ['Green', '#2E9E5B', '#5CC88A'], ['Teal', '#14968A', '#4CC7B8'], ['Cyan', '#1592AF', '#5AC6DE'],
    ['Sky', '#3B8FD9', '#74B4EE'], ['Indigo', '#5B5FD6', '#8E91F0'], ['Purple', '#8A4FD1', '#B188EC'], ['Magenta', '#C2409E', '#E07AC4'],
    ['Pink', '#DB5486', '#F08CB0'], ['Brown', '#94683F', '#C49A70'], ['Slate', '#5E7487', '#93A6B6'], ['Charcoal', '#3F4650', '#A3ACB7']
  ];
  const colorOf = key => {
    const p = PALETTE.find(x => x[0] === key);
    return p ? `light-dark(${p[1]}, ${p[2]})` : /^#[0-9a-f]{6}$/i.test(key || '') ? key : null;
  };
  // The CSS color for a time block (use as style="--sc:…")
  HB.schedColor = it => (it && it.color && colorOf(it.color)) || `hsl(${it && it.hue != null ? it.hue : HUES[0]} 58% 55%)`;
  const short = t => (t ? HB.fmtTime(t) : '').replace(/:00(?=\s?[AP]M)/i, '').replace(/\s?([AP])M/i, (_, x) => x.toLowerCase());
  const list = () => { if (!Array.isArray(HB.state.schedules)) HB.state.schedules = []; return HB.state.schedules; };

  /* ---------- What's on a given day (used by the Calendar) ---------- */
  function runsOn(s, iso) {
    if (s.hidden) return false;
    if (s.start && iso < s.start) return false;
    if (s.end && iso > s.end) return false;
    return !(s.off || []).some(o => o.from && iso >= o.from && iso <= (o.to || o.from));
  }
  HB.scheduleOn = iso => {
    const dow = parseD(iso).getDay(), out = [];
    list().forEach(s => {
      if (!runsOn(s, iso)) return;
      (s.items || []).forEach(it => {
        if (!(it.days || []).includes(dow) || !it.start) return;
        if (!it.id) it.id = uid();
        // Changes for just this day (Cancel this day, a different room, a note…): s.ex['<block id>|<date>']
        const ex = (s.ex || {})[it.id + '|' + iso] || {};
        out.push({ title: ex.title || it.title, start: ex.start || it.start, end: 'end' in ex ? ex.end : it.end, where: 'where' in ex ? ex.where : (it.where || ''),
          hue: it.hue == null ? HUES[0] : it.hue, color: HB.schedColor(it), schedule: s.name,
          ref: `${s.id}|${it.id}|${iso}`, cancelled: !!ex.cancelled, done: !!ex.done, note: ex.note || '',
          changed: !!(ex.title || ex.start || 'end' in ex || 'where' in ex) });
      });
    });
    return out.sort((a, b) => a.start.localeCompare(b.start));
  };
  HB.hasSchedules = () => list().some(s => !s.hidden && (s.items || []).length);

  /* ---------- Settings → Schedules list ---------- */
  const daysText = days => {
    const d = [...days].sort((a, b) => DAYS.indexOf(a) - DAYS.indexOf(b));
    if (d.join() === '1,2,3,4,5') return 'Weekdays';
    if (d.length === 7) return 'Every day';
    return d.map(x => dayName(x)).join(', ');
  };
  const rangeText = s => {
    const f = iso => parseD(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return s.start && s.end ? `${f(s.start)} – ${f(s.end)}` : s.start ? `From ${f(s.start)}` : s.end ? `Until ${f(s.end)}` : 'Every week, no end date';
  };
  function drawSettings() {
    const box = $('#schedList'); if (!box) return;
    const ss = list();
    box.innerHTML = ss.length ? ss.map(s => `<div class="sch-row">
        <span class="sch-sw">${(s.items || []).slice(0, 4).map(it => `<i style="--sc:${HB.schedColor(it)}"></i>`).join('')}</span>
        <span class="sch-txt"><b>${esc(s.name)}</b><small>${(s.items || []).length} time block${(s.items || []).length === 1 ? '' : 's'} · ${esc(rangeText(s))}</small></span>
        <label class="sch-show" title="Show on the calendar"><input type="checkbox" data-schshow="${s.id}"${s.hidden ? '' : ' checked'}> Show</label>
        <button type="button" class="btn sec" data-schedit="${s.id}">Edit</button>
      </div>`).join('') : '<small>No schedules yet. Make one for your classes, work shifts, practices, or anything that happens at the same times each week.</small>';
  }
  document.addEventListener('click', e => {
    const ed = e.target.closest('[data-schedit]'); if (ed) { open(ed.dataset.schedit); return; }
    if (e.target.closest('[data-schnew]')) open(null);
  });
  document.addEventListener('change', e => {
    const c = e.target.closest('[data-schshow]'); if (!c) return;
    const s = list().find(x => x.id === c.dataset.schshow); if (!s) return;
    s.hidden = !c.checked; HB.commit();
  });

  /* ---------- The Create / Edit schedule window ---------- */
  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="g-scrim" id="sdScrim"></div>
    <div class="gallery sd" id="sdDlg" role="dialog" aria-modal="true" aria-labelledby="sdTitle" inert>
      <div class="g-h"><div><h2 id="sdTitle">Create schedule</h2><p>Add the things that happen at the same times each week. They'll show on your Calendar.</p></div>
        <button class="icon-btn g-x" id="sdClose" type="button" aria-label="Close">&times;</button></div>
      <form class="g-b sd-b" id="sdForm" novalidate></form>
    </div>`;
  document.body.append(...wrap.children);
  const dlg = $('#sdDlg'), scrim = $('#sdScrim'), form = $('#sdForm');
  let draft = null, editingId = null, lastFocus = null;

  // New blocks get a color not used yet in this schedule (or the shared one with "Same color for every block")
  const blank = () => {
    const items = draft ? draft.items : [], used = new Set(items.map(x => x.color));
    const color = draft && draft.oneColor && items[0] ? items[0].color : (PALETTE.find(p => !used.has(p[0])) || PALETTE[items.length % PALETTE.length])[0];
    return { id: uid(), title: '', days: [], start: '', end: '', where: '', color };
  };
  const prevHtml = it => `<b>${esc(short(it.start) || '9:30a')}</b>${esc(it.title || 'Name')}`;
  function itemHtml(it, i) {
    return `<div class="sd-item" data-i="${i}" style="--sc:${HB.schedColor(it)}">
      <div class="sd-row">
        <input class="set-in" data-f="title" value="${esc(it.title)}" placeholder="Name (e.g. Biology lecture, Shift, Practice)" aria-label="Name">
        <button type="button" class="del sd-del" data-rm="${i}" aria-label="Remove ${esc(it.title || 'this block')}" title="Remove">&times;</button>
      </div>
      <div class="sd-days" role="group" aria-label="Days">${DAYS.map(d => `<button type="button" data-day="${d}" aria-pressed="${it.days.includes(d)}" title="${dayName(d, 'long')}">${dayName(d).slice(0, 2)}</button>`).join('')}</div>
      <div class="sd-row sd-times">
        <label>From <input class="set-in" type="time" data-f="start" value="${esc(it.start)}"></label>
        <label>to <input class="set-in" type="time" data-f="end" value="${esc(it.end)}"></label>
        <input class="set-in sd-where" data-f="where" value="${esc(it.where)}" placeholder="Where (optional)" aria-label="Where">
      </div>
      <div class="sd-colors" role="radiogroup" aria-label="Color">${PALETTE.map(p => `<button type="button" role="radio" data-color="${p[0]}" style="--sc:${colorOf(p[0])}" aria-checked="${it.color === p[0]}" title="${p[0]}" aria-label="${p[0]}"></button>`).join('')}<label class="sd-custom${/^#/.test(it.color || '') ? ' on' : ''}" title="Custom color" style="--sc:${/^#/.test(it.color || '') ? it.color : 'transparent'}"><input type="color" data-customcolor value="${/^#/.test(it.color || '') ? it.color : '#7a5cff'}" aria-label="Custom color"></label><span class="sd-prev" aria-hidden="true">${prevHtml(it)}</span></div>
      <small class="sd-err" data-err></small>
    </div>`;
  }
  function render(focusLast) {
    form.innerHTML = `
      <div class="set-row"><label for="sdName">Schedule name</label>
        <input class="set-in" id="sdName" data-s="name" value="${esc(draft.name)}" placeholder="e.g. Fall classes, Work, Practice" autocomplete="off"></div>
      <div class="set-row"><span class="lbl">When it runs <small class="sd-opt">(optional)</small></span>
        <div class="sd-row sd-dates"><label>Starts <input class="set-in" type="date" data-s="start" value="${esc(draft.start)}"></label><label>Ends <input class="set-in" type="date" data-s="end" value="${esc(draft.end)}"></label></div>
        <small>Like the first and last day of the semester. Leave blank to repeat every week with no end.</small></div>
      <div class="set-row"><span class="lbl sd-blocks-h">Time blocks <label class="sd-one"><input type="checkbox" data-onecolor${draft.oneColor ? ' checked' : ''}> Same color for every block</label></span>
        <div class="sd-items">${draft.items.map(itemHtml).join('')}</div>
        <button type="button" class="btn sec sd-add" data-additem>+ Add a time block</button></div>
      <div class="set-row"><span class="lbl">Days off <small class="sd-opt">(optional)</small></span>
        <small>Dates the schedule takes a break, like a holiday or vacation.</small>
        <div class="sd-offs">${draft.off.map((o, i) => `<div class="sd-row sd-off" data-o="${i}">
          <input class="set-in" type="date" data-of="from" value="${esc(o.from)}" aria-label="First day off">
          <span>to</span><input class="set-in" type="date" data-of="to" value="${esc(o.to)}" aria-label="Last day off">
          <input class="set-in" data-of="label" value="${esc(o.label)}" placeholder="Label (e.g. Fall break)" aria-label="Label">
          <button type="button" class="del sd-del" data-rmoff="${i}" aria-label="Remove these days off">&times;</button></div>`).join('')}</div>
        <button type="button" class="btn sec sd-add" data-addoff>+ Add days off</button></div>
      <p class="sd-msg" id="sdMsg" role="alert"></p>
      <div class="sd-foot">
        ${editingId ? '<button type="button" class="btn sec sd-delete" data-delsched>Delete schedule</button>' : '<span></span>'}
        <div><button type="button" class="btn sec" data-cancel>Cancel</button> <button type="submit" class="btn">Save schedule</button></div>
      </div>`;
    if (focusLast) { const items = form.querySelectorAll('.sd-item'), last = items[items.length - 1]; last && last.querySelector('[data-f=title]').focus(); }
  }

  function open(id) {
    const s = id && list().find(x => x.id === id);
    editingId = s ? s.id : null;
    draft = s ? JSON.parse(JSON.stringify(s)) : { id: uid(), name: '', start: '', end: '', items: [], off: [] };
    draft.items = draft.items || []; draft.off = draft.off || [];
    if (!draft.items.length) draft.items.push(blank());
    $('#sdTitle').textContent = s ? 'Edit schedule' : 'Create schedule';
    lastFocus = document.activeElement;
    render();
    dlg.inert = false; dlg.classList.add('on'); scrim.classList.add('on');
    setTimeout(() => $('#sdName').focus(), 60);
  }
  HB.openSchedule = open;
  function close() {
    if (!dlg.classList.contains('on')) return;
    dlg.classList.remove('on'); scrim.classList.remove('on'); dlg.inert = true; draft = null;
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  $('#sdClose').onclick = close; scrim.onclick = close;
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && dlg.classList.contains('on')) { e.preventDefault(); close(); } });

  // Pick a color for a block (or every block with "Same color for every block")
  function setColor(i, color) {
    (draft.oneColor ? draft.items : [draft.items[i]]).forEach(x => { x.color = color; delete x.hue; });
    form.querySelectorAll('.sd-item').forEach(el => {
      const x = draft.items[+el.dataset.i]; if (!x) return;
      el.style.setProperty('--sc', HB.schedColor(x));
      el.querySelectorAll('[data-color]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.color === x.color)));
      const cu = el.querySelector('.sd-custom'), custom = /^#/.test(x.color || '');
      cu.classList.toggle('on', custom); cu.style.setProperty('--sc', custom ? x.color : 'transparent');
    });
  }
  // Typing updates the draft without redrawing (so the cursor stays put)
  form.addEventListener('input', e => {
    const t = e.target, it = t.closest('[data-i]'), off = t.closest('[data-o]');
    if (t.dataset.s) draft[t.dataset.s] = t.value;
    else if (it && t.dataset.f) { draft.items[+it.dataset.i][t.dataset.f] = t.value; const pv = it.querySelector('.sd-prev'); if (pv) pv.innerHTML = prevHtml(draft.items[+it.dataset.i]); }
    else if (it && t.matches('[data-customcolor]')) setColor(+it.dataset.i, t.value);
    else if (off && t.dataset.of) draft.off[+off.dataset.o][t.dataset.of] = t.value;
  });
  form.addEventListener('click', e => {
    const t = e.target, it = t.closest('[data-i]');
    const day = t.closest('[data-day]'), hue = t.closest('[data-hue]');
    if (day && it) {
      const x = draft.items[+it.dataset.i], d = +day.dataset.day, on = x.days.includes(d);
      x.days = on ? x.days.filter(y => y !== d) : [...x.days, d];
      day.setAttribute('aria-pressed', String(!on)); return;
    }
    const col = t.closest('[data-color]');
    if (col && it) { setColor(+it.dataset.i, col.dataset.color); return; }
    if (t.matches('[data-onecolor]')) {
      draft.oneColor = t.checked;
      if (t.checked && draft.items[0]) draft.items.forEach(x => { x.color = draft.items[0].color; delete x.hue; });
      if (!draft.oneColor) delete draft.oneColor;
      render(); return;
    }
    if (t.closest('[data-additem]')) {
      // New blocks copy the last one's days and times, since classes often share them
      const prev = draft.items[draft.items.length - 1], n = blank();
      if (prev) { n.days = [...prev.days]; }
      draft.items.push(n); render(true); return;
    }
    const rm = t.closest('[data-rm]'); if (rm) { draft.items.splice(+rm.dataset.rm, 1); render(); return; }
    if (t.closest('[data-addoff]')) { draft.off.push({ from: '', to: '', label: '' }); render(); const o = form.querySelectorAll('.sd-off'); o.length && o[o.length - 1].querySelector('input').focus(); return; }
    const ro = t.closest('[data-rmoff]'); if (ro) { draft.off.splice(+ro.dataset.rmoff, 1); render(); return; }
    if (t.closest('[data-cancel]')) { close(); return; }
    if (t.closest('[data-delsched]')) {
      const s = list().find(x => x.id === editingId); if (!s) return;
      const i = list().indexOf(s); list().splice(i, 1); HB.commit(); close();
      HB.toast(`Deleted "${s.name}"`, 6000, { label: 'Undo', fn: () => { list().splice(i, 0, s); HB.commit(); } });
    }
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const msg = $('#sdMsg'); msg.textContent = '';
    form.querySelectorAll('[data-err]').forEach(x => { x.textContent = ''; });
    form.querySelectorAll('.bad').forEach(x => x.classList.remove('bad'));
    const name = (draft.name || '').trim();
    if (!name) { $('#sdName').classList.add('bad'); msg.textContent = 'Give your schedule a name.'; $('#sdName').focus(); return; }
    // Drop completely empty blocks, check the rest
    const items = draft.items.filter(x => x.title.trim() || x.days.length || x.start || x.end);
    let bad = null;
    items.forEach(x => {
      const el = form.querySelector(`[data-i="${draft.items.indexOf(x)}"]`), err = [];
      if (!x.title.trim()) err.push('a name');
      if (!x.days.length) err.push('at least one day');
      if (!x.start) err.push('a start time');
      if (x.start && x.end && x.end <= x.start) err.push('an end time after the start');
      if (err.length) { el.querySelector('[data-err]').textContent = 'Add ' + err.join(', ') + '.'; bad = bad || el; }
    });
    if (bad) { msg.textContent = 'A time block needs a little more info.'; bad.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
    if (!items.length) { msg.textContent = 'Add at least one time block.'; return; }
    if (draft.start && draft.end && draft.end < draft.start) { msg.textContent = 'The end date is before the start date.'; return; }
    if (draft.ex) { Object.keys(draft.ex).forEach(k => { if (!items.some(it => k.startsWith(it.id + '|'))) delete draft.ex[k]; }); if (!Object.keys(draft.ex).length) delete draft.ex; }
    const s = Object.assign(draft, {
      name, items: items.map(x => Object.assign(x, { title: x.title.trim(), where: (x.where || '').trim() })),
      off: draft.off.filter(o => o.from).map(o => ({ from: o.from, to: o.to && o.to >= o.from ? o.to : o.from, label: (o.label || '').trim() }))
    });
    const i = list().findIndex(x => x.id === s.id);
    if (i >= 0) list()[i] = s; else list().push(s);
    HB.commit(); close();
    HB.toast(i >= 0 ? `Saved "${s.name}"` : `"${s.name}" is on your calendar`);
  });

  /* ---------- One day of a schedule (click a class on the Calendar) ----------
     Cancel just that day (it stays on the calendar, crossed out), change its room or time,
     add a note, or check it off. Saved in s.ex['<block id>|<date>'] = { cancelled?, done?,
     title?, start?, end?, where?, note? }; the weekly pattern itself never changes. */
  function findOcc(ref) {
    const [sid, iid, iso] = (ref || '').split('|');
    const s = list().find(x => x.id === sid), it = s && (s.items || []).find(y => y.id === iid);
    return s && it ? { s, it, iso, key: iid + '|' + iso } : null;
  }
  const exOf = o => Object.assign({}, (o.s.ex || {})[o.key]);
  function putEx(o, ex) {
    Object.keys(ex).forEach(k => { if (ex[k] === undefined || ex[k] === null || ex[k] === false) delete ex[k]; });
    o.s.ex = o.s.ex || {};
    if (Object.keys(ex).length) o.s.ex[o.key] = ex; else delete o.s.ex[o.key];
    if (!Object.keys(o.s.ex).length) delete o.s.ex;
  }
  const dayText = iso => parseD(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  // Change one thing about a day, with Undo
  function changeDay(ref, patch, msg) {
    const o = findOcc(ref); if (!o) return;
    const before = exOf(o);
    putEx(o, Object.assign(exOf(o), patch)); HB.commit();
    if (msg) HB.undoable(msg, () => { const p = findOcc(ref); if (p) { putEx(p, before); HB.commit(); } });
  }
  HB.scheduleDayDone = (ref, done) => { const o = findOcc(ref); if (o) changeDay(ref, { done: done || undefined }, done ? `Marked ${o.it.title} on ${dayText(o.iso)} done` : ''); };
  HB.scheduleDayCancel = (ref, on) => { const o = findOcc(ref); if (o) changeDay(ref, { cancelled: on || undefined }, on ? `Cancelled ${o.it.title} on ${dayText(o.iso)}` : `${o.it.title} on ${dayText(o.iso)} is back on`); };

  const dwrap = document.createElement('div');
  dwrap.innerHTML = `<div class="g-scrim" id="sdayScrim"></div>
    <div class="evm sday" id="sdayDlg" role="dialog" aria-modal="true" aria-labelledby="sdayTitle" inert>
      <div class="g-h"><div><h2 id="sdayTitle"></h2><p id="sdaySub"></p></div><button class="icon-btn g-x" id="sdayClose" type="button" aria-label="Close">&times;</button></div>
      <div class="evm-b" id="sdayBody"></div>
    </div>`;
  document.body.append(...dwrap.children);
  const ddlg = $('#sdayDlg'), dscrim = $('#sdayScrim'), dbody = $('#sdayBody');
  let dref = null, dlast = null;
  function dayFormHtml(o) {
    const ex = exOf(o), it = o.it, v = k => k in ex ? ex[k] : (it[k] || '');
    const changed = !!(ex.title || ex.start || 'end' in ex || 'where' in ex || ex.note);
    return `<form class="ev-form" id="sdayForm" style="--sc:${HB.schedColor(it)}">
      ${ex.cancelled ? `<div class="sday-banner cancel"><span><b>Cancelled</b> for ${esc(dayText(o.iso))}. It stays on your calendar, crossed out.</span><button type="button" class="btn sec" data-sdayrestore>Restore</button></div>`
        : changed ? `<div class="sday-banner"><span><b>Changed</b> for ${esc(dayText(o.iso))} only.</span><button type="button" class="btn sec" data-sdayreset>Back to usual</button></div>` : ''}
      <p class="sday-hint">Changes here only affect <b>${esc(parseD(o.iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }))}</b>. Every other week stays the same.</p>
      <input class="dl-in ev-title" name="title" value="${esc(ex.title || it.title)}" aria-label="Name" required>
      <div class="ev-row">
        <label>From <input class="dl-in" name="start" type="time" value="${esc(ex.start || it.start)}" required></label>
        <label>to <input class="dl-in" name="end" type="time" value="${esc(v('end'))}"></label>
      </div>
      <input class="dl-in" name="where" value="${esc(v('where'))}" placeholder="Where (e.g. a different room today)" aria-label="Where">
      <textarea class="dl-in" name="note" rows="2" placeholder="Note for this day (e.g. Quiz today, bring a calculator)" aria-label="Note for this day">${esc(ex.note || '')}</textarea>
      <small class="ev-err" data-everr></small>
      <div class="ev-btns">
        <span class="ev-delset">${ex.cancelled ? '' : '<button type="button" class="btn sec ev-del" data-sdaycancel>Cancel this day</button>'}<button type="button" class="btn sec" data-sdaydone>${ex.done ? 'Mark not done' : 'Mark done'}</button></span>
        <span><button type="button" class="btn sec" data-sdayclose>Close</button> <button type="submit" class="btn">Save for this day</button></span>
      </div>
      <button type="button" class="ghost sday-whole" data-sdaywhole>Edit the whole "${esc(o.s.name)}" schedule…</button>
    </form>`;
  }
  function dayDraw() {
    const o = findOcc(dref); if (!o) { dayClose(); return; }
    $('#sdayTitle').textContent = o.it.title;
    $('#sdaySub').textContent = `${parseD(o.iso).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · ${o.s.name}`;
    dbody.innerHTML = dayFormHtml(o);
  }
  HB.openScheduleDay = ref => {
    if (!findOcc(ref)) return;
    dref = ref; dlast = document.activeElement; dayDraw();
    ddlg.inert = false; ddlg.classList.add('on'); dscrim.classList.add('on');
    setTimeout(() => { const f = dbody.querySelector('[name=where]'); f && f.focus(); }, 60);
  };
  function dayClose() {
    if (!ddlg.classList.contains('on')) return;
    ddlg.classList.remove('on'); dscrim.classList.remove('on'); ddlg.inert = true; dref = null;
    if (dlast && document.contains(dlast)) dlast.focus();
  }
  $('#sdayClose').onclick = dayClose; dscrim.onclick = dayClose;
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && ddlg.classList.contains('on')) { e.preventDefault(); e.stopImmediatePropagation(); dayClose(); } }, true);
  dbody.addEventListener('click', e => {
    const t = e.target, ref = dref; if (!ref) return;
    if (t.closest('[data-sdayclose]')) { dayClose(); return; }
    if (t.closest('[data-sdaycancel]')) { dayClose(); HB.scheduleDayCancel(ref, true); return; }
    if (t.closest('[data-sdayrestore]')) { HB.scheduleDayCancel(ref, false); dayDraw(); return; }
    if (t.closest('[data-sdaydone]')) { const o = findOcc(ref), d = !exOf(o).done; dayClose(); HB.scheduleDayDone(ref, d); return; }
    if (t.closest('[data-sdayreset]')) {
      const o = findOcc(ref); changeDay(ref, { title: undefined, start: undefined, end: undefined, where: undefined, note: undefined }, `${o.it.title} on ${dayText(o.iso)} is back to usual`);
      dayDraw(); return;
    }
    if (t.closest('[data-sdaywhole]')) { const o = findOcc(ref); dayClose(); open(o.s.id); }
  });
  dbody.addEventListener('submit', e => {
    e.preventDefault();
    const o = findOcc(dref); if (!o) return;
    const f = e.target, v = n => f.querySelector(`[name=${n}]`).value.trim(), err = f.querySelector('[data-everr]'), it = o.it;
    const start = v('start') || it.start, end = v('end');
    if (end && end <= start) { err.textContent = 'The end time should be after the start time.'; return; }
    // Keep only what's different from the usual week
    const patch = {
      title: v('title') && v('title') !== it.title ? v('title') : undefined,
      start: start !== it.start ? start : undefined,
      end: end !== (it.end || '') ? end : undefined,
      where: v('where') !== (it.where || '') ? v('where') : undefined,
      note: v('note') || undefined
    };
    const ref = dref; dayClose();
    changeDay(ref, patch, `Saved ${patch.title || it.title} for ${dayText(o.iso)}`);
  });

  HB.onChange(drawSettings);
})();
