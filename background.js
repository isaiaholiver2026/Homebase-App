/* Home Base background script (Chrome extension).
   - When Chrome starts, opens Home Base as a pinned tab (or pins the one Chrome restored).
   - Clicking the Home Base icon in the toolbar jumps to that tab, or reopens it if you closed it.
   New tabs are Chrome's normal page; Home Base no longer replaces them. */
const HOME = chrome.runtime.getURL('index.html');

async function showHomeBase({ focus }) {
  const tabs = await chrome.tabs.query({});
  const mine = tabs.filter(t => (t.url || t.pendingUrl || '').startsWith(HOME));
  // Keep one Home Base tab: close any extras (e.g. one restored by Chrome plus one opened here)
  for (const extra of mine.slice(1)) chrome.tabs.remove(extra.id).catch(() => {});
  const tab = mine[0];
  if (tab) {
    await chrome.tabs.update(tab.id, Object.assign({ pinned: true }, focus ? { active: true } : {}));
    if (focus) chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  } else {
    await chrome.tabs.create({ url: HOME, pinned: true, index: 0, active: true });
  }
}

// Chrome just opened: give restored tabs a moment to come back, then make sure Home Base is there, pinned
chrome.runtime.onStartup.addListener(() => {
  setTimeout(() => showHomeBase({ focus: true }).catch(() => {}), 1500);
});

// Toolbar button
chrome.action.onClicked.addListener(() => { showHomeBase({ focus: true }).catch(() => {}); });
