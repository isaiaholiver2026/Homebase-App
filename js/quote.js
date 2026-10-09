/* Quote of the day: quotes from DummyJSON's free quote service (no account or key).
   Pick the topics you want with the Topics button. DummyJSON doesn't label its quotes, so
   Home Base sorts them into topics by the words they use (money, love, success…).
   The whole list (about 1,400 short quotes) is saved in this browser and refreshed monthly,
   so the widget is instant and works offline. Same quote all day; "Another" shows a different one. */
(function () {
  const { esc, lsGet, lsSet, localISO } = HB;
  const API = 'https://dummyjson.com/quotes?limit=0';
  const KEY = 'home-base-quote-all', REFRESH = 30 * 864e5;

  // Topics and the words that put a quote in them
  const TOPICS = [
    { id: 'inspire', name: 'Inspirational', re: /\b(dream|dreams|believe|inspir\w*|hope|courage|brave|never give up|possible|impossible|achieve\w*|potential|passion|purpose|vision|great(ness)?)\b/i },
    { id: 'success', name: 'Success & work', re: /\b(success\w*|fail\w*|work|hard work|effort|goal|goals|win|winning|progress|persist\w*|discipline|habit\w*|excellen\w*|career|business|leader\w*)\b/i },
    { id: 'money', name: 'Money', re: /\b(money|rich|riches|wealth\w*|poor|poverty|invest\w*|financ\w*|dollar\w*|debt|spend\w*|save|saving|savings|price|profit|fortune|economy|gold|earn\w*)\b/i },
    { id: 'love', name: 'Love & relationships', re: /\b(love|loved|loving|lover\w*|heart|hearts|marriage|married|romance|romantic|kiss|relationship\w*|partner)\b/i },
    { id: 'friends', name: 'Friendship', re: /\b(friend|friends|friendship|together|kindness|kind|companion\w*)\b/i },
    { id: 'happy', name: 'Happiness', re: /\b(happ(y|iness|ier)|joy|joyful|smile|laugh\w*|peace|grateful|gratitude|content\w*|cheer\w*)\b/i },
    { id: 'wisdom', name: 'Wisdom & learning', re: /\b(wis(e|dom)|knowledge|learn\w*|truth|mind|think\w*|thought\w*|understand\w*|educat\w*|study|ignoran\w*|question\w*)\b/i },
    { id: 'life', name: 'Life', re: /\b(life|lives|living|live|death|die|time|today|tomorrow|yesterday|moment\w*|future|past|change)\b/i }
  ];

  let sec = null, list = null, shown = null, picking = false;
  const cfg = () => { const s = HB.settings(); if (!s.quote) s.quote = { cats: [] }; if (!Array.isArray(s.quote.cats)) s.quote.cats = []; return s.quote; };

  async function loadAll(force) {
    const saved = lsGet(KEY);
    if (saved && saved.list && saved.list.length && !force && Date.now() - saved.at < REFRESH) return saved.list;
    try {
      const r = await HB.fetchWithTimeout(API, 15000); if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const out = (j.quotes || []).filter(x => x && x.quote).map(x => [x.quote, x.author || '']);
      if (!out.length) throw new Error('empty');
      lsSet(KEY, { at: Date.now(), list: out });
      return out;
    } catch (e) {
      if (saved && saved.list && saved.list.length) return saved.list;   // keep using the old copy
      throw e;
    }
  }

  // Quotes that match the topics you picked (all of them if you picked none)
  function matching() {
    const cats = cfg().cats, ts = TOPICS.filter(t => cats.includes(t.id));
    if (!ts.length) return list;
    return list.filter(([q]) => ts.some(t => t.re.test(q)));
  }
  // Same quote all day (changes when the day or your topics change)
  function todays(pool) {
    const day = Math.floor(HB.today0().getTime() / 864e5), salt = cfg().cats.join('').length * 7919;
    return pool[(day * 2654435761 + salt) % pool.length >>> 0] || pool[day % pool.length];
  }

  function draw(note) {
    const body = sec && sec.querySelector('.qt-body'); if (!body) return;
    const cats = cfg().cats;
    const tbtn = sec.querySelector('[data-qttopics]');
    if (tbtn) { tbtn.textContent = cats.length ? `Topics (${cats.length})` : 'Topics'; tbtn.setAttribute('aria-expanded', String(picking)); }
    const chips = picking ? `<div class="qt-topics" role="group" aria-label="Quote topics">
        <button type="button" class="qt-chip" data-qtall aria-pressed="${!cats.length}">All topics</button>
        ${TOPICS.map(t => `<button type="button" class="qt-chip" data-qtcat="${t.id}" aria-pressed="${cats.includes(t.id)}">${esc(t.name)}</button>`).join('')}
      </div>` : '';
    if (!list) { body.innerHTML = chips + `<p class="qt-none">${esc(note || 'Loading…')}</p>`; return; }
    const pool = matching();
    if (!pool.length) { body.innerHTML = chips + '<p class="qt-none">No quotes match those topics. Try adding another topic.</p>'; return; }
    const [q, a] = shown && pool.includes(shown) ? shown : todays(pool);
    body.innerHTML = chips + `<blockquote class="qt-text">${esc(q)}</blockquote><p class="qt-by">${esc(a || 'Unknown')}</p>`
      + (picking ? `<p class="qt-count">${pool.length} quote${pool.length === 1 ? '' : 's'} in ${cats.length ? 'these topics' : 'all topics'}</p>` : '');
  }

  async function start() {
    draw();
    try { list = await loadAll(); draw(); }
    catch (e) { draw("Couldn't load quotes. Check your internet connection."); }
  }

  HB.registerWidget({
    id: 'quote', name: 'Quote of the day', size: 's',
    desc: 'A new quote every day from the topics you pick, like inspirational, money or relationships.',
    icon: '<path d="M7 7h4v4c0 3-1.5 5-4 6M14 7h4v4c0 3-1.5 5-4 6"/>',
    render(section) {
      sec = section;
      sec.classList.add('qt');
      sec.innerHTML = `<div class="card-h"><h2>Quote of the day</h2><div class="qt-btns"><button type="button" class="ghost" data-qttopics aria-expanded="false">Topics</button><button type="button" class="ghost" data-qtnext title="Show a different quote">Another</button></div></div><div class="qt-body"></div>`;
      sec.addEventListener('click', e => {
        const t = e.target;
        if (t.closest('[data-qttopics]')) { picking = !picking; draw(); return; }
        if (t.closest('[data-qtnext]')) {
          if (!list) return;
          const pool = matching(); if (pool.length < 2) return;
          let next; do { next = pool[Math.floor(Math.random() * pool.length)]; } while (next === shown && pool.length > 1);
          shown = next; draw(); return;
        }
        const c = cfg();
        if (t.closest('[data-qtall]')) { c.cats = []; shown = null; HB.saveQuietly(); draw(); return; }
        const cb = t.closest('[data-qtcat]');
        if (cb) {
          const id = cb.dataset.qtcat;
          c.cats = c.cats.includes(id) ? c.cats.filter(x => x !== id) : [...c.cats, id];
          shown = null; HB.saveQuietly(); draw();
        }
      });
      start();
      // New day while the page is open: show the new day's quote
      let lastDay = localISO();
      setInterval(() => { if (localISO() !== lastDay) { lastDay = localISO(); shown = null; draw(); } }, 10 * 60 * 1000);
    }
  });
  // Topics changed on another device (Sync): redraw
  HB.onChange(() => { if (sec && list) draw(); });
})();
