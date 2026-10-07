/* Canvas: your upcoming assignments, read straight from your Canvas calendar feed.
   Set it up in the Canvas widget or Settings → Canvas, then choose where assignments show:
   their own Canvas widget, mixed into Coming up, or both. Nothing here is sent anywhere;
   the feed link and the assignments are kept in this browser. */
(function () {
  const { $, $$, esc, localISO, daysUntil, parseD } = HB;
  const CACHE = 'home-base-canvas', EVERY = 30 * 60 * 1000;
  const cfg = () => { const s = HB.settings(); if (!s.canvas) s.canvas = { feedUrl: '', show: 'widget' }; return s.canvas; };
  const doneMap = () => HB.state.canvasDone || (HB.state.canvasDone = {});
  let cache = HB.lsGet(CACHE);            // { url, at, items, error, errAt }
  let loading = false, sec = null, showDone = false, showAll = false;

  /* The link: accept webcal:// links and missing https:// */
  function cleanUrl(u) {
    u = (u || '').trim(); if (!u) return '';
    u = u.replace(/^webcals?:\/\//i, 'https://');
    return /^https?:\/\//i.test(u) ? u : 'https://' + u;
  }
  const looksRight = u => /\/feeds\/calendars\/[^/?#]+\.ics([?#]|$)/i.test(u);
  const feed = () => cleanUrl(cfg().feedUrl);
  const host = () => { try { return new URL(feed()).origin; } catch (e) { return 'https://canvas.instructure.com'; } };

  /* Reading the calendar file (.ics) */
  const unesc = s => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').replace(/\s+/g, ' ').trim();
  function toDate(v) {
    // 20261008 (all day), 20261009T045900Z (UTC) or 20261008T235900 (local time)
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(v.trim()); if (!m) return null;
    const [, y, mo, d, h, mi, s, z] = m;
    if (!h) return { d: new Date(+y, mo - 1, +d), allDay: true };
    return { d: z ? new Date(Date.UTC(+y, mo - 1, +d, +h, +mi, +s)) : new Date(+y, mo - 1, +d, +h, +mi, +s), allDay: false };
  }
  function parseIcs(text) {
    const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    const evs = []; let ev = null;
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
      if (line === 'END:VEVENT') { if (ev) evs.push(ev); ev = null; continue; }
      if (!ev) continue;
      const i = line.indexOf(':'); if (i < 0) continue;
      const key = line.slice(0, i).split(';')[0], val = line.slice(i + 1);
      if (key === 'DTSTART') ev.start = toDate(val);
      else if (key === 'SUMMARY') ev.summary = unesc(val);
      else if (key === 'URL') ev.url = val.trim();
      else if (key === 'UID') ev.uid = val.trim();
    }
    const base = host();
    return evs.filter(e => e.start && e.summary).map(e => {
      // Canvas puts the class at the end of the title: "Lab 3 [BIOL:1411:0001 Foundations of Biology Fall 2026]"
      const cm = /\s*\[([^\]]+)\]\s*$/.exec(e.summary);
      const full = cm ? cm[1].replace(/\s+(Fall|Spring|Summer|Winter)\s+\d{4}$/i, '').trim() : '';
      // "MATH:1850:0003 Calculus I" → show "Calculus I", keep "MATH:1850:0003" for the tooltip
      const cc = /^([A-Z]{2,6}[:\s-]?\d{3,4}[A-Z]?(?:[:\s-]\d{1,4})?)\s+(.+)$/.exec(full);
      const course = cc ? cc[2] : full, code = cc ? cc[1] : '';
      const title = cm ? e.summary.slice(0, cm.index).trim() : e.summary;
      const a = /assignment-(\d+)/.exec(e.uid || ''), c = /course_(\d+)/.exec(e.url || '');
      const d = e.start.d;
      return {
        uid: e.uid || `${title}|${d.getTime()}`, title, course, code,
        date: localISO(d), ts: d.getTime(),
        time: e.start.allDay ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        kind: /assignment/.test(e.uid || '') ? 'assignment' : 'event',
        url: a && c ? `${base}/courses/${c[1]}/assignments/${a[1]}` : (/^https?:/.test(e.url || '') ? e.url : base)
      };
    });
  }

  /* Loading */
  const ERRORS = {
    blocked: HB.isExt ? "Couldn't reach Canvas. Check your internet connection, then try again."
      : location.protocol === 'file:' ? "Chrome won't let Home Base read Canvas when it's opened as a file. Open a new tab to use the Home Base extension, where Canvas works."
      : 'Canvas only loads in the Home Base extension on your computer. Turn on Settings → Sync on both to see your assignments here.',
    badlink: "Canvas didn't accept that link. Copy it again from Canvas → Calendar → Calendar Feed.",
    notics: "That link didn't return a calendar. Make sure it's the Calendar Feed link from Canvas.",
    offline: "You're offline. Showing what was saved last.",
    slow: 'Canvas took too long to answer. Try Refresh in a minute.',
    http: 'Canvas had a problem answering. Try Refresh in a minute.'
  };
  async function refresh(manual) {
    const url = feed(); if (!url || loading) return;
    // Outside the extension, Canvas can't be read directly; assignments arrive through Sync instead
    if (HB.canvasFromSync && HB.canvasFromSync()) { if (manual) HB.toast('Canvas updates from the Home Base extension on your computer'); return; }
    loading = true; drawAll();
    try {
      const r = await HB.fetchWithTimeout(url, 20000);
      if (!r.ok) throw Object.assign(new Error('http'), { status: r.status });
      const text = await r.text();
      if (!/BEGIN:VCALENDAR/.test(text)) throw Object.assign(new Error('notics'), { kind: 'notics' });
      cache = { url, at: Date.now(), items: parseIcs(text), error: null };
      if (manual) HB.toast(`Canvas updated · ${upcoming(30).length} coming up`);
    } catch (e) {
      const kind = e.status ? ([401, 403, 404].includes(e.status) ? 'badlink' : 'http')
        : e.kind || (navigator.onLine === false ? 'offline' : e.name === 'AbortError' ? 'slow' : 'blocked');
      cache = Object.assign({}, cache && cache.url === url ? cache : { url, items: [] }, { error: kind, errAt: Date.now() });
      console.warn('Canvas feed:', kind, e);
    }
    loading = false; HB.lsSet(CACHE, cache);
    HB.commit();   // redraws the widget, Coming up and the summary line
  }
  // Sync (js/sync.js) hands over assignments loaded by the extension on your computer
  HB.canvasSetCache = c => { if (!c || !Array.isArray(c.items)) return; cache = c; HB.lsSet(CACHE, cache); HB.commit(); };
  const items = () => (cache && cache.url === feed() && cache.items) || [];
  const status = () => (cache && cache.url === feed() ? cache : null);

  // Not marked done, from a week overdue (assignments only) to `days` ahead
  function upcoming(days = 30) {
    const done = doneMap();
    return items().filter(x => {
      const n = daysUntil(x.date);
      return !done[x.uid] && n <= days && (n >= 0 || (x.kind === 'assignment' && n >= -7));
    }).sort((a, b) => a.ts - b.ts);
  }

  /* Hooks for Coming up and the summary line (js/tasks.js) */
  HB.canvasDeadlines = () => (feed() && cfg().show !== 'widget' ? upcoming(14).map(x => Object.assign({ _cv: true }, x)) : []);
  HB.canvasSoon = () => {
    if (!feed()) return { week: 0, over: 0 };
    const u = upcoming(7).filter(x => x.kind === 'assignment');
    return { week: u.filter(x => daysUntil(x.date) >= 0).length, over: u.filter(x => daysUntil(x.date) < 0).length };
  };
  // Every Canvas item with a done flag (for the Calendar widget), and each class's color
  HB.canvasAll = () => (feed() ? items().map(x => Object.assign({ done: !!doneMap()[x.uid] }, x)) : []);
  HB.courseHue = course => hue(course);
  HB.canvasMarkDone = (uid, done = true) => {
    const x = items().find(i => i.uid === uid);
    if (done) doneMap()[uid] = Date.now(); else delete doneMap()[uid];
    HB.commit();
    if (done && x) HB.toast(`Marked "${x.title}" done`, 5000, { label: 'Undo', fn: () => HB.canvasMarkDone(uid, false) });
  };

  /* Choosing where assignments show */
  function setShow(v) {
    cfg().show = v;
    const L = HB.layoutAPI, l = L.get(), w = l.find(x => x.id === 'canvas'), want = v !== 'comingup';
    if (w && w.hidden === want) { w.hidden = !want; L.save(l); L.apply(); }
    HB.commit();
  }
  function connect(raw) {
    const url = cleanUrl(raw);
    if (!looksRight(url)) { HB.toast("That doesn't look like a Canvas Calendar Feed link (it ends in .ics)."); return false; }
    cfg().feedUrl = url; HB.saveQuietly();
    setShow(cfg().show || 'widget');
    refresh(true);
    return true;
  }

  /* The Canvas widget */
  const CAP = '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c0 1.6 2.5 3 5.5 3s5.5-1.4 5.5-3V11"/><path d="M21.5 9v5"/>';
  // Each class gets its own color. (Picked from hues that stay clear of the blue used for your
  // own deadlines and the green used for repeating tasks on the Calendar.)
  const HUES = [350, 22, 42, 275, 305, 188, 328, 8];
  const hue = s => { let h = 0; for (const c of s || '') h = (h * 31 + c.charCodeAt(0)) % 9973; return HUES[h % HUES.length]; };
  const dot = course => course ? `<i class="cv-dot" style="--h:${hue(course)}"></i>` : '';
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} days ago`; };
  function whenText(x, grp) {
    const d = parseD(x.date);
    const day = grp === 'This week' ? d.toLocaleDateString(undefined, { weekday: 'long' }) : grp === 'Later' || grp === 'Overdue' ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
    return [day, x.time].filter(Boolean).join(' · ');
  }
  const groupOf = x => { const n = daysUntil(x.date); return n < 0 ? 'Overdue' : n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n <= 7 ? 'This week' : 'Later'; };
  function itemHtml(x, grp, done) {
    const when = whenText(x, grp);
    return `<li class="cv-item${done ? ' done' : ''}${x.kind === 'event' ? ' ev' : ''}">
      <button type="button" class="cv-check" data-cv${done ? 'undo' : 'done'}="${esc(x.uid)}" aria-label="${done ? 'Mark not done' : 'Mark done'}: ${esc(x.title)}" title="${done ? 'Mark not done' : 'Mark done'}">${done ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>' : ''}</button>
      <div class="cv-meta"><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>
        <small>${dot(x.course)}${x.course ? `<span class="cv-course" title="${esc(x.code || x.course)}">${esc(x.course)}</span>` : ''}${x.kind === 'event' ? '<span class="cv-kind">Event</span>' : ''}${when ? `<span>${esc(when)}</span>` : ''}</small></div>
    </li>`;
  }
  function setupHtml() {
    return `<div class="cv-setup">
      <p>See your Canvas assignments and due dates right here.</p>
      <ol><li>In Canvas, open <b>Calendar</b> from the left sidebar.</li><li>At the bottom right, click <b>Calendar Feed</b> and copy the link.</li><li>Paste it below.</li></ol>
      <form class="field" data-cvform><input name="feed" placeholder="https://uiowa.instructure.com/feeds/calendars/…" autocomplete="off" spellcheck="false" aria-label="Canvas calendar feed link"><button class="btn" type="submit">Connect</button></form>
      <small>The link is private to you. Home Base keeps it in this browser only.</small>
    </div>`;
  }
  // Filter at the top of the widget: Today, Week (next 7 days) or Month (next 30 days).
  // Overdue assignments always show. The choice is remembered.
  const RANGES = { today: ['Today', 0, 'Due today (and anything overdue)', 'Nothing due today.'],
                   week: ['Week', 7, 'Due in the next 7 days', 'Nothing due in the next 7 days.'],
                   month: ['Month', 30, 'Due in the next 30 days', 'Nothing due in the next 30 days.'] };
  const range = () => (RANGES[cfg().range] ? cfg().range : 'month');
  function drawWidget() {
    if (!sec || !sec.isConnected) return;
    const url = feed(), s = status(), r = range(), list = upcoming(RANGES[r][1]);
    $('#cvCount').textContent = url && list.length ? String(list.length) : '';
    $('#cvActions').innerHTML = url ? `<button class="ghost" type="button" data-cvrefresh ${loading ? 'disabled' : ''}>${loading ? 'Updating…' : 'Refresh'}</button><a class="ghost" href="${esc(host())}" target="_blank" rel="noopener">Open Canvas</a>` : '';
    if (!url) { $('#cvBody').innerHTML = setupHtml(); return; }
    let html = '';
    if (s && s.items && s.items.length) html += `<div class="seg cv-range" role="group" aria-label="Show assignments due">${Object.keys(RANGES).map(k => {
      const n = upcoming(RANGES[k][1]).length;
      return `<button type="button" data-cvrange="${k}" aria-pressed="${k === r}" title="${RANGES[k][2]}">${RANGES[k][0]}${n ? ` <span class="cv-n">${n}</span>` : ''}</button>`;
    }).join('')}</div>`;
    if (s && s.error) html += `<div class="cv-err" role="status"><p>${esc(ERRORS[s.error] || ERRORS.http)}</p><button class="btn sec" type="button" data-cvrefresh>Try again</button></div>`;
    if (!s && loading) html += `<div class="empty">Loading your assignments…</div>`;
    else if (s && !s.error && !list.length) html += `<div class="empty">${RANGES[r][3]}</div>`;
    const shown = showAll ? list : list.slice(0, 10), groups = {};
    shown.forEach(x => { const g = groupOf(x); (groups[g] = groups[g] || []).push(x); });
    ['Overdue', 'Today', 'Tomorrow', 'This week', 'Later'].forEach(g => {
      if (groups[g]) html += `<h3 class="cv-g${g === 'Overdue' ? ' bad' : ''}">${g}</h3><ul class="cv-list">${groups[g].map(x => itemHtml(x, g)).join('')}</ul>`;
    });
    if (list.length > 10) html += `<button class="ghost cv-more" type="button" data-cvall>${showAll ? 'Show less' : `Show all ${list.length}`}</button>`;
    // Recently marked done, so a mistaken check is easy to undo
    const done = items().filter(x => doneMap()[x.uid] && daysUntil(x.date) >= -7).sort((a, b) => a.ts - b.ts);
    if (done.length) {
      html += `<button class="ghost cv-more" type="button" data-cvshowdone aria-expanded="${showDone}">${showDone ? 'Hide' : 'Show'} ${done.length} done</button>`;
      if (showDone) html += `<ul class="cv-list">${done.map(x => itemHtml(x, groupOf(x), true)).join('')}</ul>`;
    }
    if (s && s.at) html += `<p class="hint">Updated ${ago(s.at)}${s.error ? ' (showing saved copy)' : ''}</p>`;
    $('#cvBody').innerHTML = html;
  }

  HB.registerWidget({
    id: 'canvas', name: 'Canvas', size: 's',
    desc: 'Your upcoming Canvas assignments and due dates, straight from your Canvas calendar.',
    icon: CAP,
    render(section) {
      sec = section;
      sec.setAttribute('aria-label', 'Canvas assignments');
      sec.innerHTML = `<div class="card-h"><h2>Canvas</h2><span class="sessions" id="cvCount"></span><div class="cv-h" id="cvActions"></div></div><div class="cv-body" id="cvBody"></div>`;
      sec.addEventListener('click', e => {
        const t = e.target;
        if (t.closest('[data-cvrefresh]')) refresh(true);
        else if (t.closest('[data-cvdone]')) HB.canvasMarkDone(t.closest('[data-cvdone]').dataset.cvdone);
        else if (t.closest('[data-cvundo]')) HB.canvasMarkDone(t.closest('[data-cvundo]').dataset.cvundo, false);
        else if (t.closest('[data-cvrange]')) { cfg().range = t.closest('[data-cvrange]').dataset.cvrange; showAll = false; HB.saveQuietly(); drawWidget(); }
        else if (t.closest('[data-cvall]')) { showAll = !showAll; drawWidget(); }
        else if (t.closest('[data-cvshowdone]')) { showDone = !showDone; drawWidget(); }
      });
      sec.addEventListener('submit', e => {
        const f = e.target.closest('[data-cvform]'); if (!f) return;
        e.preventDefault(); connect(f.feed.value);
      });
      drawWidget();
    }
  });

  /* Settings → Canvas */
  function drawSettings() {
    const inp = $('#setCanvas'); if (!inp) return;
    if (document.activeElement !== inp) inp.value = cfg().feedUrl || '';
    $$('#cvShow button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.s === (cfg().show || 'widget'))));
    const s = status(), url = feed(), note = $('#cvStatus');
    note.className = '';
    if (!url) note.textContent = 'Not connected yet.';
    else if (loading) note.textContent = 'Checking…';
    else if (!s) note.textContent = 'Not checked yet.';
    else if (s.error) { note.textContent = ERRORS[s.error] || ERRORS.http; note.className = 'bad'; }
    else { note.textContent = `Connected · ${upcoming(30).length} coming up in the next 30 days · updated ${ago(s.at)}`; note.className = 'good'; }
    $('#cvClear').hidden = !url;
  }
  const drawAll = () => { drawWidget(); drawSettings(); };
  HB.onChange(drawAll);

  if ($('#setCanvas')) {
    let t = null;
    $('#setCanvas').addEventListener('input', e => {
      clearTimeout(t);
      const v = e.target.value;
      t = setTimeout(() => {
        const url = cleanUrl(v);
        if (!v.trim()) { cfg().feedUrl = ''; HB.commit(); }
        else if (looksRight(url) && url !== feed()) connect(v);
      }, 700);
    });
    $('#cvTest').onclick = () => { const v = $('#setCanvas').value; if (cleanUrl(v) !== feed()) connect(v); else refresh(true); };
    $('#cvClear').onclick = () => { cfg().feedUrl = ''; cache = null; HB.lsDel(CACHE); HB.commit(); HB.toast('Disconnected from Canvas'); };
    $$('#cvShow button').forEach(b => b.onclick = () => setShow(b.dataset.s));
  }

  /* Refresh every 30 minutes, and when you come back to the tab after a while */
  const stale = () => { const s = status(); return !s || Date.now() - (s.error ? s.errAt : s.at) > EVERY; };
  setTimeout(() => { if (feed() && stale()) refresh(); }, 600);
  setInterval(() => { if (feed() && !document.hidden) refresh(); }, EVERY);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && feed() && stale()) refresh(); });
})();
