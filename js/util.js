/* Small helpers shared by every part of the dashboard. */
window.HB = window.HB || {};

// True when Home Base is running as the Chrome extension (the pinned tab) instead of a file or the web.
// The extension is allowed to read Canvas and Google directly.
HB.isExt = location.protocol === 'chrome-extension:';

HB.$ = s => document.querySelector(s);
HB.$$ = s => Array.from(document.querySelectorAll(s));
HB.uid = () => Math.random().toString(36).slice(2, 10);
HB.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Browser storage that never crashes the page (private windows can block it).
HB.lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
HB.lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
HB.lsDel = k => { try { localStorage.removeItem(k); } catch (e) {} };

// Dates
HB.today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
HB.parseD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
HB.daysUntil = s => Math.round((HB.parseD(s) - HB.today0()) / 864e5);
HB.localISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Fetch JSON/text with a time limit so a slow service never hangs the page.
HB.fetchWithTimeout = (url, ms = 15000) => {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), ms) : null;
  return fetch(url, ctl ? { signal: ctl.signal, cache: 'no-store' } : { cache: 'no-store' }).finally(() => t && clearTimeout(t));
};

// A small message that pops up at the bottom of the screen for a few seconds.
// Optional action button, e.g. HB.toast('Marked done', 5000, { label: 'Undo', fn: undo })
HB.toast = (msg, ms = 2600, action) => {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on');
  if (action) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-act'; b.textContent = action.label;
    b.onclick = () => { t.classList.remove('on'); action.fn(); };
    t.appendChild(b);
  }
  clearTimeout(HB._toastT); HB._toastT = setTimeout(() => t.classList.remove('on'), ms);
};
// Images that fail to load (Chrome extensions don't allow onerror="…" in the markup):
//   data-fallback="AB" + data-fallback-color → swap the logo for letters; data-hide-broken → hide it
document.addEventListener('error', e => {
  const img = e.target; if (!img || img.tagName !== 'IMG') return;
  if (img.dataset.fallback != null) {
    const p = img.parentNode; if (!p) return;
    p.className = 'mark'; p.style.background = img.dataset.fallbackColor || ''; p.textContent = img.dataset.fallback;
  } else if (img.hasAttribute('data-hide-broken')) img.style.visibility = 'hidden';
}, true);

// "15:30" → "3:30 PM" (in your computer's clock style)
HB.fmtTime = hhmm => { const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || ''); return m ? new Date(2000, 0, 1, +m[1], +m[2]).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''; };

// "3 days ago", "yesterday", "today" for a YYYY-MM-DD date
HB.daysAgo = iso => { const n = -HB.daysUntil(iso); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`; };
