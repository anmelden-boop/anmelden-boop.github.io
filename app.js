/* 3Täler Karte – App-Logik
   Aufbau: 1) Speicher  2) Rechnen & Formatieren  3) Schneedaten  4) Karte & Pins
           5) Liste  6) Detailansicht  7) Check-in & Bilanz  8) Auslosen  9) Bedienung (Blatt, Filter, Standort)
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
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Speichern nicht möglich'); } };

  /* ---------- 2) Rechnen & Formatieren ---------- */
  const eur = v => (v == null || isNaN(v)) ? '–' : v.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const hm = m => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`;
  const drive = r => `${Math.round(r.roadKm)} km · ${hm(r.driveMin)}`;
  const fuelCost = r => 2 * r.roadKm * S.settings.cons / 100 * S.settings.fuel;
  const priceOf = r => (S.prices[r.id] != null ? S.prices[r.id] : r.price);
  const panoOf = r => S.pano[r.id] || r.pano;
  const isFav = id => S.favs.includes(id);
  const sizeKm = r => (r.km > 0 ? r.km : (r.routes || 0));
  const color = r => r.noSki ? '#9a9a9a' : sizeKm(r) >= 25 ? '#2f7fd8' : sizeKm(r) >= 8 ? '#ef9f27' : '#e0483e';
  const sizeName = r => r.noSki ? 'Seilbahn' : sizeKm(r) >= 25 ? 'groß' : sizeKm(r) >= 8 ? 'mittel' : 'klein';
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const cm = v => (v == null ? '–' : `${Math.round(v)} cm`);

  /* ---------- 3) Schneedaten (Open-Meteo, ein Abruf für alle Gebiete) ---------- */
  // snow[id] = { y: gestern, t: heute, m: morgen, d2: übermorgen, depth: Schneehöhe jetzt (cm), elev }
  let snow = {};
  const SNOW_KEY = 'dreitaeler-snow';
  async function loadSnow(force) {
    try {
      const c = JSON.parse(localStorage.getItem(SNOW_KEY) || 'null');
      if (!force && c && Date.now() - c.t < 30 * 60 * 1000) { snow = c.d; afterSnow(c.t); return; }
    } catch (e) { }
    const elev = R.map(r => r.top || r.base || 1000);
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + R.map(r => r.lat).join(',') +
      '&longitude=' + R.map(r => r.lon).join(',') + '&elevation=' + elev.join(',') +
      '&daily=snowfall_sum&hourly=snow_depth&past_days=1&forecast_days=3&timezone=Europe%2FBerlin';
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
        snow[R[i].id] = { y: s[0], t: s[1], m: s[2], d2: s[3], depth: dep == null ? null : dep * 100, elev: elev[i] };
      });
      try { localStorage.setItem(SNOW_KEY, JSON.stringify({ t: Date.now(), d: snow })); } catch (e) { }
      afterSnow(Date.now());
    } catch (e) {
      $('#snowInfo').textContent = 'Schneedaten gerade nicht erreichbar';
      toast('Schneedaten konnten nicht geladen werden');
    }
  }
  function afterSnow(t) {
    const d = new Date(t);
    $('#snowInfo').textContent = `Schnee: Open-Meteo, Stand ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`;
    drawPins(); renderList();
    if (current) renderDetail(current);
  }

  /* ---------- 4) Karte & Pins ---------- */
  const map = L.map('map', { zoomControl: false, attributionControl: true, maxZoom: 17, minZoom: 7 });
  L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution: 'Karte: © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA), © OpenStreetMap · Schnee: Open-Meteo'
  }).addTo(map);
  let pinsReady = false;
  const home = CFG.start;
  L.marker([home.lat, home.lon], { icon: L.divIcon({ className: '', html: '<div class="home-dot"></div>', iconSize: [16, 16] }), interactive: false }).addTo(map);
  map.fitBounds(L.latLngBounds(R.map(r => [r.lat, r.lon]).concat([[home.lat, home.lon]])), { paddingTopLeft: [20, 70], paddingBottomRight: [20, 170] });
  map.on('zoomend', () => { map.getContainer().classList.toggle('show-labels', map.getZoom() >= 11); if (pinsReady) drawPins(); });

  // Sechseck-Punkte, Spitze oben
  const hexPts = rad => [0, 1, 2, 3, 4, 5].map(i => { const a = Math.PI / 3 * i - Math.PI / 2; return `${(rad * Math.cos(a)).toFixed(2)},${(rad * Math.sin(a)).toFixed(2)}`; }).join(' ');
  // Balken laufen von der unteren Spitze nach oben: links = gestern (grün), rechts = morgen (dunkel)
  const sidePts = (rad, dir) => { const x = rad * Math.cos(Math.PI / 6) * dir, y = rad / 2; return `0,${rad} ${x.toFixed(2)},${y} ${x.toFixed(2)},${-y} 0,${-rad}`; };
  const frac = v => Math.max(0, Math.min(1, (v || 0) / 30)); // 30 cm = voller Balken
  function pinSVG(r, size) {
    const sn = snow[r.id];
    const fy = sn ? frac(sn.y) : 0, fm = sn ? frac(sn.m) : 0;
    const bars = r.noSki ? '' : `
      <polygon points="${hexPts(21)}" fill="none" style="stroke:var(--track)" stroke-width="9" stroke-linejoin="round"/>
      ${fy > 0 ? `<polyline points="${sidePts(21, -1)}" fill="none" style="stroke:var(--snowY)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="${(fy * 100).toFixed(1)} 200"/>` : ''}
      ${fm > 0 ? `<polyline points="${sidePts(21, 1)}" fill="none" style="stroke:var(--snowM)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" pathLength="100" stroke-dasharray="${(fm * 100).toFixed(1)} 200"/>` : ''}
      ${sn && sn.m > 30 ? '<circle cx="0" cy="-30" r="3.2" style="fill:var(--snowM)"/>' : ''}`;
    const fav = isFav(r.id) ? '<polygon points="22,-31 24.4,-26 30,-25.4 25.8,-21.6 27,-16 22,-18.8 17,-16 18.2,-21.6 14,-25.4 19.6,-26" fill="#f2b01e" stroke="#fff" stroke-width="1"/>' : '';
    return `<svg width="${size}" height="${size}" viewBox="-34 -34 68 68" aria-hidden="true">
      <polygon points="${hexPts(30)}" style="fill:var(--card);stroke:var(--ink)" stroke-width="1.6" stroke-linejoin="round"/>
      ${bars}
      <polygon points="${hexPts(r.noSki ? 18 : 13)}" fill="${color(r)}"/>
      ${fav}</svg>`;
  }
  const markers = {};
  pinsReady = true;
  function drawPins() {
    const vis = new Set(filtered().map(r => r.id));
    const z = map.getZoom();
    const sz = z <= 8 ? 26 : z === 9 ? 32 : z === 10 ? 40 : 48; // rausgezoomt kleinere Pins, damit sie nicht übereinander liegen
    R.forEach(r => {
      const icon = L.divIcon({ className: 'pin' + (vis.has(r.id) ? '' : ' dim'), html: pinSVG(r, sz), iconSize: [sz, sz], iconAnchor: [sz / 2, sz / 2] });
      if (markers[r.id]) { markers[r.id].setIcon(icon); markers[r.id].setZIndexOffset(vis.has(r.id) ? 100 : 0); }
      else {
        markers[r.id] = L.marker([r.lat, r.lon], { icon, keyboard: false })
          .bindTooltip(esc(r.name), { permanent: true, direction: 'bottom', offset: [0, 20], className: 'lbl' })
          .on('click', () => openDetail(r.id, true))
          .addTo(map);
      }
    });
  }

  /* ---------- 5) Liste ---------- */
  const FILTERS = {
    near: r => r.driveMin <= 60,
    snow: r => { const s = snow[r.id]; return !!s && ((s.y || 0) + (s.t || 0) >= 3 || (s.m || 0) >= 3); },
    fav: r => isFav(r.id),
    big: r => sizeKm(r) >= 25
  };
  const filtered = () => R.filter(r => S.filters.every(f => FILTERS[f](r)));
  function sorted(list) {
    const fresh = r => { const s = snow[r.id]; return s ? (s.y || 0) + (s.t || 0) : -1; };
    return list.slice().sort((a, b) => S.sort === 'snow'
      ? (fresh(b) - fresh(a)) || ((snow[b.id]?.m || 0) - (snow[a.id]?.m || 0)) || a.driveMin - b.driveMin
      : a.driveMin - b.driveMin);
  }
  function renderList() {
    const list = sorted(filtered());
    $('#listTitle').textContent = `${list.length} ${list.length === 1 ? 'Gebiet' : 'Gebiete'}`;
    $('#list').innerHTML = list.length ? list.map(r => {
      const s = snow[r.id];
      const snowTxt = r.noSki ? '<span class="muted">Winterwandern</span>' : s
        ? `<span class="yv">${Math.round((s.y || 0) + (s.t || 0))} cm</span> <span class="muted">neu</span><br><span class="muted">morgen ${Math.round(s.m || 0)} cm</span>`
        : '<span class="muted">…</span>';
      return `<li data-id="${r.id}">
        <span class="mini">${pinSVG(r, 34)}</span>
        <span class="t"><div class="n">${isFav(r.id) ? '★ ' : ''}${esc(r.name)}</div><div class="muted small num">${drive(r)} · ${eur(fuelCost(r))} Sprit</div></span>
        <span class="s num">${snowTxt}</span></li>`;
    }).join('') : '<div class="empty">Kein Gebiet passt zu den Filtern.</div>';
  }
  $('#list').addEventListener('click', e => { const li = e.target.closest('li[data-id]'); if (li) openDetail(li.dataset.id, true); });

  /* ---------- 6) Detailansicht ---------- */
  let current = null;
  const wikiCache = {};
  function openDetail(id, fly) {
    current = id;
    const r = byId[id];
    $('#listView').hidden = true;
    $('#detailView').hidden = false;
    renderDetail(id);
    $('#sheetBody').scrollTop = 0;
    setSheet('half');
    if (fly) {
      const z = Math.max(map.getZoom(), 11);
      const p = map.project([r.lat, r.lon], z);
      p.y += sheetVisible() / 2 - 20; // Pin über dem Blatt anzeigen
      map.flyTo(map.unproject(p, z), z, { duration: .6 });
    }
    loadWiki(r);
  }
  function closeDetail() {
    current = null;
    $('#detailView').hidden = true;
    $('#listView').hidden = false;
    renderList();
  }
  const mtn = on => `<svg viewBox="0 0 30 22"><path d="M1 21 L11 5 L16 12 L20 7 L29 21 Z" style="fill:${on ? 'var(--ink)' : 'none'};stroke:var(--ink)" stroke-width="1.6" stroke-linejoin="round" opacity="${on ? 1 : .35}"/>${on ? '<path d="M8.6 9 L11 5 L13.4 9 L11.8 8 L11 9.2 L10.2 8 Z" style="fill:var(--card)"/>' : ''}</svg>`;
  function renderDetail(id) {
    const r = byId[id], s = snow[id], pano = panoOf(r);
    const cams = r.cams.map(c => `<div class="gItem"><img loading="lazy" alt="Webcam ${esc(c.t)}" src="${esc(c.u + (c.u.includes('?') ? '&' : '?') + '_=' + Math.floor(Date.now() / 6e5))}" onerror="this.parentNode.classList.add('noimg');this.parentNode.innerHTML='Webcam ${esc(c.t)} gerade nicht verfügbar'"><span class="cap"><span class="live"></span>Webcam · ${esc(c.t)}</span></div>`).join('');
    const camLink = r.camLink ? `<a class="gItem noimg" href="${esc(r.camLink)}" target="_blank" rel="noopener">Live-Webcam öffnen ↗</a>` : '';
    const wiki = (wikiCache[id] || []).map(w => `<div class="gItem"><img loading="lazy" alt="${esc(w.title)}" src="${esc(w.thumb)}"><span class="cap">Foto: <a href="${esc(w.page)}" target="_blank" rel="noopener">${esc(w.artist)}</a> · ${esc(w.lic)}</span></div>`).join('');
    const gallery = cams + camLink + wiki || `<div class="gItem noimg">${wikiCache[id] ? 'Keine Bilder gefunden' : 'Bilder werden geladen …'}</div>`;
    const checkedToday = S.checkins.find(c => c.date === today() && c.id === id);
    const fc = fuelCost(r);
    const p = priceOf(r);
    $('#detailView').innerHTML = `
      <div class="dHead">
        <button class="iconBtn" data-act="back" aria-label="Zurück zur Liste"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
        <div class="dTitle"><div class="h2">${esc(r.name)}</div><div class="muted small">${esc(r.area)} · ${sizeName(r)}</div></div>
        <button class="iconBtn star ${isFav(id) ? 'on' : ''}" data-act="fav" aria-label="Favorit"><svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></svg></button>
      </div>
      <div class="gallery">${gallery}</div>
      <div class="drive num"><b>${drive(r)}</b> ab Friedrichshafen · Sprit hin + zurück <b>${eur(fc)}</b></div>
      ${r.noSki ? '<p class="note">Seilbahn zum Winterwandern – kein Skigebiet, zählt nicht als Skitag.</p>' : `
      <div class="snowGrid num">
        <div class="gy"><b>${cm(s?.y)}</b><span>gestern</span></div>
        <div><b>${cm(s?.t)}</b><span>heute</span></div>
        <div><b>${cm(s?.m)}</b><span>morgen</span></div>
        <div><b>${cm(s?.depth)}</b><span>Schneehöhe</span></div>
      </div>
      <p class="note">Wettermodell für ${s ? s.elev : '–'} m, nicht der offizielle Pistenbericht. Übermorgen: ${cm(s?.d2)}.</p>`}
      <div class="pano"><span><b>Panorama</b><br><span class="muted small">Tippen zum Ändern</span></span>
        <span class="mtns">${[1, 2, 3, 4, 5].map(i => `<button data-pano="${i}" aria-label="${i} von 5">${mtn(i <= pano)}</button>`).join('')}</span></div>
      <dl class="rows num">
        ${r.noSki ? '' : `<div><dt>Tageskarte</dt><dd><input class="priceIn" type="number" inputmode="decimal" step="0.5" min="0" data-act="price" value="${p ?? ''}" placeholder="? €"> €</dd></div>`}
        <div><dt>Pisten</dt><dd>${r.km ? r.km.toLocaleString('de-DE') + ' km' : '–'}${r.routes ? ` + ${r.routes.toLocaleString('de-DE')} km Skirouten` : ''}</dd></div>
        <div><dt>Höhe</dt><dd>${r.base ? `${r.base}–${r.top} m` : (r.top ? r.top + ' m' : '–')}</dd></div>
        <div><dt>Lifte</dt><dd>${r.lifts ?? '–'}</dd></div>
      </dl>
      ${r.mapOnly ? '<p class="note">Nur auf der 3Täler-Karte gelistet – Pisten/Preis von skiresort.com.</p>' : ''}
      <div class="btnGrid">
        <a class="btn" target="_blank" rel="noopener" href="https://maps.apple.com/?saddr=${home.lat},${home.lon}&daddr=${r.lat},${r.lon}&dirflg=d">Route (Apple)</a>
        <a class="btn" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&origin=${home.lat},${home.lon}&destination=${r.lat},${r.lon}&travelmode=driving">Route (Google)</a>
        <a class="btn" target="_blank" rel="noopener" href="${esc(r.link)}">Lifte & Pisten ↗</a>
        <a class="btn" target="_blank" rel="noopener" href="https://www.skiline.cc">Skiline ↗</a>
      </div>
      ${r.noSki ? '' : checkedToday
        ? `<button class="btn primary done wide" data-act="undoToday">✓ Heute eingecheckt · ${eur(checkedToday.price)}</button>`
        : `<button class="btn primary wide" data-act="checkin">Heute hier einchecken</button>`}`;
  }
  $('#detailView').addEventListener('click', e => {
    const b = e.target.closest('[data-act],[data-pano]');
    if (!b) return;
    const id = current, r = byId[id];
    if (b.dataset.pano) { S.pano[id] = +b.dataset.pano; save(); renderDetail(id); return; }
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

  // Freie Fotos von Wikimedia Commons rund um das Gebiet
  async function loadWiki(r) {
    if (wikiCache[r.id]) return;
    try {
      const u = 'https://commons.wikimedia.org/w/api.php?action=query&generator=geosearch&ggscoord=' + r.lat + '%7C' + r.lon +
        '&ggsradius=6000&ggsnamespace=6&ggslimit=20&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=900&format=json&origin=*';
      const j = await (await fetch(u)).json();
      const strip = h => { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent.trim(); };
      const pages = Object.values(j.query?.pages || {}).filter(p => /\.(jpe?g)$/i.test(p.title) && p.imageinfo?.[0]?.thumburl);
      wikiCache[r.id] = pages.slice(0, 8).map(p => {
        const ii = p.imageinfo[0], m = ii.extmetadata || {};
        return { title: p.title.replace(/^File:/, ''), thumb: ii.thumburl, page: ii.descriptionurl, artist: strip(m.Artist?.value).slice(0, 40) || 'Wikimedia', lic: strip(m.LicenseShortName?.value) || 'freie Lizenz' };
      });
    } catch (e) { wikiCache[r.id] = []; }
    if (current === r.id) renderDetail(r.id);
  }

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
        <label>Tageskarte hätte gekostet <input type="number" id="ciPrice" inputmode="decimal" step="0.5" min="0" value="${p ?? ''}" placeholder="€"></label>
      </div>
      <p class="note" id="ciErr" style="color:var(--red)"></p>
      <button class="btn primary wide" id="ciGo">Skitag eintragen</button>`);
    $('#ciGo').onclick = () => {
      const d = $('#ciDate').value, pr = parseFloat(String($('#ciPrice').value).replace(',', '.'));
      if (!d) { $('#ciErr').textContent = 'Bitte ein Datum wählen.'; return; }
      if (isNaN(pr) || pr < 0) { $('#ciErr').textContent = 'Bitte den Tageskartenpreis eintragen.'; return; }
      const same = S.checkins.find(c => c.date === d);
      if (same && !$('#ciGo').dataset.confirm) {
        $('#ciErr').textContent = `Am ${fmtDate(d)} bist du schon in ${byId[same.id]?.name || same.id} eingecheckt. Nochmal tippen ersetzt den Eintrag.`;
        $('#ciGo').dataset.confirm = '1'; return;
      }
      if (same) S.checkins = S.checkins.filter(c => c !== same);
      if (S.prices[id] == null && r.price == null) S.prices[id] = pr; // unbekannten Preis merken
      S.checkins.push({ date: d, id, price: pr, fuel: Math.round(fuelCost(r) * 100) / 100 });
      S.checkins.sort((a, b) => a.date.localeCompare(b.date));
      save(); closeModal(); drawPins();
      if (current) renderDetail(current);
      const bal = balance();
      toast(bal.saved >= 0 ? `Eingecheckt · ${eur(bal.saved)} gespart` : `Eingecheckt · noch ${eur(-bal.saved)} bis der Pass sich lohnt`);
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
  function balance() {
    const value = S.checkins.reduce((a, c) => a + c.price, 0);
    const fuel = S.checkins.reduce((a, c) => a + (c.fuel || 0), 0);
    const days = S.checkins.length;
    return { value, fuel, days, saved: value - S.settings.pass, perDay: days ? (S.settings.pass + fuel) / days : null };
  }
  function openWallet() {
    const b = balance(), pass = S.settings.pass, pos = b.saved >= 0;
    const pct = Math.min(100, pass ? b.value / pass * 100 : 0);
    const list = S.checkins.slice().reverse();
    modal(`
      <div class="mHead"><div class="h2">Pass-Bilanz 26/27</div><button class="iconBtn" data-close aria-label="Schließen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="big num ${pos ? 'pos' : 'neg'}">${pos ? '+' : '−'}${eur(Math.abs(b.saved))}</div>
      <div class="muted">${pos ? 'durch den Pass gespart' : 'noch abzufahren, bis sich der Pass lohnt'}</div>
      <div class="bar"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="muted small num">${eur(b.value)} von ${eur(pass)} Passpreis an Tageskarten abgefahren</div>
      <div class="tiles num">
        <div><span>Skitage</span><b>${b.days}</b></div>
        <div><span>Sprit gesamt</span><b>${eur(b.fuel)}</b></div>
        <div><span>Kosten / Skitag</span><b>${b.perDay == null ? '–' : eur(b.perDay)}</b></div>
      </div>
      <ul class="cList num">${list.length ? list.map((c, i) => `<li><span class="t">${fmtDate(c.date)} · ${esc(byId[c.id]?.name || c.id)}<br><span class="muted small">Sprit ${eur(c.fuel || 0)}</span></span><span class="p">+${eur(c.price)}</span><button class="del" data-del="${S.checkins.length - 1 - i}" aria-label="Löschen">✕</button></li>`).join('')
        : '<li class="muted">Noch keine Skitage. Öffne ein Gebiet und tippe „Heute hier einchecken“.</li>'}</ul>
      <details><summary>Einstellungen</summary>
        <div class="form">
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
    num($('#setPass'), 'pass'); num($('#setCons'), 'cons'); num($('#setFuel'), 'fuel');
    $('#fuelLive').onclick = async () => {
      $('#fuelLive').textContent = 'Lade …';
      try {
        const j = await (await fetch('https://api.e-control.at/sprit/1.0/search/gas-stations/by-address?latitude=47.41&longitude=9.74&fuelType=SUP&includeClosed=false')).json();
        const pr = j.map(s => s.prices?.[0]?.amount).filter(Boolean).slice(0, 5);
        if (!pr.length) throw new Error('leer');
        S.settings.fuel = Math.round(pr.reduce((a, b) => a + b, 0) / pr.length * 1000) / 1000; save();
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

  /* ---------- 8) Auslosen ---------- */
  function openDice() {
    const o = JSON.parse(localStorage.getItem('dreitaeler-dice') || '{"fav":false,"max":"0","snow":false,"big":false}');
    modal(`
      <div class="mHead"><div class="h2">Skigebiet auslosen</div><button class="iconBtn" data-close aria-label="Schließen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="opts">
        <label>Nur Favoriten <input type="checkbox" id="dFav" ${o.fav ? 'checked' : ''}></label>
        <label>Nur mit Neuschnee <input type="checkbox" id="dSnow" ${o.snow ? 'checked' : ''}></label>
        <label>Nur große/mittlere (≥ 8 km) <input type="checkbox" id="dBig" ${o.big ? 'checked' : ''}></label>
        <label>Maximale Fahrtzeit
          <select id="dMax"><option value="0">egal</option><option value="60">1 h</option><option value="80">1:20 h</option><option value="100">1:40 h</option></select></label>
      </div>
      <div class="result" id="dRes"><span class="muted">Tippe auf „Würfeln“</span></div>
      <button class="btn primary wide" id="dGo">Würfeln</button>`, 'dice');
    $('#dMax').value = o.max;
    $('#dGo').onclick = () => {
      const opt = { fav: $('#dFav').checked, snow: $('#dSnow').checked, big: $('#dBig').checked, max: $('#dMax').value };
      localStorage.setItem('dreitaeler-dice', JSON.stringify(opt));
      const pool = R.filter(r => !r.noSki && (!opt.fav || isFav(r.id)) && (!opt.snow || FILTERS.snow(r)) && (!opt.big || sizeKm(r) >= 8) && (opt.max === '0' || r.driveMin <= +opt.max));
      if (!pool.length) { $('#dRes').innerHTML = '<span class="muted">Kein Gebiet passt zu diesen Bedingungen.</span>'; return; }
      const pick = pool[Math.floor(Math.random() * pool.length)];
      let n = 0;
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const spin = setInterval(() => {
        const t = pool[Math.floor(Math.random() * pool.length)];
        $('#dRes').innerHTML = `<div class="rn">${esc(t.name)}</div>`;
        if (++n > (reduce ? 0 : 12)) { clearInterval(spin); showPick(pick); }
      }, 70);
    };
    function showPick(r) {
      const s = snow[r.id];
      $('#dRes').innerHTML = `<div class="rn">${esc(r.name)}</div>
        <div class="num">${drive(r)} · Sprit ${eur(fuelCost(r))}</div>
        <div class="muted small num">${s ? `Neuschnee gestern ${cm(s.y)} · morgen ${cm(s.m)}` : ''} · Panorama ${panoOf(r)}/5</div>
        <button class="btn" style="margin-top:8px" id="dShow">Anzeigen</button>`;
      $('#dShow').onclick = () => { closeModal(); openDetail(r.id, true); };
    }
  }

  /* ---------- 9) Bedienung ---------- */
  // Dialoge
  function modal(html, kind) { $('#modal').innerHTML = html; $('#modal').dataset.kind = kind || ''; $('#modalWrap').hidden = false; }
  function closeModal() { $('#modalWrap').hidden = true; $('#modal').innerHTML = ''; }
  $('#modalWrap').addEventListener('click', e => { if (e.target.id === 'modalWrap' || e.target.closest('[data-close]')) closeModal(); });

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
  const VIS = { peek: () => 150, half: () => Math.round(window.innerHeight * .5), full: () => H() };
  const sheetVisible = () => VIS[sheet.dataset.state]();
  function setSheet(state) {
    sheet.dataset.state = state;
    sheet.style.transform = `translateY(${H() - VIS[state]()}px)`;
    // Der nach unten verschobene Teil des Blatts ist unsichtbar → genauso viel Platz unten anhängen, damit man alles erreicht
    $('#sheetBody').style.paddingBottom = `calc(${H() - VIS[state]()}px + env(safe-area-inset-bottom) + 14px)`;
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
      setSheet({ peek: 'half', half: 'full', full: 'peek' }[sheet.dataset.state]);
    } else {
      const vis = H() - (drag.start + (e.clientY - drag.y));
      const opts = ['peek', 'half', 'full'].map(s => [s, Math.abs(VIS[s]() - vis)]).sort((a, b) => a[1] - b[1]);
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
  $('#btnDice').onclick = openDice;

  // Standort: zeigt dich auf der Karte und bietet den Check-in an, wenn du in einem Gebiet bist
  let me = null;
  $('#btnLocate').onclick = () => {
    if (!navigator.geolocation) { toast('Standort wird nicht unterstützt'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      if (!me) me = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18] }), interactive: false }).addTo(map);
      else me.setLatLng(ll);
      const near = R.map(r => ({ r, d: map.distance(ll, [r.lat, r.lon]) })).sort((a, b) => a.d - b.d)[0];
      if (near.d < 5000 && !near.r.noSki) {
        openDetail(near.r.id, true);
        toast(`Du bist bei ${near.r.name}`, 'Einchecken', () => openCheckin(near.r.id));
      } else {
        map.flyTo(ll, Math.max(map.getZoom(), 10));
        toast(`Nächstes Gebiet: ${near.r.name} (${(near.d / 1000).toFixed(0)} km Luftlinie)`);
      }
    }, () => toast('Standort nicht freigegeben'), { enableHighAccuracy: true, timeout: 10000 });
  };

  // Start
  drawPins();
  renderList();
  setSheet('peek');
  loadSnow();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadSnow(); });
})();
