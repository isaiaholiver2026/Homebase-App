/* Settings menu: splits Settings into pages (General, Appearance, each widget, School,
   Account, Backup) with a menu on the left. On a phone the menu is a list you tap into,
   with a back button. Also adds a small gear to widgets that have settings, which opens
   Settings straight to that widget's page. The last page you used is remembered. */
(function () {
  const { $, $$, esc } = HB;
  const LAST = 'home-base-settings-page';
  const I = p => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const W = id => (HB.WIDGETS && HB.WIDGETS[id] && HB.WIDGETS[id].icon) || '';
  const st = () => HB.settings();

  // page id, menu label, icon, the section(s) it shows, the widget it belongs to, and a one-line summary
  const PAGES = [
    { id: 'profile', label: 'General', icon: I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'), sec: 'set-profile',
      sub: () => st().name ? `Hi, ${st().name.split(/\s+/)[0]}` : 'Your name' },
    { id: 'appearance', label: 'Appearance', icon: I('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>'), sec: 'set-appearance',
      sub: () => ({ light: 'Light', dark: 'Dark' }[HB.lsGet(HB.THEME_KEY)] || 'Match device') + ' · ' + (st().boardMode === 'rows' ? 'Neat rows' : 'Packed') },
    { id: 'search', label: 'Search', icon: I('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'), sec: 'set-search',
      sub: () => { const p = HB.searchPrimary && HB.searchPrimary(); return p ? `Enter: ${p.name}` : 'Search buttons'; } },
    { group: 'Widgets' },
    { id: 'weather', label: 'Weather', widget: 'weather', sec: 'set-weather',
      sub: () => st().wx ? `${st().wx.name.split(',')[0]} · °${st().unit === 'celsius' ? 'C' : 'F'}` : 'Set your city' },
    { id: 'scores', label: 'Scores', widget: 'scores', sec: 'set-scores',
      sub: () => { const n = (st().sports && st().sports.favorites || []).length; return `${HB.activeLeagues ? HB.activeLeagues().length : ''} sports · ${n} favorite${n === 1 ? '' : 's'}`; } },
    { id: 'stocks', label: 'Watchlist', widget: 'watchlist', sec: 'set-stocks', sub: () => 'Google Sheet' },
    { id: 'timer', label: 'Focus timer', widget: 'focus', sec: 'set-timer',
      sub: () => { const t = st().timer || {}; return `${t.focus} / ${t.deep} / ${t.brk} min`; } },
    { group: 'School' },
    { id: 'canvas', label: 'Canvas', widget: 'canvas', school: true, sec: 'set-canvas',
      sub: () => st().canvas && st().canvas.feedUrl ? 'Connected' : 'Not connected' },
    { id: 'schedules', label: 'Schedules', widget: 'calendar', school: true, sec: 'set-schedules',
      sub: () => { const n = (HB.state.schedules || []).length; return n ? `${n} schedule${n === 1 ? '' : 's'}` : 'Classes, work shifts…'; } },
    { group: 'You' },
    { id: 'account', label: 'Account & sync', icon: I('<path d="M20 17.6A5 5 0 0 0 18 8h-1.3A8 8 0 1 0 4 16.3"/><path d="m8 16 4-4 4 4M12 12v9"/>'), sec: 'set-account',
      sub: () => { const t = ($('#acctBtn') && $('#acctBtn').title) || ''; return /^Signed in/.test(t) ? 'Signed in' : /paused/i.test(t) ? 'Sync paused' : 'Not signed in'; } },
    { id: 'backup', label: 'Backup', icon: I('<path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'), sec: 'set-backup',
      sub: () => (($('#lastBackup') && $('#lastBackup').textContent) || '').replace(/^Last backup:\s*/, '').replace(/\.$/, '') || 'Download a copy' }
  ];
  const pageFor = section => PAGES.find(p => p.id === section || p.sec === 'set-' + section);
  const onBoard = id => { if (!HB.layoutAPI) return true; const w = HB.layoutAPI.get().find(x => x.id === id); return !!w && !w.hidden; };
  let current = null;
  const drawer = $('#drawer'), nav = $('#setNav');

  /* The menu */
  function item(p) {
    let sub = ''; try { sub = p.sub ? p.sub() : ''; } catch (e) {}
    const icon = p.icon || I(W(p.widget) || '<circle cx="12" cy="12" r="3"/>');
    return `<button type="button" class="set-nav-i${p.id === current ? ' on' : ''}" data-page="${p.id}" aria-current="${p.id === current ? 'page' : 'false'}">
      <span class="sn-ic">${icon}</span><span class="sn-t"><b>${esc(p.label)}</b><small>${esc(sub)}</small></span>
      <svg class="sn-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button>`;
  }
  function drawNav() {
    // Widget pages for widgets you've removed drop to the bottom (School pages always stay)
    const away = PAGES.filter(p => p.widget && !p.school && !onBoard(p.widget));
    let html = '', group = '';
    PAGES.forEach(p => {
      if (p.group) { group = p.group; return; }
      if (away.includes(p)) return;
      if (group) { html += `<div class="sn-group">${esc(group)}</div>`; group = ''; }
      html += item(p);
    });
    if (away.length) html += `<div class="sn-group" title="These widgets aren't on your dashboard. Add them from Customize → Add widgets.">Not on your dashboard</div>` + away.map(p => item(p).replace('set-nav-i', 'set-nav-i away')).join('');
    const had = nav.contains(document.activeElement) && document.activeElement.dataset.page;
    nav.innerHTML = html;
    if (had) { const b = nav.querySelector(`[data-page="${had}"]`); b && b.focus(); }
  }

  /* Showing a page */
  const phone = () => matchMedia('(max-width:680px)').matches;
  function show(id, focus) {
    const p = PAGES.find(x => x.id === id) || PAGES[0];
    current = p.id;
    $$('#setPages > .set-sec').forEach(s => { s.hidden = s.id !== p.sec; });
    drawer.classList.add('paging');
    HB.lsSet(LAST, p.id);
    drawNav();
    $('#setPages').scrollTop = 0;
    if (focus) {
      const h = $('#' + p.sec + ' h3'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
    }
  }
  // Called by js/settings.js each time Settings opens (optionally with a page to jump to)
  HB.settingsShow = section => {
    const p = section && pageFor(section);
    if (p) { show(p.id, true); return; }
    if (phone()) { current = null; drawer.classList.remove('paging'); drawNav(); const f = nav.querySelector('.set-nav-i'); f && f.focus(); return; }
    show(HB.lsGet(LAST) || 'profile', false);
    const b = nav.querySelector('.set-nav-i.on'); b && b.focus();
  };
  nav.addEventListener('click', e => { const b = e.target.closest('[data-page]'); if (b) show(b.dataset.page, phone()); });
  // Up/Down arrows move through the menu
  nav.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...nav.querySelectorAll('.set-nav-i')], i = items.indexOf(document.activeElement); if (i < 0) return;
    e.preventDefault(); const n = items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    n.focus(); if (!phone()) show(n.dataset.page, false), nav.querySelector(`[data-page="${n.dataset.page}"]`).focus();
  });
  $('#setBack').onclick = () => { drawer.classList.remove('paging'); const b = nav.querySelector(`[data-page="${current}"]`); current = null; drawNav(); (b && nav.querySelector(`[data-page="${b.dataset.page}"]`) || nav).focus(); };
  matchMedia('(max-width:680px)').addEventListener('change', () => { if (!phone() && !current) show(HB.lsGet(LAST) || 'profile'); });

  /* Account page: shows where sync stands, and opens the account pop-up */
  function drawAccount() {
    const t = ($('#acctBtn') && $('#acctBtn').title) || '', foot = ($('#footSave') && $('#footSave').textContent) || '';
    const signedIn = /^Signed in/.test(t);
    $('#setAcctStatus').textContent = signedIn ? `${t}. ${foot}.` : /paused/i.test(t) ? `Sync is paused. ${foot}.` : 'Not signed in. Your dashboard is saved in this browser only. Sign in or create a free account to keep it the same on every device.';
    $('#setAcctOpen').textContent = signedIn || /paused/i.test(t) ? 'Manage account' : 'Sign in or create account';
  }
  $('#setAcctOpen').onclick = () => { $('#closeSettings').click(); setTimeout(() => $('#acctBtn').click(), 280); };

  HB.onChange(() => { if (drawer.classList.contains('on')) { drawNav(); drawAccount(); } });
  new MutationObserver(() => { if (drawer.classList.contains('on')) drawAccount(); }).observe($('#acctBtn'), { attributes: true, attributeFilter: ['title'] });
  // Draw once when Settings opens
  new MutationObserver(() => { if (drawer.classList.contains('on')) { drawNav(); drawAccount(); } }).observe(drawer, { attributes: true, attributeFilter: ['class'] });

  /* A gear on each widget that has settings */
  const GEAR = { weather: 'weather', scores: 'scores', watchlist: 'stocks', focus: 'timer', canvas: 'canvas', calendar: 'schedules' };
  const gearSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
  function addGears() {
    $$('#board > .widget').forEach(node => {
      const page = GEAR[node.dataset.w]; if (!page || node.querySelector('[data-wgear]')) return;
      const name = (HB.WIDGETS[node.dataset.w] || {}).name || 'this widget';
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'w-gear'; b.dataset.wgear = page; b.innerHTML = gearSvg;
      b.title = `${name} settings`; b.setAttribute('aria-label', `${name} settings`);
      const h = node.querySelector('.card-h > h2');
      if (h) { const c = h.nextElementSibling && h.nextElementSibling.matches('.w-collapse') ? h.nextElementSibling : h; c.insertAdjacentElement('afterend', b); }
      else { b.classList.add('floating'); node.appendChild(b); }
    });
  }
  $('#board').addEventListener('click', e => { const b = e.target.closest('[data-wgear]'); if (b) { e.stopPropagation(); HB.openSettings(b.dataset.wgear); } });
  new MutationObserver(addGears).observe($('#board'), { childList: true, subtree: true });
  addGears();
})();
