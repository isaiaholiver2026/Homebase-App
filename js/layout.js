/* Widgets: choose which ones show, how wide they are, and where they sit.
   Click the Customize button (four squares, top right) to change the layout. */
(function () {
  const { $, $$, esc } = HB;
  /* Every widget Home Base has: its name, a one-line description and an icon for the gallery
     (js/gallery.js). A new feature file can add its own widget with HB.registerWidget(). */
  HB.WIDGETS = HB.WIDGETS || {};
  const BUILT_IN = {
    search:    { name: 'Search',      desc: 'Search Google or YouTube, look up a stock, or send a question to Claude or ChatGPT.', icon: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>' },
    launchpad: { name: 'Launchpad',   desc: 'One-click tiles for the sites and Google Drive files you open most.', icon: '<rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/>' },
    today:     { name: 'Today',       desc: "Today's to-do list, including tasks that repeat (\"Gym every Mon/Wed\").", icon: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>' },
    deadlines: { name: 'Coming up',   desc: 'Due dates and deadlines with countdowns, notes and checklists.', icon: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>' },
    weather:   { name: 'Weather',     desc: 'Current conditions, the next 12 hours and a 7-day forecast.', icon: '<path d="M8 3v1.5M3.5 8H5M4.8 4.8l1 1M11.2 4.8l-1 1"/><path d="M5.4 11.3A3.5 3.5 0 1 1 11.4 7"/><path d="M8 20h9a3.5 3.5 0 0 0 0-7h-.4A5 5 0 0 0 7 14.6 2.8 2.8 0 0 0 8 20z"/>' },
    focus:     { name: 'Focus timer', desc: 'Focus, deep work and break timers, with your daily minutes and streak.', icon: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M10 2.5h4"/>' },
    watchlist: { name: 'Watchlist',   desc: 'Prices for the stocks in your Google Sheet watchlist.', icon: '<path d="M3 17l5-5 4 4 8-8"/><path d="M15 8h5v5"/>' },
    scores:    { name: 'Scores',      desc: 'Live and final scores for your sports and favorite teams.', icon: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7"/>' },
    notes:     { name: 'Scratchpad',  desc: 'A notepad that saves as you type.', icon: '<path d="M5 4h10l4 4v12H5z"/><path d="M9 12h6M9 16h4"/>' },
    ask:       { name: 'Ask AI',      desc: 'Write a question and open it in Claude or ChatGPT, optionally with your tasks attached.', icon: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>' }
  };
  Object.keys(BUILT_IN).forEach(k => { HB.WIDGETS[k] = Object.assign({ id: k, builtIn: true }, BUILT_IN[k]); });
  // Add a new widget: HB.registerWidget({ id, name, desc, icon, size, render(section) { ... } })
  HB.registerWidget = def => { HB.WIDGETS[def.id] = Object.assign({ collapsible: true }, def); };
  const NAMES = new Proxy({}, { get: (_, k) => HB.WIDGETS[k] && HB.WIDGETS[k].name });
  const SIZES = [['s', 'S', 'Small: one column'], ['m', 'M', 'Medium: two columns'], ['l', 'L', 'Large: full width']];
  const board = $('#board');
  let customizing = false, drag = null;

  // The saved layout, with any widget it doesn't mention added at the end
  function layout() {
    const st = HB.settings(), saved = Array.isArray(st.layout) ? st.layout.filter(w => HB.WIDGETS[w.id]) : [];
    const known = new Set(saved.map(w => w.id));
    HB.DEFAULTS.settings.layout.forEach(d => { if (!known.has(d.id)) { saved.push(Object.assign({}, d)); known.add(d.id); } });
    // Widgets added in a later update start off the dashboard; add them from the gallery
    Object.keys(HB.WIDGETS).forEach(id => { if (!known.has(id)) saved.push({ id, size: HB.WIDGETS[id].size || 's', hidden: true }); });
    return saved;
  }
  const save = l => { HB.state.settings.layout = l; HB.saveQuietly(); };
  const el = id => board.querySelector(`.widget[data-w="${id}"]`);

  // Widgets from HB.registerWidget() build their own card the first time they're needed
  function mount(id) {
    const def = HB.WIDGETS[id]; if (!def || typeof def.render !== 'function') return null;
    const node = document.createElement('div'); node.className = 'widget'; node.dataset.w = id;
    const sec = document.createElement('section'); sec.className = 'card'; sec.setAttribute('aria-label', def.name);
    node.appendChild(sec); board.appendChild(node);
    try { def.render(sec); } catch (e) { console.error(e); }
    observe(node);
    return node;
  }

  function apply() {
    const l = layout();
    l.forEach(w => {
      const node = el(w.id) || (!w.hidden && mount(w.id)); if (!node) return;
      board.appendChild(node);                       // order
      node.dataset.size = w.size || 's';             // width
      node.hidden = !!w.hidden;                      // shown or hidden
      collapseBtn(node, w);                          // collapsed to just its title
      let ctl = node.querySelector(':scope > .w-ctl');
      if (customizing) {
        if (!ctl) { ctl = document.createElement('div'); ctl.className = 'w-ctl'; node.appendChild(ctl); }
        ctl.innerHTML = `<div class="w-bar" tabindex="0" role="group" aria-label="${esc(NAMES[w.id])}. Drag to move, or use the arrow keys.">
            <span class="w-grip" title="Drag to move"><svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="2.5" cy="2.5" r="1.4"/><circle cx="7.5" cy="2.5" r="1.4"/><circle cx="2.5" cy="7" r="1.4"/><circle cx="7.5" cy="7" r="1.4"/><circle cx="2.5" cy="11.5" r="1.4"/><circle cx="7.5" cy="11.5" r="1.4"/></svg></span>
            <b>${esc(NAMES[w.id])}</b>
            <span class="seg w-size" role="group" aria-label="Size of ${esc(NAMES[w.id])}">${SIZES.map(([k, t, tip]) => `<button type="button" data-size="${k}" title="${tip}" aria-pressed="${(w.size || 's') === k}">${t}</button>`).join('')}</span>
            <button type="button" class="w-hide" data-hide title="Remove from dashboard (add it back anytime from Add widgets)" aria-label="Remove ${esc(NAMES[w.id])}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
          </div>`;
      } else if (ctl) ctl.remove();
    });
    // "Add widgets" opens the gallery; the badge counts widgets that aren't on the dashboard
    const off = l.filter(w => w.hidden).length;
    $('#hiddenWidgets').innerHTML = `<button type="button" class="btn sec add-widgets" data-gallery><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>Add widgets${off ? `<span class="badge" title="${off} not on your dashboard">${off}</span>` : ''}</button>`;
    window.dispatchEvent(new Event('resize'));       // let the weather graph redraw at its new width
    queuePack();
  }
  HB.applyLayout = apply;

  /* Collapse a card down to its title bar (the arrow next to each card's title).
     Weather collapses to just the current conditions. */
  const COLLAPSIBLE = ['today', 'deadlines', 'weather', 'focus', 'watchlist', 'scores', 'notes', 'ask'];
  const chev = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  function collapseBtn(node, w) {
    if (!COLLAPSIBLE.includes(w.id) && !(HB.WIDGETS[w.id] && HB.WIDGETS[w.id].collapsible)) return;
    let b = node.querySelector('[data-collapse]');
    if (!b) {
      b = document.createElement('button'); b.type = 'button'; b.className = 'w-collapse'; b.dataset.collapse = w.id; b.innerHTML = chev;
      const h = node.querySelector('.card-h > h2');
      if (h) h.insertAdjacentElement('afterend', b); else { b.classList.add('floating'); node.appendChild(b); }
    }
    const on = !!w.collapsed;
    node.classList.toggle('collapsed', on);
    b.setAttribute('aria-expanded', String(!on));
    b.setAttribute('aria-label', `${on ? 'Expand' : 'Collapse'} ${NAMES[w.id]}`); b.title = on ? 'Expand' : 'Collapse';
  }
  board.addEventListener('click', e => {
    const b = e.target.closest('[data-collapse]'); if (!b) return;
    e.stopPropagation();
    const l = layout(), w = l.find(x => x.id === b.dataset.collapse); if (!w) return;
    w.collapsed = !w.collapsed; save(l);
    collapseBtn(el(w.id), w);
    queuePack();
  });

  /* Packed layout: every widget is only as tall as its content, and widgets stack in columns
     with no empty space between them (like a pinboard). Each widget remembers its column, so
     when one grows (say you add a task) the widgets below it just slide down in the same
     column instead of jumping somewhere else. The board is cut into thin 4px rows. */
  const UNIT = 4, GAP = 16;
  const packed = () => (HB.settings().boardMode || 'packed') === 'packed';
  // Matches the breakpoints in css/layout.css (reading the grid itself can over-count, since a
  // widget placed in column 3 makes the browser keep a 3rd column around)
  const colCount = () => matchMedia('(max-width:680px)').matches ? 1 : matchMedia('(max-width:1020px)').matches ? 2 : 3;
  // Each widget remembers a column for the wide (3-column) board in `col`, and separately for the
  // medium (2-column) board in `col2`, so it stays put at any window width.
  const pin = cols => cols === 3 ? 'col' : 'col' + cols;
  const spanOf = (w, cols) => w.size === 'l' ? cols : w.size === 'm' ? Math.min(2, cols) : 1;
  let packQueued = false, working = null;   // working = the layout while a widget is being dragged
  function pack() {
    packQueued = false;
    const on = packed();
    board.classList.toggle('packed', on);
    if (!on) { board.querySelectorAll('.widget').forEach(n => { n.style.gridColumn = ''; n.style.gridRow = ''; }); return; }
    const l = working || layout(), cols = colCount(), heights = new Array(cols).fill(0);
    let learned = false;
    l.forEach(w => {
      const n = el(w.id); if (!n) return;
      if (w.hidden) { n.style.gridColumn = ''; n.style.gridRow = ''; return; }
      const span = spanOf(w, cols);
      let col;
      if (cols === 1 || span === cols) col = 0;
      else if (typeof w[pin(cols)] === 'number') col = Math.min(w[pin(cols)], cols - span);
      else {
        // No column yet for this window width: use the one that's currently shortest, and remember it
        let best = 0, bestTop = Infinity;
        for (let c = 0; c <= cols - span; c++) { const top = Math.max(...heights.slice(c, c + span)); if (top < bestTop) { bestTop = top; best = c; } }
        col = best;
        w[pin(cols)] = col; if (!working) learned = true;
      }
      const start = Math.max(...heights.slice(col, col + span));
      const inner = n.firstElementChild, h = inner ? inner.getBoundingClientRect().height : 0;
      const rows = Math.max(1, Math.ceil((h + GAP) / UNIT));
      n.style.gridColumn = `${col + 1} / span ${span}`;
      n.style.gridRow = `${start + 1} / span ${rows}`;
      for (let c = col; c < col + span; c++) heights[c] = start + rows;
    });
    if (learned) save(l);
  }
  const queuePack = () => { if (!packQueued) { packQueued = true; requestAnimationFrame(pack); } };
  HB.pack = queuePack;
  // Re-pack whenever any widget changes height (a task added, weather loaded, notes opened…)
  const ro = window.ResizeObserver ? new ResizeObserver(queuePack) : null;
  function observe(node) { const s = node.firstElementChild; if (ro && s) ro.observe(s); }
  board.querySelectorAll('.widget').forEach(observe);
  window.addEventListener('resize', queuePack);

  function setCustomizing(on) {
    customizing = on;
    document.body.classList.toggle('customizing', on);
    $('#customizeBar').hidden = !on;
    $('#customizeBtn').setAttribute('aria-pressed', on);
    apply();
    if (on) $('#customizeBar').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  $('#customizeBtn').onclick = () => setCustomizing(!customizing);
  $('#doneCustomize').onclick = () => setCustomizing(false);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && customizing && !document.querySelector('.drawer.on') && !document.querySelector('.gallery.on')) setCustomizing(false); });
  $('#resetLayout').onclick = () => { save(JSON.parse(JSON.stringify(HB.DEFAULTS.settings.layout))); apply(); };
  $('#hiddenWidgets').addEventListener('click', e => {
    if (e.target.closest('[data-gallery]')) { HB.openGallery && HB.openGallery(); return; }
    const b = e.target.closest('[data-show]'); if (!b) return;
    const l = layout(), w = l.find(x => x.id === b.dataset.show); w.hidden = false; save(l); apply();
    const n = el(w.id); n && n.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });

  // Size, hide and move buttons on each widget
  board.addEventListener('click', e => {
    if (!customizing) return;
    const node = e.target.closest('.widget'); if (!node) return;
    const id = node.dataset.w, l = layout(), w = l.find(x => x.id === id);
    const sz = e.target.closest('[data-size]'), hide = e.target.closest('[data-hide]');
    if (sz) { w.size = sz.dataset.size; save(l); animate(apply); }
    if (hide) { w.hidden = true; save(l); animate(apply); HB.toast(`Removed ${NAMES[id]}. Add it back anytime from Add widgets.`); }
  });

  // Keyboard: click (or Tab to) a widget's bar, then use the arrow keys to move it
  function moveBy(id, step) {
    const l = layout(), w = l.find(x => x.id === id), vis = l.filter(x => !x.hidden), i = vis.indexOf(w), j = i + step;
    if (j < 0 || j >= vis.length) return false;
    const a = l.indexOf(w), b = l.indexOf(vis[j]); l.splice(a, 1); l.splice(b, 0, w);
    save(l); animate(apply); return true;
  }
  board.addEventListener('keydown', e => {
    if (!customizing || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const bar = e.target.closest('.w-bar'); if (!bar || e.target !== bar) return;
    e.preventDefault();
    const id = bar.closest('.widget').dataset.w;
    if (moveBy(id, e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1)) { const nb = el(id).querySelector('.w-bar'); nb && nb.focus(); }
  });


  // Smoothly slide widgets to their new spots after a change
  const shown = () => [...board.querySelectorAll('.widget:not([hidden])')];
  function animate(mutate, skip) {
    const before = new Map(shown().map(n => [n, n.getBoundingClientRect()]));
    mutate();
    shown().forEach(n => {
      if (n === skip) return;
      const a = before.get(n); if (!a) return;
      const b = n.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top; if (!dx && !dy) return;
      n.style.transition = 'none'; n.style.transform = `translate(${dx}px,${dy}px)`;
      n.offsetWidth; n.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1)'; n.style.transform = '';
      setTimeout(() => { n.style.transition = ''; }, 300);
    });
  }

  // Drag a widget (by its bar) to a new spot
  board.addEventListener('pointerdown', e => {
    if (!customizing || e.button > 0) return;
    const bar = e.target.closest('.w-bar'); if (!bar || e.target.closest('button')) return;
    const node = bar.closest('.widget'), r = node.getBoundingClientRect();
    e.preventDefault();
    drag = { node, sx: e.clientX, sy: e.clientY, gx: e.clientX - r.left, gy: e.clientY - r.top, active: false };
    node.setPointerCapture(e.pointerId);
  });
  board.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6) return;
      drag.active = true; drag.node.classList.add('w-dragging');
      if (packed()) working = layout();
    }
    const node = drag.node, br = board.getBoundingClientRect(), px = e.clientX - br.left, py = e.clientY - br.top;
    // Compare against each widget's resting spot so widgets never swap back and forth
    const over = shown().find(o => o !== node && px >= o.offsetLeft && px <= o.offsetLeft + o.offsetWidth && py >= o.offsetTop && py <= o.offsetTop + o.offsetHeight);
    if (working) {
      // Packed: the column under the pointer becomes the widget's column; hovering another widget
      // puts it just above (moving up) or below (moving down) that widget.
      const cols = colCount(), me = working.find(w => w.id === node.dataset.w), span = spanOf(me, cols);
      const colW = (board.clientWidth + GAP) / cols, col = Math.max(0, Math.min(cols - span, Math.floor((px - drag.gx + colW / 2) / colW)));
      let changed = false;
      if (cols > 1 && span < cols && me[pin(cols)] !== col) { me[pin(cols)] = col; changed = true; }
      if (over) {
        const i = working.indexOf(me), target = working.find(w => w.id === over.dataset.w), j = working.indexOf(target);
        const below = py > over.offsetTop + over.offsetHeight / 2;
        working.splice(i, 1);
        working.splice(working.indexOf(target) + (below ? 1 : 0), 0, me);
        changed = changed || working.indexOf(me) !== i;
      }
      if (changed) animate(pack, node);
    } else if (over) {
      const list = shown(), from = list.indexOf(node), to = list.indexOf(over);
      animate(() => board.insertBefore(node, from < to ? over.nextSibling : over), node);
    }
    node.style.transform = `translate(${px - drag.gx - node.offsetLeft}px,${py - drag.gy - node.offsetTop}px)`;
  });
  function endDrag() {
    if (!drag) return;
    const d = drag; drag = null; if (!d.active) return;
    const n = d.node; n.classList.remove('w-dragging');
    n.style.transition = 'transform .25s cubic-bezier(.2,.8,.2,1)'; n.style.transform = '';
    setTimeout(() => { n.style.transition = ''; }, 260);
    if (working) { const l = working; working = null; save(l); apply(); }
    else {
      // Save the new order (hidden widgets keep their place at the end)
      const l = layout(), order = [...board.querySelectorAll('.widget')].map(x => x.dataset.w);
      l.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); save(l);
    }
    window.dispatchEvent(new Event('resize'));
  }
  board.addEventListener('pointerup', endDrag);
  board.addEventListener('pointercancel', endDrag);

  // For the gallery (js/gallery.js)
  HB.layoutAPI = { get: layout, save, apply: () => animate(apply), el, isCustomizing: () => customizing };

  // Re-apply after loading a backup or other changes
  let last = '';
  HB.onChange(() => { const k = JSON.stringify([HB.settings().layout || null, HB.settings().boardMode]); if (k !== last) { last = k; apply(); } });
})();
