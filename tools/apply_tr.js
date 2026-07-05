// Past de master-vertalingen toe op coach.html en history.html.
// Idempotent: verwijdert eerst een eventueel eerder geïnjecteerd blok.
const fs = require('fs');
const TR = JSON.parse(fs.readFileSync('tools/master_tr.json', 'utf8'));
const LANGS = Object.keys(TR); // it,pl,sv,da,nb,fi,cs,tr,ro,hu

const MARK_A = '/* __EXTRA_TR_START__ */';
const MARK_B = '/* __EXTRA_TR_END__ */';

function stripBlock(h) {
  const a = h.indexOf(MARK_A);
  if (a < 0) return h;
  const b = h.indexOf(MARK_B, a);
  if (b < 0) return h;
  return h.slice(0, a).replace(/\n$/, '') + h.slice(b + MARK_B.length);
}

// ---- coach.html: injecteer COACH_TR na de L()-definitie ----
{
  const F = 'public/beta/coach.html';
  let h = fs.readFileSync(F, 'utf8');
  h = stripBlock(h);
  const block = '\n' + MARK_A + '\nconst COACH_TR = ' + JSON.stringify(TR) + ';\n' + MARK_B + '\n';
  // injecteer direct na de L()-functie (na de eerste '}' die de functie sluit)
  const anchor = 'function L(nl,en){';
  const i = h.indexOf(anchor);
  if (i < 0) { console.error('coach: L() niet gevonden'); process.exit(1); }
  // vind einde van de functie (matchende sluit-accolade) — simpel: eerste "\n}" na de anchor
  const end = h.indexOf('\n}', i);
  const insertAt = end + 2;
  h = h.slice(0, insertAt) + block + h.slice(insertAt);
  fs.writeFileSync(F, h);
  console.log('coach.html: COACH_TR geïnjecteerd (' + LANGS.length + ' talen)');
}

// ---- history.html ----
{
  const F = 'public/history.html';
  let h = fs.readFileSync(F, 'utf8');
  h = stripBlock(h);

  // 1) HIST_TR + L2 opnieuw definiëren zodat het extra talen ondersteunt.
  //    De bestaande L2(nl,en) roepen we niet aan; we herdefiniëren de functie.
  const block = '\n' + MARK_A + '\n'
    + 'const HIST_TR = ' + JSON.stringify(TR) + ';\n'
    + 'function L2(nl,en){ if(currentLang===\'nl\')return nl; if(currentLang===\'en\')return en; var d=HIST_TR[currentLang]; return (d&&d[en]!=null)?d[en]:en; }\n'
    // I18N en SPORTS uitbreiden met de extra talen via de Engelse tekst
    + 'for(var _k in I18N){ var _e=I18N[_k]; if(_e&&_e.en!=null){ for(var _lg in HIST_TR){ if(I18N[_k][_lg]==null){ var _t=HIST_TR[_lg][_e.en]; I18N[_k][_lg]=(_t!=null)?_t:_e.en; } } } }\n'
    + 'if(typeof SPORTS!=="undefined"){ for(var _si=0;_si<SPORTS.length;_si++){ var _s=SPORTS[_si]; for(var _lg2 in HIST_TR){ if(_s[_lg2]==null){ var _st=HIST_TR[_lg2][_s.en]; _s[_lg2]=(_st!=null)?_st:_s.en; } } } }\n'
    + MARK_B + '\n';

  // injecteer NA de bestaande L2-definitie (regel met 'function L2(nl,en)')
  const anchorRe = /function L2\(nl,en\)\{[^\n]*\}/;
  const am = h.match(anchorRe);
  if (!am) { console.error('history: L2() niet gevonden'); process.exit(1); }
  const insertAt = h.indexOf(am[0]) + am[0].length;
  h = h.slice(0, insertAt) + block + h.slice(insertAt);

  // 2) langSelect-opties toevoegen (als nog niet aanwezig)
  const OPTS = { it:'Italiano', pl:'Polski', sv:'Svenska', da:'Dansk', no:'Norsk', fi:'Suomi', cs:'Čeština', tr:'Türkçe', ro:'Română', hu:'Magyar' };
  let optHtml = '';
  for (const c of Object.keys(OPTS)) {
    if (h.indexOf('value="' + c + '"') < 0) { optHtml += '\n      <option value="' + c + '">' + OPTS[c] + '</option>'; }
  }
  h = h.replace('<option value="fr">Français</option>', '<option value="fr">Français</option>' + optHtml);

  fs.writeFileSync(F, h);
  console.log('history.html: HIST_TR + L2 herdefinitie + I18N/SPORTS merge + langSelect (' + Object.keys(OPTS).length + ' opties)');
}
