/* Events: one list for everything with a date — deadlines, exams, appointments, trips and
   other events. They all show on the Calendar. Each one can also be shown in Coming up
   (its "Show in Coming up" switch, x.watch), so Coming up is the short list of things you're
   keeping an eye on, not everything you've ever added.
   Saved in HB.state.events [{ id, type, title, date, start?, end?, tag?, where?, note?,
   repeat?, skip?, done? (dates checked off), showNotes?, watch? }].
   Old Coming up deadlines (HB.state.deadlines) move in here automatically as type "deadline",
   already shown in Coming up. This file also has the add/edit window both widgets use. */
(function () {
  const { $, esc, localISO, parseD } = HB;

  /* Types. Deadlines are "due": they have a check box and show as overdue until checked off.
     Everything else simply happens on its day and then drops out of Coming up. */
  // hue = the color of its label in Coming up ("Event" has no label there)
  const TYPES = [
    { id: 'event', label: 'Event', ph: 'What is it? (e.g. Movie night, Career fair)' },
    { id: 'deadline', label: 'Deadline', ph: "What's due? (e.g. Bio lab report, Essay draft)", due: true, hue: 222 },
    { id: 'exam', label: 'Exam', ph: 'Which exam? (e.g. Calc midterm, Bio final)', hue: 275 },
    { id: 'quiz', label: 'Quiz', ph: 'Which quiz? (e.g. Spanish vocab quiz)', hue: 300 },
    { id: 'class', label: 'Class', ph: 'Which class? (e.g. Calculus I, Intro to Psych)', hue: 250 },
    { id: 'meeting', label: 'Meeting', ph: 'What meeting? (e.g. Advisor meeting, Group project)', hue: 195 },
    { id: 'appointment', label: 'Appointment', ph: 'What appointment? (e.g. Dentist, Haircut)', hue: 205 },
    { id: 'practice', label: 'Practice', ph: 'What practice? (e.g. Team practice, Lift)', hue: 150 },
    { id: 'game', label: 'Game', ph: 'What game? (e.g. Iowa vs. Purdue)', hue: 10 },
    { id: 'work', label: 'Work', ph: 'What shift? (e.g. Rec center shift)', hue: 35 },
    { id: 'social', label: 'Social', ph: "What's happening? (e.g. Dinner with friends)", hue: 330 },
    { id: 'birthday', label: 'Birthday', ph: "Whose birthday? (e.g. Mom's birthday)", hue: 345 },
    { id: 'holiday', label: 'Holiday', ph: 'Which holiday? (e.g. Thanksgiving break)', hue: 165 },
    { id: 'trip', label: 'Trip', ph: 'Where to? (e.g. Spring break in Chicago)', hue: 28 },
    { id: 'bill', label: 'Bill', ph: 'Which bill? (e.g. Rent, Phone bill)', due: true, hue: 0 },
    { id: 'reminder', label: 'Reminder', ph: 'What should you remember? (e.g. Renew parking permit)', hue: 45 }
  ];
  HB.EVENT_TYPES = TYPES;
  HB.eventType = x => TYPES.find(t => t.id === (x.type || 'event')) || TYPES[0];   // TYPES[0] = Event
  // Deadlines and bills are "due": a check box, and overdue until checked off
  HB.isDue = x => !!HB.eventType(x).due;
  const dueType = id => !!(TYPES.find(t => t.id === id) || {}).due;
  // Example text in the name box, to match the type you picked
  const phOf = id => (TYPES.find(t => t.id === id) || TYPES[0]).ph;

  /* The list. Also moves old Coming up deadlines in (works after a sync brings in old data too). */
  HB.events = () => {
    const st = HB.state;
    if (!Array.isArray(st.events)) st.events = [];
    if (Array.isArray(st.deadlines) && st.deadlines.length) {
      st.deadlines.forEach(d => {
        if (!d || !d.title || !d.date || st.events.some(e => e.id === d.id)) return;
        const x = { id: d.id || HB.uid(), type: 'deadline', title: d.title, date: d.date, watch: true };
        if (d.time) x.start = d.time;
        if (d.tag) x.tag = d.tag;
        if (d.notes) x.note = d.notes;
        if (d.showNotes) x.showNotes = true;
        if (d.done) x.done = [d.date];
        st.events.push(x);
      });
      st.deadlines = [];
      HB.saveQuietly();
    }
    return st.events;
  };

  /* Repeats: x.repeat = { every: 'day'|'week'|'month'|'year', n?, days? [0-6], nth? 1-4 or -1 (last), until? }
     x.skip = days removed from the series. */
  const DOW = [...Array(7)].map((_, i) => new Date(2026, 1, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }));
  const DAYS1 = [...Array(7)].map((_, i) => new Date(2026, 1, 1 + i).toLocaleDateString(undefined, { weekday: 'narrow' }));
  const WEEKDAYS = [1, 2, 3, 4, 5];
  const weekStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
  const nthOf = d => Math.ceil(d.getDate() / 7);
  const isLastOf = d => d.getDate() + 7 > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const ord = n => n + (n >= 11 && n <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'));
  const nthName = n => n === -1 ? 'last' : ord(n);
  function occursOn(x, iso) {
    if (!x.repeat) return x.date === iso;
    const r = x.repeat, n = r.n || 1;
    if (iso < x.date || (r.until && iso > r.until) || (x.skip || []).includes(iso)) return false;
    const a = parseD(x.date), d = parseD(iso);
    const months = (d.getFullYear() - a.getFullYear()) * 12 + d.getMonth() - a.getMonth();
    if (r.every === 'day') return Math.round((d - a) / 864e5) % n === 0;
    if (r.every === 'week') {
      const days = r.days && r.days.length ? r.days : [a.getDay()];
      if (!days.includes(d.getDay())) return false;
      return Math.round((weekStart(d) - weekStart(a)) / 6048e5) % n === 0;
    }
    if (r.every === 'month') {
      if (months % n) return false;
      if (r.nth) return d.getDay() === a.getDay() && (r.nth === -1 ? isLastOf(d) : nthOf(d) === r.nth);
      return d.getDate() === a.getDate();
    }
    if (r.every === 'year') return d.getDate() === a.getDate() && d.getMonth() === a.getMonth() && (d.getFullYear() - a.getFullYear()) % n === 0;
    return false;
  }
  HB.eventOccursOn = occursOn;
  function repText(x) {
    const r = x.repeat; if (!r) return '';
    const a = parseD(x.date), n = r.n || 1;
    const until = r.until ? ` until ${parseD(r.until).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : '';
    const every = (one, many) => n > 1 ? `Every ${n} ${many}` : one;
    if (r.every === 'day') return every('Every day', 'days') + until;
    if (r.every === 'week') {
      const days = (r.days && r.days.length ? r.days : [a.getDay()]).slice().sort();
      if (n === 1 && days.join() === WEEKDAYS.join()) return 'Every weekday (Mon–Fri)' + until;
      if (n === 1 && days.length === 7) return 'Every day' + until;
      return `${every('Weekly', 'weeks')} on ${days.map(i => DOW[i]).join(', ')}${until}`;
    }
    if (r.every === 'month') return `${every('Monthly', 'months')} on the ${r.nth ? `${nthName(r.nth)} ${DOW[a.getDay()]}` : ord(a.getDate())}${until}`;
    if (r.every === 'year') return `${every('Yearly', 'years')} on ${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${until}`;
    return '';
  }
  HB.eventRepText = repText;

  // When an occurrence happens (for sorting): its start time, or the start of the day
  // (deadlines without a time count as the end of the day)
  HB.eventAt = (x, iso) => {
    const d = parseD(iso || x.date), m = /^(\d{1,2}):(\d{2})/.exec(x.start || '');
    if (m) d.setHours(+m[1], +m[2]); else if (HB.isDue(x)) d.setHours(23, 59, 59);
    return d.getTime();
  };
  const addDays = (iso, n) => { const d = parseD(iso); d.setDate(d.getDate() + n); return localISO(d); };
  // The next day it happens (that isn't checked off), from `from` on. null if never again.
  HB.eventNext = (x, from) => {
    const done = x.done || [];
    if (!x.repeat) return x.date >= from && !done.includes(x.date) ? x.date : null;
    const d = parseD(from > x.date ? from : x.date);
    for (let i = 0; i < 800; i++) {
      const iso = localISO(d);
      if (x.repeat.until && iso > x.repeat.until) return null;
      if (occursOn(x, iso) && !done.includes(iso)) return iso;
      d.setDate(d.getDate() + 1);
    }
    return null;
  };

  /* What Coming up shows: events switched on for it. Deadlines stay until checked off (overdue
     ones too); everything else shows its next day and drops out once that day has passed. */
  HB.watched = () => {
    const today = localISO(), out = [];
    HB.events().forEach(x => {
      if (!x.watch) return;
      const due = HB.isDue(x);
      const occ = !x.repeat && due ? (!(x.done || []).includes(x.date) ? x.date : null)
        : HB.eventNext(x, due ? addDays(today, -7) : today);
      if (occ) out.push({ ev: x, occ, at: HB.eventAt(x, occ) });
    });
    return out.sort((a, b) => a.at - b.at);
  };
  // Events you could add to Coming up: not shown there yet, and still coming up (or overdue)
  HB.unwatched = () => {
    const today = localISO(), out = [];
    HB.events().forEach(x => {
      if (x.watch) return;
      const due = HB.isDue(x);
      const occ = !x.repeat && due ? (!(x.done || []).includes(x.date) ? x.date : null) : HB.eventNext(x, today);
      if (occ) out.push({ ev: x, occ, at: HB.eventAt(x, occ) });
    });
    return out.sort((a, b) => a.at - b.at);
  };

  /* Check off one day of an event (for a one-time event, its only day) */
  HB.eventDone = (id, occ, done = true) => {
    const x = HB.events().find(y => y.id === id); if (!x) return;
    occ = occ || x.date;
    const before = (x.done || []).slice();
    x.done = done ? [...new Set(before.concat(occ))] : before.filter(d => d !== occ);
    if (!x.done.length) delete x.done;
    HB.commit();
    if (done) HB.undoable(`Marked "${x.title}" done`, () => { if (before.length) x.done = before; else delete x.done; HB.commit(); });
  };
  HB.deadlineDone = (id, done = true) => HB.eventDone(id, null, done);   // older name, still used in places
  /* Show or stop showing an event in Coming up (it always stays on the Calendar) */
  HB.eventWatch = (id, on) => {
    const x = HB.events().find(y => y.id === id); if (!x) return;
    if (on) x.watch = true; else delete x.watch;
    HB.commit();
    if (on) HB.toast(`"${x.title}" is now in Coming up`);
    else HB.undoable(`Removed "${x.title}" from Coming up. It's still on your calendar.`, () => HB.eventWatch(id, true));
  };

  /* ---------- The add / edit window ---------- */
  function repKind(r) {
    if (!r) return 'none';
    const n = r.n || 1;
    if (r.every === 'day' && n === 1) return 'day';
    if (r.every === 'week' && n === 1 && (r.days || []).slice().sort().join() === WEEKDAYS.join()) return 'weekday';
    if (r.every === 'week' && n <= 2) return n === 2 ? 'week2' : 'week';
    if (r.every === 'month' && n === 1) return r.nth === -1 ? 'monthlast' : r.nth ? 'monthnth' : 'month';
    if (r.every === 'year' && n === 1) return 'year';
    return 'custom';
  }
  function repLabels(iso) {
    const a = iso ? parseD(iso) : new Date(), dn = DOW[a.getDay()], nth = nthOf(a);
    return {
      month: `Every month on the ${ord(a.getDate())}`,
      monthnth: nth <= 4 ? `Every month on the ${ord(nth)} ${dn}` : '',
      monthlast: isLastOf(a) ? `Every month on the last ${dn}` : '',
      year: `Every year on ${a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    };
  }
  function repeatHtml(x) {
    const r = x.repeat || {}, a = x.date ? parseD(x.date) : new Date(), kind = repKind(x.repeat), L = repLabels(x.date);
    const days = r.days && r.days.length ? r.days : [a.getDay()], unit = kind === 'custom' ? r.every : 'week';
    const opt = (v, t) => `<option value="${v}"${kind === v ? ' selected' : ''}${t ? '' : ' hidden disabled'}>${esc(t || '')}</option>`;
    return `<div class="ev-rep" data-evrep="${kind}" data-evunit="${unit}">
      <label>Repeats <select class="dl-in" name="repeat">${opt('none', "Doesn't repeat")}${opt('day', 'Every day')}${opt('weekday', 'Every weekday (Mon–Fri)')}${opt('week', 'Every week on…')}${opt('week2', 'Every 2 weeks on…')}${opt('month', L.month)}${opt('monthnth', L.monthnth)}${opt('monthlast', L.monthlast)}${opt('year', L.year)}${opt('custom', 'Custom…')}</select></label>
      <span class="ev-custom">every <input class="dl-in" name="repn" type="number" min="1" max="99" value="${kind === 'custom' ? r.n || 1 : 3}" aria-label="How many"> <select class="dl-in" name="repunit" aria-label="Days, weeks, months or years">${['day', 'week', 'month', 'year'].map(u => `<option value="${u}"${unit === u ? ' selected' : ''}>${u}s</option>`).join('')}</select></span>
      <span class="ev-days"${x.repeat ? ' data-touched="1"' : ''} role="group" aria-label="Repeat on these days">${DAYS1.map((d, i) => `<button type="button" class="ev-day" data-evday="${i}" aria-pressed="${days.includes(i)}" aria-label="${DOW[i]}">${d}</button>`).join('')}</span>
      <label class="ev-until">Until <input class="dl-in" name="until" type="date" value="${esc(r.until || '')}" aria-label="Repeat until (optional)"></label>
    </div>`;
  }
  function formHtml(x) {
    const type = x.type || 'event';
    return `<form class="ev-form" data-evform data-type="${type}" data-due="${dueType(type) ? '1' : ''}">
      <div class="ev-types" role="radiogroup" aria-label="Type">${TYPES.map(t => `<button type="button" role="radio" data-evtype="${t.id}" aria-checked="${t.id === type}">${t.label}</button>`).join('')}</div>
      <input class="dl-in ev-title" name="title" value="${esc(x.title || '')}" placeholder="${esc(phOf(type))}" aria-label="Name" required>
      <div class="ev-row">
        <label><span class="lbl-date">${dueType(type) ? 'Due' : 'Date'}</span> <input class="dl-in" name="date" type="date" value="${esc(x.date || '')}" required></label>
        <label><span class="lbl-start">${dueType(type) ? 'at' : 'From'}</span> <input class="dl-in" name="start" type="time" value="${esc(x.start || '')}"></label>
        <label class="ev-to">to <input class="dl-in" name="end" type="time" value="${esc(x.end || '')}"></label>
      </div>
      ${repeatHtml(x)}
      <div class="ev-row ev-row2">
        <input class="dl-in" name="tag" value="${esc(x.tag || '')}" placeholder="Class or tag (optional)" aria-label="Class or tag">
        <input class="dl-in" name="where" value="${esc(x.where || '')}" placeholder="Where (optional)" aria-label="Where">
      </div>
      <textarea class="dl-in" name="note" rows="3" placeholder="Notes (optional). Start a line with - [ ] to make a checklist." aria-label="Notes">${esc(x.note || '')}</textarea>
      <label class="ev-watch"><input type="checkbox" name="watch"${x.watch ? ' checked' : ''}> <span><b>Show in Coming up</b><small>It's always on your calendar. Turn this on for the things you want to keep an eye on.</small></span></label>
      <small class="ev-hint">Leave the time blank for all day.${x.id && x.repeat ? ' Changes apply to every repeat; the date is when it starts.' : ''}</small>
      <small class="ev-err" data-everr></small>
      <div class="ev-btns">${!x.id ? '<span></span>' : x.repeat && x.occ ? `<span class="ev-delset"><button type="button" class="btn sec ev-del" data-evdel="one">Delete this day only</button><button type="button" class="btn sec ev-del" data-evdel="all">Delete all</button></span>` : '<button type="button" class="btn sec ev-del" data-evdel="all">Delete</button>'}<span><button type="button" class="btn sec" data-evcancel>Cancel</button> <button type="submit" class="btn">${x.id ? 'Save' : 'Add'}</button></span></div>
    </form>`;
  }

  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="g-scrim evm-scrim" id="evmScrim"></div>
    <div class="evm" id="evm" role="dialog" aria-modal="true" aria-labelledby="evmTitle" inert>
      <div class="g-h"><h2 id="evmTitle">New event</h2><button class="icon-btn g-x" id="evmClose" type="button" aria-label="Close">&times;</button></div>
      <div class="evm-b" id="evmBody"></div>
    </div>`;
  document.body.append(...wrap.children);
  const dlg = $('#evm'), scrim = $('#evmScrim'), body = $('#evmBody');
  let cur = null, opts = {}, lastFocus = null;

  /* Open the window. x = an event to edit (with occ = the day you clicked, for repeats),
     or defaults for a new one ({ date, type, watch }). opts.onSave(x, day) runs after saving. */
  HB.openEventEditor = (x, o) => {
    cur = Object.assign({}, x); opts = o || {}; lastFocus = document.activeElement;
    $('#evmTitle').textContent = x.id ? `Edit ${HB.eventType(cur).label.toLowerCase()}` : 'Add to your calendar';
    body.innerHTML = formHtml(cur);
    dlg.inert = false; dlg.classList.add('on'); scrim.classList.add('on');
    setTimeout(() => { const i = body.querySelector('[name=title]'); i.focus(); if (x.id) i.select(); }, 60);
  };
  function close() {
    if (!dlg.classList.contains('on')) return;
    dlg.classList.remove('on'); scrim.classList.remove('on'); dlg.inert = true; cur = null;
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  $('#evmClose').onclick = close; scrim.onclick = close;
  window.addEventListener('keydown', e => {
    if (!dlg.classList.contains('on')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  }, true);

  body.addEventListener('click', e => {
    const t = e.target, f = body.querySelector('[data-evform]');
    const ty = t.closest('[data-evtype]');
    if (ty) {
      const type = ty.dataset.evtype;
      f.dataset.type = type;
      f.querySelectorAll('[data-evtype]').forEach(b => b.setAttribute('aria-checked', String(b === ty)));
      f.dataset.due = dueType(type) ? '1' : '';
      f.querySelector('.lbl-date').textContent = dueType(type) ? 'Due' : 'Date';
      f.querySelector('.lbl-start').textContent = dueType(type) ? 'at' : 'From';
      f.querySelector('[name=title]').placeholder = phOf(type);
      return;
    }
    const day = t.closest('[data-evday]');
    if (day) { day.parentNode.dataset.touched = '1'; day.setAttribute('aria-pressed', String(day.getAttribute('aria-pressed') !== 'true')); return; }
    if (t.closest('[data-evcancel]')) { close(); return; }
    const del = t.closest('[data-evdel]');
    if (del) {
      const list = HB.events(), i = list.findIndex(y => y.id === cur.id), occ = cur.occ; if (i < 0) { close(); return; }
      const x = list[i];
      if (del.dataset.evdel === 'one' && occ) {
        const before = (x.skip || []).slice();
        x.skip = before.concat(occ); HB.commit();
        HB.undoable(`Removed "${x.title}" on ${parseD(occ).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, () => { x.skip = before; HB.commit(); });
      } else {
        list.splice(i, 1); HB.commit();
        HB.undoable(`Deleted "${x.title}"`, () => { HB.events().splice(Math.min(i, HB.events().length), 0, x); HB.commit(); });
      }
      close();
    }
  });
  // Repeats picker: show the weekday buttons and "Until" only when they apply
  body.addEventListener('change', e => {
    const f = e.target.closest('[data-evform]'); if (!f) return;
    const rep = f.querySelector('[data-evrep]');
    if (e.target.name === 'repeat') { rep.dataset.evrep = e.target.value; return; }
    if (e.target.name === 'repunit') { rep.dataset.evunit = e.target.value; return; }
    if (e.target.name === 'date' && e.target.value) {
      // Update the "on the 13th" / "on the 2nd Tue" choices
      const L = repLabels(e.target.value), sel = f.querySelector('[name=repeat]');
      Object.keys(L).forEach(k => { const o = sel.querySelector(`option[value=${k}]`); o.textContent = L[k]; o.hidden = o.disabled = !L[k]; });
      if (sel.selectedOptions[0] && sel.selectedOptions[0].disabled) { sel.value = 'month'; rep.dataset.evrep = 'month'; }
      // If you haven't picked weekdays yourself, follow the date's weekday
      if (!f.querySelector('.ev-days').dataset.touched) {
        const dow = parseD(e.target.value).getDay();
        f.querySelectorAll('[data-evday]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.evday === dow)));
      }
    }
  });
  body.addEventListener('submit', e => {
    const f = e.target.closest('[data-evform]'); if (!f) return;
    e.preventDefault();
    const v = n => f.querySelector(`[name=${n}]`).value.trim(), err = f.querySelector('[data-everr]');
    const type = f.dataset.type || 'event', due = dueType(type);
    const x = { type, title: v('title'), date: v('date'), start: v('start'), end: due ? '' : v('end'), tag: v('tag'), where: v('where'), note: f.querySelector('[name=note]').value.replace(/\s+$/, '') };
    if (!x.title || !x.date) { err.textContent = due ? 'Add a name and a due date.' : 'Add a name and a date.'; return; }
    if (x.end && !x.start) { err.textContent = 'Add a start time too, or clear the end time.'; return; }
    if (x.start && x.end && x.end <= x.start) { err.textContent = 'The end time should be after the start time.'; return; }
    Object.keys(x).forEach(k => { if (!x[k]) delete x[k]; });
    if (f.querySelector('[name=watch]').checked) x.watch = true;
    const rk = f.querySelector('[name=repeat]').value, until = f.querySelector('[name=until]').value;
    if (rk !== 'none') {
      const unit = f.querySelector('[name=repunit]').value, cn = Math.max(1, Math.min(99, parseInt(f.querySelector('[name=repn]').value, 10) || 1));
      const nth = nthOf(parseD(x.date));
      const r = { day: { every: 'day' }, weekday: { every: 'week', days: WEEKDAYS.slice() }, week: { every: 'week' }, week2: { every: 'week', n: 2 },
        month: { every: 'month' }, monthnth: { every: 'month', nth: nth > 4 ? -1 : nth }, monthlast: { every: 'month', nth: -1 }, year: { every: 'year' },
        custom: Object.assign({ every: unit }, cn > 1 ? { n: cn } : {}) }[rk];
      if (rk === 'monthlast' && !isLastOf(parseD(x.date))) r.nth = nth;
      if (r.every === 'week' && rk !== 'weekday') {
        r.days = [...f.querySelectorAll('[data-evday][aria-pressed=true]')].map(b => +b.dataset.evday);
        if (!r.days.length) { err.textContent = 'Pick at least one day of the week.'; return; }
      }
      if (until) { if (until < x.date) { err.textContent = 'The "Until" date should be after the start date.'; return; } r.until = until; }
      x.repeat = r;
    }
    const list = HB.events(), old = cur.id && list.find(y => y.id === cur.id);
    if (old && old.skip && x.repeat) x.skip = old.skip.filter(d => d >= x.date);   // keep days you removed
    if (old && old.done) x.done = x.repeat ? old.done : old.done.filter(d => d === x.date);   // keep days you checked off
    if (old && x.done && !x.done.length) delete x.done;
    if (old && old.showNotes) x.showNotes = true;
    const saved = Object.assign({ id: old ? old.id : HB.uid() }, x);
    if (old) list[list.indexOf(old)] = saved; else list.push(saved);
    const day = old && cur.occ && occursOn(saved, cur.occ) ? cur.occ : saved.date, cb = opts.onSave;
    close(); HB.commit();
    HB.toast(old ? `Saved "${saved.title}"` : `Added "${saved.title}"${saved.watch ? ' to Coming up and your calendar' : ' to your calendar'}`);
    if (cb) cb(saved, day);
  });
})();
