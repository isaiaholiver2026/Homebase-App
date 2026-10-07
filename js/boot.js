/* Runs before the page draws. (Chrome extensions don't allow scripts written inside index.html,
   so anything that has to run this early lives here.) */
// Apply the saved light/dark choice so the page never flashes the wrong theme.
try { var t = JSON.parse(localStorage.getItem('home-base-theme')); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}
