// Daily refresh of apprenticeship-place counts, read from the public orientation.ch search pages
// (the same "N places d'apprentissage trouvées" a visitor sees), for every profession id in OC_INFO.
// Usage: node scripts/update-places.mjs <out/places.json> [prev.json] [--limit N] [--map-only]
// Also writes vd-places.json next to it (falls back to prev-vd.json next to prev.json).
// Ids that fail keep their value from previous.json, so a bad day never blanks the site.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';

const [out = '_site/places.json', prevPath] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const li = process.argv.indexOf('--limit'), LIMIT = li > 0 ? +process.argv[li + 1] : Infinity;
const SEARCH = 'https://www.orientation.ch/fr/recherche/apprentissages';
const CONCURRENCY = 3, PAUSE_MS = 400;

const html = readFileSync(new URL('../fenetre-ouverte-mindmap.html', import.meta.url), 'utf8');
const line = html.split('\n').find(l => l.startsWith('const OC_INFO = '));
const info = JSON.parse(line.slice(line.indexOf('{'), line.lastIndexOf('}') + 1));
const ids = [...new Set(Object.values(info).map(v => v.id).filter(Boolean))].slice(0, LIMIT);

let prev = { places: {} };
if (prevPath && existsSync(prevPath)) try { prev = JSON.parse(readFileSync(prevPath, 'utf8')); } catch {}

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await browser.newContext({ locale: 'fr-CH', userAgent: 'azimut-places-bot (+https://raven-young.github.io/azimut/)' });
await ctx.route('**/*', r => ['image', 'font', 'media'].includes(r.request().resourceType()) ? r.abort() : r.continue());

// "2787 places d'apprentissage trouvées" / "1 place d'apprentissage trouvée" / "Aucun résultat"
async function count(page, qs) {
  await page.goto(`${SEARCH}?${qs}`, { waitUntil: 'networkidle', timeout: 45000 });
  const re = /([\d'’  ]+)\s+places? d.apprentissage trouvée/;
  for (let i = 0; i < 20; i++) {
    const t = await page.innerText('main').catch(() => page.innerText('body'));
    const m = t.match(re);
    if (m) return +m[1].replace(/\D/g, '');
    if (/Aucun résultat/.test(t)) return 0;
    await page.waitForTimeout(500);
  }
  throw new Error('count not found for ' + qs);
}

const places = {}, failed = [];
const MAP_ONLY = process.argv.includes('--map-only');   // testing: only the Vaud map list
const jobs = MAP_ONLY ? [] : [{ id: '*', qs: '' }, ...ids.map(id => ({ id, qs: 'profession=' + id }))];
async function worker() {
  const page = await ctx.newPage();
  while (jobs.length) {
    const { id, qs } = jobs.shift();
    try {
      const ch = await count(page, qs);
      const vd = await count(page, (qs ? qs + '&' : '') + 'canton=VD');
      places[id] = { ch, vd };
    } catch (e) {
      failed.push(id);
      if (prev.places[id]) places[id] = prev.places[id];
      console.error('FAIL', id, e.message.split('\n')[0]);
    }
    await page.waitForTimeout(PAUSE_MS);
  }
  await page.close();
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// ---- Vaud map: every Vaud listing (company, métier, place of training), grouped by postcode + locality ----
// The list shows 10 cards per « Afficher plus »; the place of training comes from the card's map link
// ("…Rue du Château 5 1376 Goumoens-la-Ville"). Only company, métier and locality are kept (no contact names).
const mapOut = out.replace(/places\.json$/, 'vd-places.json');
const prevMap = (() => { try { return JSON.parse(readFileSync((prevPath || '').replace(/prev\.json$/, 'prev-vd.json'), 'utf8')); } catch { return { locs: [] }; } })();
async function scrapeVD() {
  const page = await ctx.newPage();
  await page.goto(`${SEARCH}?canton=VD`, { waitUntil: 'networkidle', timeout: 60000 });
  const more = page.getByRole('button', { name: 'Afficher plus' });
  const cards = () => page.locator('.search-result').count();
  for (let guard = 0; guard < 2000 && await more.count(); guard++) {
    const before = await cards();
    await more.first().evaluate(b => b.click());          // DOM click: an overlay sometimes intercepts pointer clicks
    await page.waitForLoadState('networkidle');
    for (let i = 0; i < 30 && await cards() === before; i++) {
      await page.waitForTimeout(300);
      if (i % 10 === 9 && await more.count()) await more.first().evaluate(b => b.click());
    }
    if (await cards() === before) break;
  }
  const rows = await page.$$eval('.search-result', rs => rs.map(r => [
    r.querySelector('.search-result-sup-title')?.innerText.trim() || '',
    r.querySelector('.search-result-title')?.innerText.trim() || '',
    decodeURIComponent(r.querySelector('a[href*="maps.google"]')?.href.split('?q=')[1] || ''),
    +(r.querySelector('.apprenticeship-result-body-places .mantine-Badge-label, .apprenticeship-result-body-places')?.textContent.match(/\d+/) || [1])[0],   // a listing can offer several places
  ]));
  await page.close();
  return rows;
}
const geoCache = new Map(prevMap.locs.map(l => [(l.npa || '') + ' ' + l.name, [l.lat, l.lon]]));
const GEO_API = 'https://api3.geo.admin.ch/rest/services/api/SearchServer?type=locations&sr=4326&limit=5&';
async function geocode(npa, name) {
  const k = npa + ' ' + name;
  if (geoCache.has(k)) return geoCache.get(k);
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
  let hit = null;
  try {
    const z = (await (await fetch(GEO_API + 'origins=zipcode&searchText=' + npa)).json()).results || [];
    hit = z.find(r => norm(r.attrs.label).includes(norm(name))) || z[0];
    if (!hit) {
      const g = (await (await fetch(GEO_API + 'origins=gg25&searchText=' + encodeURIComponent(name))).json()).results || [];
      hit = g.find(r => /\(VD\)/.test(r.attrs.label)) || g[0];
    }
  } catch {}
  const v = hit ? [+hit.attrs.lat.toFixed(4), +hit.attrs.lon.toFixed(4)] : null;
  geoCache.set(k, v);
  await new Promise(r => setTimeout(r, 150));
  return v;
}
try {
  const rows = await scrapeVD();
  const locs = new Map();
  for (const [co, title, addr, n] of rows) {
    const m = addr.match(/(\d{4})\s+([^\d]+?)\s*$/);
    if (!m) continue;
    const k = m[2].replace(/\s+\d+$/, '');                // one dot per locality (Lausanne has several postcodes)
    if (!locs.has(k)) locs.set(k, { k, name: k, npa: m[1], items: [] });
    locs.get(k).items.push(n > 1 ? [co, title, n] : [co, title]);
  }
  for (const l of locs.values()) { const g = await geocode(l.npa, l.name); if (g) [l.lat, l.lon] = g; }
  const list = [...locs.values()].filter(l => l.lat);
  const nPlaces = rows.reduce((a, r) => a + r[3], 0);
  console.log(`vd map: ${rows.length} listings, ${nPlaces} places, ${locs.size} localities, ${list.length} geocoded`);
  if (rows.length > 100) writeFileSync(mapOut, JSON.stringify({ updated: new Date().toISOString(), n: nPlaces, listings: rows.length, locs: list }));
  else throw new Error('too few cards');
} catch (e) {
  console.error('vd map failed:', e.message);
  if (prevMap.updated) writeFileSync(mapOut, JSON.stringify(prevMap));
}
await browser.close();

if (MAP_ONLY) process.exit(0);
const ok = ids.length + 1 - failed.length;
console.log(`ok ${ok}/${ids.length + 1}, failed ${failed.length}`);
if (ok < (ids.length + 1) / 2) {               // mostly broken (site change?): keep yesterday's file as is
  if (prev.updated) { writeFileSync(out, JSON.stringify(prev)); console.error('Too many failures: kept previous data'); }
  process.exit(1);
}
const { '*': total, ...byId } = places;
writeFileSync(out, JSON.stringify({ updated: new Date().toISOString(), total, places: byId }));
console.log('wrote', out, 'total', total);
