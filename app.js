/* 3Täler Karte – App-Logik
   Aufbau: 1) Speicher  2) Rechnen & Formatieren  3) Schneedaten  4) Karte & Pins
           5) Liste  6) Detailansicht  7) Check-in & Bilanz  8) Bedienung (Blatt, Filter, Standort)
*/
(function () {
  'use strict';

  const R = window.RESORTS;
  const CFG = window.CONFIG;
  const byId = Object.fromEntries(R.map(r => [r.id, r]));
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- 1) Speicher (bleibt auf dem iPhone) ---------- */
  const KEY = 'dreitaeler-v1';
  const DEFAULT = {
    favs: [], checkins: [], prices: {}, pano: {},
    settings: { pass: CFG.pass_price, cons: CFG.consumption_l_per_100km, fuel: CFG.fuel_eur_per_l },
    sort: 'time', filters: []
  };
  let S;
  try { S = Object.assign(structuredClone(DEFAULT), JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch (e) { S = structuredClone(DEFAULT); }
  S.settings = Object.assign({}, DEFAULT.settings, S.settings);
  if (S.sort === 'km') S.sort = 'rec'; // früher „Pisten-km“
  if (!['time', 'snow', 'rec'].includes(S.sort)) S.sort = 'time';
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Speichern nicht möglich'); } if (typeof passBtn === 'function') passBtn(); };

  /* ---------- 2) Rechnen & Formatieren ---------- */
  const eur = v => (v == null || isNaN(v)) ? '–' : v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const hm = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
  // Wohnort: Standard Friedrichshafen (vorberechnet), sonst eigene Fahrzeiten per OSRM
  const homeOf = () => S.home || { name: CFG.start.name, lat: CFG.start.lat, lon: CFG.start.lon };
  const roadKm = r => S.home?.t?.[r.id]?.[0] ?? r.roadKm;
  const driveMin = r => S.home?.t?.[r.id]?.[1] ?? r.driveMin;
  const drive = r => `${Math.round(roadKm(r))} km · ${hm(driveMin(r))}`;
  const fuelCost = r => 2 * roadKm(r) * S.settings.cons / 100 * S.settings.fuel;
  const priceOf = r => (S.prices[r.id] != null ? S.prices[r.id] : r.price);
  const panoOf = r => r.pano; // fest vorgegeben, nicht änderbar
  const isFav = id => S.favs.includes(id);
  const sizeKm = r => (r.km > 0 ? r.km : (r.routes || 0));
  const BIG = '#2e9a4f'; // große Gebiete (grün); Neuschnee heute ist blau
  const color = r => r.noSki ? '#9a9a9a' : sizeKm(r) >= 25 ? BIG : sizeKm(r) >= 8 ? '#ef9f27' : '#e0483e';
  const sizeName = r => r.noSki ? 'Seilbahn' : sizeKm(r) >= 25 ? 'groß' : sizeKm(r) >= 8 ? 'mittel' : 'klein';
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const cm = v => (v == null ? '–' : `${Math.round(v)} cm`);
  const starsOf = (id, d) => snow[id]?.w?.[d]?.stars ?? null; // d: 0 = heute, 1 = morgen
  const num1 = v => v.toLocaleString('de-DE', { maximumFractionDigits: 1 });
  const STAR = 'M12 2.8l2.8 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17.1 6.4 20l1.1-6.2L2.9 9.4l6.3-.9z';
  const starsHTML = v => v == null ? '<span class="muted">–</span>' : `<span class="stars" role="img" aria-label="${num1(v)} von 5 Sternen">${[0, 1, 2, 3, 4].map(i => {
    const f = Math.max(0, Math.min(1, v - i)) * 100;
    return `<span class="st"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="e" d="${STAR}"/></svg><svg viewBox="0 0 24 24" aria-hidden="true" style="clip-path:inset(0 ${100 - f}% 0 0)"><path class="f" d="${STAR}"/></svg></span>`;
  }).join('')}</span>`;
  // Wetter-Symbole nach WMO-Code
  const wLabel = c => c == null ? '–' : c === 0 ? 'Sonnig' : c <= 2 ? 'Heiter' : c === 3 ? 'Bewölkt' : c <= 48 ? 'Nebel' : c <= 57 ? 'Nieselregen' : c <= 67 ? 'Regen' : c <= 77 ? 'Schneefall' : c <= 82 ? 'Regenschauer' : c <= 86 ? 'Schneeschauer' : 'Gewitter';
  function wIcon(c) {
    const sun = '<circle cx="12" cy="12" r="4.2" class="sun"/><path class="sun" d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>';
    const cloud = (y = 0) => `<path d="M7 ${18 + y}h10.5a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6-1.2A3.9 3.9 0 0 0 7 ${18 + y}z"/>`;
    let g;
    if (c == null) g = '';
    else if (c === 0) g = sun;
    else if (c <= 2) g = '<g transform="translate(-3 -3) scale(.8)">' + sun + '</g>' + cloud(1);
    else if (c === 3) g = cloud();
    else if (c <= 48) g = '<path d="M4 9h16M3 13h18M5 17h14"/>';
    else if (c <= 67 || (c >= 80 && c <= 82)) g = cloud(-3) + '<path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3"/>';
    else if (c <= 77 || c <= 86) g = cloud(-3) + '<path d="M8.5 19.5h.01M12.5 21h.01M16.5 19.5h.01M10.5 22.5h.01M14.5 22.5h.01" stroke-width="2.4"/>';
    else g = cloud(-3) + '<path d="M13 16l-2.5 3.5h3L11 23" class="bolt"/>';
    return `<svg class="wi" viewBox="0 0 24 24" aria-hidden="true">${g}</svg>`;
  }
  const dayName = (iso, i) => i === 0 ? 'Heute' : i === 1 ? 'Morgen' : new Date(iso + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');

  // Tipp für morgen: Mischung aus Wetter, Schnee, Panorama, Größe, offenen Liften und (schwach) Anfahrt
  let podium = {}; // id -> 1|2|3
  let lifts = {};  // id -> { open, total } (sobald Liftstatus verfügbar ist)
  function scoreTomorrow(r) {
    const s = snow[r.id]; if (!s || r.noSki) return null;
    const parts = [];
    parts.push([0.25, (starsOf(r.id, 1) ?? 2.5) / 5]);                                          // Wetter/Sicht morgen
    const fresh = (s.t || 0) + (s.m || 0);
    const snowQ = s.depth == null ? Math.min(1, fresh / 20) : 0.5 * Math.min(1, fresh / 20) + 0.5 * Math.min(1, s.depth / 100);
    parts.push([0.25, snowQ]);                                                                  // Schnee
    parts.push([0.20, (panoOf(r) - 1) / 4]);                                                    // Panorama
    parts.push([0.15, Math.log(1 + sizeKm(r)) / Math.log(1 + 90)]);                             // Pistengröße
    const L = lifts[r.id]; if (L && L.total) parts.push([0.10, L.open / L.total]);              // offene Lifte
    parts.push([0.05, 1 - Math.min(1, driveMin(r) / 150)]);                                      // Anfahrt
    const wsum = parts.reduce((a, p) => a + p[0], 0);
    let sc = parts.reduce((a, p) => a + p[0] * p[1], 0) / wsum;
    if (s.depth != null && s.depth < 15 && fresh < 10) sc *= 0.5; // zu wenig Schnee
    if (L && L.total && L.open === 0) sc *= 0.2;                  // alles zu
    if (r.season) { const d = new Date(); d.setDate(d.getDate() + 1); const tm = d.toLocaleDateString('sv-SE'); if (tm < r.season[0] || tm > r.season[1]) sc *= 0.15; } // morgen außerhalb der Saison
    else sc *= L && L.st && L.st !== 'open' ? 0.15 : 0.7;          // kein fester Termin: Liftstatus „geschlossen“ zählt wie außerhalb der Saison
    return sc;
  }
  /* Abruf-Intervalle: jede Quelle nur so oft wie nötig, nie öfter als alle 30 Minuten (kein manuelles Neuladen).
     - Sicht/Wetter HEUTE (kleiner Abruf):  stündlich, aber nur 7–16 Uhr – danach ist der Skitag vorbei
     - Prognose (morgen, 7 Tage, Neuschnee, Schneehöhe): alle 3 h + einmal frisch ab 6 Uhr – die Modelle rechnen nur alle 3–6 h neu
     - Lifte offen + Öffnungsstatus (3Täler): alle 4 h, zusätzlich einmal frisch nach 8 Uhr (Betriebsbeginn)
     - Spritpreis: höchstens alle 12 h (nur auf Knopfdruck)
     - Fahrtzeiten: nur wenn sich der Wohnort ändert */
  const MIN = 60 * 1000, HOUR = 60 * MIN, FLOOR = 30 * MIN;
  const atToday = h => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.getTime(); };
  const stale = (t, maxAge, freshAfterHour) => {
    const age = Date.now() - (t || 0);
    if (age < FLOOR) return false;
    if (age >= maxAge) return true;
    return freshAfterHour != null && Date.now() >= atToday(freshAfterHour) && t < atToday(freshAfterHour);
  };
  const TTL = { today: HOUR, long: 3 * HOUR, lifts: 4 * HOUR, fuel: 12 * HOUR };
  const LIFT_KEY = 'dreitaeler-lifts';
  let liftsT = 0;
  async function loadLifts() {
    try {
      const c = JSON.parse(localStorage.getItem(LIFT_KEY) || 'null');
      if (c) { lifts = c.d; liftsT = c.t; }
      if (c && !stale(c.t, TTL.lifts, 8)) return;
    } catch (e) { }
    try {
      const j = await (await fetch('https://www.3taeler.at/SkigebieteManager/Micado.SkigebieteManager.Plugin.RegionPlugin.RegionApiIO/List.api?region=3taeler')).json();
      const d = {};
      (j.items || []).forEach(it => {
        const L = (it.facilityStatistics || []).find(f => f.identifier === 'lift');
        const r = R.find(x => x.link && it.pageName && x.link.endsWith(it.pageName));
        if (r) { if (L && L.count) d[r.id] = { open: L.countOpen, total: L.count, st: it.openingState }; else if (it.openingState) d[r.id] = { st: it.openingState }; }
      });
      lifts = d; liftsT = Date.now();
      try { localStorage.setItem(LIFT_KEY, JSON.stringify({ t: liftsT, d })); } catch (e) { }
    } catch (e) { /* Liftstatus gerade nicht erreichbar */ }
  }
  function computePodium() {
    podium = {};
    R.map(r => [r.id, scoreTomorrow(r)]).filter(x => x[1] != null).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach((x, i) => podium[x[0]] = i + 1);
  }
  const MEDAL = { 1: '#e3a90f', 2: '#8fb3d9', 3: '#b5622a' }; // Gold, Silber (leicht bläulich, damit es sich abhebt), Bronze
  const MEDALNAME = { 1: 'Gold', 2: 'Silber', 3: 'Bronze' };
  const medalDot = id => podium[id] ? `<span class="medal" style="background:${MEDAL[podium[id]]}" title="Tipp für morgen: Platz ${podium[id]}">${podium[id]}</span>` : '';
  const liftsTxt = r => { const L = lifts[r.id]; return L?.total ? `${L.open}/${L.total}` : `–/${r.lifts ?? '–'}`; };
  const hhmm = t => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  /* ---------- 3) Schneedaten (Open-Meteo, ein Abruf für alle Gebiete) ---------- */
  // snow[id] = { y: gestern, t: heute, m: morgen, d2: übermorgen, depth: Schneehöhe jetzt (cm), elev,
  //             w: [7 Tage ab heute: { date, code, tmax, tmin, snow, precip, stars }] }
  let snow = {};
  const SNOW_KEY = 'dreitaeler-wx2';

  // Sichtverhältnis 0,5–5 Sterne (halbe Schritte) für einen Tag, aus Wolken, Sonnenstunden, Sichtweite, Nebel und Niederschlag
  // zwischen 9 und 16 Uhr in Gipfelhöhe. 5 Sterne nur bei sonnigem, praktisch wolkenfreiem Wetter.
  function visStars(h, dl, di) {
    const hrs = []; for (let k = 9; k <= 16; k++) hrs.push(di * 24 + k);
    const avg = a => { const v = a.filter(x => x != null); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
    const cloud = avg(hrs.map(i => h.cloud_cover[i])) ?? 50;
    const vis = avg(hrs.map(i => h.visibility[i]));
    const fog = hrs.filter(i => [45, 48].includes(h.weather_code[i])).length;
    const sunFrac = dl.daylight_duration[di] ? (dl.sunshine_duration[di] || 0) / dl.daylight_duration[di] : 0;
    const pr = dl.precipitation_sum[di] || 0;
    let q = 0.55 * (1 - cloud / 100) + 0.45 * Math.min(1, sunFrac / 0.8);
    if (vis != null) q *= Math.sqrt(Math.max(0.15, Math.min(1, vis / 20000)));
    if (pr > 2) q *= 0.6; else if (pr > 0.3) q *= 0.8;
    if (fog >= 3) q = Math.min(q, 0.2);
    let st = Math.round(q * 10) / 2;
    if (!(cloud < 15 && sunFrac > 0.7)) st = Math.min(st, 4.5);
    return Math.max(0.5, Math.min(5, st));
  }
  const TODAY_KEY = 'dreitaeler-wxT';
  let snowT = 0, todayT = 0, todayD = null;
  // Tageswerte aus dem kleinen Heute-Abruf über die Prognose legen (nur wenn vom selben Tag)
  function applyToday() {
    if (!todayD || todayT <= snowT || todayD.date !== snow[R[0].id]?.w?.[0]?.date) return; // nur wenn neuer als die Prognose
    R.forEach(r => { const o = todayD.d[r.id], s = snow[r.id]; if (o && s) { Object.assign(s.w[0], o.w); if (o.t != null) s.t = o.t; } });
  }
  async function loadToday() {
    try { const c = JSON.parse(localStorage.getItem(TODAY_KEY) || 'null'); if (c) { todayD = c.v; todayT = c.t; } } catch (e) { }
    const h = new Date().getHours();
    if (h < 7 || h >= 16 || !stale(todayT, TTL.today) || !stale(snowT, TTL.today)) return; // außerhalb der Skizeit oder frisch genug
    const elev = R.map(r => r.top || r.base || 1000);
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + R.map(r => r.lat).join(',') +
      '&longitude=' + R.map(r => r.lon).join(',') + '&elevation=' + elev.join(',') +
      '&daily=snowfall_sum,weather_code,sunshine_duration,daylight_duration,precipitation_sum' +
      '&hourly=cloud_cover,visibility,weather_code&forecast_days=1&timezone=Europe%2FBerlin';
    try {
      const res = await fetch(url); if (!res.ok) throw new Error(res.status);
      let j = await res.json(); if (!Array.isArray(j)) j = [j];
      const d = {};
      j.forEach((loc, i) => { const dl = loc.daily; d[R[i].id] = { t: dl.snowfall_sum[0], w: { code: dl.weather_code[0], snow: dl.snowfall_sum[0], precip: dl.precipitation_sum[0], stars: visStars(loc.hourly, dl, 0) } }; });
      todayD = { date: j[0].daily.time[0], d }; todayT = Date.now();
      try { localStorage.setItem(TODAY_KEY, JSON.stringify({ t: todayT, v: todayD })); } catch (e) { }
    } catch (e) { /* bleibt bei der Prognose */ }
  }
  async function loadSnow() {
    try {
      const c = JSON.parse(localStorage.getItem(SNOW_KEY) || 'null');
      if (c) { snow = c.d; snowT = c.t; }
      if (c && !stale(c.t, TTL.long, 6) && c.d[R[0].id]?.w?.[0]?.date === new Date().toLocaleDateString('sv-SE')) {
        await loadToday(); applyToday(); afterSnow(Math.max(snowT, todayT)); return;
      }
    } catch (e) { }
    const elev = R.map(r => r.top || r.base || 1000);
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + R.map(r => r.lat).join(',') +
      '&longitude=' + R.map(r => r.lon).join(',') + '&elevation=' + elev.join(',') +
      '&daily=snowfall_sum,weather_code,temperature_2m_max,temperature_2m_min,sunshine_duration,daylight_duration,precipitation_sum' +
      '&hourly=snow_depth,cloud_cover,visibility,weather_code&past_days=1&forecast_days=7&timezone=Europe%2FBerlin';
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      let j = await res.json();
      if (!Array.isArray(j)) j = [j];
      const nowH = new Date().getHours();
      snow = {};
      j.forEach((loc, i) => {
        const s = loc.daily.snowfall_sum;
        const dep = loc.hourly.snow_depth[24 + nowH]; // Stunde jetzt (Tag 2 der Reihe = heute)
        const dl = loc.daily, h = loc.hourly;
        const w = [];
        for (let di = 1; di < dl.time.length; di++) w.push({
          date: dl.time[di], code: dl.weather_code[di], tmax: dl.temperature_2m_max[di], tmin: dl.temperature_2m_min[di],
          snow: dl.snowfall_sum[di], precip: dl.precipitation_sum[di], stars: visStars(h, dl, di)
        });
        snow[R[i].id] = { y: s[0], t: s[1], m: s[2], d2: s[3], depth: dep == null ? null : dep * 100, elev: elev[i], w };
      });
      snowT = Date.now();
      try { localStorage.setItem(SNOW_KEY, JSON.stringify({ t: snowT, d: snow })); } catch (e) { }
      applyToday(); afterSnow(snowT);
    } catch (e) {
      if (snowT) { applyToday(); afterSnow(snowT); return; } // alte Daten weiter zeigen
      $('#snowInfo').textContent = 'Schneedaten gerade nicht erreichbar';
      toast('Schneedaten konnten nicht geladen werden');
    }
  }
  function afterSnow(t) {
    const d = new Date(t);
    computePodium();
    $('#snowInfo').textContent = `Wetter: Open-Meteo · Stand ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
    drawPins(); renderList();
    if (current) renderDetail(current);
  }

  /* ---------- 4) Karte & Pins ---------- */
  // Karte: OpenFreeMap (Vektor, ohne Limit/Schlüssel) + Relief aus AWS Terrain Tiles; eigener Stil ohne Straßen.
  // Tag = Hell-Beige, Nacht (Dunkelmodus) = Dunkles Beige – wechselt automatisch mit dem iPhone.
  const PAL = {
    light: { bg: '#f1e9da', wood: '#e6dcc6', woodO: .6, rock: '#e9e1d2', water: '#c5d0cf', shadow: '#7d6a4d', hi: '#fffaf0', ex: .55, border: '#b6a68a', label: '#6d5e47' },
    dark: { bg: '#2c2822', wood: '#332e27', woodO: .8, rock: '#36312a', water: '#1d2326', shadow: '#0b0a08', hi: '#5a4f40', ex: .7, border: '#6c6150', label: '#c8b99e' }
  };
  const mapStyle = dark => {
    const C = dark ? PAL.dark : PAL.light;
    return {
      version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      sources: {
        o: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '<a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
        dem: { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding: 'terrarium', tileSize: 256, maxzoom: 12, attribution: 'Relief: Mapzen/AWS · Schnee: Open-Meteo' }
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': C.bg } },
        { id: 'wood', type: 'fill', source: 'o', 'source-layer': 'landcover', filter: ['==', ['get', 'class'], 'wood'], paint: { 'fill-color': C.wood, 'fill-opacity': C.woodO } },
        { id: 'rock', type: 'fill', source: 'o', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['ice', 'rock']]], paint: { 'fill-color': C.rock, 'fill-opacity': .5 } },
        { id: 'hs', type: 'hillshade', source: 'dem', paint: { 'hillshade-shadow-color': C.shadow, 'hillshade-highlight-color': C.hi, 'hillshade-accent-color': C.shadow, 'hillshade-exaggeration': C.ex, 'hillshade-illumination-direction': 315 } },
        { id: 'water', type: 'fill', source: 'o', 'source-layer': 'water', paint: { 'fill-color': C.water } },
        { id: 'river', type: 'line', source: 'o', 'source-layer': 'waterway', filter: ['==', ['get', 'class'], 'river'], paint: { 'line-color': C.water, 'line-width': 1.2 } },
        { id: 'border', type: 'line', source: 'o', 'source-layer': 'boundary', filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': C.border, 'line-width': 1.3, 'line-dasharray': [3, 2] } },
        { id: 'place', type: 'symbol', source: 'o', 'source-layer': 'place', filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]], layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': ['match', ['get', 'class'], 'city', 13, 11], 'text-letter-spacing': .04 }, paint: { 'text-color': C.label, 'text-halo-color': C.bg, 'text-halo-width': 1.4 } },
        { id: 'peak', type: 'symbol', source: 'o', 'source-layer': 'mountain_peak', minzoom: 9, filter: ['>=', ['to-number', ['get', 'ele']], 2000], layout: { 'text-field': ['concat', '▲ ', ['get', 'name']], 'text-font': ['Noto Sans Italic'], 'text-size': 9.5, 'text-optional': true }, paint: { 'text-color': C.label, 'text-opacity': .75, 'text-halo-color': C.bg, 'text-halo-width': 1 } }
      ]
    };
  };
  const darkMQ = matchMedia('(prefers-color-scheme: dark)');
  let home = homeOf();
  const allBounds = new maplibregl.LngLatBounds();
  R.forEach(r => allBounds.extend([r.lon, r.lat])); allBounds.extend([home.lon, home.lat]);
  const map = new maplibregl.Map({
    container: 'map', style: mapStyle(darkMQ.matches), bounds: allBounds,
    fitBoundsOptions: { padding: { top: 70, left: 20, right: 20, bottom: 170 } },
    minZoom: 6, maxZoom: 16, dragRotate: false, pitchWithRotate: false, touchPitch: false,
    attributionControl: false, fadeDuration: 0
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'top-right');
  map.once('load', () => document.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')); // Quellen nur auf Tippen (i)
  darkMQ.addEventListener?.('change', e => map.setStyle(mapStyle(e.matches)));
  const dot = (cls, lat, lon) => { const el = document.createElement('div'); el.className = cls; return new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map); };
  // Luftlinie in Metern
  const distM = (a, b) => { const k = Math.PI / 180, dLa = (b[0] - a[0]) * k, dLo = (b[1] - a[1]) * k; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * k) * Math.cos(b[0] * k) * Math.sin(dLo / 2) ** 2; return 12742000 * Math.asin(Math.sqrt(h)); };
  let pinsReady = false;
  const homeMarker = dot('home-dot', home.lat, home.lon);
  map.on('zoomend', () => { map.getContainer().classList.toggle('show-labels', map.getZoom() >= 10); if (pinsReady) drawPins(); });

  // Sechseck-Punkte, Spitze oben
  const hexPts = rad => [0, 1, 2, 3, 4, 5].map(i => { const a = Math.PI / 3 * i - Math.PI / 2; return `${(rad * Math.cos(a)).toFixed(2)},${(rad * Math.sin(a)).toFixed(2)}`; }).join(' ');
  // Balken laufen von der unteren Spitze nach oben: links = Neuschnee gestern (schwarz), rechts = Neuschnee heute (grün)
  const sidePts = (rad, dir) => { const x = rad * Math.cos(Math.PI / 6) * dir, y = rad / 2; return `0,${rad} ${x.toFixed(2)},${y} ${x.toFixed(2)},${-y} 0,${-rad}`; };
  const frac = v => Math.max(0, Math.min(1, (v || 0) / 30)); // 30 cm = voller Balken
  function pinSVG(r, size) {
    const sn = snow[r.id];
    const fy = sn ? frac(sn.y) : 0, ft = sn ? frac(sn.t) : 0;
    const bars = r.noSki ? '' : `
      <polygon points="${hexPts(21)}" fill="none" style="stroke:var(--track)" stroke-width="9" stroke-linejoin="round"/>
      ${fy > 0 ? `<polyline points="${sidePts(21, -1)}" fill="none" style="stroke:var(--snowM)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="${(fy * 100).toFixed(1)} 200"/>` : ''}
      ${ft > 0 ? `<polyline points="${sidePts(21, 1)}" fill="none" style="stroke:var(--snowY)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="${(ft * 100).toFixed(1)} 200"/>` : ''}
      ${sn && (sn.y > 30 || sn.t > 30) ? '<circle cx="0" cy="-30" r="3.2" style="fill:var(--snowY)"/>' : ''}`;
    const fav = isFav(r.id) ? '<polygon points="22,-31 24.4,-26 30,-25.4 25.8,-21.6 27,-16 22,-18.8 17,-16 18.2,-21.6 14,-25.4 19.6,-26" fill="#f2b01e" stroke="#fff" stroke-width="1"/>' : '';
    return `<svg width="${size}" height="${size}" viewBox="-39 -39 78 78" aria-hidden="true">
      ${podium[r.id] ? `<polygon points="${hexPts(33)}" fill="none" stroke="#15181b" stroke-width="10.5" stroke-linejoin="round" opacity=".55"/><polygon points="${hexPts(33)}" fill="none" style="stroke:${MEDAL[podium[r.id]]}" stroke-width="8" stroke-linejoin="round"/>${podium[r.id] === 2 ? `<polygon points="${hexPts(33)}" fill="none" stroke="#ffffff" stroke-width="2" stroke-linejoin="round" opacity=".9"/>` : ''}` : ''}
      <polygon points="${hexPts(30)}" style="fill:var(--card);stroke:${podium[r.id] ? MEDAL[podium[r.id]] : 'var(--ink)'}" stroke-width="1.6" stroke-linejoin="round"/>
      ${bars}
      <polygon points="${hexPts(r.noSki ? 18 : 13)}" fill="${color(r)}"/>
      ${fav}</svg>`;
  }
  const markers = {};
  pinsReady = true;
  function drawPins() {
    const vis = new Set(filtered().map(r => r.id));
    const z = map.getZoom();
    const sz = z < 7.5 ? 26 : z < 8.5 ? 32 : z < 9.5 ? 40 : 48; // rausgezoomt kleinere Pins, damit sie nicht übereinander liegen
    R.forEach(r => {
      let m = markers[r.id];
      if (!m) {
        const el = document.createElement('div'); el.className = 'pin';
        el.addEventListener('click', e => { e.stopPropagation(); openDetail(r.id, true); });
        m = markers[r.id] = new maplibregl.Marker({ element: el }).setLngLat([r.lon, r.lat]).addTo(map);
      }
      const el = m.getElement();
      el.classList.toggle('dim', !vis.has(r.id));
      el.style.zIndex = vis.has(r.id) ? (podium[r.id] ? 3 : 2) : 1;
      el.style.width = el.style.height = sz + 'px';
      el.innerHTML = `<div class="pw">${pinSVG(r, sz)}<span class="lbl">${esc(r.name)}</span></div>`;
    });
  }

  /* ---------- 5) Liste ---------- */
  const FILTERS = {
    snow: r => { const s = snow[r.id]; return !!s && ((s.y || 0) + (s.t || 0) >= 3 || (s.m || 0) >= 3); },
    fav: r => isFav(r.id),
    big: r => sizeKm(r) >= 25,
    sunT: r => (starsOf(r.id, 0) ?? 0) >= 4,
    sunM: r => (starsOf(r.id, 1) ?? 0) >= 4
  };
  S.filters = (S.filters || []).filter(f => f in FILTERS); // entfernte Filter (z. B. „≤ 1 h Fahrt“) aus alten Daten ignorieren
  const filtered = () => R.filter(r => S.filters.every(f => FILTERS[f](r)));
  // Empfohlen: dieselbe Bewertung wie „Tipp für morgen“, für alle Gebiete; Rang 1–n über alle Gebiete (unabhängig vom Filter)
  const recScore = r => scoreTomorrow(r);
  const recRank = () => { const ok = R.filter(r => recScore(r) != null).sort((a, b) => recScore(b) - recScore(a) || driveMin(a) - driveMin(b)); return Object.fromEntries(ok.map((r, i) => [r.id, i + 1])); };
  function sorted(list) {
    const fresh = r => { const s = snow[r.id]; return s ? (s.y || 0) + (s.t || 0) : -1; };
    const st = (r, d) => starsOf(r.id, d) ?? -1;
    return list.slice().sort((a, b) => S.sort === 'snow'
      ? (fresh(b) - fresh(a)) || ((snow[b.id]?.m || 0) - (snow[a.id]?.m || 0)) || driveMin(a) - driveMin(b)
      : S.sort === 'rec'
        ? ((recScore(b) ?? -1) - (recScore(a) ?? -1)) || driveMin(a) - driveMin(b)
        : driveMin(a) - driveMin(b));
  }
  function renderList() {
    const list = sorted(filtered());
    $('#listTitle').textContent = `${list.length} ${list.length === 1 ? 'Gebiet' : 'Gebiete'}`;
    const top = Object.entries(podium).sort((a, b) => a[1] - b[1]);
    $('#podium').innerHTML = top.length ? `<div class="podLbl">Tipp für morgen</div>` + top.map(([id, n]) =>
      `<button data-id="${id}"><span class="medal" style="background:${MEDAL[n]}">${n}</span>${esc(byId[id].name)}</button>`).join('') : '';
    $('#podium').hidden = !top.length;
    const rank = S.sort === 'rec' ? recRank() : null;
    $('#list').innerHTML = list.length ? list.map(r => {
      const s = snow[r.id];
      const snowTxt = r.noSki ? '<span class="muted">Winterwandern</span>' : s
        ? `<span class="yv">${Math.round((s.y || 0) + (s.t || 0))} cm</span> <span class="muted">neu</span><br><span class="muted">morgen ${Math.round(s.m || 0)} cm</span><br><span class="muted">Sicht</span> ${starsOf(r.id, 0) != null ? num1(starsOf(r.id, 0)) + '<span class="sy">★</span>' : '–'}`
        : '<span class="muted">…</span>';
      return `<li data-id="${r.id}">
        <span class="mini">${pinSVG(r, 34)}</span>
        <span class="t"><div class="n">${rank ? `<span class="rk${rank[r.id] <= 3 ? ' top' : ''}"${rank[r.id] <= 3 ? ` style="background:${MEDAL[rank[r.id]]}"` : ''}>${rank[r.id] ?? '–'}</span>` : medalDot(r.id)}${isFav(r.id) ? '★ ' : ''}${esc(r.name)}</div><div class="muted small num">${drive(r)} · ${eur(fuelCost(r))} Sprit</div></span>
        <span class="s num">${snowTxt}</span></li>`;
    }).join('') : '<div class="empty">Kein Gebiet passt zu den Filtern.</div>';
  }
  $('#list').addEventListener('click', e => { const li = e.target.closest('li[data-id]'); if (li) openDetail(li.dataset.id, true); });
  $('#podium').addEventListener('click', e => { const b = e.target.closest('button[data-id]'); if (b) openDetail(b.dataset.id, true); });

  /* ---------- 6) Detailansicht ---------- */
  let current = null;
  function openDetail(id, fly) {
    current = id;
    const r = byId[id];
    $('#listView').hidden = true;
    $('#detailView').hidden = false;
    renderDetail(id);
    $('#sheetBody').scrollTop = 0;
    setSheet('detail');
    if (fly) {
      const z = Math.max(map.getZoom(), 10);
      map.flyTo({ center: [r.lon, r.lat], zoom: z, offset: [0, -(sheetVisible() / 2 - 20)], duration: 600 }); // Pin über dem Blatt anzeigen
    }
  }
  function closeDetail() {
    current = null;
    $('#detailView').hidden = true;
    $('#listView').hidden = false;
    $('#ciBar').hidden = true;
    renderList();
    if (sheet.dataset.state === 'detail') setSheet('half');
  }
  const mtn = on => `<svg viewBox="0 0 30 22"><path d="M1 21 L11 5 L16 12 L20 7 L29 21 Z" style="fill:${on ? 'var(--ink)' : 'none'};stroke:var(--ink)" stroke-width="1.6" stroke-linejoin="round" opacity="${on ? 1 : .35}"/>${on ? '<path d="M8.6 9 L11 5 L13.4 9 L11.8 8 L11 9.2 L10.2 8 Z" style="fill:var(--card)"/>' : ''}</svg>`;
  // Saison-Punkt: grün = Saison läuft, rot = noch nicht / nicht mehr geöffnet (Termine 3TälerPass 2026/27)
  const fmtD = iso => new Date(iso + 'T12:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  function seasonState(r) {
    const t = today();
    if (r.season) return t >= r.season[0] && t <= r.season[1] ? 'on' : 'off';
    const L = lifts[r.id]; if (L && (L.st === 'open' || L.open > 0)) return 'on';
    return 'snow';
  }
  function seasonDot(r) {
    const st = seasonState(r);
    const txt = r.noSki && st === 'on' ? 'Ganzjährig in Betrieb'
      : r.season ? `${st === 'on' ? 'Saison läuft' : 'Geschlossen'} · Saison ${fmtD(r.season[0])} – ${fmtD(r.season[1])}`
      : st === 'on' ? 'Laut 3TälerPass geöffnet' : 'Kein fester Saisontermin – Betrieb je nach Schneelage';
    return `<span class="sDot ${st}" role="img" aria-label="${txt}" title="${txt}"></span>`;
  }
  function renderDetail(id) {
    const r = byId[id], s = snow[id], pano = panoOf(r);
    // Reihenfolge: 1) Titelbild (Panorama/Piste, Betreiber) 2) Live-Webcams 3) weitere Schneebilder
    const photo = (p, first) => `<div class="gItem"><img ${first ? 'fetchpriority="high"' : 'loading="lazy"'} alt="${esc(r.name)}" src="${esc(p.u)}" onerror="this.parentNode.remove()">${p.l ? `<a class="cap" href="${esc(p.l)}" target="_blank" rel="noopener">Foto: ${esc(p.c)} ↗</a>` : `<span class="cap">Foto: ${esc(p.c)}</span>`}</div>`;
    const ph = r.photos || [];
    const hero = ph.length ? photo(ph[0], true) : '';
    const cams = r.cams.map(c => `<div class="gItem"><img loading="lazy" alt="Webcam ${esc(c.t)}" src="${esc(c.u + (c.u.includes('?') ? '&' : '?') + '_=' + Math.floor(Date.now() / 6e5))}" onerror="this.parentNode.classList.add('noimg');this.parentNode.innerHTML='Webcam ${esc(c.t)} gerade nicht verfügbar'"><span class="cap"><span class="live"></span>Webcam · ${esc(c.t)}</span></div>`).join('');
    const camLink = r.camLink ? `<a class="gItem noimg" href="${esc(r.camLink)}" target="_blank" rel="noopener">Live-Webcam öffnen ↗</a>` : '';
    const more = ph.slice(1).map(p => photo(p, false)).join('');
    const gallery = hero + cams + camLink + more || `<div class="gItem noimg">Kein offizielles Schneebild verfügbar – Infos über „Lifte & Pisten“.</div>`;
    const checkedToday = S.checkins.find(c => c.date === today() && c.id === id);
    const fc = fuelCost(r);
    const p = priceOf(r);
    const kmTxt = r.km ? r.km.toLocaleString('de-DE') + ' km' : '–';
    $('#detailView').innerHTML = `
      <div class="dHead">
        <button class="iconBtn" data-act="back" aria-label="Zurück zur Liste"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
        <div class="dTitle"><div class="h2">${esc(r.name)} ${seasonDot(r)}</div><div class="muted small">${esc(r.area)} · ${sizeName(r)}</div></div>
        <button class="iconBtn star ${isFav(id) ? 'on' : ''}" data-act="fav" aria-label="Favorit"><svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg></button>
      </div>
      <div class="metrics num">
        <div title="ab ${esc(home.name)}"><span>Anfahrt</span><b>${hm(driveMin(r))}</b><small>${Math.round(roadKm(r))} km</small><small>${eur(fc)} Sprit</small></div>
        <div><span>Lifte offen</span><b>${r.noSki ? '–' : liftsTxt(r)}</b><small>${lifts[r.id]?.total ? '3Täler · ' + hhmm(liftsT) : 'kein Status'}</small></div>
        <div><span>Sicht heute</span><b>${starsOf(id, 0) != null ? num1(starsOf(id, 0)) : '–'}</b>${starsHTML(starsOf(id, 0))}</div>
        <div><span>Sicht morgen</span><b>${starsOf(id, 1) != null ? num1(starsOf(id, 1)) : '–'}</b>${starsHTML(starsOf(id, 1))}</div>
      </div>
      <div class="metrics2 num">
        <div class="panoT"><span>Panorama</span>
          <span class="mtns" role="img" aria-label="Panorama ${pano} von 5">${[1, 2, 3, 4, 5].map(i => `<i>${mtn(i <= pano)}</i>`).join('')}</span></div>
        <div><span>Pisten</span><b>${kmTxt}</b>${r.routes ? `<small>+ ${r.routes.toLocaleString('de-DE')} km Routen</small>` : ''}</div>
        <div><span>Höhe</span><b>${r.top ? r.top + ' m' : '–'}</b>${r.base ? `<small>Tal ${r.base} m</small>` : ''}</div>
      </div>
      ${podium[id] ? `<p class="medalNote"><span class="medal" style="background:${MEDAL[podium[id]]}">${podium[id]}</span> ${MEDALNAME[podium[id]]} – Platz ${podium[id]} der besten Bedingungen für morgen (Wetter, Schnee, Panorama, Größe, Lifte, Anfahrt)</p>` : ''}
      <div class="gallery">${gallery}</div>
      ${r.noSki ? '<p class="note">Seilbahn zum Winterwandern – kein Skigebiet, zählt nicht als Skitag.</p>' : `
      <div class="secT">Schnee</div>
      <div class="snowGrid num">
        <div class="gd"><b>${cm(s?.y)}</b><span>gestern</span></div>
        <div class="gy"><b>${cm(s?.t)}</b><span>heute</span></div>
        <div><b>${cm(s?.m)}</b><span>morgen</span></div>
        <div><b>${cm(s?.depth)}</b><span>Schneehöhe</span></div>
      </div>
      <p class="note">Wettermodell für ${s ? s.elev : '–'} m, nicht der offizielle Pistenbericht. Übermorgen: ${cm(s?.d2)}.</p>`}
      ${wxHTML(r)}
      ${parkHTML(r)}
      <div class="secT">Infos & Links</div>
      <dl class="rows num">
        ${r.noSki ? '' : `<div><dt>Tageskarte</dt><dd><input class="priceIn" type="number" inputmode="decimal" step="0.5" min="0" data-act="price" value="${p ?? ''}" placeholder="? €"> €</dd></div>`}
        <div><dt>Lifte gesamt</dt><dd>${r.lifts ?? '–'}</dd></div>
        <div><dt>Anfahrt ab</dt><dd>${esc(home.name)}</dd></div>
      </dl>
      ${r.mapOnly ? '<p class="note">Nur auf der 3Täler-Karte gelistet – Pisten/Preis von skiresort.com.</p>' : ''}
      <div class="btnGrid">
        <a class="btn" target="_blank" rel="noopener" href="${esc(r.web || r.link)}">${r.web && r.webKind === 'op' ? 'Website Skigebiet ↗' : 'Website (Ort) ↗'}</a>
        <a class="btn" target="_blank" rel="noopener" href="${esc(r.link)}">Lifte & Pisten ↗</a>
        <a class="btn" target="_blank" rel="noopener" href="https://maps.apple.com/?saddr=${home.lat},${home.lon}&daddr=${r.lat},${r.lon}&dirflg=d">Route (Apple)</a>
        <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&origin=${home.lat},${home.lon}&destination=${r.lat},${r.lon}&travelmode=driving">Route (Google)</a>
        <a class="btn" target="_blank" rel="noopener" href="https://www.skiline.cc">Skiline ↗</a>
      </div>`;
    // Check-in-Leiste bleibt beim Scrollen unten sichtbar
    $('#ciBar').innerHTML = r.noSki ? '' : checkedToday
      ? `<button class="btn primary done ciBtn" data-act="undoToday"><b>✓ Eingecheckt</b><small>${eur(checkedToday.price)} gespart</small></button>`
      : `<button class="btn primary ciBtn" data-act="checkin"><b>Einchecken</b><small>+${eur(p ?? 0)} gespart</small></button>`;
    $('#ciBar').hidden = !!r.noSki;
    setSheet($('#sheet').dataset.state);
  }
  function parkHTML(r) {
    const P = r.parking || [];
    const gm = (lat, lon) => `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    if (!P.length) return `<div class="secT">Parken</div><a class="btn wide" target="_blank" rel="noopener" href="https://www.google.com/maps/search/${encodeURIComponent('Parkplatz ' + r.name.replace(/\s*\(.*\)/, ''))}/@${r.lat},${r.lon},15z">Kein Skiparkplatz bekannt – in Google Maps suchen ↗</a>${hoursHTML(r)}`;
    return `<div class="secT">Parken <span class="muted small">(nächste Parkplätze an den Liften)</span></div>
      <ul class="park">${P.map((p, i) => `<li><a target="_blank" rel="noopener" href="${gm(p.lat, p.lon)}">
        <span class="pIcon">P${P.length > 1 ? i + 1 : ''}</span>
        <span class="t"><b>${esc(p.n)}</b><span class="muted small">${p.d} m zum Lift${p.lift && !p.n.includes(p.lift) ? ' ' + esc(p.lift) : ''} · ${p.sz}${p.fee === 1 ? ' · kostenpflichtig' : p.fee === 0 ? ' · kostenlos' : ''}</span></span>
        <span class="go">Maps ↗</span></a></li>`).join('')}</ul>
      <p class="note">Aus OpenStreetMap: öffentliche Parkplätze nahe den Talstationen, ohne Privat- und Kundenparkplätze.</p>${hoursHTML(r)}`;
  }
  function hoursHTML(r) {
    const st = lifts[r.id]?.st;
    const state = st === 'open' ? '<b class="ok">heute geöffnet</b>' : st === 'closed' ? '<b class="no">heute geschlossen</b>' : '';
    return `<div class="hours"><div class="secT">Öffnungszeiten</div>
      <p class="note">${state ? `Laut 3TälerPass ${state} (Stand ${hhmm(liftsT)}). ` : ''}Lift- und Betriebszeiten unterscheiden sich je nach Gebiet, Wochentag und Saison – kleine Lifte fahren oft nur am Wochenende, in den Ferien oder bei genug Schnee. Verbindlich sind nur die Angaben des Betreibers.</p>
      <a class="btn wide" target="_blank" rel="noopener" href="${esc(r.web || r.link)}">Öffnungszeiten beim Betreiber prüfen ↗</a></div>`;
  }
  function wxHTML(r) {
    const w = snow[r.id]?.w;
    if (!w) return '';
    const d = (x, i) => `<div class="wxDay"><div class="wxH">${dayName(x.date, i)}</div>${wIcon(x.code)}<div><b>${wLabel(x.code)}</b><div class="muted small num">${Math.round(x.tmin)}° / ${Math.round(x.tmax)}° · Schnee ${cm(x.snow)}</div><div class="small">Sicht ${starsHTML(x.stars)}</div></div></div>`;
    return `<div class="secT">Wetter am Berg <span class="muted small">(${snow[r.id].elev} m)</span></div>
      <div class="wxTwo">${d(w[0], 0)}${d(w[1], 1)}</div>
      <div class="wx7 num">${w.slice(0, 7).map((x, i) => `<div><span class="small">${dayName(x.date, i)}</span>${wIcon(x.code)}<b>${Math.round(x.tmax)}°</b><span class="muted small">${Math.round(x.tmin)}°</span><span class="small">${num1(x.stars)}<span class="sy">★</span></span></div>`).join('')}</div>`;
  }
  $('#ciBar').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b || !current) return; if (b.dataset.act === 'checkin') openCheckin(current); else if (b.dataset.act === 'undoToday') { const c = S.checkins.find(c => c.date === today() && c.id === current); if (c) removeCheckin(c); } });
  $('#detailView').addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = current, r = byId[id];
    switch (b.dataset.act) {
      case 'back': closeDetail(); break;
      case 'fav': S.favs = isFav(id) ? S.favs.filter(x => x !== id) : S.favs.concat(id); save(); drawPins(); renderDetail(id); break;
      case 'checkin': openCheckin(id); break;
      case 'undoToday': {
        const c = S.checkins.find(c => c.date === today() && c.id === id);
        if (c) removeCheckin(c);
        break;
      }
    }
  });
  $('#detailView').addEventListener('change', e => {
    if (e.target.dataset.act === 'price') {
      const v = parseFloat(String(e.target.value).replace(',', '.'));
      if (isNaN(v)) delete S.prices[current]; else S.prices[current] = Math.round(v * 100) / 100;
      save(); toast('Preis gespeichert');
    }
  });


  /* ---------- 7) Check-in & Bilanz ---------- */
  function openCheckin(id, date) {
    const r = byId[id];
    const p = priceOf(r);
    modal(`
      <div class="mHead"><div class="h2">Einchecken</div><button class="iconBtn" data-close aria-label="Schließen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <p style="margin:0 0 6px"><b>${esc(r.name)}</b></p>
      <p class="muted small" style="margin:0 0 10px">${drive(r)} · Sprit ${eur(fuelCost(r))}</p>
      <div class="form">
        <label>Datum <input type="date" id="ciDate" value="${date || today()}" max="${today()}"></label>
        <label>Tageskarte hätte gekostet <b class="num">${p != null ? eur(p) : '–'}</b></label>
      </div>
      <p class="note">${p != null ? 'Den Preis änderst du im Gebiet unter „Infos &amp; Links“.' : 'Für dieses Gebiet ist kein Preis hinterlegt – trag ihn zuerst im Gebiet unter „Infos &amp; Links“ ein.'}</p>
      <p class="note" id="ciErr" style="color:var(--red)"></p>
      <button class="btn primary wide" id="ciGo"${p == null ? ' disabled' : ''}>Skitag eintragen</button>`);
    $('#ciGo').onclick = () => {
      const d = $('#ciDate').value, pr = p;
      if (!d) { $('#ciErr').textContent = 'Bitte ein Datum wählen.'; return; }
      if (pr == null || isNaN(pr)) { $('#ciErr').textContent = 'Bitte zuerst im Gebiet den Tageskartenpreis eintragen.'; return; }
      const same = S.checkins.find(c => c.date === d);
      if (same && !$('#ciGo').dataset.confirm) {
        $('#ciErr').textContent = `Am ${fmtDate(d)} bist du schon in ${byId[same.id]?.name || same.id} eingecheckt. Nochmal tippen ersetzt den Eintrag.`;
        $('#ciGo').dataset.confirm = '1'; return;
      }
      if (same) S.checkins = S.checkins.filter(c => c !== same);
      S.checkins.push({ date: d, id, price: pr, fuel: Math.round(fuelCost(r) * 100) / 100 });
      S.checkins.sort((a, b) => a.date.localeCompare(b.date));
      save(); closeModal(); drawPins();
      if (current) renderDetail(current);
      const bal = balance();
      showHello({ quote: pickCheckinQuote() || pickQuote(), gain: pr });
      // Pass amortisiert: jedes Mal Glückwunsch, beim ersten Mal groß mit Konfetti, danach kompakter
      if (bal.saved >= 0) setTimeout(() => celebrate(bal.saved, bal.saved - pr < 0), 3200);
    };
  }
  const fmtDate = d => new Date(d + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  function removeCheckin(c) {
    S.checkins = S.checkins.filter(x => x !== c); save();
    if (current) renderDetail(current);
    if (!$('#modalWrap').hidden && $('#modal').dataset.kind === 'wallet') openWallet();
    toast(`${byId[c.id]?.name || 'Eintrag'} gelöscht`, 'Rückgängig', () => {
      S.checkins.push(c); S.checkins.sort((a, b) => a.date.localeCompare(b.date)); save();
      if (current) renderDetail(current);
      if (!$('#modalWrap').hidden && $('#modal').dataset.kind === 'wallet') openWallet();
    });
  }
  // Kleine Animation, wenn der Pass sich gerade gelohnt hat (Bilanz springt über 0 €)
  function celebrate(saved, first) {
    const box = document.createElement('div'); box.className = 'party' + (first ? '' : ' small'); box.setAttribute('role', 'status');
    const cols = ['#e3a90f', '#5a9e2a', '#2f7fd8', '#e0483e', '#ef9f27', '#8fb3d9'];
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let bits = '';
    if (!reduce) for (let i = 0; i < (first ? 70 : 24); i++) {
      const x = Math.random() * 100, dx = (Math.random() - .5) * 60, rot = Math.random() * 720, del = Math.random() * .4, dur = 1.6 + Math.random() * 1.2;
      bits += `<i style="left:${x}%;background:${cols[i % cols.length]};--dx:${dx}vw;--rot:${rot}deg;animation-delay:${del}s;animation-duration:${dur}s"></i>`;
    }
    box.innerHTML = bits + (first
      ? `<div class="partyCard"><div class="partyBig">🎉</div><b>Der Pass hat sich gelohnt!</b><span>Glückwunsch, du hast diese Saison bereits</span><span class="num">${eur(saved)} gespart</span></div>`
      : `<div class="partyCard"><b>Glückwunsch!</b><span>Diese Saison schon <b class="num">${eur(saved)}</b> gespart.</span></div>`);
    document.body.appendChild(box);
    if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
    box.onclick = () => box.remove();
    setTimeout(() => box.remove(), first ? 4500 : 3200);
  }
  function balance() {
    const value = S.checkins.reduce((a, c) => a + c.price, 0);
    const fuel = S.checkins.reduce((a, c) => a + (c.fuel || 0), 0);
    const days = S.checkins.length;
    return { value, fuel, days, saved: value - S.settings.pass, perDay: days ? (S.settings.pass + fuel) / days : null };
  }
  // Knopf auf der Karte: kleine Pass-Karte, die sich mit jedem Skitag füllt (rot → grün, ab 100 % mit Haken)
  function passBtn() {
    const btn = document.getElementById('btnWallet'); if (!btn) return;
    const b = balance(), f = S.settings.pass ? Math.max(0, Math.min(1, b.value / S.settings.pass)) : 0, done = f >= 1;
    btn.innerHTML = `<svg viewBox="0 0 28 28" class="passIco"><rect x="3" y="7" width="22" height="15" rx="2.8" class="pc"/><rect x="4.3" y="8.3" width="${(19.4 * f).toFixed(2)}" height="12.4" rx="1.6" class="pf ${done ? 'ok' : ''}"/><rect x="11" y="9.6" width="6" height="1.9" rx=".95" class="ph"/><rect x="6.2" y="13.6" width="4.6" height="3.6" rx=".8" class="pm"/><path d="M13 14.4h7.2M13 17h4.6" class="pm"/>${done ? '<path d="M18.6 17.6l1.6 1.6 2.9-3" class="ck"/>' : ''}</svg><span class="pPct num">${Math.round(f * 100)}%</span>`;
    btn.setAttribute('aria-label', `Pass-Bilanz: ${Math.round(f * 100)} % refinanziert`);
  }
  function openWallet() {
    const b = balance(), pass = S.settings.pass, pos = b.saved >= 0;
    const pct = Math.min(100, pass ? b.value / pass * 100 : 0);
    const list = S.checkins.slice().reverse();
    const avg = b.days ? b.value / b.days : 60, left = pos ? 0 : Math.ceil(-b.saved / avg);
    modal(`
      <div class="mHead"><div class="h2">Pass-Bilanz</div><button class="iconBtn" data-close aria-label="Schließen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="passCard ${pos ? 'pos' : ''}">
        <div class="pcTop"><span>3TälerPass 26/27</span><span class="num">${Math.round(pass ? b.value / pass * 100 : 0)} %</span></div>
        <div class="pcBig num">${pos ? '+' : '−'}${eur(Math.abs(b.saved))}</div>
        <div class="pcSub">${pos ? 'durch den Pass gespart' : `noch bis der Pass bezahlt ist · ca. ${left} Skitag${left === 1 ? '' : 'e'}`}</div>
        <div class="pcBar"><i style="width:${pct.toFixed(1)}%"></i></div>
        <div class="pcScale num"><span>${eur(b.value)} abgefahren</span><span>${eur(pass)}</span></div>
      </div>
      <div class="tiles num">
        <div><span>Skitage</span><b>${b.days}</b></div>
        <div><span>Sprit gesamt</span><b>${eur(b.fuel)}</b></div>
        <div><span>Kosten / Skitag</span><b>${b.perDay == null ? '–' : eur(b.perDay)}</b></div>
      </div>
      <ul class="cList num">${list.length ? list.map((c, i) => `<li><span class="t">${fmtDate(c.date)} · ${esc(byId[c.id]?.name || c.id)}<br><span class="muted small">Sprit ${eur(c.fuel || 0)}</span></span><span class="p">+${eur(c.price)}</span><button class="del" data-del="${S.checkins.length - 1 - i}" aria-label="Löschen">✕</button></li>`).join('')
        : '<li class="muted">Noch keine Skitage. Öffne ein Gebiet und tippe „Heute hier einchecken“.</li>'}</ul>
      <details><summary>Einstellungen</summary>
        <div class="form">
          <button class="btn" id="setTour">Einführung nochmal ansehen</button>
          <button class="btn" id="setHome">Wohnort: ${esc(homeOf().name)} – ändern</button>
          <label>Passpreis (€) <input type="number" id="setPass" inputmode="decimal" step="1" value="${pass}"></label>
          <label>Verbrauch (l/100 km) <input type="number" id="setCons" inputmode="decimal" step="0.1" value="${S.settings.cons}"></label>
          <label>Benzinpreis (€/l) <input type="number" id="setFuel" inputmode="decimal" step="0.01" value="${S.settings.fuel}"></label>
          <button class="btn" id="fuelLive">Aktuellen Preis Super (Vorarlberg) laden</button>
          <p class="note">Spritkosten bereits eingetragener Skitage bleiben unverändert.</p>
        </div>
      </details>
      <details><summary>Daten sichern / übertragen</summary>
        <p class="note">Favoriten, Skitage und Preise liegen nur auf diesem Gerät. Sichere sie ab und zu.</p>
        <div class="btnGrid"><button class="btn" id="expCopy">Kopieren</button><button class="btn" id="expFile">Als Datei laden</button></div>
        <textarea id="impText" placeholder="Gesicherte Daten hier einfügen"></textarea>
        <button class="btn wide" id="impGo" style="margin-top:8px">Einfügen & übernehmen</button>
      </details>`, 'wallet');
    $('#modal').querySelectorAll('[data-del]').forEach(btn => btn.onclick = () => removeCheckin(S.checkins[+btn.dataset.del]));
    const num = (el, key) => el.onchange = () => { const v = parseFloat(String(el.value).replace(',', '.')); if (!isNaN(v) && v >= 0) { S.settings[key] = v; save(); renderList(); if (current) renderDetail(current); openWallet(); } };
    $('#setHome').onclick = () => openHome(false);
    $('#setTour').onclick = () => openTour();
    num($('#setPass'), 'pass'); num($('#setCons'), 'cons'); num($('#setFuel'), 'fuel');
    $('#fuelLive').onclick = async () => {
      const ft = S.settings.fuelT || 0;
      if (Date.now() - ft < TTL.fuel) { toast(`Spritpreis ist vom ${hhmm(ft)} – neu abrufbar ab ${hhmm(ft + TTL.fuel)}`); return; }
      $('#fuelLive').textContent = 'Lade …';
      try {
        const j = await (await fetch('https://api.e-control.at/sprit/1.0/search/gas-stations/by-address?latitude=47.41&longitude=9.74&fuelType=SUP&includeClosed=false')).json();
        const pr = j.map(s => s.prices?.[0]?.amount).filter(Boolean).slice(0, 5);
        if (!pr.length) throw new Error('leer');
        S.settings.fuel = Math.round(pr.reduce((a, b) => a + b, 0) / pr.length * 1000) / 1000; S.settings.fuelT = Date.now(); save();
        toast(`Super 95 rund um Dornbirn: ${S.settings.fuel.toLocaleString('de-DE')} €/l`);
        renderList(); if (current) renderDetail(current); openWallet();
      } catch (e) { $('#fuelLive').textContent = 'Nicht erreichbar – später nochmal'; }
    };
    const dump = () => JSON.stringify({ app: 'dreitaeler', v: 1, favs: S.favs, checkins: S.checkins, prices: S.prices, pano: S.pano, settings: S.settings });
    $('#expCopy').onclick = async () => { try { await navigator.clipboard.writeText(dump()); toast('Kopiert – z. B. in Notizen einfügen'); } catch (e) { $('#impText').value = dump(); toast('Text unten markieren und kopieren'); } };
    $('#expFile').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([dump()], { type: 'application/json' })); a.download = `3taeler-backup-${today()}.json`; a.click(); };
    $('#impGo').onclick = () => {
      try {
        const d = JSON.parse($('#impText').value);
        if (d.app !== 'dreitaeler') throw new Error();
        ['favs', 'checkins', 'prices', 'pano', 'settings'].forEach(k => { if (d[k]) S[k] = d[k]; });
        save(); drawPins(); renderList(); openWallet(); toast('Daten übernommen');
      } catch (e) { toast('Das sind keine gültigen Sicherungsdaten'); }
    };
  }

  /* ---------- 9) Bedienung ---------- */
  // Dialoge
  function openHome(first) {
    const h = homeOf();
    modal(`
      <div class="mHead"><div class="h2">${first ? 'Wo startest du?' : 'Wohnort ändern'}</div>${first ? '' : '<button class="iconBtn" data-close aria-label="Schließen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>'}</div>
      <p class="muted small" style="margin:0 0 10px">Von hier berechnet die App Fahrtzeit, Strecke und Spritkosten zu allen Gebieten.</p>
      <div class="form"><label>Ort <input id="hmQ" style="width:62%" type="search" autocomplete="off" value="${esc(h.name)}" placeholder="z. B. Dornbirn"></label></div>
      <button class="btn primary wide" id="hmGo">Ort suchen</button>
      <ul class="cList" id="hmRes"></ul>
      <p class="note" id="hmMsg"></p>`, 'home');
    const pick = async (name, lat, lon) => {
      $('#hmMsg').textContent = 'Berechne Fahrtzeiten …';
      try {
        if (name === CFG.start.name && Math.abs(lat - CFG.start.lat) < 0.02 && Math.abs(lon - CFG.start.lon) < 0.02) {
          S.home = { name, lat: CFG.start.lat, lon: CFG.start.lon, t: null };
        } else {
          const pts = [[lon, lat]].concat(R.map(r => [r.lon, r.lat])).map(p => p.map(v => v.toFixed(5)).join(',')).join(';');
          const j = await (await fetch(`https://router.project-osrm.org/table/v1/driving/${pts}?sources=0&annotations=duration,distance`)).json();
          if (j.code !== 'Ok') throw new Error(j.code);
          const t = {};
          R.forEach((r, i) => { const du = j.durations[0][i + 1], di = j.distances[0][i + 1]; if (du != null && di != null) t[r.id] = [Math.round(di / 100) / 10, Math.round(du / 60)]; });
          S.home = { name, lat, lon, t };
        }
        save(); home = homeOf(); homeMarker.setLngLat([home.lon, home.lat]);
        closeModal(); drawPins(); renderList(); computePodium(); if (current) renderDetail(current);
        if (first && (S.tourV || 0) < TOUR_V) openTour(); else toast(`Fahrtzeiten ab ${name}`);
      } catch (e) { $('#hmMsg').textContent = 'Routenberechnung gerade nicht erreichbar – bitte später nochmal.'; }
    };
    $('#hmGo').onclick = async () => {
      const q = $('#hmQ').value.trim(); if (!q) return;
      $('#hmMsg').textContent = 'Suche …';
      try {
        const j = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=de`)).json();
        const res = (j.results || []).filter(x => ['DE', 'AT', 'CH', 'LI', 'IT', 'FR'].includes(x.country_code));
        if (!res.length) { $('#hmMsg').textContent = 'Nichts gefunden – anders schreiben?'; return; }
        // Automatisch den obersten Vorschlag nehmen – keine Auswahl nötig
        const x = res[0];
        $('#hmRes').innerHTML = `<li class="muted small">Gefunden: <b>${esc(x.name)}</b> · ${esc([x.admin1, x.country].filter(Boolean).join(', '))}</li>`;
        pick(x.name, x.latitude, x.longitude);
      } catch (e) { $('#hmMsg').textContent = 'Ortssuche gerade nicht erreichbar.'; }
    };
    $('#hmQ').onkeydown = e => { if (e.key === 'Enter') $('#hmGo').click(); };
  }
  // Kurze Einführung beim ersten Öffnen (zum Durchklicken, ca. 1 Minute)
  const TOUR_V = 2; // Version der Einführung
  function openTour(start) {
    const pin = (fill, y, t, ring) => `<svg width="64" height="64" viewBox="-39 -39 78 78" aria-hidden="true">${ring ? `<polygon points="${hexPts(33)}" fill="none" stroke="${ring}" stroke-width="8" stroke-linejoin="round"/>` : ''}<polygon points="${hexPts(30)}" style="fill:var(--card);stroke:var(--ink)" stroke-width="1.6" stroke-linejoin="round"/><polygon points="${hexPts(21)}" fill="none" style="stroke:var(--track)" stroke-width="9" stroke-linejoin="round"/><polyline points="${sidePts(21, -1)}" fill="none" style="stroke:var(--snowM)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="${y} 200"/><polyline points="${sidePts(21, 1)}" fill="none" style="stroke:var(--snowY)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="${t} 200"/><polygon points="${hexPts(13)}" fill="${fill}"/></svg>`;
    const K = matchMedia('(prefers-color-scheme: dark)').matches ? ['Weiß', 'weiß'] : ['Schwarz', 'schwarz']; // Balkenfarbe „gestern“ folgt dem Hell-/Dunkelmodus
    // Animierte Pin-Erklärung: großer Pin mit Hinweisstrichen
    const SIZES = [['#e0483e', 'Kleines Gebiet', 'unter 8 km Piste'], ['#ef9f27', 'Mittleres Gebiet', '8–25 km Piste'], [BIG, 'Großes Gebiet', 'ab 25 km Piste']];
    const apin = mode => {
      const lead = mode === 'size' ? `<line x1="8" y1="0" x2="52" y2="0" class="tLead"/><circle cx="8" cy="0" r="1.6" class="tDot"/><text x="55" y="1.6" class="tLbl">Farbe innen</text><text x="55" y="9" class="tLbl s">= Größe</text>`
        : mode === 'y' ? `<line x1="-21" y1="2" x2="-52" y2="2" class="tLead"/><circle cx="-21" cy="2" r="1.6" class="tDot"/><text x="-55" y="0" class="tLbl" text-anchor="end">linker Rand</text><text x="-55" y="8" class="tLbl s" text-anchor="end">= gestern</text>`
        : `<line x1="21" y1="2" x2="52" y2="2" class="tLead"/><circle cx="21" cy="2" r="1.6" class="tDot"/><text x="55" y="0" class="tLbl">rechter Rand</text><text x="55" y="8" class="tLbl s">= heute</text>`;
      const full = mode === 'size' ? '' : `<line x1="0" y1="-24" x2="${mode === 'y' ? -30 : 30}" y2="-38" class="tLead"/><text x="${mode === 'y' ? -32 : 32}" y="-36" class="tLbl s" text-anchor="${mode === 'y' ? 'end' : 'start'}">oben = 30 cm</text>`;
      return `<svg viewBox="-110 -44 220 86" class="tBig" aria-hidden="true">${lead}${full}<polygon points="${hexPts(30)}" style="fill:var(--card);stroke:var(--ink)" stroke-width="1.6" stroke-linejoin="round"/><polygon points="${hexPts(21)}" fill="none" style="stroke:var(--track)" stroke-width="9" stroke-linejoin="round"/>`
        + `<polyline id="tBarY" points="${sidePts(21, -1)}" fill="none" style="stroke:var(--snowM)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="0 200" opacity="0"/>`
        + `<polyline id="tBarT" points="${sidePts(21, 1)}" fill="none" style="stroke:var(--snowY)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="0 200" opacity="0"/>`
        + `<polygon id="tCore" points="${hexPts(13)}" fill="${mode === 'size' ? SIZES[0][0] : BIG}"/></svg>`;
    };
    let animId = 0;
    const animSize = () => {
      const id = ++animId; let k = 0;
      const set = j => { const [c, t, sub] = SIZES[j]; $('#tCore')?.setAttribute('fill', c); if ($('#tSq')) { $('#tSq').style.background = c; $('#tCapT').textContent = t; $('#tCapS').textContent = sub; } };
      set(0);
      const next = () => { if (id !== animId || ++k > 2) return; set(k); setTimeout(next, 850); };
      setTimeout(next, 850);
    };
    // Balken: startet nach 0,1 s → weich (langsam–schnell–langsam) bis 30 cm → 0,5 s halten → sanft auf den Wert zurück
    const ease = f => f < 0.5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2; // easeInOutCubic: Tempo wie eine Glockenkurve
    const animBar = (which, cm) => {
      const id = ++animId, el = $(which === 'y' ? '#tBarY' : '#tBarT'), out = $('#tCm');
      const WAIT = 100, UP = 1300, HOLD = 500, DOWN = 700, MAX = 30, t0 = performance.now();
      const draw = v => { el.setAttribute('stroke-dasharray', `${(v / 30 * 100).toFixed(1)} 200`); el.setAttribute('opacity', v > 0.4 ? 1 : 0); out.textContent = `${Math.round(v)} cm`; };
      if (!el) return; draw(0);
      const step = now => {
        if (id !== animId) return;
        const t = now - t0; let v;
        if (t < WAIT) v = 0;
        else if (t < WAIT + UP) v = MAX * ease((t - WAIT) / UP);
        else if (t < WAIT + UP + HOLD) v = MAX;
        else v = MAX - (MAX - cm) * ease(Math.min(1, (t - WAIT - UP - HOLD) / DOWN));
        draw(v);
        if (t < WAIT + UP + HOLD + DOWN) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    // „Gestern | Heute“-Schalter: groß und eindeutig; beim Wechsel klappt er auf „Heute“ um
    const days = which => `<div class="tDays ${which}" aria-hidden="true"><span class="d y">Gestern</span><span class="d t">Heute</span></div>`;
    // Einchecken: Pass-Balken, von dem der Tageskartenpreis abgezogen wird
    const passDemo = () => {
      const P = S.settings.pass || 500, day = 52;
      $('#tpVal').textContent = `noch ${eur0(P)}`; $('#tpFill').style.width = '0%';
      setTimeout(() => {
        const t0 = performance.now(), D = 1100;
        const step = now => { const f = Math.min(1, (now - t0) / D), e = ease(f); $('#tpFill') && ($('#tpFill').style.width = `${(day / P * 100 * e).toFixed(1)}%`); $('#tpVal') && ($('#tpVal').textContent = `noch ${eur0(P - day * e)}`); if (f < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      }, 400);
    };
    const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
    const ico = {
      share: '<svg viewBox="0 0 24 24"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5v10h14V11h-1"/></svg>',
      add: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>',
      app: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M7 15l3-5 2 3 1.5-2 3.5 4z" class="f"/></svg>'
    };
    const steps = [
      ['Willkommen 👋', `<p>Die Karte zeigt alle <b>38 Gebiete</b> deines 3TälerPass. Unten ist die <b>Liste</b> – nach oben ziehen zum Aufklappen.</p><p><b>Pin oder Listeneintrag antippen</b> öffnet das Gebiet mit Fotos, Webcams, Wetter und Parkplätzen.</p>`],
      ['Pin: Größe des Gebiets', `<div class="tAnim" data-anim="size">${apin('size')}</div>
        <div class="tCap"><span class="tSq" id="tSq"></span><b id="tCapT">Kleines Gebiet</b><span class="muted" id="tCapS">unter 8 km Piste</span></div>
        <p class="muted small tHint">Die Farbe innen zeigt die Größe – rot, gelb oder grün.</p>`, () => animSize()],
      ['Pin: Neuschnee gestern', `${days('y')}<div class="tAnim">${apin('y')}</div>
        <div class="tCap"><span class="tNum" id="tCm">0 cm</span><span class="muted">Neuschnee gestern</span></div>
        <p class="muted small tHint">Linker Rand (${K[1]}) = gestern. Ganz voll = 30 cm.</p>`, () => animBar('y', 18)],
      ['Pin: Neuschnee heute', `${days('t flip')}<div class="tAnim">${apin('t')}</div>
        <div class="tCap"><span class="tNum" id="tCm">0 cm</span><span class="muted">Neuschnee heute</span></div>
        <p class="muted small tHint">Rechter Rand (blau) = heute. Ganz voll = 30 cm.</p>`, () => animBar('t', 24)],
      ['Gold, Silber, Bronze', `<div class="tPin big">${pin(BIG, 30, 60, MEDAL[1])}${pin('#ef9f27', 20, 40, MEDAL[2])}${pin(BIG, 10, 50, MEDAL[3])}</div>
        <p class="tLead1">Die <b>3 besten Gebiete für morgen</b>.</p><p class="muted small tHint">Dahinter steckt eine Bewertung aus Wetter, Schnee und mehr.</p>`],
      ['Ein Gebiet im Detail', `<p class="tLead1">Hier siehst du auf einen Blick:</p>
        <div class="tChips"><span>🚗 <b>Fahrtzeit</b></span><span>🚡 <b>Offene Lifte</b></span><span>☀️ <b>Sicht &amp; Wetter</b> für die nächsten Tage</span><span>🅿️ <b>Parkplätze</b></span></div>`],
      ['Einchecken lohnt sich', `<div class="tPass"><div class="tpTop"><span>Dein Pass</span><b class="num" id="tpVal"></b></div>
          <div class="tpBar"><i id="tpFill"></i></div>
          <div class="tpTag">✓ Einchecken · Tageskarte <b class="num">52 €</b> wird abgezogen</div></div>
        <p class="tLead1">Jeder Skitag zählt: Beim <b>Einchecken</b> wird der Preis der Tageskarte von deinen <b>${eur0(S.settings.pass || 500)}</b> abgezogen.</p>
        <p class="muted small tHint">Bei 0 € hat sich der Pass bezahlt – ab dann sparst du.</p>`, () => passDemo()],
      ['Zum Home-Bildschirm', `<div class="tHome"><div><span class="hi">${ico.share}</span><small>1. Teilen</small></div><i>›</i><div><span class="hi">${ico.add}</span><small>2. „Zum Home-Bildschirm“</small></div><i>›</i><div><span class="hi app">${ico.app}</span><small>3. Fertig</small></div></div>
        ${standalone ? '<p class="tLead1">✓ <b>Erledigt</b> – du nutzt die App schon vom Home-Bildschirm.</p>' : '<p class="tLead1">In Safari unten auf <b>Teilen</b> tippen, dann <b>„Zum Home-Bildschirm“</b>.</p>'}
        <p class="muted small tHint">Wichtig: Safari löscht Daten von Webseiten, die du länger nicht öffnest. Als App auf dem Home-Bildschirm bleiben deine Skitage erhalten.</p>`],
      ['Bitte beachten', `<p class="tData">🔒 Deine Daten bleiben <b>nur auf diesem Gerät</b> – kein Konto, kein Upload.</p><p><b>Keine offizielle Software.</b> Diese App ist ein privates Projekt und steht in keiner Verbindung zum 3TälerPass oder zu den Liftbetreibern.</p><p>Alle Angaben (Schnee, Wetter, Lifte, Preise, Fahrtzeiten, Parkplätze) ohne Gewähr – maßgeblich sind die offiziellen Seiten. <b>Es wird keine Haftung übernommen.</b></p><p>Nutzung nur <b>privat und nicht kommerziell</b>. Kopieren, Weitergeben des Codes oder Nachbauen ist nicht erlaubt.</p>`]
    ];
    let i = start || 0;
    const show = () => {
      const [h, body] = steps[i];
      modal(`<div class="tour">
        <div class="mHead"><div class="h2">${h}</div><span class="tHeadR"><span class="muted small num">${i + 1}/${steps.length}</span>${i >= 4 ? '<button class="iconBtn" data-tour="close" aria-label="Einführung schließen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' : ''}</span></div>
        <div class="tBody">${body}</div>
        <div class="tDots">${steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
        <div class="btnGrid">${i ? '<button class="btn" data-tour="back">Zurück</button>' : '<span></span>'}<button class="btn primary" data-tour="next">${i === steps.length - 1 ? 'Verstanden – los geht’s' : 'Weiter'}</button></div></div>`, 'tour');
      animId++; const run = steps[i][2]; if (run) { run(); const a = $('#modal .tAnim') || $('#modal .tPass'); if (a) a.onclick = () => { animId++; run(); }; }
      $('#modal').querySelectorAll('[data-tour]').forEach(b => b.onclick = e => {
        e.stopPropagation();
        const a = b.dataset.tour;
        if (a === 'next' && i < steps.length - 1) { i++; show(); return; }
        if (a === 'back') { i--; show(); return; }
        if (a === 'next' || a === 'close') { S.toured = true; S.tourV = TOUR_V; save(); closeModal(); }
      });
    };
    show();
  }
  function modal(html, kind) { $('#modal').innerHTML = html; $('#modal').dataset.kind = kind || ''; $('#modalWrap').hidden = false; }
  function closeModal() { $('#modalWrap').hidden = true; $('#modal').innerHTML = ''; }
  $('#modalWrap').addEventListener('click', e => {
    const k = $('#modal').dataset.kind;
    if (k === 'tour' || (k === 'home' && !S.home)) return; // Einführung und erster Wohnort lassen sich nicht wegklicken
    if (e.target.id === 'modalWrap' || e.target.closest('[data-close]')) closeModal();
  });

  // Hinweis unten
  let toastT;
  function toast(msg, actLabel, act) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>${actLabel ? `<button>${esc(actLabel)}</button>` : ''}`;
    t.hidden = false;
    if (actLabel) t.querySelector('button').onclick = () => { act(); t.hidden = true; };
    clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, actLabel ? 5000 : 2600);
  }

  // Ausziehbares Blatt: peek (Liste angedeutet) / half / full
  const sheet = $('#sheet');
  const H = () => sheet.getBoundingClientRect().height;
  const VIS = { peek: () => 150, half: () => Math.round(window.innerHeight * .5), detail: () => Math.min(H(), Math.round(window.innerHeight * .74)), full: () => H() };
  const sheetVisible = () => VIS[sheet.dataset.state]();
  function setSheet(state) {
    sheet.dataset.state = state;
    sheet.style.transform = `translateY(${H() - VIS[state]()}px)`;
    // Der nach unten verschobene Teil des Blatts ist unsichtbar → genauso viel Platz unten anhängen, damit man alles erreicht
    const bar = !$('#ciBar').hidden;
    $('#sheetBody').style.paddingBottom = `calc(${H() - VIS[state]()}px + env(safe-area-inset-bottom) + ${bar ? 72 : 14}px)`;
    $('#ciBar').style.bottom = (H() - VIS[state]()) + 'px';
    $('#fabs').style.bottom = (Math.min(VIS[state](), VIS.half()) + 14) + 'px';
    $('#fabs').style.visibility = state === 'full' ? 'hidden' : 'visible';
  }
  let drag = null;
  function startDrag(e) {
    if (e.target.closest('button,input,select,a')) return;
    drag = { y: e.clientY, start: H() - VIS[sheet.dataset.state](), moved: false };
    sheet.classList.add('dragging');
    e.target.setPointerCapture?.(e.pointerId);
  }
  function moveDrag(e) {
    if (!drag) return;
    const dy = e.clientY - drag.y;
    if (Math.abs(dy) > 4) drag.moved = true;
    const t = Math.max(0, Math.min(H() - VIS.peek(), drag.start + dy));
    sheet.style.transform = `translateY(${t}px)`;
  }
  function endDrag(e) {
    if (!drag) return;
    sheet.classList.remove('dragging');
    if (!drag.moved) { // Tippen auf den Griff wechselt die Höhe
      setSheet({ peek: 'half', half: 'full', detail: 'full', full: 'peek' }[sheet.dataset.state]);
    } else {
      const vis = H() - (drag.start + (e.clientY - drag.y));
      const opts = (current ? ['peek', 'half', 'detail', 'full'] : ['peek', 'half', 'full']).map(s => [s, Math.abs(VIS[s]() - vis)]).sort((a, b) => a[1] - b[1]);
      setSheet(opts[0][0]);
    }
    drag = null;
  }
  ['#sheetHead', '.listTop'].forEach(sel => {
    const el = $(sel);
    el.addEventListener('pointerdown', startDrag);
    el.addEventListener('pointermove', moveDrag);
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
  });
  // Liste ganz oben + weiter nach unten wischen = Blatt kleiner machen
  let ty = null;
  $('#sheetBody').addEventListener('touchstart', e => { ty = $('#sheetBody').scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  $('#sheetBody').addEventListener('touchend', e => {
    if (ty == null) return;
    const dy = e.changedTouches[0].clientY - ty;
    if (dy > 70) setSheet(sheet.dataset.state === 'full' ? 'half' : 'peek');
    ty = null;
  }, { passive: true });
  map.on('click', () => { if (sheet.dataset.state !== 'peek') setSheet('peek'); });
  window.addEventListener('resize', () => setSheet(sheet.dataset.state));

  // Sortierung
  document.querySelectorAll('.seg button').forEach(b => {
    b.classList.toggle('on', b.dataset.sort === S.sort);
    b.onclick = () => { S.sort = b.dataset.sort; save(); document.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b)); renderList(); };
  });
  // Filter
  document.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('on', S.filters.includes(c.dataset.filter));
    c.onclick = () => {
      const f = c.dataset.filter;
      S.filters = S.filters.includes(f) ? S.filters.filter(x => x !== f) : S.filters.concat(f);
      c.classList.toggle('on'); save(); drawPins(); renderList();
      if (current) closeDetail();
      if (sheet.dataset.state === 'peek') setSheet('half');
    };
  });
  $('#btnWallet').onclick = openWallet;

  // Standort: zeigt dich auf der Karte und bietet den Check-in an, wenn du in einem Gebiet bist
  let me = null;
  $('#btnLocate').onclick = () => {
    if (!navigator.geolocation) { toast('Standort wird nicht unterstützt'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      if (!me) me = dot('me-dot', ll[0], ll[1]);
      else me.setLngLat([ll[1], ll[0]]);
      const near = R.map(r => ({ r, d: distM(ll, [r.lat, r.lon]) })).sort((a, b) => a.d - b.d)[0];
      if (near.d < 5000 && !near.r.noSki) {
        openDetail(near.r.id, true);
        toast(`Du bist bei ${near.r.name}`, 'Einchecken', () => openCheckin(near.r.id));
      } else {
        map.flyTo({ center: [ll[1], ll[0]], zoom: Math.max(map.getZoom(), 9) });
        toast(`Nächstes Gebiet: ${near.r.name} (${(near.d / 1000).toFixed(0)} km Luftlinie)`);
      }
    }, () => toast('Standort nicht freigegeben'), { enableHighAccuracy: true, timeout: 10000 });
  };


  /* ---------- Begrüßungs-Banner: Spruch + Finanzierungsfortschritt, 10 s beim Öffnen ---------- */
  const QKEY = 'dreitaeler-quotes', HELLO_MS = 10000;
  const eur0 = v => Math.round(v).toLocaleString('de-DE') + ' €';
  function quoteVals() {
    const b = balance(), pass = S.settings.pass || 0, f = pass ? b.value / pass : 0, minus = b.saved < 0;
    const ski = R.filter(r => !r.noSki && priceOf(r) != null);
    const avg = b.days ? b.value / b.days : (ski.reduce((a, r) => a + priceOf(r), 0) / (ski.length || 1));
    const best = R.filter(r => !r.noSki && snow[r.id]).sort((a, c) => (snow[c.id].t || 0) - (snow[a.id].t || 0))[0];
    const cm = best ? Math.round(snow[best.id].t || 0) : 0;
    return {
      offen: minus ? eur0(-b.saved) : null,
      tageNoch: minus ? String(Math.max(1, Math.ceil(-b.saved / (avg || 60)))) : null,
      skitage: minus && b.days >= 1 && b.days <= 5 ? `${b.days} Skitag${b.days === 1 ? '' : 'e'}` : null,
      prozent: f < 1 ? String(Math.round(f * 100)) : null,
      tagespreis: avg ? eur0(avg) : null,
      gebiet: cm >= 5 ? best.name : null, cm: cm >= 5 ? String(cm) : null
    };
  }
  function pickQuote() {
    const Q = window.QUOTES || []; if (!Q.length) return null;
    const V = quoteVals();
    const fill = q => { let ok = true; const t = q.replace(/\{(\w+)\}/g, (m, k) => { if (V[k] == null) ok = false; return V[k] ?? ''; }); return ok ? t : null; };
    let recent = []; try { recent = JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch (e) { }
    const all = Q.map((q, i) => [i, fill(q)]).filter(x => x[1]);
    const pool = all.filter(x => !recent.includes(x[0]));
    const [i, t] = (pool.length ? pool : all)[Math.floor(Math.random() * (pool.length || all.length))];
    recent = [i, ...recent].slice(0, Math.floor(Q.length * 0.7)); // ca. 70 % der Sprüche müssen erst durch sein, bevor einer wiederkommt
    try { localStorage.setItem(QKEY, JSON.stringify(recent)); } catch (e) { }
    return t;
  }
  let helloTimer = null, helloSteps = [];
  function closeHello() {
    const el = document.getElementById('hello'); clearTimeout(helloTimer); helloSteps.forEach(clearTimeout); helloSteps = []; if (!el) return;
    el.classList.remove('in'); setTimeout(() => el.remove(), 320);
  }
  // opt.gain: Preis des gerade eingecheckten Skitags → Balken läuft erst bis zum alten Stand, nach 0,5 s kommt der neue Teil dazu
  function showHello(opt = {}) {
    const q = opt.quote || pickQuote(); if (!q) return;
    clearTimeout(helloTimer); helloSteps.forEach(clearTimeout); helloSteps = [];
    document.getElementById('hello')?.remove();
    const b = balance(), pass = S.settings.pass || 0, frac = v => pass ? Math.max(0, Math.min(1, v / pass)) : 0;
    const f = frac(b.value), f0 = opt.gain ? frac(b.value - opt.gain) : 0, done = f >= 1;
    const el = document.createElement('div'); el.id = 'hello'; el.setAttribute('role', 'status');
    const right = done ? `+${eur0(b.saved)} gespart` : `noch ${eur0(-b.saved)} offen`;
    const left = opt.gain ? `+${eur0(opt.gain)} heute · ${Math.round(f * 100)} %` : (done ? '✓ Pass bezahlt' : `${Math.round(f * 100)} % abgefahren`);
    el.innerHTML = `
      <button class="hX" aria-label="Schließen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <div class="hQ">${esc(q)}</div>
      <div class="hBar"><i class="hG"></i></div>
      <div class="hSub num"><span>${left}</span><span>${right}</span></div>
      <i class="hTime"></i>`;
    document.body.appendChild(el);
    el.querySelector('.hX').onclick = e => { e.stopPropagation(); closeHello(); };
    el.onclick = () => { closeHello(); openWallet(); };
    let y0 = null;
    el.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchmove', e => { if (y0 != null && e.touches[0].clientY - y0 < -25) { y0 = null; closeHello(); } }, { passive: true });
    const g = el.querySelector('.hG'), w = v => `${(v * 100).toFixed(1)}%`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.add('in');
      // Balken beginnt rot; Grün wächst von links bis zum abbezahlten Anteil
      if (!opt.gain) { helloSteps.push(setTimeout(() => { g.style.width = w(f); }, 600)); return; }
      helloSteps.push(setTimeout(() => { g.style.width = w(f0); }, 500));                       // bisheriger Stand (1,4 s)
      helloSteps.push(setTimeout(() => { g.classList.add('gain'); g.style.width = w(f); }, 500 + 1400 + 500)); // nach 0,5 s: heutiger Skitag
    }));
    helloTimer = setTimeout(closeHello, HELLO_MS);
  }
  function pickCheckinQuote() {
    const Q = window.CHECKIN_QUOTES || [], minus = balance().saved < 0; if (!Q.length) return null;
    let recent = []; try { recent = JSON.parse(localStorage.getItem(QKEY + '-ci') || '[]'); } catch (e) { }
    const all = Q.map((q, i) => [i, q]).filter(([, q]) => minus || !q.includes('{minus}'));
    const pool = all.filter(x => !recent.includes(x[0])), src = pool.length ? pool : all;
    const [i, t] = src[Math.floor(Math.random() * src.length)];
    try { localStorage.setItem(QKEY + '-ci', JSON.stringify([i, ...recent].slice(0, Math.floor(Q.length * 0.7)))); } catch (e) { }
    return t.replace('{minus}', '');
  }

  // Start
  drawPins();
  renderList();
  setSheet('peek');
  const refresh = () => loadLifts().then(() => loadSnow());
  refresh();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  // Neue Einführung (TOUR_V erhöhen) wird jedem einmal gezeigt – auch wer die App schon nutzt
  passBtn();
  if (!S.home) openHome(true); else if ((S.tourV || 0) < TOUR_V) openTour(); else setTimeout(showHello, 500);
  // Banner auch, wenn die App nach mindestens 30 Minuten im Hintergrund wieder geöffnet wird
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); closeHello(); }
    else if (hiddenAt && Date.now() - hiddenAt >= 30 * 60 * 1000 && $('#modalWrap').hidden) setTimeout(showHello, 400);
  });
})();
