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
  const HUES = [265, 330, 20, 42, 185, 300, 0, 85];
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
        out.push({ title: it.title, start: it.start, end: it.end, where: it.where || '', hue: it.hue == null ? HUES[0] : it.hue, schedule: s.name });
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
        <span class="sch-sw">${(s.items || []).slice(0, 4).map(it => `<i style="--h:${it.hue}"></i>`).join('')}</span>
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

  const blank = () => ({ id: uid(), title: '', days: [], start: '', end: '', where: '', hue: HUES[(draft ? draft.items.length : 0) % HUES.length] });
  function itemHtml(it, i) {
    return `<div class="sd-item" data-i="${i}" style="--h:${it.hue}">
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
      <div class="sd-colors" role="group" aria-label="Color">${HUES.map(h => `<button type="button" data-hue="${h}" style="--h:${h}" aria-pressed="${it.hue === h}" aria-label="Color"></button>`).join('')}</div>
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
      <div class="set-row"><span class="lbl">Time blocks</span>
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

  // Typing updates the draft without redrawing (so the cursor stays put)
  form.addEventListener('input', e => {
    const t = e.target, it = t.closest('[data-i]'), off = t.closest('[data-o]');
    if (t.dataset.s) draft[t.dataset.s] = t.value;
    else if (it && t.dataset.f) draft.items[+it.dataset.i][t.dataset.f] = t.value;
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
    if (hue && it) {
      draft.items[+it.dataset.i].hue = +hue.dataset.hue; it.style.setProperty('--h', hue.dataset.hue);
      it.querySelectorAll('[data-hue]').forEach(b => b.setAttribute('aria-pressed', String(b === hue))); return;
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
    const s = Object.assign(draft, {
      name, items: items.map(x => Object.assign(x, { title: x.title.trim(), where: (x.where || '').trim() })),
      off: draft.off.filter(o => o.from).map(o => ({ from: o.from, to: o.to && o.to >= o.from ? o.to : o.from, label: (o.label || '').trim() }))
    });
    const i = list().findIndex(x => x.id === s.id);
    if (i >= 0) list()[i] = s; else list().push(s);
    HB.commit(); close();
    HB.toast(i >= 0 ? `Saved "${s.name}"` : `"${s.name}" is on your calendar`);
  });

  HB.onChange(drawSettings);
})();
