/* Calendar: a Month or Week view of your Coming up deadlines, Canvas assignments and
   repeating tasks. Click a day to see everything on it, or to add a deadline to that day.
   Add it from Customize → Add widgets. Works best as a medium or large widget. */
(function () {
  const { $, esc, localISO, parseD } = HB;
  const cfg = () => { const s = HB.settings(); if (!s.calendar) s.calendar = { view: 'month' }; return s.calendar; };
  const view = () => (cfg().view === 'week' ? 'week' : 'month');
  let sec = null, cursor = HB.today0(), selected = localISO();
  const DOW = [...Array(7)].map((_, i) => new Date(2026, 1, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }));   // Sun…Sat
  const KIND = { deadline: 'Deadline', canvas: 'Canvas', repeat: 'Repeating task' };

  /* Everything on one day. Items without a time ("all day") come first, then by time. */
  function eventsOn(iso) {
    const out = [], day0 = parseD(iso).getTime();
    HB.state.deadlines.forEach(x => {
      if (x.date !== iso) return;
      out.push({ kind: 'deadline', title: x.title, sub: x.tag || '', time: x.time ? HB.fmtTime(x.time) : '', allDay: !x.time, at: HB.dueAt(x) });
    });
    (HB.canvasAll ? HB.canvasAll() : []).forEach(x => {
      if (x.date !== iso) return;
      out.push({ kind: 'canvas', title: x.title, sub: x.course, code: x.code, time: x.time, allDay: !x.time, at: x.ts, url: x.url, done: x.done, hue: HB.courseHue(x.course) });
    });
    // Repeating tasks: today and later (they have no time, so they show as all-day)
    if (iso >= localISO() && HB.repeatOccursOn) (HB.state.recurring || []).forEach(r => {
      if (HB.repeatOccursOn(r, parseD(iso))) out.push({ kind: 'repeat', title: r.text, sub: HB.repeatText ? 'Repeats ' + HB.repeatText(r) : '', time: '', allDay: true, at: day0 });
    });
    return out.sort((a, b) => (b.allDay - a.allDay) || a.at - b.at);
  }

  const short = t => (t || '').replace(/:00(?=\s?[AP]M)/i, '').replace(/\s?([AP])M/i, (_, x) => x.toLowerCase());   // "11:59 PM" → "11:59p", "3:00 PM" → "3p"
  const style = e => (e.kind === 'canvas' ? ` style="--h:${e.hue}"` : '');
  const chip = e => `<span class="cal-chip k-${e.kind}${e.done ? ' done' : ''}"${style(e)}>${e.time ? `<b>${esc(short(e.time))}</b>` : ''}${esc(e.title)}</span>`;
  const dot = e => `<i class="cal-dot k-${e.kind}"${style(e)}></i>`;
  const longDate = iso => parseD(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const shortDate = iso => parseD(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  function dayCell(d, inMonth) {
    const iso = localISO(d), evs = eventsOn(iso), today = iso === localISO(), sel = iso === selected;
    const label = `${longDate(iso)}${evs.length ? `, ${evs.length} item${evs.length > 1 ? 's' : ''}` : ''}`;
    return `<button type="button" class="cal-day${inMonth ? '' : ' out'}${today ? ' today' : ''}${sel ? ' sel' : ''}" data-day="${iso}" aria-pressed="${sel}" aria-label="${esc(label)}">
      <span class="cal-num">${d.getDate()}</span>
      <span class="cal-chips">${evs.slice(0, 3).map(chip).join('')}${evs.length > 3 ? `<span class="cal-more">+${evs.length - 3} more</span>` : ''}</span>
      <span class="cal-dots">${evs.slice(0, 5).map(dot).join('')}</span>
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
      h += `<div class="cal-wday${today ? ' today' : ''}${sel ? ' sel' : ''}">
        <button type="button" class="cal-whead" data-day="${iso}" aria-pressed="${sel}" aria-label="${esc(longDate(iso))}"><span>${DOW[d.getDay()]}</span><b>${d.getDate()}</b></button>
        ${evs.length ? `<ul class="cal-wlist">${evs.map(itemHtml).join('')}</ul>` : '<p class="cal-none">Nothing</p>'}
      </div>`;
    }
    return h + '</div>';
  }
  function itemHtml(e) {
    const name = e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : `<span>${esc(e.title)}</span>`;
    const sub = [e.sub, KIND[e.kind]].filter(Boolean).join(' · ');
    return `<li class="cal-item k-${e.kind}${e.done ? ' done' : ''}"${style(e)}${e.code ? ` title="${esc(e.code)}"` : ''}>
      <span class="cal-time">${e.time ? esc(e.time) : 'All day'}</span>
      <span class="cal-body">${name}<small>${esc(sub)}${e.done ? ' · Done' : ''}</small></span></li>`;
  }
  function title() {
    if (view() === 'month') return cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    const s = weekStart(cursor), e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6);
    const sameMonth = s.getMonth() === e.getMonth();
    return `${s.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString(undefined, sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })}, ${e.getFullYear()}`;
  }

  function draw() {
    if (!sec || !sec.isConnected) return;
    const v = view(), evs = eventsOn(selected);
    const body = $('#calBody'), keep = document.activeElement && body.contains(document.activeElement) ? document.activeElement : null;
    const keepDay = keep && keep.dataset.day;
    if (keep && keep.closest('[data-caladd]')) return;   // don't redraw while you're typing a new deadline
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
      <div class="cal-detail">
        ${v === 'month' ? `<h3>${esc(longDate(selected))}</h3>${evs.length ? `<ul class="cal-list">${evs.map(itemHtml).join('')}</ul>` : '<p class="cal-none">Nothing on this day.</p>'}` : ''}
        <form class="cal-add" data-caladd>
          <input name="title" placeholder="Add a deadline on ${esc(shortDate(selected))}" autocomplete="off" aria-label="New deadline on ${esc(longDate(selected))}" required>
          <input name="time" type="time" aria-label="Time (optional)" title="Time (optional)">
          <button class="btn" type="submit">Add</button>
        </form>
      </div>
      <div class="cal-legend"><span><i class="cal-dot k-deadline"></i>Deadline</span>${HB.canvasAll && HB.canvasAll().length ? '<span><i class="cal-dot k-canvas" style="--h:350"></i>Canvas (color per class)</span>' : ''}<span><i class="cal-dot k-repeat"></i>Repeating task</span></div>`;
    if (keepDay) { const b = body.querySelector(`[data-day="${keepDay}"]`); b && b.focus(); }
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
    desc: 'A month or week view of your deadlines, Canvas assignments and repeating tasks. Click a day to add to it.',
    icon: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 16.5h2M11 16.5h2"/>',
    render(section) {
      sec = section;
      sec.classList.add('cal');
      sec.innerHTML = `<div class="card-h"><h2>Calendar</h2></div><div class="cal-wrap" id="calBody"></div>`;
      sec.addEventListener('click', e => {
        const t = e.target;
        const day = t.closest('[data-day]'), nav = t.closest('[data-calnav]'), vw = t.closest('[data-calview]');
        if (day) { selected = day.dataset.day; const d = parseD(selected); if (view() === 'month' && d.getMonth() !== cursor.getMonth()) cursor = new Date(d.getFullYear(), d.getMonth(), 1); draw(); }
        else if (nav) move(+nav.dataset.calnav);
        else if (t.closest('[data-caltoday]')) { cursor = HB.today0(); selected = localISO(); draw(); }
        else if (vw) { cfg().view = vw.dataset.calview; HB.saveQuietly(); cursor = parseD(selected); draw(); }
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
      sec.addEventListener('submit', e => {
        const f = e.target.closest('[data-caladd]'); if (!f) return;
        e.preventDefault();
        const title = f.title.value.trim(); if (!title) return;
        HB.state.deadlines.push({ id: HB.uid(), title, date: selected, time: f.time.value || '', tag: '', notes: '' });
        f.reset(); document.activeElement && document.activeElement.blur();
        HB.commit();
        HB.toast(`Added "${title}" to Coming up for ${shortDate(selected)}`);
      });
      draw();
    }
  });
  HB.onChange(draw);
})();
