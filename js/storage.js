/* Saving and loading your data.
   Everything is saved in this browser's storage. Turn on Settings → Sync (js/sync.js) to keep
   every browser and device the same, or use Settings → Backup to move it by hand. */
(function () {
  const KEY = 'home-base-data';
  const clone = o => JSON.parse(JSON.stringify(o));

  function withDefaults(saved) {
    const d = clone(HB.DEFAULTS);
    if (!saved || typeof saved !== 'object') return d;
    const s = Object.assign(d, saved);
    s.settings = Object.assign(clone(HB.DEFAULTS.settings), saved.settings || {});
    s.settings.timer = Object.assign(clone(HB.DEFAULTS.settings.timer), (saved.settings || {}).timer || {});
    s.settings.sports = Object.assign(clone(HB.DEFAULTS.settings.sports), (saved.settings || {}).sports || {});
    ['links', 'tasks', 'deadlines'].forEach(k => { if (!Array.isArray(s[k])) s[k] = []; });
    return s;
  }

  HB.withDefaults = withDefaults;
  HB.state = withDefaults(HB.lsGet(KEY));
  HB.settings = () => HB.state.settings;

  // Call after any change: redraws the page and saves.
  const listeners = [];
  HB.onChange = fn => listeners.push(fn);
  HB.commit = () => {
    HB.lsSet(KEY, HB.state);
    listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  };
  HB.saveQuietly = () => HB.lsSet(KEY, HB.state);

  HB.saveSetting = patch => { Object.assign(HB.state.settings, patch); HB.commit(); };

  // Backup: download everything as a file, or load a file back in.
  HB.exportData = () => {
    const blob = new Blob([JSON.stringify({ app: 'Home Base', savedAt: new Date().toISOString(), data: HB.state }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `home-base-backup-${HB.localISO()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  HB.importData = file => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const j = JSON.parse(r.result);
        const data = j && j.data ? j.data : j;
        if (!data || !Array.isArray(data.links)) throw new Error('not a backup');
        HB.state = withDefaults(data);
        HB.commit(); resolve();
      } catch (e) { reject(e); }
    };
    r.onerror = reject;
    r.readAsText(file);
  });
})();
