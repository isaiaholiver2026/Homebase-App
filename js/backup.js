/* Backups (Settings → Backup): remembers when you last downloaded one.
   Your data only lives in this browser. */
(function () {
  const { $, lsGet, lsSet, localISO } = HB;
  const LAST = 'home-base-last-backup';

  // Remember the date every time a backup is downloaded (from anywhere)
  const exportData = HB.exportData;
  HB.exportData = () => { exportData(); lsSet(LAST, localISO()); update(); HB.toast('Backup saved to your Downloads folder'); };

  function update() {
    const last = lsGet(LAST);
    $('#lastBackup').textContent = last ? `Last backup: ${HB.daysAgo(last)}.` : 'No backup yet.';
  }
  HB.onChange(update);
})();
