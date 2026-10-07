/* What the dashboard starts with the very first time it opens in a browser.
   After that, everything you change is saved in the browser (see storage.js). */
HB.DEFAULTS = {
  links: [
    { id: 'canvas',    name: 'Canvas',        url: 'https://canvas.instructure.com',   icon: 'images/canvas.png',        iconMode: 'filled', iconBg: '#FFFFFF' },
    { id: 'outlook',   name: 'Outlook',       url: 'https://outlook.office.com/mail/', icon: 'images/outlook.jpg',       iconMode: 'filled', iconBg: '#FFFFFF' },
    { id: 'teamworks', name: 'Teamworks',     url: 'https://app.teamworksapp.com',     icon: 'images/teamworks.png',     iconMode: 'filled', iconBg: '#000000' },
    { id: 'youtube',   name: 'YouTube',       url: 'https://www.youtube.com',          icon: 'images/youtube.png',       iconMode: 'filled', iconBg: '#FFFFFF' },
    { id: 'claude',    name: 'Claude',        url: 'https://claude.ai',                icon: 'images/claude.png',        iconMode: 'bleed',  iconBg: '#D77655' },
    { id: 'chatgpt',   name: 'ChatGPT',       url: 'https://chatgpt.com',              icon: 'images/chatgpt.png',       iconMode: 'filled', iconBg: '#FFFFFF' },
    { id: 'finance',   name: 'Yahoo Finance', url: 'https://finance.yahoo.com',        icon: 'images/yahoo-finance.png', iconMode: 'filled', iconBg: '#FFFFFF' },
    { id: 'drive',     name: 'Google Drive',  url: 'https://drive.google.com',         icon: 'images/google-drive.png',  iconMode: 'filled', iconBg: '#FFFFFF' },
    { id: 'nflpro',    name: 'NFL Pro',       url: 'https://pro.nfl.com/',             icon: 'images/nfl-pro.png',       iconMode: 'filled', iconBg: '#FFFFFF' }
  ],
  tasks: [],
  deadlines: [],
  notes: '',
  canvasDone: {},   // Canvas assignments you've checked off (by Canvas id)
  settings: {
    name: '',          // no name until you add one in Settings → Profile (or Sync brings yours)
    about: '',
    unit: 'fahrenheit',
    wx: null,          // no city until you pick one in Settings → Weather (or Sync brings yours)
    timer: { focus: 25, deep: 50, brk: 5 },
    sheetUrl: '',      // no watchlist until you add your sheet in Settings → Stocks (or Sync brings yours)
    sheetCsvUrl: '',  // optional backup link (Settings → Stocks)
    sports: { favorites: [], leagues: ['nfl', 'cfb', 'nba', 'ncaab'] },  // favorite teams + sports with a tab, picked in Settings → Scores
    canvas: { feedUrl: '', show: 'widget' },   // Settings → Canvas: calendar feed link; show in 'widget', 'comingup' or 'both'
    boardMode: 'packed',        // 'packed' (no gaps) or 'rows' (neat, equal-height rows)
    // Widget order, size (s = one column, m = two columns, l = full width) and whether each is hidden
    layout: [
      { id: 'search', size: 'l' }, { id: 'launchpad', size: 'l' },
      { id: 'today', size: 's', col: 0 }, { id: 'deadlines', size: 's', col: 1 }, { id: 'focus', size: 's', col: 2 },
      { id: 'weather', size: 'm', col: 0 }, { id: 'watchlist', size: 's', col: 2 },
      { id: 'scores', size: 'l' },
      { id: 'notes', size: 'm', col: 0 }, { id: 'ask', size: 's', col: 2 }
    ]
  }
};
