/* Calendar: a Month or Week view of everything with a date — your events (deadlines, exams,
   appointments, trips… see js/events.js), Canvas assignments and schedules (js/schedule.js).
   Repeating tasks stay in Today only. "+ Event" and the pencil on an item open the shared
   add/edit window (HB.openEventEditor). The eye button on an item shows it in Coming up (or not).
   Click a day to see everything on it. Works best as a medium or large widget. */
(function () {
  const { $, esc, localISO, parseD } = HB;
  const cfg = () => { const s = HB.settings(); if (!s.calendar) s.calendar = { view: 'month' }; return s.calendar; };
  const view = () => (cfg().view === 'week' ? 'week' : 'month');
  // What's turned off with the toggles under the calendar (schedules use their own "hidden" flag,
  // the same one as the Show checkbox in Settings → Schedules)
  // What's hidden with the "Types" filter under the calendar: event types and/or 'canvas'
  // (cfg().hideTypes = ['work', 'canvas', …]). Older versions had separate Events/Canvas toggles
  // (cfg().hide); a hidden Canvas carries over, the rest is dropped.
  function hiddenTypes() {
    const c = cfg();
    if (c.hide) { const h = new Set(c.hideTypes || []); if (c.hide.canvas) h.add('canvas'); c.hideTypes = [...h]; delete c.hide; }
    return c.hideTypes || [];
  }
  const typeOff = x => hiddenTypes().includes(x.type || 'event');
  let typesOpen = false;
  let sec = null, cursor = HB.today0(), selected = localISO();
  const DOW = [...Array(7)].map((_, i) => new Date(2026, 1, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }));   // Sun…Sat
  const KIND = { deadline: 'Deadline', canvas: 'Canvas', sched: '', event: 'Event' };
  const events = () => HB.events();
  let hideDone = new Set();   // week view: days whose done items are folded away

  /* Everything on one day. Items without a time ("all day") come first, then by time. */
  function eventsOn(iso) {
    const out = [], day0 = parseD(iso).getTime();
    if (!hiddenTypes().includes('canvas')) (HB.canvasAll ? HB.canvasAll() : []).forEach(x => {
      if (x.date !== iso) return;
      out.push({ kind: 'canvas', uid: x.uid, title: x.title, sub: x.course, code: x.code, time: x.time, allDay: !x.time, at: x.ts, url: x.url, done: x.done, hue: HB.courseHue(x.course) });
    });
    // Your events (deadlines show in blue, everything else in teal)
    events().forEach(x => {
      const kind = HB.isDue(x) ? 'deadline' : 'event';
      if (typeOff(x) || !occursOn(x, iso)) return;
      const [h, m] = (x.start || '0:0').split(':').map(Number), t = HB.eventType(x);
      out.push({ kind, id: x.id, label: t.label, watch: !!x.watch, title: x.title,
        sub: [x.start && x.end ? 'Until ' + HB.fmtTime(x.end) : '', x.tag, x.where, x.repeat ? repText(x) : ''].filter(Boolean).join(' · '),
        notes: x.note || '', showNotes: !!x.showNotes, occ: iso, done: (x.done || []).includes(iso), time: x.start ? HB.fmtTime(x.start) : '', allDay: !x.start,
        at: x.start ? day0 + (h * 60 + m) * 60000 : HB.isDue(x) ? day0 + 86399000 : day0 });
    });
    // Schedules (classes, shifts…): weekly time blocks
    (HB.scheduleOn ? HB.scheduleOn(iso) : []).forEach(x => {
      const [h, m] = x.start.split(':').map(Number);
      out.push({ kind: 'sched', ref: x.ref, title: x.title, done: x.done, cancelled: x.cancelled, changed: x.changed, note: x.note,
        sub: [x.end ? 'Until ' + HB.fmtTime(x.end) : '', x.where, x.schedule].filter(Boolean).join(' · '), time: HB.fmtTime(x.start), allDay: false, at: day0 + (h * 60 + m) * 60000, color: x.color });
    });
    // (Repeating tasks stay in Today only; they don't show on the calendar.)
    // Done items go last
    return out.sort((a, b) => (!!a.done - !!b.done) || (b.allDay - a.allDay) || a.at - b.at);
  }

  const short = t => (t || '').replace(/:00(?=\s?[AP]M)/i, '').replace(/\s?([AP])M/i, (_, x) => x.toLowerCase());   // "11:59 PM" → "11:59p", "3:00 PM" → "3p"
  const style = e => (e.kind === 'canvas' ? ` style="--h:${e.hue}"` : e.kind === 'sched' ? ` style="--sc:${e.color}"` : '');
  const chip = e => `<span class="cal-chip k-${e.kind}${e.done ? ' done' : ''}${e.cancelled ? ' cancelled' : ''}"${style(e)}>${e.time ? `<b>${esc(short(e.time))}</b>` : ''}${esc(e.title)}</span>`;
  const dot = e => `<i class="cal-dot k-${e.kind}"${style(e)}></i>`;
  const longDate = iso => parseD(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  function dayCell(d, inMonth) {
    // Done items don't take up room in the box: they're summed up as "✓ 5 done" (and listed in the day list below)
    const iso = localISO(d), all = eventsOn(iso), evs = all.filter(e => !e.done), nDone = all.length - evs.length, today = iso === localISO(), sel = iso === selected;
    const label = `${longDate(iso)}${evs.length ? `, ${evs.length} item${evs.length > 1 ? 's' : ''}` : ''}${nDone ? `, ${nDone} done` : ''}`;
    return `<button type="button" class="cal-day${inMonth ? '' : ' out'}${today ? ' today' : ''}${sel ? ' sel' : ''}" data-day="${iso}" aria-pressed="${sel}" aria-label="${esc(label)}">
      <span class="cal-num">${d.getDate()}</span>
      <span class="cal-chips">${evs.slice(0, 3).map(chip).join('')}${evs.length > 3 ? `<span class="cal-more">+${evs.length - 3} more</span>` : ''}${nDone ? `<span class="cal-done">✓ ${nDone} done</span>` : ''}</span>
      <span class="cal-dots">${evs.slice(0, 5).map(dot).join('')}${nDone ? `<i class="cal-dot cal-dot-done" title="${nDone} done"></i>` : ''}</span>
    </button>`;
  }
  function monthHtml() {
    const y = cursor.getFullYear(), m = cursor.getMonth(), lead = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    const cells = Math.ceil((lead + days) / 7) * 7;
    let h = `<div class="cal-month" role="grid" aria-label="${esc(title())}"><div class="cal-dow">${DOW.map(x => `<span>${x}</span>`).join('')}</div><div class="cal-grid">`;
    for (let i = 0; i < cells; i++) { const d = new Date(y, m, 1 - lead + i); h += dayCell(d, d.getMonth() === m); }
    return h + '</div></div>';
  }
  const weekStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
  function weekHtml() {
    const s = weekStart(cursor);
    let h = '<div class="cal-week">';
    for (let i = 0; i < 7; i++) {
      const d = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i), iso = localISO(d), evs = eventsOn(iso);
      const today = iso === localISO(), sel = iso === selected;
      const open = evs.filter(e => !e.done), done = evs.filter(e => e.done), showDone = !hideDone.has(iso);
      const doneBtn = done.length ? `<button type="button" class="cal-wdone" data-calwdone="${iso}" aria-expanded="${showDone}">${showDone ? 'Hide' : '✓'} ${done.length} done</button>` : '';
      h += `<div class="cal-wday${today ? ' today' : ''}${sel ? ' sel' : ''}">
        <button type="button" class="cal-whead" data-day="${iso}" aria-pressed="${sel}" aria-label="${esc(longDate(iso))}"><span>${DOW[d.getDay()]}</span><b>${d.getDate()}</b></button>
        ${open.length || (showDone && done.length) ? `<ul class="cal-wlist">${open.concat(showDone ? done : []).map(itemHtml).join('')}</ul>` : (done.length ? '' : '<p class="cal-none">Nothing</p>')}${doneBtn}
      </div>`;
    }
    return h + '</div>';
  }
  function itemHtml(e) {
    const name = e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : `<span>${esc(e.title)}</span>`;
    const sub = [e.sub, e.label || KIND[e.kind]].filter(Boolean).join(' · ');
    // Canvas assignments, events and deadlines get a check button: mark done (or not done)
    const doneAttr = e.kind === 'sched' && e.ref && !e.cancelled ? `data-schdone="${esc(e.ref)}"` : e.kind === 'canvas' && e.uid ? `data-calcv="${esc(e.uid)}"` : (e.kind === 'event' || e.kind === 'deadline') && e.id ? `data-evdone="${esc(e.id)}|${esc(e.occ)}"` : '';
    const chk = doneAttr ? `<button type="button" class="cal-chk${e.done ? ' on' : ''}" ${doneAttr} aria-pressed="${!!e.done}" aria-label="${e.done ? 'Mark not done' : 'Mark done'}: ${esc(e.title)}" title="${e.done ? 'Mark not done' : 'Mark done'}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg></button>` : '';
    // Events and deadlines get a pencil button: the only way to edit them from the calendar
    const mine = (e.kind === 'event' || e.kind === 'deadline') && e.id;
    const ev = mine ? ` data-evedit="${esc(e.id)}" data-evocc="${esc(e.occ)}"` : '';
    // Eye: show this in Coming up (filled when it's already there)
    const eye = mine ? `<button type="button" class="cal-evbtn cal-watch${e.watch ? ' on' : ''}" data-evwatch="${esc(e.id)}" aria-pressed="${e.watch}" aria-label="${e.watch ? 'Remove from' : 'Show in'} Coming up: ${esc(e.title)}" title="${e.watch ? 'In Coming up. Click to remove it from there.' : 'Show in Coming up'}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"${e.watch ? ' fill="currentColor"' : ''}/></svg></button>` : '';
    const pen = e.kind === 'sched' && e.ref ? `<button type="button" class="cal-evbtn" data-schday="${esc(e.ref)}" aria-label="Change or cancel ${esc(e.title)} on this day" title="Change or cancel this day only"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg></button>` : mine ? `<button type="button" class="cal-evbtn" data-evpen aria-label="Edit ${esc(e.title)}" title="Edit"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg></button>` : '';
    const tags = e.cancelled ? '<span class="cal-tag cancel">Cancelled</span>' : e.changed ? '<span class="cal-tag changed" title="Changed for this day only">Changed</span>' : '';
    const dayNote = e.kind === 'sched' && e.note ? `<em class="cal-daynote">${esc(e.note)}</em>` : '';
    return `<li class="cal-item k-${e.kind}${e.done ? ' done' : ''}${e.cancelled ? ' cancelled' : ''}"${style(e)}${e.code ? ` title="${esc(e.code)}"` : ''}${ev}>
      <span class="cal-time">${e.time ? esc(e.time) : 'All day'}</span>
      <span class="cal-body">${name}<small>${tags}${esc(sub)}${e.done ? ' · Done' : ''}${noteBtn(e)}</small>${dayNote}</span>${eye}${pen}${chk}
      ${e.notes && e.showNotes && HB.notesHtml ? `<div class="dl-notes cal-notes">${HB.notesHtml({ id: `${e.kind}:${e.id}`, notes: e.notes }, 'data-calck')}</div>` : ''}</li>`;
  }
  // "Notes" button under an event or deadline (shows its notes, like in Coming up)
  function noteBtn(e) {
    if (!e.notes || !e.id || !HB.noteIcon) return '';
    const cc = HB.checklistCount(e.notes), open = !!e.showNotes;
    return ` · <button type="button" class="nt cal-nt" data-calnotes="${e.kind}:${esc(e.id)}" aria-expanded="${open}" title="${open ? 'Hide notes' : 'Show notes'}">${HB.noteIcon}${cc ? `${cc.done}/${cc.total}` : 'Notes'}<svg class="chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>`;
  }
  function title() {
    if (view() === 'month') return cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const s = weekStart(cursor), e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
    const sameMonth = s.getMonth() === e.getMonth();
    return `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString(undefined, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}, ${e.getFullYear()}`;
  }

  // Repeats are worked out in js/events.js
  const occursOn = (x, iso) => HB.eventOccursOn(x, iso);
  const repText = x => HB.eventRepText(x);

  // An event from "event:<id>" / "deadline:<id>" (both live in the same list now)
  function findItem(key) {
    const id = key.split(':')[1];
    return events().find(y => y.id === id);
  }
  // Open the add/edit window; after saving, jump to the event's day so you can see it
  function openEvent(x) {
    HB.openEventEditor(x, { onSave: (saved, day) => { selected = day; const d = parseD(day); cursor = view() === 'month' ? new Date(d.getFullYear(), d.getMonth(), 1) : d; draw(); } });
  }
  function editFrom(el) {
    const x = events().find(y => y.id === el.dataset.evedit);
    if (x) openEvent(Object.assign({}, x, { occ: el.dataset.evocc || '' }));
  }

  function draw(force) {
    if (!sec || !sec.isConnected) return;
    const v = view(), evs = eventsOn(selected);
    const body = $('#calBody'), keep = document.activeElement && body.contains(document.activeElement) ? document.activeElement : null;
    const keepDay = keep && keep.dataset.day;
    body.innerHTML = `
      <div class="cal-bar">
        <div class="cal-nav">
          <button type="button" class="cal-arrow" data-calnav="-1" aria-label="Previous ${v}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg></button>
          <button type="button" class="ghost cal-todaybtn" data-caltoday>Today</button>
          <button type="button" class="cal-arrow" data-calnav="1" aria-label="Next ${v}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button>
          <b class="cal-title" aria-live="polite">${esc(title())}</b>
        </div>
        <div class="seg" role="group" aria-label="Calendar view"><button type="button" data-calview="month" aria-pressed="${v === 'month'}">Month</button><button type="button" data-calview="week" aria-pressed="${v === 'week'}">Week</button></div>
      </div>
      ${v === 'month' ? monthHtml() : weekHtml()}
      ${v === 'month' ? `<div class="cal-detail"><h3>${esc(longDate(selected))}</h3>${evs.length ? `<ul class="cal-list">${evs.map(itemHtml).join('')}</ul>` : '<p class="cal-none">Nothing on this day.</p>'}</div>` : ''}
      ${legendHtml()}`;
    if (keepDay) { const b = body.querySelector(`[data-day="${keepDay}"]`); b && b.focus(); }
  }

  /* Toggles under the calendar: choose what shows (e.g. turn off school stuff for the weekend) */
  function legendHtml() {
    const t = (attr, on, dot, label, title) => `<button type="button" class="cal-tog${on ? '' : ' off'}" ${attr} aria-pressed="${on}" title="${esc(title)}">${dot}<span>${esc(label)}</span></button>`;
    const parts = [typesHtml()];
    return `<div class="cal-legend" role="group" aria-label="Show on calendar"><span class="cal-lbl">Show:</span>${parts.join('')}${HB.openSchedule ? '<button type="button" class="ghost cal-sched" data-schnew>+ Create schedule</button>' : ''}</div>`;
  }
  // "Types" filter: one checklist with each event type you've used, plus Canvas
  function typesHtml() {
    const opts = HB.EVENT_TYPES.filter(ty => events().some(x => (x.type || 'event') === ty.id))
      .map(ty => ({ id: ty.id, label: ty.label, dot: `<i class="cal-dot ${ty.due ? 'k-deadline' : 'k-event'}"></i>` }));
    if (HB.canvasAll && HB.canvasAll().length) opts.push({ id: 'canvas', label: 'Canvas', dot: '<i class="cal-dot k-canvas" style="--h:350"></i>' });
    // Schedules too (they use their own "hidden" flag, the same one as Settings → Schedules)
    const scheds = (HB.state.schedules || []).filter(x => (x.items || []).length).map(x => ({ id: 'sched:' + x.id, label: x.name, sched: x,
      dot: `<i class="cal-dot k-sched" style="--sc:${HB.schedColor(x.items[0] || {})}"></i>` }));
    if (!opts.length && !scheds.length) return '';
    const hid = hiddenTypes(), isOff = o => o.sched ? !!o.sched.hidden : hid.includes(o.id);
    const all = opts.concat(scheds), hidden = all.filter(isOff).length, allOff = hidden === all.length;
    const label = allOff ? 'Nothing (all hidden)' : hidden ? `All but ${hidden}` : 'Everything';
    const btn = `<button type="button" class="cal-tog cal-typesbtn${hidden ? ' filtered' : ''}" data-caltypesbtn aria-expanded="${typesOpen}" aria-haspopup="true" title="Choose what shows on the calendar"><span>${label}</span><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>`;
    if (!typesOpen) return `<span class="cal-types-wrap">${btn}</span>`;
    const item = o => { const on = !isOff(o);
      return `<button type="button" class="cal-type" data-caltype="${o.id}" role="menuitemcheckbox" aria-checked="${on}"><span class="ct-box">${on ? '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7"/></svg>' : ''}</span>${o.dot}${esc(o.label)}</button>`; };
    const list = opts.map(item).join('') + (scheds.length ? `${opts.length ? '<span class="cal-types-h">Schedules</span>' : ''}${scheds.map(item).join('')}` : '');
    return `<span class="cal-types-wrap">${btn}<div class="cal-types" role="menu" aria-label="What shows on the calendar">${list}${hidden ? '<button type="button" class="ghost cal-types-all" data-caltypesall>Show all</button>' : ''}</div></span>`;
  }



  function move(step) {
    const today = HB.today0();
    if (view() === 'month') {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + step, 1);
      // Select today if it's in this month, otherwise the 1st
      const here = today.getFullYear() === cursor.getFullYear() && today.getMonth() === cursor.getMonth();
      selected = localISO(here ? today : cursor);
    } else {
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7 * step);
      const s = weekStart(cursor);
      selected = localISO(localISO(weekStart(today)) === localISO(s) ? today : s);
    }
    draw();
  }

  HB.registerWidget({
    id: 'calendar', name: 'Calendar', size: 'm',
    desc: 'A month or week view of your events and deadlines, Canvas assignments and schedules. Click a day to see what is on it.',
    icon: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 16.5h2M11 16.5h2"/>',
    render(section) {
      sec = section;
      sec.classList.add('cal');
      sec.innerHTML = `<div class="card-h"><h2>Calendar</h2><button type="button" class="ghost cal-evadd" data-evadd title="Add an event, like an appointment">+ Event</button></div><div class="cal-wrap" id="calBody"></div>`;
      sec.addEventListener('click', e => {
        const t = e.target;
        // Events: add, edit, show in Coming up
        if (t.closest('[data-evadd]')) { openEvent({ type: 'event', date: selected < localISO() ? localISO() : selected }); return; }
        const ew = t.closest('[data-evwatch]');
        if (ew) { HB.eventWatch(ew.dataset.evwatch, ew.getAttribute('aria-pressed') !== 'true'); return; }
        const ed = t.closest('[data-evedit]');
        if (ed && t.closest('[data-evpen]')) { editFrom(ed); return; }
        const nb = t.closest('[data-calnotes]');
        if (nb) { const x = findItem(nb.dataset.calnotes); if (x) { x.showNotes = !x.showNotes; HB.commit(); } return; }
        const evd = t.closest('[data-evdone]');
        if (evd) {
          const [id, occ] = evd.dataset.evdone.split('|'), x = events().find(y => y.id === id); if (!x) return;
          const before = (x.done || []).slice(), was = before.includes(occ);
          x.done = was ? before.filter(d => d !== occ) : before.concat(occ);
          if (!x.done.length) delete x.done;
          HB.commit();
          if (!was) HB.undoable(`Marked "${x.title}" done`, () => { if (before.length) x.done = before; else delete x.done; HB.commit(); });
          return;
        }
        const cv = t.closest('[data-calcv]');
        if (cv) { e.preventDefault(); HB.canvasMarkDone && HB.canvasMarkDone(cv.dataset.calcv, cv.getAttribute('aria-pressed') !== 'true'); return; }
        const day = t.closest('[data-day]'), nav = t.closest('[data-calnav]'), vw = t.closest('[data-calview]');
        const wd = t.closest('[data-calwdone]');
        if (wd) { const k = wd.dataset.calwdone; hideDone.has(k) ? hideDone.delete(k) : hideDone.add(k); draw(); return; }
        if (day) { selected = day.dataset.day; const d = parseD(selected); if (view() === 'month' && d.getMonth() !== cursor.getMonth()) cursor = new Date(d.getFullYear(), d.getMonth(), 1); draw(); }
        else if (nav) move(+nav.dataset.calnav);
        else if (t.closest('[data-caltoday]')) { cursor = HB.today0(); selected = localISO(); draw(); }
        else if (vw) { cfg().view = vw.dataset.calview; HB.saveQuietly(); cursor = parseD(selected); draw(); }
        else if (t.closest('[data-caltypesbtn]')) { typesOpen = !typesOpen; draw(); }
        else if (t.closest('[data-schday]')) HB.openScheduleDay(t.closest('[data-schday]').dataset.schday);
        else if (t.closest('[data-schdone]')) { const b = t.closest('[data-schdone]'); HB.scheduleDayDone(b.dataset.schdone, b.getAttribute('aria-pressed') !== 'true'); }
        else if (t.closest('[data-caltype]')) {
          const id = t.closest('[data-caltype]').dataset.caltype, c = cfg(), h = new Set(hiddenTypes());
          if (id.startsWith('sched:')) { const x = (HB.state.schedules || []).find(y => 'sched:' + y.id === id); if (x) { x.hidden = !x.hidden; HB.commit(); } }
          else { h.has(id) ? h.delete(id) : h.add(id); c.hideTypes = [...h]; HB.commit(); }
        }
        else if (t.closest('[data-caltypesall]')) { cfg().hideTypes = []; (HB.state.schedules || []).forEach(x => { delete x.hidden; }); HB.commit(); }
      });
      // Tick checklist items in an event's or deadline's notes
      sec.addEventListener('change', e => {
        const c = e.target.closest('[data-calck]'); if (!c) return;
        const parts = c.dataset.calck.split(':'), i = +parts.pop(), x = findItem(parts.join(':')); if (!x) return;
        const key = 'note', lines = (x[key] || '').split('\n');
        if (lines[i] == null) return;
        lines[i] = lines[i].replace(/\[( |x|X)\]/, c.checked ? '[x]' : '[ ]'); x[key] = lines.join('\n'); HB.commit();
      });
      // Arrow keys move between days
      sec.addEventListener('keydown', e => {
        const b = e.target.closest && e.target.closest('[data-day]'); if (!b) return;
        const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]; if (!step) return;
        if (view() === 'week' && Math.abs(step) === 7) return;
        e.preventDefault();
        const d = parseD(b.dataset.day); d.setDate(d.getDate() + step);
        selected = localISO(d);
        if (view() === 'month' && d.getMonth() !== cursor.getMonth()) cursor = new Date(d.getFullYear(), d.getMonth(), 1);
        if (view() === 'week' && localISO(weekStart(d)) !== localISO(weekStart(cursor))) cursor = d;
        draw();
        const nb = sec.querySelector(`[data-day="${selected}"]`); nb && nb.focus();
      });
      draw();
    }
  });
  document.addEventListener('click', e => { if (typesOpen && !e.target.closest('.cal-types-wrap')) { typesOpen = false; draw(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && typesOpen) { typesOpen = false; draw(); } });
  HB.onChange(draw);
})();
