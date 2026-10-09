/* Starts the dashboard: theme, clock and greeting, search bar. Loaded last. */
(function () {
  const { $, $$, lsGet, lsSet, lsDel } = HB;

  /* Light / dark mode (saved per browser) */
  HB.THEME_KEY = 'home-base-theme';
  const root = document.documentElement, mq = window.matchMedia('(prefers-color-scheme: dark)');
  const effective = () => root.getAttribute('data-theme') || (mq.matches ? 'dark' : 'light');
  function paint() {
    const dark = effective() === 'dark';
    root.classList.toggle('is-dark', dark);
    $('#themeBtn').setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }
  HB.setTheme = t => {
    root.classList.add('theme-fade');
    if (t === 'system') { lsDel(HB.THEME_KEY); root.removeAttribute('data-theme'); }
    else { lsSet(HB.THEME_KEY, t); root.setAttribute('data-theme', t); }
    paint(); setTimeout(() => root.classList.remove('theme-fade'), 400);
  };
  const saved = lsGet(HB.THEME_KEY); if (saved) root.setAttribute('data-theme', saved);
  paint();
  mq.addEventListener && mq.addEventListener('change', paint);
  $('#themeBtn').onclick = () => { HB.setTheme(effective() === 'dark' ? 'light' : 'dark'); HB.fillSettings(); };

  /* Clock and greeting */
  function tick() {
    const n = new Date(), h = n.getHours();
    $('#time').innerHTML = `${((h + 11) % 12) + 1}:${String(n.getMinutes()).padStart(2, '0')}<small>${h < 12 ? 'AM' : 'PM'}</small>`;
    $('#date').textContent = n.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const part = h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const nm = (HB.settings().name || '').trim().split(/\s+/)[0];
    $('#greet').textContent = nm ? `${part}, ${nm}` : part;
  }
  setInterval(tick, 15000);
  HB.onChange(tick);

  /* Search bar: see js/search.js */

  /* First draw: every section listens for HB.commit() */
  HB.commit();
})();
