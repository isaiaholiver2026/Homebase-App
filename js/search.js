/* Search bar: type once, then pick where to search. Which buttons show (and which one
   Enter uses) is chosen in Settings → Search. Press / anywhere to jump to the search box.
   Choices are saved in settings.search { on: [ids in order], primary: id }. */
(function () {
  const { $, $$, esc } = HB;
  const E = (id, name, url, home) => ({ id, name, url, home });
  // Every place you can search. url(q) gets the already-encoded search words.
  const ENGINES = [
    E('google', 'Google', q => `https://www.google.com/search?q=${q}`, 'https://www.google.com'),
    E('scholar', 'Google Scholar', q => `https://scholar.google.com/scholar?q=${q}`, 'https://scholar.google.com'),
    E('images', 'Google Images', q => `https://www.google.com/search?tbm=isch&q=${q}`, 'https://images.google.com'),
    E('maps', 'Google Maps', q => `https://www.google.com/maps/search/${q}`, 'https://www.google.com/maps'),
    E('bing', 'Bing', q => `https://www.bing.com/search?q=${q}`, 'https://www.bing.com'),
    E('duckduckgo', 'DuckDuckGo', q => `https://duckduckgo.com/?q=${q}`, 'https://duckduckgo.com'),
    E('youtube', 'YouTube', q => `https://www.youtube.com/results?search_query=${q}`, 'https://www.youtube.com'),
    E('chatgpt', 'ChatGPT', q => `https://chatgpt.com/?q=${q}`, 'https://chatgpt.com'),
    E('claude', 'Claude', q => `https://claude.ai/new?q=${q}`, 'https://claude.ai/new'),
    E('perplexity', 'Perplexity', q => `https://www.perplexity.ai/search?q=${q}`, 'https://www.perplexity.ai'),
    E('wikipedia', 'Wikipedia', q => `https://en.wikipedia.org/w/index.php?search=${q}`, 'https://en.wikipedia.org'),
    E('amazon', 'Amazon', q => `https://www.amazon.com/s?k=${q}`, 'https://www.amazon.com'),
    E('reddit', 'Reddit', q => `https://www.reddit.com/search/?q=${q}`, 'https://www.reddit.com'),
    E('stock', 'Stock quote', q => `https://finance.yahoo.com/quote/${q.toUpperCase()}`, 'https://finance.yahoo.com')
  ];
  const byId = id => ENGINES.find(e => e.id === id);
  const DEFAULT = { on: ['google', 'youtube', 'claude', 'chatgpt', 'stock'], primary: 'google' };
  function cfg() {
    const s = HB.settings();
    if (!s.search || !Array.isArray(s.search.on)) s.search = JSON.parse(JSON.stringify(DEFAULT));
    s.search.on = s.search.on.filter(byId);
    if (!s.search.on.length) s.search.on = ['google'];
    if (!s.search.on.includes(s.search.primary)) s.search.primary = s.search.on[0];
    return s.search;
  }
  HB.searchEngines = ENGINES;
  HB.searchPrimary = () => byId(cfg().primary);

  /* The buttons under the search box */
  let lastKey = '';
  function drawBar() {
    const c = cfg(), key = c.on.join() + '|' + c.primary;
    if (key === lastKey) return; lastKey = key;
    $('#engines').innerHTML = c.on.map(id => { const e = byId(id); return `<a class="engine${id === c.primary ? ' primary' : ''}" data-e="${id}" target="_blank" rel="noopener" href="${e.home}"${id === c.primary ? ' title="Press Enter to search here"' : ''}>${esc(e.name)}</a>`; }).join('');
    $('#q').placeholder = `Search ${byId(c.primary).name}… or pick a button below`;
    updLinks();
  }
  function updLinks() {
    const q = encodeURIComponent($('#q').value.trim());
    $$('#engines .engine').forEach(a => { const e = byId(a.dataset.e); if (e) a.href = q ? e.url(q) : e.home; });
  }
  $('#q').addEventListener('input', updLinks);
  $('#q').addEventListener('keydown', e => { if (e.key === 'Enter' && $('#q').value.trim()) { e.preventDefault(); updLinks(); const p = $('#engines .engine.primary'); p && p.click(); } });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { e.preventDefault(); $('#q').focus(); }
  });

  /* Settings → Search */
  const check = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17 19 7"/></svg>';
  function drawSettings() {
    const picks = $('#enginePicks'); if (!picks) return;
    const c = cfg();
    picks.innerHTML = ENGINES.map(e => { const on = c.on.includes(e.id); return `<button type="button" data-engine="${e.id}" aria-pressed="${on}">${on ? check : '+'} ${esc(e.name)}</button>`; }).join('');
    const sel = $('#engineDefault');
    if (document.activeElement !== sel) sel.innerHTML = c.on.map(id => `<option value="${id}"${id === c.primary ? ' selected' : ''}>${esc(byId(id).name)}</option>`).join('');
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('#enginePicks [data-engine]'); if (!b) return;
    const c = cfg(), id = b.dataset.engine, note = $('#engineNote');
    note.textContent = '';
    if (c.on.includes(id)) {
      if (c.on.length === 1) { note.textContent = 'Keep at least one search button.'; return; }
      c.on = c.on.filter(x => x !== id);
      if (c.primary === id) c.primary = c.on[0];
    } else c.on.push(id);
    HB.commit();
  });
  document.addEventListener('change', e => {
    if (e.target.id !== 'engineDefault') return;
    cfg().primary = e.target.value; HB.commit();
  });

  HB.onChange(() => { drawBar(); drawSettings(); });
  drawBar(); drawSettings();
})();
