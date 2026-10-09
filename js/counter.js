/* Days since: count the days since something happened (an injury, a fresh start, a streak).
   Each counter shows the day count, how many weeks that is, the next milestone to reach,
   and an optional note to yourself ("Keep pushing"). On a milestone day it gets a badge.
   Add as many as you like; they stay compact so several fit in one widget.
   Saved in HB.state.counters, so they sync and back up with everything else. */
(function () {
  const { esc, uid, localISO, parseD, daysUntil } = HB;
  let sec = null, editing = null, adding = false;
  const list = () => { if (!Array.isArray(HB.state.counters)) HB.state.counters = []; return HB.state.counters; };
  const pen = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';
  const niceDate = iso => parseD(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const since = c => -daysUntil(c.date);   // 0 on the day itself

  // "6 weeks, 3 days"
  function weeks(n) {
    if (n < 7) return '';
    const w = Math.floor(n / 7), d = n % 7;
    return `${w} week${w === 1 ? '' : 's'}${d ? `, ${d} day${d === 1 ? '' : 's'}` : ''}`;
  }
  // Milestones worth marking: first week, two weeks, then round numbers, half a year, years
  function milestones(upTo) {
    const m = [7, 14, 21, 30, 50, 60, 75, 90, 100, 120, 150, 182, 200, 250, 300, 365];
    for (let x = 400; x <= upTo + 400; x += 100) m.push(x);
    for (let y = 2; y * 365 <= upTo + 400; y++) m.push(y * 365);
    return [...new Set(m)].sort((a, b) => a - b);
  }
  const mName = d => d === 182 ? '6 months' : d % 365 === 0 ? `${d / 365} year${d === 365 ? '' : 's'}` : `day ${d}`;

  function rowHtml(c) {
    if (c.id === editing) return formHtml(c);
    const n = since(c);
    if (n < 0) {   // a date that hasn't happened yet
      return `<li class="dc-row" data-id="${c.id}"><span class="dc-num mono">–</span>
        <span class="dc-txt"><span><b>${esc(c.title)}</b></span><small>Starts counting ${esc(niceDate(c.date))}</small></span>${btns(c)}</li>`;
    }
    const ms = milestones(n), next = ms.find(x => x > n), hit = ms.includes(n);
    const sub = [`Since ${niceDate(c.date)}`, weeks(n), next ? `${next - n} to ${mName(next)}` : ''].filter(Boolean).join(' · ');
    return `<li class="dc-row${hit ? ' hit' : ''}" data-id="${c.id}">
      <span class="dc-num mono">${n.toLocaleString()}</span>
      <span class="dc-txt">
        <span>day${n === 1 ? '' : 's'} since <b>${esc(c.title)}</b>${hit ? ` <span class="dc-badge">${esc(mName(n) === `day ${n}` ? `Day ${n}` : mName(n))}</span>` : ''}</span>
        <small>${esc(sub)}</small>
        ${c.note ? `<span class="dc-note">${esc(c.note)}</span>` : ''}
      </span>${btns(c)}</li>`;
  }
  /* The featured counter: a big number in a ring like the Focus timer. The ring fills up
     on the way to the next milestone. Click the star on any other counter to feature it instead. */
  function featuredHtml(c) {
    if (c.id === editing) return `<ul class="dc-list">${formHtml(c)}</ul>`;
    const n = since(c);
    if (n < 0) return `<ul class="dc-list">${rowHtml(c)}</ul>`;
    const ms = milestones(n), next = ms.find(x => x > n), prev = [0, ...ms].filter(x => x <= n).pop();
    const hit = ms.includes(n), C = 2 * Math.PI * 44, pct = next ? (n - prev) / (next - prev) : 1;
    const long = n >= 1000;
    return `<div class="dc-feat${hit ? ' hit' : ''}" data-id="${c.id}">
      <div class="dc-dial" role="img" aria-label="${n} days since ${esc(c.title)}${next ? `, ${next - n} days to ${mName(next)}` : ''}">
        <svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="44"/><circle class="bar" cx="50" cy="50" r="44" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - (hit ? 1 : pct))}"/></svg>
        <div class="read"><b class="mono${long ? ' long' : ''}">${n.toLocaleString()}</b><small>day${n === 1 ? '' : 's'}</small></div>
      </div>
      <div class="dc-ftxt">
        <div class="dc-ftitle">since <b>${esc(c.title)}</b>${hit ? ` <span class="dc-badge">${esc(mName(n) === `day ${n}` ? `Day ${n}` : mName(n))}</span>` : ''}</div>
        <small>${esc([weeks(n), `Since ${niceDate(c.date)}`].filter(Boolean).join(' · '))}</small>
        ${next ? `<small class="dc-next">${next - n} day${next - n === 1 ? '' : 's'} to ${esc(mName(next))}</small>` : ''}
        ${c.note ? `<span class="dc-note">${esc(c.note)}</span>` : ''}
      </div>
      <div class="dc-fbtns">${btns(c, true)}</div>
    </div>`;
  }
  const star = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>';
  const btns = (c, featured) => (featured ? '' : `<button type="button" class="del edit" data-dcfeat="${c.id}" aria-label="Show ${esc(c.title)} big" title="Show this one big">${star}</button>`) + `<button type="button" class="del edit" data-dcedit="${c.id}" aria-label="Edit ${esc(c.title)}" title="Edit">${pen}</button>
      <button type="button" class="del" data-dcdel="${c.id}" aria-label="Delete ${esc(c.title)}" title="Delete">&times;</button>`;
  function formHtml(c) {
    return `<li class="dc-form-li"><form class="dc-form" data-dcform="${c ? c.id : ''}">
      <input class="dl-in" name="title" value="${c ? esc(c.title) : ''}" placeholder="What happened? (e.g. ACL injury, Started the gym)" aria-label="What happened" required>
      <label class="dc-lbl">On <input class="dl-in" name="date" type="date" max="${localISO()}" value="${c ? esc(c.date) : ''}" aria-label="Date it happened" required></label>
      <input class="dl-in" name="note" value="${c && c.note ? esc(c.note) : ''}" placeholder="A note to yourself (optional), e.g. Keep pushing" aria-label="Note to yourself" maxlength="120">
      <small class="dc-err" data-dcerr></small>
      <div class="dc-btns"><button type="button" class="btn sec" data-dccancel>Cancel</button><button type="submit" class="btn">${c ? 'Save' : 'Add'}</button></div>
    </form></li>`;
  }

  function draw(force) {
    const body = sec && sec.querySelector('.dc-body'); if (!body) return;
    // Don't redraw while you're typing in the form (unless you just pressed Cancel, Add or Edit)
    if (!force && body.contains(document.activeElement) && document.activeElement.closest('.dc-form')) return;
    const items = list();   // in the order you added them
    const feat = items.find(c => c.featured) || items[0], rest = items.filter(c => c !== feat);
    body.innerHTML = (feat ? featuredHtml(feat) : '')
      + `<ul class="dc-list">${rest.map(rowHtml).join('')}${adding ? formHtml(null) : ''}</ul>`
      + (!items.length && !adding ? '<p class="dc-empty">Count the days since something happened, like an injury, a fresh start or a new habit. Click "+ Add".</p>' : '');
    const f = body.querySelector('.dc-form [name=title]'); if (f && (adding || editing) && !f.value) f.focus();
  }

  HB.registerWidget({
    id: 'counters', name: 'Days since', size: 's',
    desc: 'Count the days since something happened, with weeks, milestones and a note to yourself.',
    icon: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M10 14.5h4"/>',
    render(section) {
      sec = section;
      sec.innerHTML = `<div class="card-h"><h2>Days since</h2><button type="button" class="ghost" data-dcadd>+ Add</button></div><div class="dc-body"></div>`;
      sec.addEventListener('click', e => {
        const t = e.target;
        if (t.closest('[data-dcadd]')) { adding = true; editing = null; draw(true); sec.querySelector('.dc-form [name=title]').focus(); return; }
        if (t.closest('[data-dccancel]')) { adding = false; editing = null; draw(true); return; }
        const ed = t.closest('[data-dcedit]');
        if (ed) { editing = ed.dataset.dcedit; adding = false; draw(true); const i = sec.querySelector('.dc-form [name=title]'); i && (i.focus(), i.select()); return; }
        const fb = t.closest('[data-dcfeat]');
        if (fb) { list().forEach(c => { c.featured = c.id === fb.dataset.dcfeat; }); HB.commit(); return; }
        const del = t.closest('[data-dcdel]');
        if (del) {
          const i = list().findIndex(c => c.id === del.dataset.dcdel); if (i < 0) return;
          const [c] = list().splice(i, 1); HB.commit();
          HB.toast(`Deleted "${c.title}"`, 5000, { label: 'Undo', fn: () => { list().splice(i, 0, c); HB.commit(); } });
        }
      });
      sec.addEventListener('submit', e => {
        const f = e.target.closest('[data-dcform]'); if (!f) return;
        e.preventDefault();
        const title = f.querySelector('[name=title]').value.trim(), date = f.querySelector('[name=date]').value, note = f.querySelector('[name=note]').value.trim();
        if (!title || !date) return;
        if (date > localISO()) { f.querySelector('[data-dcerr]').textContent = 'Pick today or a day in the past.'; return; }
        const c = f.dataset.dcform && list().find(x => x.id === f.dataset.dcform);
        if (c) Object.assign(c, { title, date, note }); else list().push({ id: uid(), title, date, note });
        adding = false; editing = null; document.activeElement && document.activeElement.blur(); HB.commit();
      });
      sec.addEventListener('keydown', e => { if (e.key === 'Escape' && (adding || editing)) { adding = false; editing = null; document.activeElement.blur(); draw(true); } });
      draw();
      // Roll over at midnight
      let day = localISO(); setInterval(() => { if (localISO() !== day) { day = localISO(); draw(); } }, 60 * 1000);
    }
  });
  HB.onChange(draw);
})();
