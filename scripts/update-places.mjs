// Daily refresh of apprenticeship places, read from the public orientation.ch search pages
// (what a visitor sees: "N places d'apprentissage trouvées" and the result cards), for every profession id in OC_INFO.
// Usage: node scripts/update-places.mjs <out/places.json> [prev.json] [--limit N]
// Writes places.json (CH / VD count per métier) and vd-places.json (Vaud listings for the map) next to each other.
// Ids that fail keep yesterday's values (prev.json / prev-vd.json), so a bad day never blanks the site.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';

const [out = '_site/places.json', prevPath = ''] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const li = process.argv.indexOf('--limit'), LIMIT = li > 0 ? +process.argv[li + 1] : Infinity;
const SEARCH = 'https://www.orientation.ch/fr/recherche/apprentissages';
const CONCURRENCY = 3, PAUSE_MS = 400;
const mapOut = out.replace(/places\.json$/, 'vd-places.json');

const html = readFileSync(new URL('../fenetre-ouverte-mindmap.html', import.meta.url), 'utf8');
const line = html.split('\n').find(l => l.startsWith('const OC_INFO = '));
const info = JSON.parse(line.slice(line.indexOf('{'), line.lastIndexOf('}') + 1));
const ids = [...new Set(Object.values(info).map(v => v.id).filter(Boolean))].slice(0, LIMIT);

const readJSON = (p, def) => { try { return p && existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : def; } catch { return def; } };
const prev = readJSON(prevPath, { places: {} });
const prevMap = readJSON(prevPath.replace(/prev\.json$/, 'prev-vd.json'), { locs: [] });

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ locale: 'fr-CH', userAgent: 'azimut-places-bot (+https://raven-young.github.io/azimut/)' });
await ctx.route('**/*', r => ['image', 'font', 'media'].includes(r.request().resourceType()) ? r.abort() : r.continue());

// "2787 places d'apprentissage trouvées" / "1 place d'apprentissage trouvée" / "Aucun résultat".
// Waits for the text itself (not network idle: the site keeps background requests open) and for it to be stable.
async function count(page, qs) {
  await page.goto(`${SEARCH}?${qs}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const re = /([\d'’  ]+)\s+places? d.apprentissage trouvée/;
  let last = null;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(500);
    const t = await page.innerText('body').catch(() => '');
    const m = t.match(re), n = m ? +m[1].replace(/\D/g, '') : /Aucun résultat/.test(t) ? 0 : null;
    if (n !== null && n === last) return n;
    last = n;
  }
  throw new Error('count not found for ' + qs);
}

// All result cards of the current page: « Afficher plus » adds 10 at a time. The place of training comes from the
// card's map link ("…Rue du Château 5 1376 Goumoens-la-Ville"); only company, métier, address and places are kept.
async function cards(page) {
  const more = page.getByRole('button', { name: 'Afficher plus' });
  const n = () => page.locator('.search-result').count();
  for (let guard = 0; guard < 400 && await more.count(); guard++) {
    const before = await n();
    await more.first().evaluate(b => b.click());          // DOM click: an overlay sometimes intercepts pointer clicks
    for (let i = 0; i < 40 && await n() === before; i++) {
      await page.waitForTimeout(300);
      if (i % 10 === 9 && await more.count()) await more.first().evaluate(b => b.click());
    }
    if (await n() === before) throw new Error('list stopped growing at ' + before);
  }
  return page.$$eval('.search-result', rs => rs.map(r => [
    r.querySelector('.search-result-sup-title')?.innerText.trim() || '',
    r.querySelector('.search-result-title')?.innerText.trim() || '',
    decodeURIComponent(r.querySelector('a[href*="maps.google"]')?.href.split('?q=')[1] || ''),
    +(r.querySelector('.apprenticeship-result-body-places')?.textContent.match(/\d+/) || [1])[0],   // a listing can offer several places
  ]));
}

const places = {}, failed = [], rows = new Map();
const jobs = [{ id: '*', qs: '' }, ...ids.map(id => ({ id, qs: 'profession=' + id }))];
async function worker() {
  const page = await ctx.newPage();
  while (jobs.length) {
    const job = jobs.shift();
    for (let attempt = 1; ; attempt++) {
      try {
        const ch = await count(page, job.qs);
        const vd = await count(page, (job.qs ? job.qs + '&' : '') + 'canton=VD');
        const list = job.id !== '*' && vd > 0 ? await cards(page) : [];
        places[job.id] = { ch, vd };
        for (const r of list) rows.set(r.slice(0, 3).join('|'), r);     // ids can overlap: one row per listing
        break;
      } catch (e) {
        if (attempt < 2) { await page.waitForTimeout(3000); continue; }
        failed.push(job.id);
        if (prev.places[job.id]) places[job.id] = prev.places[job.id];
        console.error('FAIL', job.id.slice(0, 40), e.message.split('\n')[0]);
        break;
      }
    }
    await page.waitForTimeout(PAUSE_MS);
  }
  await page.close();
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await browser.close();

const ok = ids.length + 1 - failed.length;
console.log(`ok ${ok}/${ids.length + 1}, failed ${failed.length}`);
if (ok < (ids.length + 1) / 2) {               // mostly broken (site change?): keep yesterday's files as they are
  if (prev.updated) writeFileSync(out, JSON.stringify(prev));
  if (prevMap.updated) writeFileSync(mapOut, JSON.stringify(prevMap));
  console.error('Too many failures: kept previous data');
  process.exit(1);
}
const { '*': total, ...byId } = places;
writeFileSync(out, JSON.stringify({ updated: new Date().toISOString(), total, places: byId }));
console.log('wrote', out, 'total', total);

// ---- Vaud map: listings grouped by locality (one dot per locality; Lausanne has several postcodes) ----
const geoCache = new Map(prevMap.locs.map(l => [(l.npa || '') + ' ' + l.name, [l.lat, l.lon]]));
const GEO_API = 'https://api3.geo.admin.ch/rest/services/api/SearchServer?type=locations&sr=4326&limit=5&';
const plain = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
async function geocode(npa, name) {             // swisstopo public search: postcode first, then commune name
  const k = npa + ' ' + name;
  if (geoCache.has(k) && geoCache.get(k)[0]) return geoCache.get(k);
  let hit = null;
  try {
    const z = (await (await fetch(GEO_API + 'origins=zipcode&searchText=' + npa)).json()).results || [];
    hit = z.find(r => plain(r.attrs.label).includes(plain(name))) || z[0];
    if (!hit) {
      const g = (await (await fetch(GEO_API + 'origins=gg25&searchText=' + encodeURIComponent(name))).json()).results || [];
      hit = g.find(r => /\(VD\)/.test(r.attrs.label)) || g[0];
    }
  } catch {}
  await new Promise(r => setTimeout(r, 150));
  return hit ? [+hit.attrs.lat.toFixed(4), +hit.attrs.lon.toFixed(4)] : null;
}
const locs = new Map();
for (const [co, title, addr, n] of rows.values()) {
  const m = addr.match(/(\d{4})\s+([^\d]+?)\s*$/);
  if (!m) continue;
  const k = m[2].replace(/\s+\d+$/, '');
  if (!locs.has(k)) locs.set(k, { k, name: k, npa: m[1], items: [] });
  locs.get(k).items.push(n > 1 ? [co, title, n] : [co, title]);
}
for (const l of locs.values()) { const g = await geocode(l.npa, l.name); if (g) [l.lat, l.lon] = g; }
const list = [...locs.values()].filter(l => l.lat);
const nPlaces = list.reduce((a, l) => a + l.items.reduce((b, it) => b + (it[2] || 1), 0), 0);
console.log(`vd map: ${rows.size} listings, ${nPlaces} places on the map, ${locs.size} localities, ${list.length} geocoded`);
if (rows.size > 100) writeFileSync(mapOut, JSON.stringify({ updated: new Date().toISOString(), n: nPlaces, listings: rows.size, locs: list }));
else if (prevMap.updated) writeFileSync(mapOut, JSON.stringify(prevMap));
