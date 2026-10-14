(async (n) => {
  // Runs on a www.flysas.com page (SAS's own offers API, same origin, the page's own session). Takes the next `n` pending
  // one-way searches from localStorage '__sastasks' (keys FROM-TO-YYYYMMDD), keeps the cheapest, the best value (price plus
  // EUR 2 an hour) and the fastest itinerary within 25 % of the cheapest, and returns them as compact JSON. Results also
  // stay in localStorage '__sasr' so a reload loses nothing. Stops and says so if SAS answers with an error or a challenge.
  const tasks = JSON.parse(localStorage.getItem('__sastasks') || '[]');
  const res = JSON.parse(localStorage.getItem('__sasr') || '{}');
  const todo = tasks.filter((k) => !(k in res)).slice(0, n || 5);
  const mins = (s) => { const m = String(s || '').match(/(\d+):(\d\d)/); return m ? +m[1] * 60 + +m[2] : null; };
  const out = {};
  for (const key of todo) {
    const [from, to, d] = key.split('-');
    const u = `/api/offers/flights?to=${to}&from=${from}&outDate=${d}&adt=1&chd=0&inf=0&yth=0&bookingFlow=revenue&pos=no&channel=web&displayType=upsell`;
    let r, txt;
    try { r = await fetch(u, { credentials: 'include' }); txt = await r.text(); } catch (e) { return JSON.stringify({ error: 'fetch failed: ' + e, done: out }); }
    if (/challenge|captcha|just a moment/i.test(txt.slice(0, 2000)) && !txt.startsWith('{')) return JSON.stringify({ blocked: true, status: r.status, done: out });
    let j = null;
    try { j = JSON.parse(txt); } catch (e) {}
    if (!j) { out[key] = { s: r.status, o: [] }; res[key] = out[key]; continue; }
    const its = [];
    for (const f of Object.values(j.outboundFlights || {})) {
      if (f.isSoldOut) continue;
      const e = (f.cabins || {}).ECONOMY || {};
      const price = (name) => { const p = Object.values((e[name] || {}).products || {})[0]; return p ? p.price.totalPrice : null; };
      const light = price('Light'), std = price('Standard');
      if (!light && !std) continue;
      const dur = Math.round((new Date(f.endTimeInGmt) - new Date(f.startTimeInGmt)) / 60000);
      const seats = Math.min(...Object.values((e.Light || e.Standard || {}).products || {}).flatMap((p) => (p.fares || []).map((x) => x.avlSeats)));
      its.push([light || std, std, f.startTimeInLocal.slice(11, 16), f.endTimeInLocal.slice(5, 16), dur, f.stops,
        (f.via || []).map((v) => v.code + ':' + mins(v.haltDuration)).join('/'),
        f.segments.map((s) => (s.marketingCarrier || {}).code + s.flightNumber).join(' '),
        [...new Set(f.segments.map((s) => (s.operatingCarrier || {}).code))].join(','), isFinite(seats) ? seats : null, light ? 0 : 1]);
    }
    const cur = (j.currency || {}).code || (Object.values(j.outboundFlights || {})[0] || {}).currency || 'NOK';
    const keep = [];
    const add = (it) => { if (it && !keep.includes(it)) keep.push(it); };
    const byPrice = its.slice().sort((a, b) => a[0] - b[0] || a[4] - b[4]);
    add(byPrice[0]);
    add(its.slice().sort((a, b) => (a[0] / 10.7 + a[4] / 30) - (b[0] / 10.7 + b[4] / 30))[0]);
    if (byPrice[0]) add(its.filter((x) => x[0] <= byPrice[0][0] * 1.25).sort((a, b) => a[4] - b[4])[0]);
    out[key] = { s: r.status, c: cur, n: its.length, o: keep };
    res[key] = out[key];
    localStorage.setItem('__sasr', JSON.stringify(res));
    await new Promise((ok) => setTimeout(ok, 700 + Math.random() * 900));
  }
  const left = tasks.filter((k) => !(k in res)).length;
  return JSON.stringify({ left, done: out });
})
