/* Widget gallery: every widget Home Base has, with an Add or Remove button for each.
   Open it from Customize (four squares, top right) → Add widgets, or Settings → Appearance.
   Removing a widget only takes it off the dashboard; its tasks, notes and settings stay saved. */
(function () {
  const { $, esc } = HB, L = HB.layoutAPI;

  const wrap = document.createElement('div');
  wrap.innerHTML = `<div class="g-scrim" id="gScrim"></div>
    <div class="gallery" id="gallery" role="dialog" aria-modal="true" aria-labelledby="gTitle" inert>
      <div class="g-h">
        <div><h2 id="gTitle">Widgets</h2><p>Pick what shows on your dashboard. Removing a widget keeps its data, so you can add it back anytime.</p></div>
        <button class="icon-btn g-x" id="gClose" type="button" aria-label="Close">&times;</button>
      </div>
      <div class="g-b" id="gBody"></div>
    </div>`;
  document.body.append(...wrap.children);
  const g = $('#gallery'), sc = $('#gScrim');

  const icon = p => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p || ''}</svg>`;
  function item(w, on) {
    const d = HB.WIDGETS[w.id];
    return `<li class="g-item${on ? ' on' : ''}">
      <span class="g-ic">${icon(d.icon)}</span>
      <span class="g-txt"><b>${esc(d.name)}</b><small>${esc(d.desc || '')}</small></span>
      ${on ? `<button type="button" class="btn sec g-btn" data-remove="${w.id}" aria-label="Remove ${esc(d.name)}">Remove</button>`
           : `<button type="button" class="btn g-btn" data-add="${w.id}" aria-label="Add ${esc(d.name)}">Add</button>`}
    </li>`;
  }
  function render() {
    const l = L.get(), on = l.filter(w => !w.hidden), off = l.filter(w => w.hidden);
    $('#gBody').innerHTML =
      `<h3>Available <span>${off.length}</span></h3>` +
      (off.length ? `<ul class="g-list">${off.map(w => item(w, false)).join('')}</ul>` : `<p class="g-all">Every widget is already on your dashboard.</p>`) +
      `<h3>On your dashboard <span>${on.length}</span></h3><ul class="g-list">${on.map(w => item(w, true)).join('')}</ul>`;
  }

  let lastFocus = null, lastAdded = null;
  HB.openGallery = () => {
    lastFocus = document.activeElement; lastAdded = null;
    render();
    g.inert = false; g.classList.add('on'); sc.classList.add('on');
    setTimeout(() => (g.querySelector('[data-add]') || $('#gClose')).focus(), 60);
  };
  function close() {
    if (!g.classList.contains('on')) return;
    g.classList.remove('on'); sc.classList.remove('on'); g.inert = true;
    const n = lastAdded && L.el(lastAdded);
    if (n) {
      // Show where the new widget landed
      n.scrollIntoView({ block: 'center', behavior: 'smooth' });
      n.classList.remove('w-flash'); void n.offsetWidth; n.classList.add('w-flash');
      setTimeout(() => n.classList.remove('w-flash'), 1700);
    } else if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    lastAdded = null;
  }
  $('#gClose').onclick = close; sc.onclick = close;

  $('#gBody').addEventListener('click', e => {
    const b = e.target.closest('[data-add],[data-remove]'); if (!b) return;
    const adding = !!b.dataset.add, id = b.dataset.add || b.dataset.remove;
    const l = L.get(), w = l.find(x => x.id === id); if (!w) return;
    w.hidden = !adding;
    L.save(l); L.apply();
    if (adding) lastAdded = id; else if (lastAdded === id) lastAdded = null;
    HB.toast(`${adding ? 'Added' : 'Removed'} ${HB.WIDGETS[id].name}`);
    render();
    // Keep keyboard focus on the same widget's (now flipped) button
    const nb = g.querySelector(`[data-add="${id}"],[data-remove="${id}"]`); nb && nb.focus();
  });

  // Escape closes the gallery first (before Settings or Customize react to it); Tab stays inside
  window.addEventListener('keydown', e => {
    if (!g.classList.contains('on')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if (e.key === 'Tab') {
      const f = [...g.querySelectorAll('button')]; if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, true);

  const sb = $('#openGallery'); if (sb) sb.onclick = () => HB.openGallery();
})();
