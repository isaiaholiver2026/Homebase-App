/* Watchlist prices from your Google Sheet (GOOGLEFINANCE), read through its "Publish to web" CSV link.
   Your list of tickers lives in the sheet: type a ticker into column A of any empty row. */
(function () {
  const { $, esc, lsGet, lsSet } = HB;
  const CACHE = 'home-base-quotes';
  let cache = lsGet(CACHE) || { rows: [], at: 0 }, prev = {}, loading = false, issue = '', detail = '';

  // Reads CSV, including quoted names that contain commas ("Invesco QQQ Trust, Series 1")
  function parseCsv(text) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  const num = v => { const n = parseFloat(String(v).replace(/[,$%\s]/g, '')); return isFinite(n) ? n : null; };

  // Market hours in New York
  function nyParts(d) {
    const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: false, weekday: 'short' }).formatToParts(d).forEach(x => p[x.type] = x.value);
    return { h: +p.hour % 24, min: +p.minute, wd: p.weekday };
  }
  function marketOpen(d = new Date()) { const p = nyParts(d), t = p.h * 60 + p.min; return !['Sat', 'Sun'].includes(p.wd) && t >= 570 && t < 960; }

  // Plan B: Google's chart feed, loaded as a script. Browsers allow this even when they block
  // reading the CSV link from a file on your computer. Needs the sheet shared as "Anyone with the link".
  function loadViaScript(sheetId) {
    if (HB.isExt) return loadViaFetch(sheetId);
    return new Promise((resolve, reject) => {
      const cb = 'HB_sheet_' + Date.now(), s = document.createElement('script');
      const done = () => { delete window[cb]; s.remove(); clearTimeout(t); };
      const t = setTimeout(() => { done(); reject(new Error('timeout')); }, 15000);
      window[cb] = res => {
        done();
        if (!res || res.status === 'error' || !res.table) return reject(new Error('not shared'));
        const cols = res.table.cols.map(c => (c.label || '').trim().toLowerCase());
        const rows = res.table.rows.map(r => r.c.map(c => (c == null ? '' : (c.v == null ? '' : c.v))));
        resolve([cols, ...rows]);
      };
      s.onerror = () => { done(); reject(new Error('blocked')); };
      // If Google sends a sign-in page instead of data, the callback never runs: fail fast.
      s.onload = () => setTimeout(() => { if (window[cb]) { done(); reject(new Error('not shared')); } }, 150);
      s.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?headers=1&tqx=responseHandler:${cb}&_=${Date.now()}`;
      document.head.appendChild(s);
    });
  }
  // As a Chrome extension, Home Base may read the same feed directly (no script tag needed,
  // and extensions aren't allowed to load scripts from other sites anyway).
  async function loadViaFetch(sheetId) {
    const r = await HB.fetchWithTimeout(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?headers=1&tqx=out:json&_=${Date.now()}`);
    const text = await r.text(), a = text.indexOf('{'), b = text.lastIndexOf('}');
    let res = null; try { res = JSON.parse(text.slice(a, b + 1)); } catch (e) {}
    if (!res || res.status === 'error' || !res.table) throw new Error('not shared');
    const cols = res.table.cols.map(c => (c.label || '').trim().toLowerCase());
    const rows = res.table.rows.map(r => r.c.map(c => (c == null ? '' : (c.v == null ? '' : c.v))));
    return [cols, ...rows];
  }
  const sheetIdFrom = u => { const m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(u || ''); return m && m[1] !== 'e' ? m[1] : null; };

  function toRows(table) {
    const head = table[0].map(h => String(h).trim().toLowerCase()), col = n => head.indexOf(n);
    if (col('symbol') < 0 || col('price') < 0) throw new Error('columns');
    return table.slice(1).filter(r => r[col('symbol')] && String(r[col('symbol')]).trim())
      .map(r => ({ sym: String(r[col('symbol')]).trim().toUpperCase(), name: String(r[col('name')] || ''), price: num(r[col('price')]), change: num(r[col('change')]) || 0, pct: num(r[col('changepct')]) || 0 }));
  }

  const sourceKey = () => { const st = HB.settings(); return (sheetIdFrom(st.sheetUrl) || '') + '|' + (st.sheetCsvUrl || '').trim(); };

  async function load(force) {
    const st = HB.settings(), id = sheetIdFrom(st.sheetUrl), csv = (st.sheetCsvUrl || '').trim(), key = sourceKey();
    if (!id && !csv) { render(); return; }
    const age = Date.now() - (cache.at || 0);
    if (loading || (!force && cache.url === key && age < (marketOpen() ? 5 : 60) * 60000)) { render(); return; }
    loading = true; render();
    let rows = null; const why = [];
    // 1) Read the sheet directly (works once the sheet is shared as "Anyone with the link")
    if (id) { try { rows = toRows(await loadViaScript(id)); } catch (e) { why.push('sheet: ' + (e.message || e)); } }
    // 2) Otherwise try the "Publish to web" CSV link
    if (!rows && csv) {
      try {
        const r = await HB.fetchWithTimeout(csv + (csv.includes('?') ? '&' : '?') + '_=' + Date.now());
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const text = await r.text();
        if (/^\s*</.test(text)) throw new Error('got a web page, not CSV');
        rows = toRows(parseCsv(text));
      } catch (e) { why.push('csv: ' + (e.message || e)); }
    }
    if (rows) { cache = { url: key, at: Date.now(), rows }; lsSet(CACHE, cache); issue = ''; detail = ''; }
    else {
      detail = why.join(' · ');
      console.warn('Watchlist could not load:', detail);
      issue = 'Couldn\'t read your watchlist sheet. Open it with "Edit list", click Share, and make sure General access is "Anyone with the link" (Viewer). Then press Refresh.';
    }
    loading = false; render();
  }

  const fmtPx = n => n >= 1000 ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : n.toFixed(n < 1 ? 4 : 2);
  const sign = n => n > 0 ? '+' : n < 0 ? '-' : '';
  function render() {
    const st = HB.settings(), list = $('#ticks'), note = $('#quoteNote');
    $('#editSheet').href = st.sheetUrl || 'https://sheets.google.com';
    if (!sheetIdFrom(st.sheetUrl) && !st.sheetCsvUrl) {
      list.innerHTML = `<div class="empty">Connect your watchlist sheet to see prices.</div><button class="btn sec" data-open-settings="stocks" style="margin-top:10px">Set up in Settings</button>`;
      note.textContent = ''; return;
    }
    const rows = cache.url === sourceKey() ? cache.rows : [];
    list.innerHTML = rows.length ? rows.map(q => {
      let px;
      if (typeof q.price !== 'number') px = `<span class="na">Price unavailable</span>`;
      else {
        const dir = q.change > 0 ? 'up' : q.change < 0 ? 'down' : 'flat';
        const fl = prev[q.sym] != null && prev[q.sym] !== q.price ? (q.price > prev[q.sym] ? 'flash-up' : 'flash-down') : '';
        px = `<b class="${fl}">${fmtPx(q.price)}</b><span class="${dir}">${sign(q.change)}${Math.abs(q.change).toFixed(2)} (${sign(q.pct)}${Math.abs(q.pct).toFixed(2)}%)</span>`;
      }
      return `<a class="tick" href="https://finance.yahoo.com/quote/${encodeURIComponent(q.sym)}" target="_blank" rel="noopener"><span class="id"><span class="sym">${esc(q.sym)}</span>${q.name ? `<span class="nm">${esc(q.name)}</span>` : ''}</span><span class="px">${px}</span></a>`;
    }).join('') : (loading ? `<div class="empty">Loading prices…</div>` : issue ? `<div class="empty">${esc(issue)}${detail ? `<br><small style="opacity:.7">Details: ${esc(detail)}</small>` : ''}</div>` : `<div class="empty">No tickers yet. Click "Edit list" and type tickers into column A.</div>`);
    rows.forEach(q => { if (typeof q.price === 'number') prev[q.sym] = q.price; });
    if (issue && rows.length) note.textContent = 'Couldn\'t refresh prices just now. Showing the last ones.';
    else if (issue) note.textContent = '';
    else if (cache.at) note.textContent = marketOpen() ? `Updated ${new Date(cache.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · prices may be delayed up to 20 min` : 'Market closed · showing the latest prices';
    else note.textContent = '';
  }

  let lastKey = null;
  HB.onChange(() => { const k = sourceKey(); if (k !== lastKey) { lastKey = k; load(true); } else render(); });
  setInterval(() => { if (!document.hidden) load(false); }, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false); });
  $('#refreshQuotes').onclick = () => load(true);
})();
