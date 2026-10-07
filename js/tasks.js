/* Today (to-do list), Coming up (deadlines) and the one-line summary under the greeting. */
(function () {
  const { $, esc, uid, parseD, daysUntil, localISO } = HB;

  /* Repeating tasks: type "every Mon/Wed", "every weekday", "daily"… at the end of a task */
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const FULL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayIndex = w => {
    for (const x of [w, w.replace(/s$/, '')]) {
      const i = FULL.findIndex(f => x.length >= 2 && f.startsWith(x) && (x.length >= 3 || ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].includes(x)));
      if (i >= 0) return i;
    }
    return -1;
  };
  function parseDays(str) {
    const s = str.toLowerCase().trim().replace(/[.!]$/, '');
    if (/^(day|days|daily)$/.test(s)) return [0, 1, 2, 3, 4, 5, 6];
    if (/^(weekday|weekdays)$/.test(s)) return [1, 2, 3, 4, 5];
    if (/^(weekend|weekends)$/.test(s)) return [0, 6];
    const parts = s.split(/\s*(?:\/|,|&|\+|\band\b|\s)\s*/).filter(Boolean), out = new Set();
    for (const w of parts) { const i = dayIndex(w); if (i < 0) return null; out.add(i); }
    return out.size ? [...out].sort() : null;
  }
  // "Pay rent every month on the 1st", "Budget monthly", "Bills every 15th" → day of the month
  function parseMonthly(str) {
    const s = str.toLowerCase().trim().replace(/[.!]$/, '');
    let m = /^month(?:ly)?(?:\s+on)?(?:\s+the)?(?:\s+(\d{1,2})(?:st|nd|rd|th)?)?$/.exec(s) || /^(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)(?:\s+of\s+(?:the|each|every)\s+month)?$/.exec(s);
    if (!m) return null;
    const d = m[1] ? +m[1] : new Date().getDate();
    return d >= 1 && d <= 31 ? d : null;
  }
  // "Gym every Mon/Wed" → { text: 'Gym', days: [1, 3] }; "Rent every month on the 1st" → { text: 'Rent', monthly: 1 }.
  // Returns null for an ordinary task.
  HB.parseRepeat = v => {
    const m = /^(.+?)\s+(?:every|each)\s+(.+)$/i.exec(v) || /^(.+?)\s+(daily|weekdays|weekends|monthly(?:\s+on\s+(?:the\s+)?\d{1,2}(?:st|nd|rd|th)?)?)$/i.exec(v);
    if (!m) return null;
    const mo = parseMonthly(m[2]); if (mo) return { text: m[1].trim(), monthly: mo };
    // "every 2 weeks", "every other day", "every week", "every 3 months"
    const iv = /^(other|\d{1,2})?\s*(day|week|month)s?$/i.exec(m[2].trim().replace(/[.!]$/, ''));
    if (iv && (iv[1] || iv[2].toLowerCase() !== 'day')) {
      const n = !iv[1] ? 1 : iv[1].toLowerCase() === 'other' ? 2 : +iv[1];
      if (n >= 1) return { text: m[1].trim(), every: n, unit: iv[2].toLowerCase(), start: localISO() };
    }
    const days = parseDays(m[2]);
    return days ? { text: m[1].trim(), days } : null;
  };
  const ord = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const daysText = days => days.length === 7 ? 'every day' : days.join() === '1,2,3,4,5' ? 'every weekday' : days.join() === '0,6' ? 'every weekend' : 'every ' + days.map(d => DAY_NAMES[d]).join(', ');
  // A rule is weekly ({ days: [0-6] }), monthly ({ monthly: 1-31 }),
  // or a custom gap ({ every: 2, unit: 'day' | 'week' | 'month', start: 'YYYY-MM-DD' })
  function intervalText(r) {
    const s = parseD(r.start), n = r.every;
    let t = n === 1 ? `every ${r.unit}` : n === 2 ? `every other ${r.unit}` : `every ${n} ${r.unit}s`;
    if (r.unit === 'week') t += ` on ${s.toLocaleDateString(undefined, { weekday: 'short' })}`;
    if (r.unit === 'month') t += ` on the ${ord(s.getDate())}`;
    return t;
  }
  const ruleText = r => r.every ? intervalText(r) : r.monthly ? `every month on the ${ord(r.monthly)}` : daysText(r.days || []);
  HB.repeatText = ruleText;
  // Does the rule land on this date? (A monthly "31st" lands on the last day of shorter months.)
  function occursOn(r, d) {
    if (r.every) {
      const s = parseD(r.start), d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (d0 < s) return false;
      const diff = Math.round((d0 - s) / 864e5);
      if (r.unit === 'day') return diff % r.every === 0;
      if (r.unit === 'week') return diff % (7 * r.every) === 0;
      const months = (d0.getFullYear() - s.getFullYear()) * 12 + d0.getMonth() - s.getMonth(), last = new Date(d0.getFullYear(), d0.getMonth() + 1, 0).getDate();
      return months % r.every === 0 && d0.getDate() === Math.min(s.getDate(), last);
    }
    if (r.monthly) { const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); return d.getDate() === Math.min(r.monthly, last); }
    return (r.days || []).includes(d.getDay());
  }
  HB.repeatOccursOn = occursOn;   // used by the Calendar widget
  function nextDate(r) {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    for (let i = 1; i <= 800; i++) { d.setDate(d.getDate() + 1); if (occursOn(r, d)) return i < 7 ? d.toLocaleDateString(undefined, { weekday: 'long' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
    return '';
  }
  // Put today's copy on the list if the rule lands today and it isn't there yet
  function addTodayIfDue(r, top) {
    const today = localISO();
    if (!occursOn(r, new Date()) || r.last === today) return false;
    r.last = today;
    if (HB.state.tasks.some(t => t.rec === r.id && !t.done)) return false;
    const t = { id: uid(), text: r.text, done: false, day: today, rec: r.id };
    if (top) HB.state.tasks.unshift(t); else addOpenAtEnd(t);
    return true;
  }

  /* A new day: finished tasks from earlier days are cleared, unfinished ones carry over
     (tagged "from yesterday"), and today's repeating tasks are added. */
  function newDay() {
    const st = HB.state, today = localISO();
    if (st.lastDay === today) return false;
    if (!Array.isArray(st.recurring)) st.recurring = [];
    const first = !st.lastDay;
    st.tasks.forEach(t => { if (!t.day) t.day = first ? today : st.lastDay; });
    if (!first) {
      st.tasks = st.tasks.filter(t => t.done ? t.day >= today : true);
      st.tasks.forEach(t => { if (!t.done && t.day < today) { t.from = t.from || t.day; t.day = today; } });
    }
    st.recurring.forEach(r => addTodayIfDue(r, false));
    st.lastDay = today;
    return true;
  }
  function addOpenAtEnd(t) { const i = HB.state.tasks.findIndex(x => x.done); if (i < 0) HB.state.tasks.push(t); else HB.state.tasks.splice(i, 0, t); }
  HB.newDay = newDay;
  newDay(); HB.saveQuietly();
  setInterval(() => { if (newDay()) HB.commit(); }, 60 * 1000);   // catches midnight if the page stays open

  // Add a task (used by the Today box). Handles "every …" repeats.
  HB.addTask = v => {
    v = v.trim(); if (!v) return null;
    const rep = HB.parseRepeat(v), today = localISO();
    if (!rep) { HB.state.tasks.unshift({ id: uid(), text: v, done: false, day: today }); HB.commit(); return 'Added to Today'; }
    const r = Object.assign({ id: uid() }, rep);
    if (!Array.isArray(HB.state.recurring)) HB.state.recurring = [];
    HB.state.recurring.push(r);
    const added = addTodayIfDue(r, true);
    HB.commit();
    return `"${r.text}" repeats ${ruleText(r)}` + (added ? ' (added for today)' : `. First one: ${nextDate(r)}`);
  };
  const fromText = iso => { const n = -daysUntil(iso); return n === 1 ? 'from yesterday' : n < 7 ? 'from ' + parseD(iso).toLocaleDateString(undefined, { weekday: 'short' }) : 'from ' + parseD(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };
  const repeatIcon = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>';

  /* Today */
  const checkSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17 19 7"/></svg>';
  const pencil = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';
  const grip = '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true"><circle cx="2.5" cy="2.5" r="1.4"/><circle cx="7.5" cy="2.5" r="1.4"/><circle cx="2.5" cy="7" r="1.4"/><circle cx="7.5" cy="7" r="1.4"/><circle cx="2.5" cy="11.5" r="1.4"/><circle cx="7.5" cy="11.5" r="1.4"/></svg>';
  let editingTask = null, tdrag = null;
  function tagsHtml(x) {
    const r = x.rec && (HB.state.recurring || []).find(r => r.id === x.rec);
    let h = '';
    if (r) h += ` <button type="button" class="ttag rp-open" data-rpopen="${r.id}" title="Repeats ${esc(ruleText(r))}. Click to change." aria-label="Repeats ${esc(ruleText(r))}. Change how often">${repeatIcon}</button>`;
    if (x.from && !x.done) h += ` <span class="ttag${-daysUntil(x.from) >= 3 ? ' old' : ''}" title="Carried over from ${esc(parseD(x.from).toDateString())}">${esc(fromText(x.from))}</span>`;
    return h;
  }
  /* Repeats panel: list of repeating tasks, each can be edited (name + how often) or stopped */
  let editingRule = null;
  /* The "how often" picker, used when editing a task and in the Repeats panel */
  const freqOf = r => !r ? 'daily' : r.every ? 'custom' : r.monthly ? 'monthly' : (r.days || []).length === 7 ? 'daily' : (r.days || []).join() === '1,2,3,4,5' ? 'weekdays' : 'days';
  const FREQS = [['daily', 'Every day'], ['weekdays', 'Weekdays'], ['days', 'Certain days'], ['monthly', 'Monthly'], ['custom', 'Custom']];
  function schedHtml(r) {
    const f = freqOf(r), now = new Date();
    const days = r && r.days && r.days.length < 7 ? r.days : [now.getDay()], dom = (r && r.monthly) || now.getDate();
    const every = (r && r.every) || 2, unit = (r && r.unit) || 'week', start = (r && r.start) || localISO();
    return `<div class="sched" data-freq="${f}">
      <div class="rp-freq" role="group" aria-label="How often">${FREQS.map(([k, t]) => `<button type="button" data-f="${k}" aria-pressed="${k === f}">${t}</button>`).join('')}</div>
      <div class="rp-days" role="group" aria-label="Days of the week">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button type="button" data-day="${d}" aria-pressed="${days.includes(d)}" title="${FULL[d][0].toUpperCase() + FULL[d].slice(1)}">${DAY_NAMES[d].slice(0, 2)}</button>`).join('')}</div>
      <label class="rp-month">On the <select class="dl-in" name="dom">${[...Array(31)].map((_, i) => `<option value="${i + 1}"${i + 1 === dom ? ' selected' : ''}>${ord(i + 1)}</option>`).join('')}</select> of every month</label>
      <div class="rp-custom"><span>Every</span><input class="dl-in" name="every" type="number" min="1" max="99" value="${every}" aria-label="How many"><select class="dl-in" name="unit" aria-label="Days, weeks or months">${['day', 'week', 'month'].map(u => `<option value="${u}"${u === unit ? ' selected' : ''}>${u}s</option>`).join('')}</select><span>starting</span><input class="dl-in" name="start" type="date" value="${start}" aria-label="Starting"></div>
      <small class="rp-note" data-note></small>
    </div>`;
  }
  function syncSched(el) {
    const f = el.dataset.freq;
    el.querySelectorAll('[data-f]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.f === f)));
    el.querySelector('.rp-days').hidden = f !== 'days';
    el.querySelector('.rp-month').hidden = f !== 'monthly';
    el.querySelector('.rp-custom').hidden = f !== 'custom';
    const n = +el.querySelector('[name=every]').value || 0;
    el.querySelectorAll('[name=unit] option').forEach(o => { o.textContent = n === 1 ? o.value : o.value + 's'; });
    const dom = +el.querySelector('[name=dom]').value, sd = el.querySelector('[name=start]').value;
    let note = '';
    if (f === 'monthly' && dom > 28) note = `In months without a ${ord(dom)}, it shows up on the last day of the month.`;
    if (f === 'custom' && n >= 1 && sd) note = 'Repeats ' + intervalText({ every: n, unit: el.querySelector('[name=unit]').value, start: sd }) + '.';
    el.querySelector('[data-note]').textContent = note;
  }
  // Read the picker: returns the schedule fields, or { error }
  function readSched(el) {
    const f = el.dataset.freq;
    if (f === 'daily') return { days: [0, 1, 2, 3, 4, 5, 6] };
    if (f === 'weekdays') return { days: [1, 2, 3, 4, 5] };
    if (f === 'monthly') return { monthly: +el.querySelector('[name=dom]').value };
    if (f === 'custom') {
      const n = Math.round(+el.querySelector('[name=every]').value), start = el.querySelector('[name=start]').value;
      if (!(n >= 1 && n <= 99)) return { error: 'Enter a number from 1 to 99.' };
      if (!start) return { error: 'Pick a start date.' };
      return { every: n, unit: el.querySelector('[name=unit]').value, start };
    }
    const days = [...el.querySelectorAll('[data-day][aria-pressed="true"]')].map(b => +b.dataset.day).sort();
    return days.length ? { days } : { error: 'Pick at least one day.' };
  }
  function setSchedule(r, sc) { delete r.days; delete r.monthly; delete r.every; delete r.unit; delete r.start; Object.assign(r, sc); }
  // Clicks and changes inside any picker (task editor or Repeats panel)
  document.addEventListener('click', e => {
    const el = e.target.closest('.sched'); if (!el) return;
    const fb = e.target.closest('[data-f]'), db = e.target.closest('[data-day]');
    if (fb) { el.dataset.freq = fb.dataset.f; syncSched(el); }
    if (db) db.setAttribute('aria-pressed', String(db.getAttribute('aria-pressed') !== 'true'));
  });
  ['change', 'input'].forEach(ev => document.addEventListener(ev, e => { const el = e.target.closest && e.target.closest('.sched'); if (el) syncSched(el); }));
  function ruleEditor(r) {
    return `<form class="rp-edit" data-rpedit="${r.id}">
      <input class="dl-in" name="text" value="${esc(r.text)}" aria-label="Task" required>
      ${schedHtml(r)}
      <div class="dl-edit-btns"><button class="btn sec" type="button" data-rpcancel>Cancel</button><button class="btn" type="submit">Save</button></div>
    </form>`;
  }
  function renderRepeats() {
    const rs = HB.state.recurring || [], b = $('#repeatsBtn'), p = $('#repeatsPanel');
    // Don't redraw over an edit in progress
    if (editingRule && p.contains(document.activeElement) && document.activeElement.closest('.rp-edit')) return;
    b.hidden = !rs.length; b.textContent = rs.length ? `Repeats (${rs.length})` : 'Repeats';
    if (!rs.length) { p.hidden = true; b.setAttribute('aria-expanded', 'false'); }
    p.innerHTML = `<div class="rp-h">Repeating tasks <small>Added to Today on their days. Click the pencil to change how often.</small></div>` + rs.map(r => r.id === editingRule ? ruleEditor(r)
      : `<div class="rp-row"><span>${repeatIcon} ${esc(r.text)}</span><small>${esc(ruleText(r))}</small><button class="del edit" data-rpedit-btn="${r.id}" aria-label="Edit ${esc(r.text)}" title="Edit">${pencil}</button><button class="del" data-unrep="${r.id}" aria-label="Stop repeating ${esc(r.text)}" title="Stop repeating">&times;</button></div>`).join('');
    const sc = p.querySelector('.sched'); if (sc) syncSched(sc);
  }
  function openRuleEditor(id) {
    editingRule = id; const p = $('#repeatsPanel'); p.hidden = false; $('#repeatsBtn').setAttribute('aria-expanded', 'true');
    renderRepeats(); const i = p.querySelector('.rp-edit [name=text]'); if (i) { i.focus(); i.select(); }
  }
  HB.editRepeat = openRuleEditor;
  $('#repeatsBtn').onclick = () => { const p = $('#repeatsPanel'); p.hidden = !p.hidden; if (p.hidden) { editingRule = null; renderRepeats(); } $('#repeatsBtn').setAttribute('aria-expanded', String(!p.hidden)); };
  $('#repeatsPanel').addEventListener('click', e => {
    if (e.target.closest('.rp-edit')) { if (e.target.closest('[data-rpcancel]')) { editingRule = null; renderRepeats(); } return; }
    const ed = e.target.closest('[data-rpedit-btn]'); if (ed) { openRuleEditor(ed.dataset.rpeditBtn); return; }
    const b = e.target.closest('[data-unrep]'); if (!b) return;
    const r = (HB.state.recurring || []).find(x => x.id === b.dataset.unrep);
    HB.state.recurring = HB.state.recurring.filter(x => x.id !== b.dataset.unrep);
    HB.state.tasks.forEach(t => { if (t.rec === b.dataset.unrep) delete t.rec; });
    HB.commit(); if (r) HB.toast(`"${r.text}" won't repeat anymore`);
  });
  $('#repeatsPanel').addEventListener('keydown', e => { if (e.key === 'Escape' && editingRule) { editingRule = null; renderRepeats(); } });
  $('#repeatsPanel').addEventListener('submit', e => {
    const f = e.target.closest('.rp-edit'); if (!f) return;
    e.preventDefault();
    const r = (HB.state.recurring || []).find(x => x.id === f.dataset.rpedit); if (!r) return;
    const text = f.querySelector('[name=text]').value.trim(), sc = readSched(f.querySelector('.sched'));
    if (!text) return;
    if (sc.error) { f.querySelector('[data-note]').textContent = sc.error; return; }
    const oldText = r.text;
    r.text = text;
    setSchedule(r, sc);
    // Rename the open copy on today's list too
    HB.state.tasks.forEach(t => { if (t.rec === r.id && !t.done && t.text === oldText) t.text = text; });
    if (r.last !== localISO()) addTodayIfDue(r, false);
    editingRule = null; HB.commit(); renderRepeats();
    HB.toast(`"${r.text}" now repeats ${ruleText(r)}`);
  });
  // The repeat icon on a task opens that task's editor
  $('#tasks').addEventListener('click', e => { const b = e.target.closest('[data-rpopen]'); if (b) { e.stopPropagation(); const li = b.closest('.task'); li && startEdit(li.dataset.id); } });
  // Editing a task: its name, and whether it repeats (and how often)
  const ruleFor = x => x.rec && (HB.state.recurring || []).find(r => r.id === x.rec);
  function taskEditor(x) {
    const r = ruleFor(x), on = !!r;
    return `<li class="task task-edit" data-id="${x.id}"><form class="task-form" data-tedit="${x.id}" data-rep="${on ? 'yes' : 'no'}">
      <input class="dl-in" name="text" value="${esc(x.text)}" aria-label="Task" required>
      <div class="te-rep"><span>Is this a repeating task?</span><div class="seg" role="group" aria-label="Repeating task"><button type="button" data-rep="no" aria-pressed="${!on}">No</button><button type="button" data-rep="yes" aria-pressed="${on}">Yes</button></div></div>
      <div class="te-sched"${on ? '' : ' hidden'}><span class="te-lbl">How often?</span>${schedHtml(r)}</div>
      <div class="dl-edit-btns"><button class="btn sec" type="button" data-tcancel>Cancel</button><button class="btn" type="submit">Save</button></div>
    </form></li>`;
  }
  function startEdit(id) {
    editingTask = id; renderTasks(true);
    const sc = $('#tasks .task-edit .sched'); if (sc) syncSched(sc);
    const i = $('#tasks [name=text]'); if (i) { i.focus(); i.select(); }
  }
  function renderTasks(force) {
    if (tdrag && tdrag.active) return;
    // Don't wipe out an edit in progress when something else on the page updates
    if (!force && editingTask && document.activeElement && document.activeElement.closest && document.activeElement.closest('.task-edit')) return;
    const t = HB.state.tasks, done = t.filter(x => x.done).length;
    const pct = t.length ? done / t.length : 0, C = 2 * Math.PI * 8;
    $('#progress').innerHTML = t.length ? `<svg class="ring" viewBox="0 0 22 22"><circle cx="11" cy="11" r="8" style="stroke:var(--surface-2)"/><circle cx="11" cy="11" r="8" style="stroke:var(--good);stroke-dasharray:${C};stroke-dashoffset:${C * (1 - pct)};transform:rotate(-90deg);transform-origin:center;transition:stroke-dashoffset .4s" stroke-linecap="round"/></svg><span class="mono">${done}/${t.length}</span>` : '';
    const sorted = [...t.filter(x => !x.done), ...t.filter(x => x.done)];
    $('#tasks').innerHTML = sorted.length ? sorted.map(x => x.id === editingTask
      ? taskEditor(x)
      : `<li class="task${x.done ? ' done' : ''}" data-id="${x.id}">
        ${x.done ? '<span class="grip off"></span>' : `<span class="grip" title="Drag to reorder" aria-hidden="true">${grip}</span>`}
        <button class="check" data-toggle="${x.id}" aria-label="${x.done ? 'Mark not done' : 'Mark done'}">${checkSvg}</button>
        <span class="txt">${esc(x.text)}${tagsHtml(x)}</span>
        <button class="del edit" data-tedit-btn="${x.id}" aria-label="Edit task" title="Edit">${pencil}</button>
        <button class="del" data-del="${x.id}" aria-label="Delete task">&times;</button></li>`).join('')
      : `<li class="empty">Nothing on your list. Add the first thing you want to get done today.</li>`;
    $('#clearDone').hidden = !done;
  }
  $('#taskForm').addEventListener('submit', e => {
    e.preventDefault(); const v = $('#taskInput').value.trim(); if (!v) return;
    $('#taskInput').value = '';
    const msg = HB.addTask(v);
    if (HB.parseRepeat(v)) HB.toast(msg, 4000);
    const first = document.querySelector('.task'); first && first.classList.add('pop');
  });
  $('#tasks').addEventListener('click', e => {
    const tg = e.target.closest('[data-toggle]'), dl = e.target.closest('[data-del]'), ed = e.target.closest('[data-tedit-btn]');
    if (tg) {
      const t = HB.state.tasks.find(x => x.id === tg.dataset.toggle); t.done = !t.done;
      tg.closest('.task').classList.toggle('done', t.done);
      setTimeout(HB.commit, 380);   // let the check animation play before the list re-sorts
    }
    if (dl) { HB.state.tasks = HB.state.tasks.filter(x => x.id !== dl.dataset.del); HB.commit(); }
    if (ed) startEdit(ed.dataset.teditBtn);
    const rb = e.target.closest('.te-rep [data-rep]');
    if (rb) {
      const f = rb.closest('form'); f.dataset.rep = rb.dataset.rep;
      f.querySelectorAll('.te-rep [data-rep]').forEach(b => b.setAttribute('aria-pressed', String(b === rb)));
      f.querySelector('.te-sched').hidden = rb.dataset.rep !== 'yes';
    }
    if (e.target.closest('[data-tcancel]')) { editingTask = null; renderTasks(true); }
  });
  // Double-click a task's words to edit it
  $('#tasks').addEventListener('dblclick', e => { const li = e.target.closest('.task:not(.task-edit)'); if (li && e.target.closest('.txt')) { const b = li.querySelector('[data-tedit-btn]'); b && b.click(); } });
  $('#tasks').addEventListener('submit', e => {
    const f = e.target.closest('[data-tedit]'); if (!f) return;
    e.preventDefault();
    const v = f.querySelector('[name=text]').value.trim(), t = HB.state.tasks.find(x => x.id === f.dataset.tedit);
    if (!t || !v) return;
    const r = ruleFor(t); let msg = '';
    if (f.dataset.rep === 'yes') {
      const sc = readSched(f.querySelector('.sched'));
      if (sc.error) { f.querySelector('[data-note]').textContent = sc.error; return; }
      if (r) {
        const before = ruleText(r); r.text = v; setSchedule(r, sc);
        if (ruleText(r) !== before) msg = `"${v}" now repeats ${ruleText(r)}`;
      } else {
        // This task becomes today's copy of a new repeating task
        const nr = Object.assign({ id: uid(), text: v, last: localISO() }, sc);
        if (!Array.isArray(HB.state.recurring)) HB.state.recurring = [];
        HB.state.recurring.push(nr); t.rec = nr.id;
        msg = `"${v}" repeats ${ruleText(nr)}`;
      }
    } else if (r) {
      HB.state.recurring = HB.state.recurring.filter(x => x.id !== r.id);
      HB.state.tasks.forEach(x => { if (x.rec === r.id) delete x.rec; });
      msg = `"${v}" won't repeat anymore`;
    }
    t.text = v;
    editingTask = null; HB.commit(); renderTasks(true);
    if (msg) HB.toast(msg);
  });
  $('#tasks').addEventListener('keydown', e => {
    if (e.key === 'Escape' && editingTask) { editingTask = null; renderTasks(true); return; }
    // Keyboard reorder: focus a task's checkbox and press Alt + ↑ / ↓
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const li = e.target.closest('.task:not(.done):not(.task-edit)'); if (!li) return;
      e.preventDefault();
      const ids = openIds(), i = ids.indexOf(li.dataset.id), j = i + (e.key === 'ArrowUp' ? -1 : 1);
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]]; applyOrder(ids); HB.commit();
      const b = document.querySelector(`#tasks [data-toggle="${li.dataset.id}"]`); b && b.focus();
    }
  });
  $('#clearDone').onclick = () => { HB.state.tasks = HB.state.tasks.filter(x => !x.done); HB.commit(); };

  /* Drag the dotted handle to reorder unfinished tasks. Finished tasks stay at the bottom. */
  const openIds = () => HB.state.tasks.filter(x => !x.done).map(x => x.id);
  function applyOrder(ids) {
    const byId = new Map(HB.state.tasks.map(x => [x.id, x]));
    HB.state.tasks = [...ids.map(id => byId.get(id)), ...HB.state.tasks.filter(x => x.done)];
  }
  const openLis = () => [...document.querySelectorAll('#tasks .task:not(.done):not(.task-edit)')];
  function flipList(mutate, skip) {
    const before = new Map(openLis().map(li => [li, li.getBoundingClientRect().top]));
    mutate();
    openLis().forEach(li => {
      if (li === skip) return;
      const dy = before.get(li) - li.getBoundingClientRect().top; if (!dy) return;
      li.style.transition = 'none'; li.style.transform = `translateY(${dy}px)`;
      li.offsetWidth; li.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1)'; li.style.transform = '';
    });
  }
  $('#tasks').addEventListener('pointerdown', e => {
    const g = e.target.closest('.grip:not(.off)'); if (!g || e.button > 0) return;
    const li = g.closest('.task'); e.preventDefault();
    tdrag = { li, sy: e.clientY, gy: e.clientY - li.getBoundingClientRect().top, active: false };
    li.setPointerCapture(e.pointerId);
  });
  $('#tasks').addEventListener('pointermove', e => {
    if (!tdrag) return;
    if (!tdrag.active) { if (Math.abs(e.clientY - tdrag.sy) < 4) return; tdrag.active = true; tdrag.li.classList.add('tdragging'); }
    const li = tdrag.li, list = $('#tasks'), top = list.getBoundingClientRect().top, py = e.clientY - top;
    // Compare against each task's resting spot so items never swap back and forth
    const over = openLis().find(o => o !== li && py >= o.offsetTop && py <= o.offsetTop + o.offsetHeight);
    if (over) { const all = openLis(), from = all.indexOf(li), to = all.indexOf(over); flipList(() => list.insertBefore(li, from < to ? over.nextSibling : over), li); }
    li.style.transform = `translateY(${py - tdrag.gy - li.offsetTop}px)`;
  });
  function endTaskDrag() {
    if (!tdrag) return;
    const d = tdrag; tdrag = null; if (!d.active) return;
    d.li.classList.remove('tdragging'); d.li.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1)'; d.li.style.transform = '';
    setTimeout(() => { d.li.style.transition = ''; }, 220);
    applyOrder(openLis().map(li => li.dataset.id)); HB.saveQuietly();
  }
  $('#tasks').addEventListener('pointerup', endTaskDrag);
  $('#tasks').addEventListener('pointercancel', endTaskDrag);

  /* Coming up */
  // When something is due, for sorting: its time if it has one, otherwise the end of that day
  HB.dueAt = x => {
    if (x.ts) return x.ts;
    const d = parseD(x.date), m = /^(\d{1,2}):(\d{2})/.exec(x.time || '');
    if (m) d.setHours(+m[1], +m[2]); else d.setHours(23, 59, 59);
    return d.getTime();
  };
  function dueLabel(n) {
    if (n < 0) return ['Overdue', 'bad'];
    if (n === 0) return ['Today', 'bad'];
    if (n === 1) return ['Tomorrow', 'warn'];
    if (n <= 3) return [`In ${n} days`, 'warn'];
    if (n <= 14) return [`In ${n} days`, ''];
    return [`In ${Math.round(n / 7)} weeks`, 'good'];
  }
  let editingDl = null;
  const noteIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>';
  const CHECK = /^\s*[-*]\s*\[( |x|X)\]\s?(.*)$/, BULLET = /^\s*[-*•]\s+(.*)$/;
  function checklistCount(notes) {
    const items = (notes || '').split('\n').map(l => CHECK.exec(l)).filter(Boolean);
    return items.length ? { done: items.filter(m => m[1] !== ' ').length, total: items.length } : null;
  }
  // Notes: plain lines, "- " bullets, and "- [ ]" checklist items you can tick right here
  function notesHtml(x) {
    let html = '', list = '';
    const flush = () => { if (list) { html += `<ul>${list}</ul>`; list = ''; } };
    (x.notes || '').split('\n').forEach((line, i) => {
      const c = CHECK.exec(line), b = !c && BULLET.exec(line);
      if (c) list += `<li class="ck${c[1] !== ' ' ? ' done' : ''}"><label><input type="checkbox" data-ck="${x.id}:${i}"${c[1] !== ' ' ? ' checked' : ''}> <span>${esc(c[2])}</span></label></li>`;
      else if (b) list += `<li>${esc(b[1])}</li>`;
      else { flush(); html += line.trim() ? `<p>${esc(line)}</p>` : '<p class="gap"></p>'; }
    });
    flush();
    return html;
  }
  function renderDeadlines(force) {
    // Don't wipe out an edit in progress when something else on the page updates
    if (!force && editingDl && document.activeElement && document.activeElement.closest && document.activeElement.closest('.dl-edit')) return;
    // Your own deadlines, plus Canvas assignments when Settings → Canvas says to show them here
    const cv = HB.canvasDeadlines ? HB.canvasDeadlines() : [];
    const d = [...HB.state.deadlines, ...cv].sort((a, b) => HB.dueAt(a) - HB.dueAt(b));
    $('#deadlines').innerHTML = d.length ? d.map(x => {
      if (x._cv) {
        const [lab, cls] = dueLabel(daysUntil(x.date)), dt = parseD(x.date);
        return `<div class="dl-item cv"><div class="row"><div class="date-tile"><i>${dt.toLocaleDateString(undefined, { month: 'short' })}</i><b>${dt.getDate()}</b></div>
          <div class="meta"><div><a class="cv-link" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a></div><small><span class="cv-tag">Canvas</span>${x.course ? esc(x.course) + ' · ' : ''}${dt.toLocaleDateString(undefined, { weekday: 'long' })}${x.time ? ' · ' + esc(x.time) : ''}</small></div>
          <span class="pill ${cls}">${lab}</span>
          <button class="del cvdone" data-cvdone="${esc(x.uid)}" aria-label="Mark ${esc(x.title)} done" title="Mark done"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg></button></div></div>`;
      }
      if (x.id === editingDl) return `<form class="row dl-edit" data-edit="${x.id}">
          <input class="dl-in" name="title" value="${esc(x.title)}" aria-label="What's due" required>
          <input class="dl-in" name="tag" value="${esc(x.tag || '')}" placeholder="Class or tag (optional)" aria-label="Class or tag">
          <input class="dl-in" name="date" type="date" value="${esc(x.date)}" aria-label="Due date" required>
          <input class="dl-in" name="time" type="time" value="${esc(x.time || '')}" aria-label="Time (optional)" title="Time (optional)">
          <textarea class="dl-in" name="notes" rows="4" placeholder="Notes: what you need to do. Start a line with - [ ] to make a checklist." aria-label="Notes">${esc(x.notes || '')}</textarea>
          <div class="dl-edit-btns"><button class="btn sec" type="button" data-cancel>Cancel</button><button class="btn" type="submit">Save</button></div>
        </form>`;
      const [lab, cls] = dueLabel(daysUntil(x.date)), dt = parseD(x.date), cc = checklistCount(x.notes), open = !!(x.showNotes && x.notes);
      const noteTag = x.notes ? ` · <button type="button" class="nt" data-notes="${x.id}" aria-expanded="${open}" title="${open ? 'Hide notes' : 'Show notes'}">${noteIcon}${cc ? `${cc.done}/${cc.total}` : 'Notes'}<svg class="chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>` : '';
      return `<div class="dl-item${open ? ' open' : ''}"><div class="row" data-row="${x.id}"><div class="date-tile"><i>${dt.toLocaleDateString(undefined, { month: 'short' })}</i><b>${dt.getDate()}</b></div>
        <div class="meta"><div>${esc(x.title)}</div><small>${x.tag ? esc(x.tag) + ' · ' : ''}${dt.toLocaleDateString(undefined, { weekday: 'long' })}${x.time ? ' · ' + esc(HB.fmtTime(x.time)) : ''}${noteTag}</small></div>
        <span class="pill ${cls}">${lab}</span>
        <button class="del edit" data-dledit="${x.id}" aria-label="Edit deadline" title="Edit"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg></button>
        <button class="del" data-dldel="${x.id}" aria-label="Remove deadline">&times;</button></div>
        ${open ? `<div class="dl-notes">${notesHtml(x)}</div>` : ''}</div>`;
    }).join('') : `<div class="empty">No deadlines yet. Add assignments, exams, bills, or anything with a date.</div>`;
  }
  $('#toggleDl').onclick = () => { const f = $('#dlForm'); f.hidden = !f.hidden; $('#toggleDl').textContent = f.hidden ? '+ Add' : 'Close'; if (!f.hidden) $('#dlTitle').focus(); };
  $('#dlForm').addEventListener('submit', e => {
    e.preventDefault();
    const title = $('#dlTitle').value.trim(), date = $('#dlDate').value; if (!title || !date) return;
    HB.state.deadlines.push({ id: uid(), title, date, time: $('#dlTime').value || '', tag: $('#dlTag').value.trim(), notes: $('#dlNotes').value.replace(/\s+$/, '') });
    $('#dlTitle').value = $('#dlTag').value = $('#dlNotes').value = $('#dlTime').value = ''; HB.commit();
  });
  $('#deadlines').addEventListener('click', e => {
    const cvd = e.target.closest('[data-cvdone]'); if (cvd) { HB.canvasMarkDone(cvd.dataset.cvdone); return; }
    const del = e.target.closest('[data-dldel]'), ed = e.target.closest('[data-dledit]'), cancel = e.target.closest('[data-cancel]');
    if (del) { HB.state.deadlines = HB.state.deadlines.filter(x => x.id !== del.dataset.dldel); HB.commit(); }
    if (ed) { editingDl = ed.dataset.dledit; renderDeadlines(true); const f = $('#deadlines form [name=title]'); f && f.focus(); }
    if (cancel) { editingDl = null; renderDeadlines(true); }
    // The notes button under an item shows or hides its notes (remembered for each item)
    const nb = e.target.closest('[data-notes]');
    if (nb) { const x = HB.state.deadlines.find(d => d.id === nb.dataset.notes); if (x) { x.showNotes = !x.showNotes; HB.commit(); renderDeadlines(true); } }
  });
  // Tick checklist items right from the list
  $('#deadlines').addEventListener('change', e => {
    const c = e.target.closest('[data-ck]'); if (!c) return;
    const [id, i] = c.dataset.ck.split(':'), x = HB.state.deadlines.find(d => d.id === id); if (!x) return;
    const lines = x.notes.split('\n'); lines[+i] = lines[+i].replace(/\[( |x|X)\]/, c.checked ? '[x]' : '[ ]');
    x.notes = lines.join('\n'); HB.commit(); renderDeadlines(true);
  });
  // Double-click a deadline to edit it too
  $('#deadlines').addEventListener('dblclick', e => { if (e.target.closest('.dl-notes, [data-notes]')) return; const r = e.target.closest('.row:not(.dl-edit)'); const b = r && r.querySelector('[data-dledit]'); if (b) b.click(); });
  $('#deadlines').addEventListener('submit', e => {
    const f = e.target.closest('[data-edit]'); if (!f) return;
    e.preventDefault();
    const val = n => f.querySelector(`[name=${n}]`).value;
    const x = HB.state.deadlines.find(d => d.id === f.dataset.edit), title = val('title').trim(), date = val('date');
    if (!x || !title || !date) return;
    x.title = title; x.tag = val('tag').trim(); x.date = date; x.time = val('time') || ''; x.notes = val('notes').replace(/\s+$/, ''); editingDl = null; HB.commit(); renderDeadlines(true);
  });
  $('#deadlines').addEventListener('keydown', e => { if (e.key === 'Escape' && editingDl) { editingDl = null; renderDeadlines(true); } });

  /* Summary line */
  function renderSummary() {
    const left = HB.state.tasks.filter(t => !t.done).length;
    const cv = HB.canvasSoon ? HB.canvasSoon() : { week: 0, over: 0 };   // Canvas assignments count too
    const week = HB.state.deadlines.filter(d => { const n = daysUntil(d.date); return n >= 0 && n <= 7; }).length + cv.week;
    const over = HB.state.deadlines.filter(d => daysUntil(d.date) < 0).length + cv.over;
    const bits = [left ? `${left} task${left > 1 ? 's' : ''} left today` : (HB.state.tasks.length ? 'Every task is done' : 'A clear list today')];
    if (week) bits.push(`${week} deadline${week > 1 ? 's' : ''} this week`);
    if (over) bits.push(`${over} overdue`);
    $('#summary').textContent = bits.join(' · ') + '.';
  }

  HB.onChange(() => { renderTasks(); renderRepeats(); renderDeadlines(); renderSummary(); });
  setInterval(() => { renderDeadlines(); renderSummary(); }, 10 * 60 * 1000);   // keep "Tomorrow"/"Today" labels current
})();
