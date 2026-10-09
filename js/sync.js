/* Sync: keeps your dashboard the same on every browser and device where you sign in.
   Uses your free Firebase project ("home-base-4ace0") through Firebase's web APIs, so no
   outside scripts are needed (Chrome extensions don't allow them).
   - Sign in with the account button (top right, next to the gear) using the email and password you made in Firebase.
   - Your tasks, deadlines, launchpad, notes and settings are stored at users/<you>/data/main.
   - Canvas assignments load in the Chrome extension and are shared to your other devices
     through users/<you>/data/canvas.
   - Light/dark mode, the weather, stock prices and scores stay per device (they refresh by themselves).
   Changes made on two devices at once are combined section by section; if the same section
   changed on both, the most recent edit on this device wins. */
(function () {
  const { $, esc, lsGet, lsSet, lsDel } = HB;

  const FB = {
    apiKey: 'AIzaSyCvjp4ANbD8TjIn6q_Z2853nRS4l_43mVY',
    projectId: 'home-base-4ace0'
  };
  const AUTH_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + FB.apiKey;
  const TOKEN_URL = 'https://securetoken.googleapis.com/v1/token?key=' + FB.apiKey;
  const SIGNUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + FB.apiKey;
  const RESET_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=' + FB.apiKey;
  const DOCS = `https://firestore.googleapis.com/v1/projects/${FB.projectId}/databases/(default)/documents`;

  const DATA_KEY = 'home-base-data';
  const K = {
    session: 'home-base-sync-session',  // { uid, email, idToken, refreshToken, exp }
    meta: 'home-base-sync-meta',        // { updateTime, base, dirty, at, canvasTime, canvasSent }
    presync: 'home-base-presync-backup' // this browser's data from just before it first synced
  };
  const POLL = 30 * 1000, PUSH_DELAY = 1500;
  const device = lsGet('home-base-device') || (() => { const d = HB.uid(); lsSet('home-base-device', d); return d; })();

  let session = lsGet(K.session);
  let meta = Object.assign({ updateTime: '', base: '', dirty: false, at: 0, canvasTime: '', canvasSent: '' }, lsGet(K.meta) || {});
  let applying = false, busy = false, pushT = null, pollT = null, status = '', problem = '';
  const saveMeta = () => lsSet(K.meta, meta);
  const hadDataBefore = HB.lsGet(DATA_KEY) != null;   // read before anything below saves

  // On other devices Canvas comes from sync instead of loading directly
  HB.canvasFromSync = () => !!session && !HB.isExt;

  /* ---------- Watching for changes made in this browser ---------- */
  const origCommit = HB.commit, origQuiet = HB.saveQuietly;
  HB.commit = () => { origCommit(); if (!applying) changed(); };
  HB.saveQuietly = () => { origQuiet(); if (!applying) changed(); };
  function changed() {
    if (!session) return;
    if (!meta.dirty && localText() === meta.base) return;   // redrawn, but nothing actually changed
    meta.dirty = true; saveMeta();
    clearTimeout(pushT); pushT = setTimeout(() => sync('push'), PUSH_DELAY);
  }

  /* ---------- Firebase sign-in ---------- */
  const AUTH_ERRORS = {
    INVALID_LOGIN_CREDENTIALS: "That email and password don't match an account. Check them, or create an account.",
    INVALID_PASSWORD: "That email and password don't match an account. Check them, or create an account.",
    EMAIL_NOT_FOUND: "That email and password don't match an account. Check them, or create an account.",
    INVALID_EMAIL: 'Check the email address and try again.',
    MISSING_PASSWORD: 'Enter your password.',
    USER_DISABLED: 'This login has been turned off in Firebase.',
    OPERATION_NOT_ALLOWED: 'Email sign-in is turned off. In Firebase, open Authentication → Sign-in method and enable Email/Password.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many tries. Wait a few minutes, then try again.',
    EMAIL_EXISTS: 'There\'s already an account with that email. Sign in instead.',
    WEAK_PASSWORD: 'Use a password with at least 6 characters.',
    ADMIN_ONLY_OPERATION: 'New accounts are turned off for this dashboard. In Firebase, open Authentication → Settings → User actions and turn on "Enable create (sign-up)".',
    MISSING_EMAIL: 'Enter your email.'
  };
  const authMessage = code => AUTH_ERRORS[String(code || '').split(' ')[0]] || "Couldn't sign in. Check your internet connection and try again.";

  async function postJson(url, body, form) {
    const r = await fetch(url, form
      ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error('auth'), { code: (j.error && j.error.message) || 'HTTP_' + r.status, status: r.status });
    return j;
  }
  async function signIn(email, password, create) {
    const j = await postJson(create ? SIGNUP_URL : AUTH_URL, { email, password, returnSecureToken: true });
    session = { uid: j.localId, email: j.email || email, idToken: j.idToken, refreshToken: j.refreshToken, exp: Date.now() + (+j.expiresIn || 3600) * 1000 };
    lsSet(K.session, session);
  }
  async function token() {
    if (!session) throw Object.assign(new Error('signed out'), { kind: 'signedout' });
    if (Date.now() < session.exp - 60000) return session.idToken;
    try {
      const j = await postJson(TOKEN_URL, { grant_type: 'refresh_token', refresh_token: session.refreshToken }, true);
      session = Object.assign({}, session, { idToken: j.id_token, refreshToken: j.refresh_token, exp: Date.now() + (+j.expires_in || 3600) * 1000 });
      lsSet(K.session, session);
      return session.idToken;
    } catch (e) {
      if (e.status === 400) { signOut(true); throw Object.assign(new Error('signed out'), { kind: 'signedout' }); }
      throw e;
    }
  }
  function signOut(expired) {
    session = null; lsDel(K.session);
    meta = { updateTime: '', base: '', dirty: false, at: 0, canvasTime: '', canvasSent: '' }; saveMeta();
    problem = expired ? 'Your sign-in expired. Sign in again to keep syncing.' : '';
    draw();
  }

  /* ---------- Firestore (the online copy) ---------- */
  const docUrl = name => `${DOCS}/users/${session.uid}/data/${name}`;
  async function fsGet(name) {
    const r = await fetch(docUrl(name), { headers: { Authorization: 'Bearer ' + await token() }, cache: 'no-store' });
    if (r.status === 404) {
      const j = await r.json().catch(() => ({}));
      // "The database (default) does not exist…" means no Firestore database; any other 404 is just a document that isn't saved yet
      if (/database \S+ does not exist/i.test((j.error && j.error.message) || '')) throw Object.assign(new Error('nodb'), { kind: 'nodb' });
      return null;
    }
    if (!r.ok) throw Object.assign(new Error('fs'), { status: r.status });
    const j = await r.json(), f = j.fields || {};
    return { text: (f.state && f.state.stringValue) || '', device: (f.device && f.device.stringValue) || '', updateTime: j.updateTime };
  }
  async function fsSet(name, text, prevTime) {
    const pre = prevTime ? 'currentDocument.updateTime=' + encodeURIComponent(prevTime) : 'currentDocument.exists=false';
    const body = { fields: { state: { stringValue: text }, device: { stringValue: device }, savedAt: { integerValue: String(Date.now()) } } };
    const r = await fetch(`${docUrl(name)}?${pre}`, {
      method: 'PATCH', headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (r.status === 400 || r.status === 409 || r.status === 412) {
      const j = await r.json().catch(() => ({}));
      const st = (j.error && j.error.status) || '';
      if (/FAILED_PRECONDITION|ALREADY_EXISTS|NOT_FOUND/.test(st) || r.status !== 400) throw Object.assign(new Error('conflict'), { kind: 'conflict' });
      throw Object.assign(new Error('fs'), { status: r.status });
    }
    if (r.status === 404) {
      const j = await r.json().catch(() => ({}));
      throw /database \S+ does not exist/i.test((j.error && j.error.message) || '') ? Object.assign(new Error('nodb'), { kind: 'nodb' }) : Object.assign(new Error('fs'), { status: 404 });
    }
    if (!r.ok) throw Object.assign(new Error('fs'), { status: r.status });
    return (await r.json()).updateTime;
  }

  /* ---------- Combining and applying ---------- */
  const localText = () => JSON.stringify(HB.state);
  // Combine two versions that both changed since the last sync, one section at a time
  function merge(baseText, localObj, remoteObj) {
    let base = {}; try { base = JSON.parse(baseText) || {}; } catch (e) {}
    const out = {}, keys = new Set([...Object.keys(remoteObj), ...Object.keys(localObj)]);
    keys.forEach(k => {
      const changedHere = JSON.stringify(localObj[k]) !== JSON.stringify(base[k]);
      out[k] = changedHere ? localObj[k] : (k in remoteObj ? remoteObj[k] : localObj[k]);
    });
    return out;
  }
  // Hold incoming changes only while you're in the middle of typing something
  const typing = () => {
    const a = document.activeElement;
    if (!a || a.closest('#acctPop')) return false;
    if (a.tagName === 'TEXTAREA') return true;
    return a.tagName === 'INPUT' && !/checkbox|radio|button|submit/.test(a.type) && a.value.trim() !== '';
  };
  function apply(obj) {
    applying = true;
    try { HB.state = HB.withDefaults(obj); origCommit(); HB.fillSettings && HB.fillSettings(); }
    finally { applying = false; }
  }

  /* ---------- The sync itself ---------- */
  // mode: 'push' after a change here, 'pull' to check for changes elsewhere, 'first' right after signing in
  async function sync(mode) {
    if (!session) return;
    if (busy) { if (mode === 'push') { clearTimeout(pushT); pushT = setTimeout(() => sync('push'), PUSH_DELAY); } return; }
    busy = true; status = 'syncing'; draw();
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const remote = await fsGet('main');
        if (mode === 'first') {
          mode = 'pull';
          if (!remote) { meta.dirty = true; }              // first device: this browser becomes the synced copy
          else if (meta.base === '' && hadDataBefore && remote.text !== localText()) {
            const useRemote = confirm('Your synced Home Base already has data.\n\nOK: replace what\'s in this browser with your synced dashboard (recommended).\nCancel: keep this browser\'s version and replace the synced copy with it.');
            lsSet(K.presync, HB.state);                    // safety copy either way
            if (useRemote) { meta.updateTime = remote.updateTime; meta.base = remote.text; meta.dirty = false; apply(JSON.parse(remote.text)); saveMeta(); }
            else { meta.updateTime = remote.updateTime; meta.base = remote.text; meta.dirty = true; }
          }
        }
        // Somebody else saved since our last sync: bring it in
        if (remote && remote.updateTime !== meta.updateTime) {
          if (typing()) { status = ''; break; }           // wait until you're done typing
          const remoteObj = JSON.parse(remote.text || '{}');
          if (meta.dirty) apply(merge(meta.base, JSON.parse(localText()), remoteObj));
          else apply(remoteObj);
          meta.updateTime = remote.updateTime; meta.base = remote.text;
          if (!meta.dirty) { meta.at = Date.now(); saveMeta(); }
        }
        if (!meta.dirty) break;
        // Send this browser's changes
        const text = localText();
        if (text.length > 900000) { problem = 'Your dashboard is too big to sync (probably large custom logos). Try smaller logo images.'; break; }
        try {
          meta.updateTime = await fsSet('main', text, remote ? meta.updateTime : '');
          meta.base = text; meta.dirty = false; meta.at = Date.now(); saveMeta();
          break;
        } catch (e) { if (e.kind !== 'conflict') throw e; }   // changed elsewhere a moment ago: combine and try again
      }
      await syncCanvas();
      problem = ''; status = '';
    } catch (e) {
      status = '';
      if (e.kind === 'signedout') {}
      else if (e.kind === 'nodb') problem = "Firebase says there's no Firestore database yet. Create one in the Firebase console (Firestore Database → Create database).";
      else if (e.status === 403 || e.status === 401) problem = "Firebase blocked access. Check that the Firestore rules from setup are published.";
      else if (navigator.onLine === false) problem = "You're offline. Changes are saved here and will sync when you're back online.";
      else problem = "Couldn't reach Firebase just now. Changes are saved here and will sync on the next try.";
      console.warn('Sync:', e);
    }
    busy = false; saveMeta(); draw();
  }

  // Canvas assignments: the extension shares them, other devices read them
  async function syncCanvas() {
    if (HB.isExt) {
      const c = localStorage.getItem('home-base-canvas') || '';
      if (!c || c === meta.canvasSent) return;
      let prev = meta.canvasTime;
      for (let i = 0; i < 2; i++) {
        try { meta.canvasTime = await fsSet('canvas', c, prev); meta.canvasSent = c; return; }
        catch (e) { if (e.kind !== 'conflict') throw e; const r = await fsGet('canvas'); prev = r ? r.updateTime : ''; }
      }
    } else {
      const r = await fsGet('canvas');
      if (r && r.updateTime !== meta.canvasTime && r.text) {
        meta.canvasTime = r.updateTime;
        try { HB.canvasSetCache && HB.canvasSetCache(JSON.parse(r.text)); } catch (e) {}
      }
    }
  }

  // After signing out: start this browser over with a blank dashboard (light/dark mode stays)
  function clearThisBrowser() {
    ['home-base-data', 'home-base-canvas', 'home-base-weather', 'home-base-quotes', 'home-base-scores', 'home-base-sessions', K.presync].forEach(lsDel);
    meta.canvasTime = meta.canvasSent = ''; saveMeta();
    apply(HB.withDefaults(null));
    setTimeout(() => location.reload(), 900);   // so every widget redraws from scratch
  }

  /* ---------- The sync pop-up and the footer ---------- */
  function ago(t) {
    if (!t) return '';
    const s = Math.round((Date.now() - t) / 1000);
    return s < 45 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} hr ago` : `${Math.round(s / 86400)} d ago`;
  }
  function drawButton() {
    const btn = $('#acctBtn'); if (!btn) return;
    const who = (HB.settings().name || (session && session.email) || '').trim();
    btn.classList.toggle('on', !!session);
    btn.classList.toggle('warn', !!session && !!problem);
    $('#acctInit').textContent = who ? who[0].toUpperCase() : '';
    const label = !session ? 'Sign in or create an account' : problem ? 'Sync paused' : `Signed in as ${session.email}`;
    btn.title = label; btn.setAttribute('aria-label', label);
  }
  function draw() {
    drawButton();
    const box = $('#syncBox'), foot = $('#footSave');
    if (foot) foot.textContent = !session ? 'Saved in this browser'
      : problem ? 'Sync paused · saved in this browser'
      : status === 'syncing' ? 'Syncing…'
      : meta.at ? `Synced ${ago(meta.at)}` : 'Sync on';
    if (!box) return;
    const title = $('#acctTitle');
    if (!session) {
      if (title) title.textContent = authMode === 'create' ? 'Create account' : authMode === 'reset' ? 'Reset password' : 'Sign in';
      if (box.dataset.mode !== authMode) drawAuthForm(box);
      $('#syncMsg').textContent = problem;
      return;
    }
    if (title) title.textContent = 'Your account';
    box.dataset.mode = '';
    box.innerHTML = `<small>Signed in as <b>${esc(session.email)}</b>. Your tasks, deadlines, launchpad, notes and settings sync to every device where you sign in${HB.isExt ? ', and this browser shares your Canvas assignments with them' : ''}.</small>
      <small>${problem ? esc(problem) : status === 'syncing' ? 'Syncing…' : meta.at ? 'Last synced ' + ago(meta.at) + '.' : ''}</small>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sec" type="button" id="syncNow">Sync now</button><button class="btn sec" type="button" id="syncOut">Sign out</button></div>`;
    $('#syncNow').onclick = () => sync('pull');
    $('#syncOut').onclick = () => {
      if (!confirm('Sign out on this browser?\n\nYour dashboard will be removed from this browser (it stays safe in your synced copy). Sign in again anytime to bring it back.')) return;
      closePop(); signOut(false); clearThisBrowser(); HB.toast('Signed out. Your dashboard was removed from this browser.');
    };
  }
  let authMode = 'signin';   // 'signin' | 'create' | 'reset'
  function drawAuthForm(box) {
    box.dataset.mode = authMode;
    const email = ($('#syncEmail') && $('#syncEmail').value) || '';
    const tabs = authMode === 'reset' ? '' : `<div class="seg acct-seg" role="tablist" aria-label="Sign in or create an account">
        <button type="button" role="tab" data-m="signin" aria-pressed="${authMode === 'signin'}">Sign in</button>
        <button type="button" role="tab" data-m="create" aria-pressed="${authMode === 'create'}">Create account</button></div>`;
    const intro = authMode === 'create' ? 'Make a free account so your dashboard is saved and stays the same on every browser and device where you sign in.'
      : authMode === 'reset' ? 'Enter your email and we\'ll send you a link to choose a new password.'
      : 'Sign in to keep your dashboard the same on every browser and device where you sign in.';
    box.innerHTML = `${tabs}<small>${intro}</small>
      <form class="field" id="syncForm" style="flex-direction:column;align-items:stretch;gap:8px">
        <input class="set-in" id="syncEmail" type="email" autocomplete="${authMode === 'create' ? 'email' : 'username'}" placeholder="Email" required value="${esc(email)}">
        ${authMode === 'reset' ? '' : `<input class="set-in" id="syncPass" type="password" autocomplete="${authMode === 'create' ? 'new-password' : 'current-password'}" placeholder="${authMode === 'create' ? 'Password (at least 6 characters)' : 'Password'}" required>`}
        ${authMode === 'create' ? '<input class="set-in" id="syncPass2" type="password" autocomplete="new-password" placeholder="Confirm password" required>' : ''}
        <button class="btn" type="submit">${authMode === 'create' ? 'Create account' : authMode === 'reset' ? 'Send reset link' : 'Sign in'}</button>
      </form>
      <small id="syncMsg"></small>
      ${authMode === 'signin' ? '<button type="button" class="ghost acct-link" data-m="reset">Forgot password?</button>' : authMode === 'reset' ? '<button type="button" class="ghost acct-link" data-m="signin">Back to sign in</button>' : ''}`;
    box.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { authMode = b.dataset.m; problem = ''; drawAuthForm(box); draw(); const f = $('#syncEmail'); if (f) f.focus(); });
    $('#syncForm').addEventListener('submit', authMode === 'reset' ? onReset : onSignIn);
  }
  async function onReset(e) {
    e.preventDefault();
    const email = $('#syncEmail').value.trim(), btn = e.target.querySelector('button');
    btn.disabled = true; btn.textContent = 'Sending…';
    try {
      await postJson(RESET_URL, { requestType: 'PASSWORD_RESET', email });
      $('#syncMsg').textContent = 'If there\'s an account with that email, a reset link is on its way. Check your inbox (and spam).';
    } catch (err) { $('#syncMsg').textContent = authMessage(err.code); }
    btn.disabled = false; btn.textContent = 'Send reset link';
  }
  async function onSignIn(e) {
    e.preventDefault();
    const create = authMode === 'create';
    const email = $('#syncEmail').value.trim(), pass = $('#syncPass').value, btn = e.target.querySelector('button');
    if (create && pass !== $('#syncPass2').value) { $('#syncMsg').textContent = 'The passwords don\'t match.'; return; }
    btn.disabled = true; btn.textContent = create ? 'Creating account…' : 'Signing in…'; $('#syncMsg').textContent = '';
    try {
      await signIn(email, pass, create);
      meta = { updateTime: '', base: '', dirty: false, at: 0, canvasTime: '', canvasSent: '' }; saveMeta();
      problem = ''; draw();
      await sync('first');
      if (!problem) { HB.toast(create ? 'Account created. Your dashboard is saved.' : 'Signed in. Sync is on.'); authMode = 'signin'; setTimeout(closePop, 1200); }
      startPolling();
    } catch (err) {
      $('#syncMsg').textContent = authMessage(err.code);
      btn.disabled = false; btn.textContent = create ? 'Create account' : 'Sign in';
    }
  }

  /* ---------- The pop-up under the account button ---------- */
  const pop = $('#acctPop'), abtn = $('#acctBtn');
  function openPop() {
    draw(); pop.hidden = false; abtn.setAttribute('aria-expanded', 'true');
    const f = pop.querySelector('#syncEmail') || pop.querySelector('#syncNow');
    if (f) setTimeout(() => f.focus(), 30);
  }
  function closePop() { if (pop.hidden) return; pop.hidden = true; abtn.setAttribute('aria-expanded', 'false'); }
  if (pop && abtn) {
    abtn.addEventListener('click', e => { e.stopPropagation(); pop.hidden ? openPop() : closePop(); });
    $('#acctClose').addEventListener('click', () => { closePop(); abtn.focus(); });
    // Close on clicks outside (a button that redrew itself inside the pop-up doesn't count)
    document.addEventListener('click', e => { if (!pop.hidden && e.target.isConnected && !pop.contains(e.target) && !abtn.contains(e.target)) closePop(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) { closePop(); abtn.focus(); } });
  }

  /* ---------- Staying up to date ---------- */
  function startPolling() {
    clearInterval(pollT);
    pollT = setInterval(() => { if (session && !document.hidden) sync(meta.dirty ? 'push' : 'pull'); draw(); }, POLL);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && session) sync('pull'); });
  window.addEventListener('focus', () => { if (session) sync('pull'); });
  window.addEventListener('online', () => { if (session) sync('push'); });

  HB.onChange(draw);
  if (session) { startPolling(); setTimeout(() => sync(meta.dirty ? 'push' : 'pull'), 300); }
  draw();
})();
