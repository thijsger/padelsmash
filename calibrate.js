#!/usr/bin/env node
// Swing-calibratie: leest gelabelde slagen (label-mode van de watch) en rekent
// nieuwe centroids + scale uit voor het 6-klassen model in SwingCounter.mc.
//
// Gebruik:
//   node calibrate.js <pin> [betaKey]                 # haalt live van rallypoint.pro
//   node calibrate.js --file beta-label.jsonl         # uit een lokaal jsonl-bestand
//   node calibrate.js <pin> <betaKey> --weak          # neem OOK zwakke labels mee (l 0/1/2)
//
// Standaard gebruikt hij alleen ground-truth labels (label-mode, weak=false) met
// een echte klasse l in 0..5 en een feature-vector f. Plak de output in
// SwingCounter.mc: de regels `SCALE` en `CENT`.

const https = require('https');
const fs = require('fs');

const CLASSES = ['forehand','backhand','volley_forehand','volley_backhand','smash','lob'];
const FEAT = ['gx','gy','gz','ax','ay','az','dur','amag'];
const HOST = 'rallypoint.pro';

const args = process.argv.slice(2);
const useWeak = args.includes('--weak');
const fileIdx = args.indexOf('--file');

function fetchRows() {
  if (fileIdx >= 0) {
    const p = args[fileIdx + 1];
    const lines = fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean);
    return Promise.resolve(lines.map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean));
  }
  const pin = args.find(a => /^\d{3,5}$/.test(a));
  const key = args.find(a => a.startsWith('rp-')) || 'rp-swing-9f3a2c';
  if (!pin) { console.error('Geef een PIN of --file <bestand>.'); process.exit(1); }
  const url = `https://${HOST}/beta/label/${pin}?beta=${encodeURIComponent(key)}`;
  return new Promise((resolve, reject) => {
    https.get(url, r => {
      let b = ''; r.on('data', c => b += c);
      r.on('end', () => { try { resolve(JSON.parse(b).data || []); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function mean(xs) { return xs.reduce((a, b) => a + b, 0) / xs.length; }
function std(xs, m) { return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / Math.max(1, xs.length - 1)); }
function fmt(x) { return (Math.round(x * 10) / 10).toFixed(1); }

(async () => {
  const rows = await fetchRows();
  // Bruikbare rijen: feature-vector f aanwezig, echte klasse l in 0..5.
  // Zwakke labels (weak=true) alleen als --weak; die kennen enkel l 0/1/2.
  const good = rows.filter(r => Array.isArray(r.f) && r.f.length === 8 &&
    Number.isInteger(r.l) && r.l >= 0 && r.l <= 5 && (useWeak || !r.weak));

  if (!good.length) {
    console.error('Geen bruikbare gelabelde slagen gevonden (f + l 0..5). Heb je in label-mode gelabeld met de nieuwe build?');
    process.exit(1);
  }

  const byClass = CLASSES.map(() => []);
  for (const r of good) { byClass[r.l].push(r.f); }

  console.log(`\nGelabelde slagen: ${good.length} (van ${rows.length} rijen)`);
  CLASSES.forEach((c, k) => {
    const n = byClass[k].length;
    const flag = n === 0 ? '  ⚠️ LEEG' : n < 10 ? '  ⚠️ weinig (<10)' : '';
    console.log(`  ${k} ${c.padEnd(16)}: ${n}${flag}`);
  });

  // SCALE = globale std per feature (over alle samples). Nooit 0.
  const allF = good.map(r => r.f);
  const scale = FEAT.map((_, j) => {
    const col = allF.map(f => f[j]);
    const s = std(col, mean(col));
    return s < 1 ? 1 : s;
  });

  // CENT = gemiddelde feature-vector per klasse. Lege klasse -> oude waarde behouden
  // is niet mogelijk hier; we laten 'm op 0 en waarschuwen (plak dan die regel niet).
  const cent = byClass.map(fs => fs.length
    ? FEAT.map((_, j) => mean(fs.map(f => f[j])))
    : null);

  // Zelf-check: classificeer elke gelabelde slag met de NIEUWE centroids.
  let ok = 0, tot = 0;
  const conf = CLASSES.map(() => CLASSES.map(() => 0));
  for (const r of good) {
    if (!cent[r.l]) continue;
    let best = -1, bd = 1e18;
    for (let k = 0; k < 6; k++) {
      if (!cent[k]) continue;
      let d = 0;
      for (let j = 0; j < 8; j++) { const z = (r.f[j] - cent[k][j]) / scale[j]; d += z * z; }
      if (d < bd) { bd = d; best = k; }
    }
    conf[r.l][best]++; tot++; if (best === r.l) ok++;
  }

  console.log(`\nZelf-check (nieuwe centroids op eigen data): ${ok}/${tot} = ${(100 * ok / tot).toFixed(1)}% correct`);
  console.log('confusie (rij=echt, kol=voorspeld):');
  console.log('        ' + CLASSES.map(c => c.slice(0, 5).padStart(6)).join(''));
  conf.forEach((row, i) => console.log(CLASSES[i].slice(0, 7).padEnd(8) + row.map(n => String(n).padStart(6)).join('')));

  // ---- Output om te plakken in SwingCounter.mc ----
  console.log('\n// ---- plak dit in SwingCounter.mc ----');
  console.log(`    private const SCALE = [${scale.map(fmt).join(', ')}];`);
  console.log('    private const CENT = [');
  cent.forEach((row, k) => {
    if (!row) { console.log(`        // ${k} ${CLASSES[k]}: GEEN DATA — oude regel laten staan`); return; }
    const comma = k < 5 ? ',' : '';
    console.log(`        [${row.map(fmt).join(', ')}]${comma}   // ${k} ${CLASSES[k]}`);
  });
  console.log('    ];');
})();
