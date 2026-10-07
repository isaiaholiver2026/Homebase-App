/* Launchpad: app and file tiles, edit mode (wiggle, reorder, remove, change logo), and the Add panel. */
(function () {
  const { $, $$, esc, uid } = HB;
  const L = () => $('#launch');
  let editing = false, drag = null, iconFor = null;

  const hue = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const normUrl = u => { u = u.trim(); return /^https?:\/\//i.test(u) ? u : 'https://' + u; };

  // File type from a Google Drive / Docs link
  function fileTypeFromUrl(url) {
    const u = (url || '').toLowerCase();
    if (u.includes('/document/')) return { t: 'DOC', c: '#2B6CE0' };
    if (u.includes('/spreadsheets/')) return { t: 'SHEET', c: '#1E8E3E' };
    if (u.includes('/presentation/')) return { t: 'SLIDES', c: '#D98A0B' };
    if (u.includes('/forms/')) return { t: 'FORM', c: '#7A4FD6' };
    if (u.includes('/folders/')) return { t: 'FOLDER', c: '#6B7886' };
    if (/\.pdf($|\?)/.test(u)) return { t: 'PDF', c: '#D9412B' };
    return { t: 'FILE', c: '#4A5A6B' };
  }
  HB.fileTypeFromUrl = fileTypeFromUrl;

  function tileMark(l) {
    const color = l.color || `hsl(${hue(l.name)} 55% 45%)`;
    const letters = l.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    if (l.icon) {
      const cls = l.iconMode === 'bleed' ? ' bleed' : l.iconMode === 'filled' ? ' filled' : '';
      const bg = l.iconMode && l.iconMode !== 'bare' && l.iconBg ? ` style="background:${esc(l.iconBg)}"` : '';
      return `<div class="mark img${cls}"${bg}><img src="${esc(l.icon)}" alt="" data-fit="${l.iconMode ? '' : esc(l.id)}" data-fallback="${esc(letters)}" data-fallback-color="${esc(color)}"></div>`;
    }
    if (l.kind === 'file') {
      const ft = fileTypeFromUrl(l.url), size = ft.t.length > 5 ? 7.5 : ft.t.length > 4 ? 8.5 : 10.5;
      return `<div class="mark file" style="background:${ft.c}"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg><span style="font-size:${size}px">${ft.t}</span></div>`;
    }
    return `<div class="mark" style="background:${esc(color)}">${esc(letters)}</div>`;
  }

  function render() {
    if (drag && drag.active) return;
    const el = L();
    el.classList.toggle('editing', editing);
    el.innerHTML = HB.state.links.map(l => `<a class="app" href="${esc(l.url)}" target="_blank" rel="noopener" data-id="${esc(l.id)}" draggable="false">
        ${tileMark(l)}<span>${esc(l.name)}</span>
        ${l.kind === 'file' ? `<span class="src" title="Google Drive file"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"><path d="M8 3h8l6 10-4 7H6l-4-7z"/></svg></span>` : ''}
        <button class="ic" data-icon="${esc(l.id)}" aria-label="Change logo for ${esc(l.name)}" title="Change logo"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg></button>
        <button class="x" data-rm="${esc(l.id)}" aria-label="Remove ${esc(l.name)}">&times;</button></a>`).join('')
      + (HB.state.links.length ? '' : `<div class="empty">No apps yet. Click "+ Add" to add your first one.</div>`);
    el.querySelectorAll('img[data-fit]').forEach(img => { if (img.dataset.fit) img.addEventListener('load', () => fitIcon(img), { once: true }); });
  }
  HB.renderLinks = render;

  /* Logo tiles: match the tile to the logo's background.
     Built-in logos have this worked out ahead of time (defaults.js). New logos you add are
     stored as pictures inside your data, which lets the page measure them here. */
  function fitIcon(img) {
    const l = HB.state.links.find(x => x.id === img.dataset.fit); if (!l) return;
    try {
      const W = Math.min(128, img.naturalWidth || 64), H = Math.min(128, img.naturalHeight || 64);
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H);
      const d = x.getImageData(0, 0, W, H).data, at = (i, j) => { const k = (j * W + i) * 4; return [d[k], d[k + 1], d[k + 2], d[k + 3]]; };
      const key = p => p[3] < 128 ? 't' : p.slice(0, 3).map(v => v >> 3).join(',');
      const edge = []; for (let i = 0; i < W; i++) edge.push(at(i, 0), at(i, H - 1)); for (let j = 1; j < H - 1; j++) edge.push(at(0, j), at(W - 1, j));
      const counts = new Map(); edge.forEach(p => counts.set(key(p), (counts.get(key(p)) || 0) + 1));
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      if (top === 't') { l.iconMode = 'bare'; }
      else {
        const m = edge.filter(p => key(p) === top), avg = i => Math.round(m.reduce((s, p) => s + p[i], 0) / m.length);
        const bg = [avg(0), avg(1), avg(2)], far = p => p[3] < 128 || Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 60;
        // An app icon with its own colored square: use the color a little way in from the edge.
        const ins = Math.round(Math.min(W, H) * 0.1), ring = [];
        for (let i = ins; i < W - ins; i++) ring.push(at(i, ins), at(i, H - 1 - ins));
        for (let j = ins; j < H - ins; j++) ring.push(at(ins, j), at(W - 1 - ins, j));
        const rc = new Map(); ring.forEach(p => { if (p[3] >= 128) rc.set(key(p), (rc.get(key(p)) || 0) + 1); });
        const best = [...rc.entries()].sort((a, b) => b[1] - a[1])[0];
        const bestRgb = best && best[0].split(',').map(v => (+v << 3) + 4);
        if (best && best[1] > ring.length * 0.6 && far([...bestRgb, 255])) {
          const mm = ring.filter(p => p[3] >= 128 && key(p) === best[0]), av = i => Math.round(mm.reduce((s, p) => s + p[i], 0) / mm.length);
          l.iconMode = 'bleed'; l.iconBg = `rgb(${av(0)},${av(1)},${av(2)})`;
        } else { l.iconMode = 'filled'; l.iconBg = `rgb(${bg.join(',')})`; }
      }
    } catch (e) { l.iconMode = 'filled'; l.iconBg = '#FFFFFF'; }
    HB.commit();
  }

  // Shrink a picked logo and keep it inside your saved data
  function imageToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          const s = Math.min(1, 160 / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/png'));
        };
        img.onerror = reject; img.src = r.result;
      };
      r.onerror = reject; r.readAsDataURL(file);
    });
  }
  async function setIcon(id, file) {
    if (!file || !/^image\//.test(file.type)) return;
    try {
      const url = await imageToDataUrl(file);
      const l = HB.state.links.find(x => x.id === id);
      if (l) { l.icon = url; delete l.iconMode; delete l.iconBg; HB.commit(); }
    } catch (e) { alertNote('That image could not be used. Try a PNG or JPG.'); }
  }
  function alertNote(t) { const n = $('#editHint'); if (n) { n.hidden = false; n.textContent = t; } }

  // Clicks on tiles
  L().addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]'), ic = e.target.closest('[data-icon]');
    if (ic) { e.preventDefault(); iconFor = ic.dataset.icon; $('#iconFile').value = ''; $('#iconFile').click(); return; }
    if (rm) { e.preventDefault(); HB.state.links = HB.state.links.filter(l => l.id !== rm.dataset.rm); HB.commit(); return; }
    if (editing && e.target.closest('.app:not(.add)')) { e.preventDefault(); return; }
  });
  // "+ Add" sits next to Edit in the Launchpad header, so it never ends up alone on its own row
  $('#addApp').onclick = () => { const p = $('#addPanel'); if (!p.hidden) { p.hidden = true; return; } openAdd('web'); };
  $('#editLinks').onclick = () => {
    editing = !editing; $('#editLinks').textContent = editing ? 'Done' : 'Edit';
    $('#editHint').textContent = 'Drag apps to reorder them. Click the picture button, or drop an image on an app, to change its logo. Click × to remove an app.';
    $('#editHint').hidden = !editing; render();
  };
  $('#iconFile').addEventListener('change', e => { const f = e.target.files[0]; if (f && iconFor) setIcon(iconFor, f); });
  L().addEventListener('dragover', e => { const t = e.target.closest('.app[data-id]'); if (!t) return; e.preventDefault(); $$('.app.drop').forEach(x => x !== t && x.classList.remove('drop')); t.classList.add('drop'); });
  L().addEventListener('dragleave', e => { const t = e.target.closest('.app[data-id]'); t && !t.contains(e.relatedTarget) && t.classList.remove('drop'); });
  L().addEventListener('drop', e => { const t = e.target.closest('.app[data-id]'); if (!t) return; e.preventDefault(); t.classList.remove('drop'); setIcon(t.dataset.id, e.dataTransfer.files[0]); });

  /* Drag to reorder (edit mode) */
  const tiles = () => [...L().querySelectorAll('.app[data-id]')];
  function flip(mutate, skip) {
    const before = new Map(tiles().map(t => [t, t.getBoundingClientRect()]));
    mutate();
    tiles().forEach(t => {
      if (t === skip) return;
      const a = before.get(t), b = t.getBoundingClientRect(); if (!a) return;
      const dx = a.left - b.left, dy = a.top - b.top; if (!dx && !dy) return;
      t.style.transition = 'none'; t.style.transform = `translate(${dx}px,${dy}px)`;
      t.offsetWidth; t.style.transition = ''; t.style.transform = '';
    });
  }
  function saveOrder() {
    const order = tiles().map(t => t.dataset.id);
    HB.state.links.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    HB.saveQuietly();
  }
  L().addEventListener('dragstart', e => { if (editing && !(e.dataTransfer && [...e.dataTransfer.types].includes('Files'))) e.preventDefault(); });
  L().addEventListener('pointerdown', e => {
    if (!editing || e.button > 0) return;
    const t = e.target.closest('.app[data-id]'); if (!t || e.target.closest('button')) return;
    const r = t.getBoundingClientRect();
    drag = { tile: t, sx: e.clientX, sy: e.clientY, gx: e.clientX - r.left, gy: e.clientY - r.top, active: false };
    t.setPointerCapture(e.pointerId);
  });
  let rafMove = null;
  L().addEventListener('pointermove', e => {
    if (!drag) return;
    if (rafMove) { rafMove.e = e; return; }
    rafMove = { e }; requestAnimationFrame(() => { const ev = rafMove.e; rafMove = null; if (drag) moveDrag(ev); });
  });
  function moveDrag(e) {
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
      drag.active = true; drag.tile.classList.add('dragging');
    }
    const t = drag.tile, lr = L().getBoundingClientRect(), px = e.clientX - lr.left, py = e.clientY - lr.top;
    // Compare against each app's resting spot so tiles never swap back and forth.
    const over = tiles().find(o => o !== t && px >= o.offsetLeft && px <= o.offsetLeft + o.offsetWidth && py >= o.offsetTop && py <= o.offsetTop + o.offsetHeight);
    if (over) { const list = tiles(), from = list.indexOf(t), to = list.indexOf(over); flip(() => L().insertBefore(t, from < to ? over.nextSibling : over), t); }
    t.style.transform = `translate(${px - drag.gx - t.offsetLeft}px,${py - drag.gy - t.offsetTop}px) scale(1.05)`;
  }
  function endDrag() {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.active) return;
    const t = d.tile; t.classList.remove('dragging'); t.classList.add('settling'); t.style.transform = '';
    setTimeout(() => t.classList.remove('settling'), 240);
    saveOrder();
  }
  L().addEventListener('pointerup', endDrag);
  L().addEventListener('pointercancel', endDrag);
  L().addEventListener('keydown', e => {
    if (!editing || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const t = e.target.closest('.app[data-id]'); if (!t) return;
    e.preventDefault();
    const list = tiles(), i = list.indexOf(t), j = i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1);
    if (j < 0 || j >= list.length) return;
    flip(() => L().insertBefore(t, j > i ? list[j].nextSibling : list[j]));
    t.focus(); saveOrder();
  });

  /* Add panel: a website, or a link to a Google Drive file */
  function setAddMode(m) {
    $$('#addSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.m === m));
    $$('#addPanel [data-pane]').forEach(p => p.hidden = p.dataset.pane !== m);
    const f = { web: '#linkName', file: '#fileUrl' }[m]; if (f) setTimeout(() => $(f).focus(), 30);
  }
  function openAdd(m) { $('#addPanel').hidden = false; setAddMode(m); }
  $$('#addSeg button').forEach(b => b.onclick = () => setAddMode(b.dataset.m));
  $('#cancelAdd').onclick = () => { $('#addPanel').hidden = true; };
  $('#addLinkForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#linkName').value.trim(), url = $('#linkUrl').value.trim();
    if (!name || !url) return;
    HB.state.links.push({ id: uid(), name, url: normUrl(url) });
    $('#linkName').value = $('#linkUrl').value = ''; $('#addPanel').hidden = true; HB.commit();
  });
  $('#fileForm').addEventListener('submit', e => {
    e.preventDefault();
    const url = $('#fileUrl').value.trim(), name = $('#fileName').value.trim();
    if (!url || !name) return;
    HB.state.links.push({ id: uid(), kind: 'file', name, url: normUrl(url) });
    $('#fileUrl').value = $('#fileName').value = ''; $('#addPanel').hidden = true; HB.commit();
  });

  HB.onChange(render);
})();
