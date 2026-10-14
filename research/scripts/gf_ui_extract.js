(async () => {
  // Reads a loaded Google Flights results page (the page Google itself rendered; nothing is replayed or forged).
  // Waits for results, parses the itinerary labels, keeps the cheapest itinerary per airline plus the fastest one,
  // and returns compact JSON. Stops and says so if Google shows a CAPTCHA or "unusual traffic" page.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const t0 = Date.now();
  let done = false;
  while (Date.now() - t0 < 20000) {
    const txt = document.body ? document.body.innerText : '';
    if (/unusual traffic|not a robot|captcha/i.test(txt)) return JSON.stringify({ blocked: true });
    if (/\d+ results? returned|No results returned|No options matching/i.test(txt)) { done = true; break; }
    await sleep(500);
  }
  await sleep(600);
  const MONTHS = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };
  const clock = (s) => { const m = s.match(/(\d{1,2}):(\d\d)\s*([AP])M/); if (!m) return null; const h = (+m[1] % 12) + (m[3] === 'P' ? 12 : 0); return String(h).padStart(2, '0') + ':' + m[2]; };
  const iso = (s) => { const m = s.trim().match(/(\w+) (\d{1,2})$/); if (!m || !MONTHS[m[1]]) return null; const mo = MONTHS[m[1]]; return `${mo < 6 ? 2027 : 2026}-${String(mo).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`; };
  const mins = (s) => { const h = s.match(/(\d+)\s*hr/), m = s.match(/(\d+)\s*min/); return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0); };
  const parse = (raw) => {
    const l = raw.replace(/[  ]/g, ' ');
    const p = l.match(/From ([\d,]+) euros/);
    if (!p) return null;
    const it = { price: +p[1].replace(/,/g, ''), roundTripTotal: /round trip total/.test(l), noOverheadBin: /(does not|may not) include overhead bin access/.test(l) };
    let m = l.match(/(Nonstop|(\d+) stops?) flight with (.+?)\.(?: |$)/);
    it.stops = m ? (m[1] === 'Nonstop' ? 0 : +m[2]) : null;
    it.airlines = m ? m[3].trim() : null;
    m = l.match(/Operated by (.+?)\.(?: |$)/);
    it.operatedBy = m ? m[1].trim() : null;
    m = l.match(/Leaves (.+?) at (\d{1,2}:\d\d ?[AP]M) on (\w+day, \w+ \d{1,2}) and arrives at (.+?) at (\d{1,2}:\d\d ?[AP]M) on (\w+day, \w+ \d{1,2})\./);
    if (m) Object.assign(it, { depAirportName: m[1], depTime: clock(m[2]), depDate: iso(m[3]), arrAirportName: m[4], arrTime: clock(m[5]), arrDate: iso(m[6]) });
    m = l.match(/Total duration ((?:\d+ hr ?)?(?:\d+ min)?)/);
    it.durationMin = m ? mins(m[1]) : null;
    it.layovers = [...l.matchAll(/Layover \((\d) of (\d)\) is an? (.+?) (overnight )?layover at (.+?)(?: in (.+?))?\.(?: |$)/g)].map((x) => ({ min: mins(x[3]), overnight: !!x[4], airport: x[5], city: x[6] || null }));
    it.changeAirport = /change airports|requires changing airports/i.test(l);
    it.separateTickets = /separate tickets|self transfer/i.test(l);
    return it;
  };
  const labels = [...new Set([...document.querySelectorAll('[aria-label^="From "]')].map((e) => e.getAttribute('aria-label')).filter((l) => /flight with/.test(l)))];
  const its = labels.map(parse).filter(Boolean).sort((a, b) => a.price - b.price || (a.durationMin || 9999) - (b.durationMin || 9999));
  const keep = new Map();
  for (const it of its) if (!keep.has(it.airlines)) keep.set(it.airlines, it);
  const cheapest = its.length ? its[0].price : 0;
  const fastest = its.slice().sort((a, b) => (a.durationMin || 9999) - (b.durationMin || 9999))[0];
  if (fastest && fastest.price <= cheapest * 1.25) keep.set('__fastest__' + fastest.airlines, fastest);
  return JSON.stringify({ done, n: labels.length, its: [...keep.values()] });
})()
