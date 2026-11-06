// One-off: turns the swiss-maps 2025 TopoJSON (BFS ids; cdn.jsdelivr.net/npm/swiss-maps@4.7.0/2025/ch-combined.json)
// into pre-projected SVG paths for the « Trouver place d'apprentissage » view, printed as one `const GEO = …;` line.
// Usage: node scripts/build-geo.mjs ch-combined.json > geo.js
import { readFileSync } from 'node:fs';
import { feature, mesh, merge } from 'topojson-client';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { geoMercator, geoPath } from 'd3-geo';

const topo = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const W = 1000, H = 640, VD = 22, isVD = id => id >= 5401 && id <= 5939;
const coarse = simplify(presimplify(structuredClone(topo)), quantile(presimplify(structuredClone(topo)), 0.93));
const fine = simplify(presimplify(structuredClone(topo)), quantile(presimplify(structuredClone(topo)), 0.25));

const proj = geoMercator().fitExtent([[10, 10], [W - 10, H - 10]], feature(coarse, coarse.objects.country));
const r = s => s && s.replace(/(\d+\.\d)\d+/g, '$1');     // 0.1 unit precision
const path = geoPath(proj), P = g => r(path(g));
const ri = s => s.replace(/(\d+)\.\d+/g, '$1').replace(/L(-?\d+),(-?\d+)(?=L\1,\2(?!\d))/g, ''); // whole units for the Swiss-scale layers

const ch = ri(P(feature(coarse, coarse.objects.country)));
const cantons = ri(P(mesh(coarse, coarse.objects.cantons, (a, b) => a !== b)));
const vdGeoms = fine.objects.municipalities.geometries.filter(g => isVD(g.id));
const vd = P(merge(fine, vdGeoms));
const communes = P(mesh(fine, { type: 'GeometryCollection', geometries: vdGeoms }, (a, b) => a !== b));
const lakes = P(feature(fine, fine.objects.lakes));
const [[x0, y0], [x1, y1]] = path.bounds(merge(fine, vdGeoms));

console.log('const GEO = ' + JSON.stringify({
  w: W, h: H, scale: +proj.scale().toFixed(3), translate: proj.translate().map(v => +v.toFixed(3)),
  vdBox: [x0, y0, x1 - x0, y1 - y0].map(v => +v.toFixed(1)),
  ch, cantons, vd, communes, lakes,
}) + ';');
