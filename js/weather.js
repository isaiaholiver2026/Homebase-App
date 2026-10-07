/* Weather card, using Open-Meteo (free, no account or key needed): https://open-meteo.com */
(function () {
  const { $, esc, lsGet, lsSet } = HB;
  const CACHE = 'home-base-weather';
  let data = lsGet(CACHE), loading = false;

  // Open-Meteo weather codes → icon + words
  function describe(code, day) {
    code = +code;
    if (code === 0) return { k: day ? 'sun' : 'moon', p: day ? 'Sunny' : 'Clear' };
    if (code === 1) return { k: day ? 'sun' : 'moon', p: day ? 'Mostly sunny' : 'Mostly clear' };
    if (code === 2) return { k: day ? 'pcday' : 'pcnight', p: 'Partly cloudy' };
    if (code === 3) return { k: 'cloud', p: 'Cloudy' };
    if (code === 45 || code === 48) return { k: 'fog', p: 'Fog' };
    if (code >= 51 && code <= 57) return { k: 'rain', p: 'Drizzle' };
    if (code >= 61 && code <= 67) return { k: 'rain', p: code >= 65 ? 'Heavy rain' : 'Rain' };
    if (code >= 71 && code <= 77) return { k: 'snow', p: 'Snow' };
    if (code >= 80 && code <= 82) return { k: 'rain', p: 'Showers' };
    if (code === 85 || code === 86) return { k: 'snow', p: 'Snow showers' };
    if (code >= 95) return { k: 'storm', p: 'Thunderstorms' };
    return { k: 'cloud', p: 'Cloudy' };
  }

  function icon(kind, size = 28) {
    const sun = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--wx-sun)"/>` + [0, 45, 90, 135, 180, 225, 270, 315].map(a => { const t = a * Math.PI / 180; return `<line x1="${cx + Math.cos(t) * (r + 2.5)}" y1="${cy + Math.sin(t) * (r + 2.5)}" x2="${cx + Math.cos(t) * (r + 5)}" y2="${cy + Math.sin(t) * (r + 5)}" stroke="var(--wx-sun)" stroke-width="2" stroke-linecap="round"/>`; }).join('');
    const moon = (cx, cy, r) => `<path d="M${cx + r * .35} ${cy - r} a${r} ${r} 0 1 0 ${r * .75} ${r * 1.55} a${r * .8} ${r * .8} 0 0 1 ${-r * .75} ${-r * 1.55}z" fill="var(--wx-sun)" opacity=".9"/>`;
    const cloud = (dx = 0, dy = 0, fill = 'var(--wx-cloud)') => `<path transform="translate(${dx} ${dy})" d="M9 26h15.5a5.5 5.5 0 0 0 .6-11 7.5 7.5 0 0 0-14.4-1.6A6.3 6.3 0 0 0 9 26z" fill="${fill}"/>`;
    const b = {
      sun: () => sun(16, 16, 6.5),
      moon: () => moon(15, 16, 8),
      pcday: () => sun(12, 11, 5) + cloud(2, 3),
      pcnight: () => moon(11, 11, 6) + cloud(2, 3),
      cloud: () => cloud(-2, 0, 'var(--wx-cloud-2)') + cloud(1, 2),
      fog: () => cloud(0, -3) + `<g stroke="var(--wx-cloud-2)" stroke-width="2" stroke-linecap="round"><line x1="7" y1="27" x2="25" y2="27"/><line x1="10" y1="30" x2="22" y2="30"/></g>`,
      rain: () => cloud(0, -4) + `<g stroke="var(--wx-rain)" stroke-width="2" stroke-linecap="round"><line x1="11" y1="25" x2="9.5" y2="29"/><line x1="16.5" y1="25" x2="15" y2="29"/><line x1="22" y1="25" x2="20.5" y2="29"/></g>`,
      storm: () => cloud(0, -4, 'var(--wx-cloud-2)') + `<path d="M17 22l-4 5.5h3.5L15 31l5-6.5h-3.5L18 22z" fill="var(--wx-sun)"/>`,
      snow: () => cloud(0, -4) + `<g fill="var(--wx-cold)"><circle cx="11" cy="26" r="1.6"/><circle cx="16.5" cy="28.5" r="1.6"/><circle cx="22" cy="26" r="1.6"/></g>`
    };
    return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">${(b[kind] || b.cloud)()}</svg>`;
  }

  const hourLabel = iso => { const h = +iso.slice(11, 13); return `${((h + 11) % 12) + 1} ${h < 12 ? 'AM' : 'PM'}`; };
  const dow = iso => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(iso + 'T12:00:00').getDay()];

  async function load(force) {
    const st = HB.settings(), loc = st.wx;
    if (!loc) { render(); return; }
    const same = data && data.lat === loc.lat && data.lon === loc.lon && data.unit === st.unit && data.now;
    render();
    if (loading || (!force && same && Date.now() - data.at < 15 * 60000)) return;
    loading = true;
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat + '&longitude=' + loc.lon
      + '&current=temperature_2m,apparent_temperature,weather_code,is_day'
      + '&hourly=temperature_2m,weather_code,precipitation_probability,is_day'
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
      + '&temperature_unit=' + (st.unit === 'celsius' ? 'celsius' : 'fahrenheit') + '&timezone=auto&forecast_days=8';
    try {
      const r = await HB.fetchWithTimeout(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const c = j.current, h = j.hourly, d = j.daily;
      const start = Math.max(0, h.time.findIndex(t => t > c.time));   // first whole hour after now
      data = {
        lat: loc.lat, lon: loc.lon, unit: st.unit, at: Date.now(), place: loc.name,
        now: { t: c.temperature_2m, feel: c.apparent_temperature, code: c.weather_code, day: !!c.is_day },
        hours: h.time.slice(start, start + 12).map((t, i) => ({ t: h.temperature_2m[start + i], code: h.weather_code[start + i], day: !!h.is_day[start + i], p: h.precipitation_probability[start + i] || 0, label: hourLabel(t) })),
        days: d.time.slice(0, 7).map((t, i) => ({ date: t, hi: d.temperature_2m_max[i], lo: d.temperature_2m_min[i], code: d.weather_code[i], p: d.precipitation_probability_max[i] || 0 })),
        err: ''
      };
      lsSet(CACHE, data);
    } catch (e) {
      data = Object.assign({}, same ? data : {}, { err: "Couldn't reach the weather service. Check your internet connection." });
    } finally { loading = false; render(); }
  }
  HB.loadWeather = load;

  function render() {
    const el = $('#wx'), st = HB.settings();
    if (!st.wx) { el.classList.remove('night'); el.innerHTML = `<div class="wx-empty"><span>Add your city or ZIP code in Settings to see the weather.</span><button class="btn sec" data-open-settings>Open settings</button></div>`; return; }
    const w = data && data.lat === st.wx.lat && data.lon === st.wx.lon && data.unit === st.unit ? data : null;
    if (!w || !w.now) {
      el.classList.remove('night');
      el.innerHTML = w && w.err ? `<div class="wx-empty"><span>${esc(w.err)}</span><button class="btn sec" data-wx-retry>Try again</button></div>`
        : `<div class="wx-now" aria-busy="true"><div class="loc">${esc(st.wx.name)}</div><span class="skel-line" style="width:110px;height:44px;margin-top:10px"></span><span class="skel-line" style="width:90px;margin-top:10px"></span><span class="skel-line" style="width:150px;margin-top:8px"></span></div>
           <div class="wx-chart"><div class="ttl">Next 12 hours</div><span class="skel-line" style="height:130px;border-radius:12px"></span></div>
           <div class="wx-days">${'<span class="skel-line" style="margin:9px 0"></span>'.repeat(7)}</div>`;
      return;
    }
    const nowD = describe(w.now.code, w.now.day), today = w.days[0] || {}, deg = '°';
    const days = w.days, lo = Math.min(...days.map(d => d.lo)), hi = Math.max(...days.map(d => d.hi)), span = Math.max(1, hi - lo);
    const todayISO = HB.localISO();
    el.classList.toggle('night', !w.now.day);
    el.innerHTML = `${w.err ? `<span class="wx-err">${esc(w.err)}</span>` : ''}
      <div class="wx-now">
        <div class="loc"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/></svg>${esc(w.place)}</div>
        <div class="big">${icon(nowD.k, 44)}<b>${Math.round(w.now.t)}${deg}</b></div>
        <div class="phrase">${nowD.p}</div>
        <div class="sub">H ${Math.round(today.hi)}${deg} · L ${Math.round(today.lo)}${deg} · Feels like ${Math.round(w.now.feel)}${deg}</div>
      </div>
      <div class="wx-chart"><div class="ttl">Next 12 hours</div><div id="wxPlot" style="position:relative"></div></div>
      <div class="wx-days">${days.map(d => { const dd = describe(d.code, true); return `<div class="wx-day"><span class="dn">${d.date === todayISO ? 'Today' : dow(d.date)}</span>${icon(dd.k, 24)}<span class="pc">${d.p >= 20 ? d.p + '%' : ''}</span><span class="lo">${Math.round(d.lo)}${deg}</span>
        <span class="range" title="${dd.p}"><i style="left:${(d.lo - lo) / span * 100}%;right:${100 - (d.hi - lo) / span * 100}%"></i></span><span class="hi">${Math.round(d.hi)}${deg}</span></div>`; }).join('')}</div>`;
    drawHourly(w);
  }

  function smoothPath(pts) {
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }
  function drawHourly(w) {
    const box = $('#wxPlot'); if (!box) return;
    const nowD = describe(w.now.code, w.now.day);
    const hours = [{ t: w.now.t, k: nowD.k, p: 0, label: 'Now', phrase: nowD.p }, ...w.hours.map(h => { const d = describe(h.code, h.day); return { t: h.t, k: d.k, p: h.p, label: h.label, phrase: d.p }; })];
    const W = Math.max(260, box.clientWidth), H = 170, n = hours.length;
    const padX = 18, top = 58, bot = H - 26, ts = hours.map(h => h.t);
    const mn = Math.min(...ts), mx = Math.max(...ts), rng = Math.max(4, mx - mn);
    const x = i => padX + (W - padX * 2) * (i / (n - 1));
    const y = t => bot - 14 - (t - mn) / rng * (bot - top - 26);
    const pts = hours.map((h, i) => [x(i), y(h.t)]);
    const line = smoothPath(pts), area = `${line} L${x(n - 1)},${bot} L${x(0)},${bot} Z`;
    const labeled = new Set([0, ts.indexOf(mx), ts.indexOf(mn), n - 1]), step = W / n < 44 ? 2 : 1;
    box.innerHTML = `<svg class="wx-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Temperature for the next 12 hours">
      <defs><linearGradient id="wxFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".22"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      <line x1="${padX}" x2="${W - padX}" y1="${bot}" y2="${bot}" stroke="var(--line)"/>
      <path d="${area}" fill="url(#wxFill)"/>
      <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>
      ${hours.map((h, i) => i % step ? '' : `<g transform="translate(${x(i) - 11} 2)">${icon(h.k, 22)}</g>${h.p >= 20 ? `<text class="pp" x="${x(i)}" y="36" text-anchor="middle">${h.p}%</text>` : ''}`).join('')}
      ${[...labeled].map(i => `<text class="tv" x="${x(i)}" y="${y(ts[i]) - 9}" text-anchor="middle">${Math.round(ts[i])}°</text>`).join('')}
      <circle cx="${x(0)}" cy="${y(ts[0])}" r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>
      ${hours.map((h, i) => i % step ? '' : `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(h.label)}</text>`).join('')}
      <line id="wxCross" x1="0" x2="0" y1="${top - 8}" y2="${bot}" stroke="var(--muted)" stroke-dasharray="3 3" opacity="0"/>
      <circle id="wxDot" r="5" fill="var(--accent)" stroke="var(--surface)" stroke-width="2" opacity="0"/>
      <rect x="0" y="0" width="${W}" height="${H}" fill="transparent" id="wxHit"/>
    </svg><div class="wx-tip" id="wxTip" hidden></div>`;
    const hit = $('#wxHit'), tip = $('#wxTip'), cross = $('#wxCross'), dot = $('#wxDot');
    hit.addEventListener('pointermove', e => {
      const r = hit.getBoundingClientRect(), cx = (e.clientX - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(n - 1, Math.round((cx - padX) / ((W - padX * 2) / (n - 1))))), h = hours[i];
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', '.6');
      dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(h.t)); dot.setAttribute('opacity', '1');
      tip.hidden = false; tip.style.left = Math.min(W - 70, Math.max(70, x(i))) + 'px'; tip.style.top = (y(h.t) - 12) + 'px';
      tip.innerHTML = `${esc(h.label)} · <b>${Math.round(h.t)}°</b> · ${esc(h.phrase)}${h.p ? ` · ${h.p}% rain` : ''}`;
    });
    hit.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('opacity', '0'); dot.setAttribute('opacity', '0'); });
  }

  // Location search for Settings
  HB.searchPlaces = async q => {
    const r = await HB.fetchWithTimeout('https://geocoding-api.open-meteo.com/v1/search?count=6&language=en&format=json&name=' + encodeURIComponent(q));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return (j.results || []).map(p => ({ name: [p.name, p.admin1, p.country_code === 'US' ? '' : p.country].filter(Boolean).join(', '), lat: p.latitude, lon: p.longitude }));
  };

  document.addEventListener('click', e => { if (e.target.closest('[data-wx-retry]')) load(true); });
  let resizeT; window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (data && data.now) drawHourly(data); }, 150); });
  let lastKey = '';
  HB.onChange(() => {
    const st = HB.settings(), key = JSON.stringify([st.wx, st.unit]);
    if (key !== lastKey) { lastKey = key; load(false); }
  });
  setInterval(() => { if (!document.hidden) load(false); }, 5 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false); });
})();
