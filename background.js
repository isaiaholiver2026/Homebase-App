/* Home Base background script (Chrome extension).
   - When Chrome starts, opens Home Base as a normal tab in the first spot (or reuses the one Chrome restored).
     It isn't pinned, because Chrome shrinks pinned tabs to a small icon.
   - Clicking the Home Base icon in the toolbar jumps to that tab, or reopens it if you closed it.
   New tabs are Chrome's normal page; Home Base no longer replaces them. */
const HOME = chrome.runtime.getURL('index.html');

async function showHomeBase({ focus, first }) {
  const tabs = await chrome.tabs.query({});
  const mine = tabs.filter(t => (t.url || t.pendingUrl || '').startsWith(HOME));
  // Keep one Home Base tab: close any extras (e.g. one restored by Chrome plus one opened here)
  for (const extra of mine.slice(1)) chrome.tabs.remove(extra.id).catch(() => {});
  const tab = mine[0];
  if (tab) {
    // Unpin it if it was pinned before (older versions pinned it)
    await chrome.tabs.update(tab.id, Object.assign({ pinned: false }, focus ? { active: true } : {}));
    if (first) await chrome.tabs.move(tab.id, { index: 0 }).catch(() => {});   // back to the first spot when Chrome starts
    if (focus) chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
  } else {
    await chrome.tabs.create({ url: HOME, index: 0, active: true });
  }
}

// Chrome just opened: give restored tabs a moment to come back, then make sure Home Base is there, first in line
chrome.runtime.onStartup.addListener(() => {
  setTimeout(() => showHomeBase({ focus: true, first: true }).catch(() => {}), 1500);
});

// Toolbar button
chrome.action.onClicked.addListener(() => { showHomeBase({ focus: true }).catch(() => {}); });
