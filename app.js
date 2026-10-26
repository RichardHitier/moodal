'use strict';
/* Moodal : journal d'humeur, de prises et de sommeil. Tout reste dans le navigateur du téléphone. */

const VERSION = self.MOODAL_VERSION || '?';
const KEY = 'moodal.v1';
const PREVIEW = !!window.MOODAL_PREVIEW;
const SH = '­'; // césure conditionnelle pour les mots longs sur les petits boutons

const SCALES = {
  humeur:        { label: 'Humeur',            short: 'Humeur',    kind: 'mood',  opts: [[-2, 'Déprimé'], [-1, 'Bas'], [0, 'Stable'], [1, 'Élevé'], [2, 'Hypomane']] },
  anxiete:       { label: 'Anxiété',           short: 'Anxiété',   kind: 'level', opts: [[0, 'Aucune'], [1, 'Légère'], [2, 'Modérée'], [3, 'Forte'], [4, 'Panique']] },
  pensees_neg:   { label: 'Pensées négatives', short: 'P. nég.',   kind: 'level', opts: [[0, 'Absentes'], [1, 'Fugaces'], [2, 'Présentes'], [3, `Insis${SH}tantes`], [4, `Envahis${SH}santes`]] },
  irritabilite:  { label: 'Irritabilité',      short: 'Irrit.',    kind: 'level', opts: [[0, 'Aucune'], [1, 'Légère'], [2, 'Moyenne'], [3, 'Forte'], [4, 'Intense']] },
  fatigue:       { label: 'Fatigue',           short: 'Fatigue',   kind: 'level', opts: [[0, 'Aucune'], [1, 'Légère'], [2, 'Moyenne'], [3, 'Forte'], [4, 'Épuisé']] },
  concentration: { label: 'Concentration',     short: 'Concentr.', kind: 'level', opts: [[0, 'Nulle'], [1, 'Faible'], [2, 'Moyenne'], [3, 'Bonne'], [4, 'Très bonne']] },
  appetit:       { label: 'Appétit',           short: 'Appétit',   kind: 'level', opts: [[0, 'Aucun'], [1, 'Faible'], [2, 'Normal'], [3, 'Fort'], [4, 'Très fort']] },
};
const SAISIE_KEYS = ['humeur', 'anxiete', 'pensees_neg', 'irritabilite', 'fatigue', 'concentration', 'appetit'];
const NOTE_KEYS = ['pensees', 'fantasme', 'declencheur'];
const BILAN_SCALES = {
  sommeil_h: { label: 'Durée du sommeil',   kind: 'level', opts: [[4, '≤ 4 h'], [5, '5 h'], [6, '6 h'], [7, '7 h'], [8, '8 h'], [9, '≥ 9 h']] },
  sommeil_q: { label: 'Qualité du sommeil', kind: 'level', opts: [[0, 'Très mauvaise'], [1, 'Mauvaise'], [2, 'Moyenne'], [3, 'Bonne'], [4, 'Très bonne']] },
};
// [clé, libellé, couleur, valeur ramenée sur 0..4]
const SERIES = [
  ['humeur', 'Humeur', '--c-humeur', v => v + 2],
  ['anxiete', 'Anxiété', '--c-anx', v => v],
  ['pensees_neg', 'Pensées nég.', '--c-pen', v => v],
  ['irritabilite', 'Irritabilité', '--c-irr', v => v],
  ['fatigue', 'Fatigue', '--c-fat', v => v],
  ['concentration', 'Concentration', '--c-conc', v => v],
];
const DEFAULT_HIDDEN = ['irritabilite', 'fatigue'];

const $ = s => document.querySelector(s);
const plain = s => String(s).replace(/­/g, '');

/* ---------- Stockage ---------- */
let db = load();
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return { entries: Array.isArray(d.entries) ? d.entries : [], settings: d.settings || {} };
    }
  } catch (e) { /* stockage indisponible */ }
  return { entries: [], settings: {} };
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
  catch (e) { toast("Impossible d'enregistrer : le stockage du navigateur est indisponible."); return false; }
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function sortEntries() { db.entries.sort((a, b) => a.t - b.t); }
function upsert(e) {
  const i = db.entries.findIndex(x => x.id === e.id);
  if (i >= 0) db.entries[i] = e; else db.entries.push(e);
  sortEntries();
  return persist();
}
function removeEntry(id) { db.entries = db.entries.filter(x => x.id !== id); persist(); }
const meds = () => (Array.isArray(db.settings.meds) ? db.settings.meds : (db.settings.meds = []));
const hiddenSeries = () => (Array.isArray(db.settings.hidden) ? db.settings.hidden : DEFAULT_HIDDEN);

/* ---------- Dates et nombres ---------- */
const pad = n => String(n).padStart(2, '0');
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const hm = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const toInput = t => `${dayKey(t)}T${hm(t)}`;
const fromInput = s => { const t = new Date(s).getTime(); return isNaN(t) ? null : t; };
const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
const startOfWeek = t => { const s = startOfDay(t); return addDays(s, -((new Date(s).getDay() + 6) % 7)); };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const fmtDay = (t, o = { weekday: 'long', day: 'numeric', month: 'long' }) => cap(new Date(t).toLocaleDateString('fr-FR', o));
const fmtNum = v => String(v).replace('.', ',');
const fmtDose = d => `${fmtNum(d)} mg`;
const parseNum = s => parseFloat(String(s).trim().replace(',', '.'));
const abbr = name => cap(String(name).trim().slice(0, 3).toLowerCase());
function relDay(t) {
  const k = dayKey(t), now = Date.now();
  if (k === dayKey(now)) return "aujourd'hui";
  if (k === dayKey(addDays(startOfDay(now), -1))) return 'hier';
  return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
const optLabel = (cfg, v) => plain((cfg.opts.find(o => o[0] === v) || [, String(v)])[1]);

/* ---------- Navigation ---------- */
let tab = 'home';
function show(view) {
  document.querySelectorAll('main > section').forEach(s => { s.hidden = s.id !== 'v-' + view; });
  document.querySelectorAll('.tabs button').forEach(b => {
    b.setAttribute('aria-current', b.dataset.tab === view ? 'page' : 'false');
  });
  window.scrollTo(0, 0);
}
function goTab(t) { tab = t; render(); show(t); }
function goBack() { goTab(tab); }

/* ---------- Échelles à gros boutons ---------- */
function buildScales(container, defs, state) {
  container.replaceChildren();
  for (const [key, cfg] of Object.entries(defs)) {
    const fs = document.createElement('fieldset');
    fs.className = 'scale';
    fs.dataset.kind = cfg.kind;
    const lg = document.createElement('legend');
    lg.textContent = cfg.label;
    const row = document.createElement('div');
    row.className = 'opts';
    row.style.setProperty('--n', cfg.opts.length);
    const btns = cfg.opts.map(([v, lab], i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.textContent = lab;
      b.dataset.i = i;
      b.setAttribute('aria-pressed', String(state[key] === v));
      b.addEventListener('click', () => {
        state[key] = state[key] === v ? null : v; // toucher à nouveau = désélectionner
        btns.forEach((x, j) => x.setAttribute('aria-pressed', String(state[key] === cfg.opts[j][0])));
      });
      return b;
    });
    row.append(...btns);
    fs.append(lg, row);
    container.append(fs);
  }
}

/* Bouton de suppression en deux temps */
function setDelete(el, visible, fn) {
  const b = typeof el === 'string' ? $(el) : el;
  b.hidden = !visible;
  b.textContent = b.dataset.label;
  delete b.dataset.armed;
  b.onclick = () => {
    if (b.dataset.armed) fn();
    else { b.dataset.armed = '1'; b.textContent = 'Toucher encore pour confirmer'; }
  };
}

/* ---------- Saisie ---------- */
let sState = null;
function openSaisie(entry) {
  const vals = {};
  SAISIE_KEYS.forEach(k => { vals[k] = entry && entry[k] != null ? entry[k] : null; });
  sState = { id: entry ? entry.id : null, vals };
  $('#saisie-title').textContent = entry ? 'Modifier la saisie' : 'Nouvelle saisie';
  $('#s-when').value = toInput(entry ? entry.t : Date.now());
  buildScales($('#s-scales'), Object.fromEntries(SAISIE_KEYS.map(k => [k, SCALES[k]])), vals);
  let hasNote = false;
  NOTE_KEYS.forEach(k => { const v = (entry && entry[k]) || ''; $('#s-' + k).value = v; if (v) hasNote = true; });
  $('#s-notes').open = hasNote;
  setDelete('#s-del', !!entry, () => { removeEntry(entry.id); goBack(); toast('Saisie supprimée'); });
  show('saisie');
}
$('#f-saisie').addEventListener('submit', ev => {
  ev.preventDefault();
  const t = fromInput($('#s-when').value);
  if (t === null) { toast('Date ou heure invalide.'); return; }
  const e = { id: sState.id || uid(), type: 'saisie', t };
  let any = false;
  SAISIE_KEYS.forEach(k => { const v = sState.vals[k]; if (v != null) { e[k] = v; any = true; } });
  NOTE_KEYS.forEach(k => { const v = $('#s-' + k).value.trim(); if (v) { e[k] = v; any = true; } });
  if (!any) { toast('Choisis au moins une valeur ou écris une note.'); return; }
  if (upsert(e)) { toast(sState.id ? 'Saisie modifiée' : 'Saisie enregistrée'); goBack(); }
});

/* ---------- Médicaments ---------- */
function addMed(name, doseRaw) {
  name = String(name || '').trim();
  if (!name) { toast('Indique le nom du médicament.'); return null; }
  if (meds().some(m => m.name.toLowerCase() === name.toLowerCase())) { toast(`${name} est déjà dans la liste.`); return null; }
  let dose = null;
  if (String(doseRaw || '').trim()) {
    dose = parseNum(doseRaw);
    if (!(dose > 0)) { toast('Indique la dose en mg, par exemple 0,25.'); return null; }
  }
  const m = { id: uid(), name, dose, chart: true };
  meds().push(m);
  return persist() ? m : null;
}
const prisesOf = medId => db.entries.filter(e => e.type === 'prise' && e.medId === medId);
const prisLabel = e => e.med ? `${e.med} · ${fmtDose(e.dose)}` : `Prise · ${fmtDose(e.dose)}`;
function lastPrises() {
  let t = null;
  for (let i = db.entries.length - 1; i >= 0; i--) if (db.entries[i].type === 'prise') { t = db.entries[i].t; break; }
  if (t === null) return [];
  return db.entries.filter(e => e.type === 'prise' && e.t === t);
}

/* ---------- Prise ---------- */
let pEdit = null;
let pSel = new Map(); // medId -> dose saisie
function openPrise(entry) {
  pEdit = entry || null;
  pSel = new Map();
  $('#p-title').textContent = entry ? 'Modifier la prise' : 'Prise de médicaments';
  $('#p-when').value = toInput(entry ? entry.t : Date.now());
  $('#p-add').hidden = !!entry;
  $('#p-add').open = !entry && !meds().length;
  $('#p-add-name').value = '';
  $('#p-add-dose').value = '';
  renderPickList();
  setDelete('#p-del', !!entry, () => { removeEntry(entry.id); $('#d-prise').close(); render(); toast('Prise supprimée'); });
  $('#d-prise').showModal();
}
function field(labelText, control) {
  const l = document.createElement('label');
  l.className = 'field';
  l.append(labelText, control);
  return l;
}
function renderPickList() {
  const box = $('#p-meds');
  box.replaceChildren();
  if (pEdit) {
    const sel = document.createElement('select');
    sel.id = 'p-med';
    const names = meds().map(m => m.name);
    if (pEdit.med && !names.includes(pEdit.med)) names.unshift(pEdit.med);
    if (!pEdit.med) names.unshift('');
    names.forEach(n => {
      const o = document.createElement('option');
      o.value = n;
      o.textContent = n || '(sans nom)';
      o.selected = n === (pEdit.med || '');
      sel.append(o);
    });
    const dose = document.createElement('input');
    dose.id = 'p-dose';
    dose.type = 'text';
    dose.inputMode = 'decimal';
    dose.value = fmtNum(pEdit.dose);
    box.append(field('Médicament', sel), field('Dose (mg)', dose));
    updateOk();
    return;
  }
  if (!meds().length) {
    const p = document.createElement('p');
    p.className = 'muted small';
    p.textContent = "Ajoute d'abord tes médicaments ci-dessous. La liste reste sur ce téléphone.";
    box.append(p);
    updateOk();
    return;
  }
  const now = Date.now();
  meds().forEach(m => {
    const row = document.createElement('div');
    row.className = 'med-row';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'med-toggle';
    b.setAttribute('aria-pressed', String(pSel.has(m.id)));
    const nm = document.createElement('span');
    nm.className = 'med-name';
    nm.textContent = m.name;
    const sub = document.createElement('span');
    sub.className = 'med-sub';
    const ps = prisesOf(m.id);
    const last = ps.length ? ps[ps.length - 1] : null;
    if (last && last.t <= now && now - last.t < 30 * 60000) { sub.textContent = `Déjà notée à ${hm(last.t)}`; sub.classList.add('warn-txt'); }
    else sub.textContent = last ? `Dernière : ${relDay(last.t)} ${hm(last.t)}` : 'Jamais notée';
    b.append(nm, sub);
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.inputMode = 'decimal';
    inp.className = 'med-dose';
    inp.setAttribute('aria-label', `Dose de ${m.name} en mg`);
    inp.value = pSel.has(m.id) ? pSel.get(m.id) : (m.dose != null ? fmtNum(m.dose) : '');
    inp.placeholder = 'dose';
    const unit = document.createElement('span');
    unit.className = 'med-unit';
    unit.textContent = 'mg';
    const sync = () => b.setAttribute('aria-pressed', String(pSel.has(m.id)));
    b.addEventListener('click', () => {
      if (pSel.has(m.id)) pSel.delete(m.id); else pSel.set(m.id, inp.value);
      sync(); updateOk();
    });
    inp.addEventListener('input', () => { pSel.set(m.id, inp.value); sync(); updateOk(); });
    row.append(b, inp, unit);
    box.append(row);
  });
  updateOk();
}
function updateOk() {
  $('#p-ok').textContent = !pEdit && pSel.size > 1 ? `Enregistrer (${pSel.size})` : 'Enregistrer';
}
$('#p-add-ok').addEventListener('click', () => {
  const m = addMed($('#p-add-name').value, $('#p-add-dose').value);
  if (!m) return;
  $('#p-add-name').value = '';
  $('#p-add-dose').value = '';
  pSel.set(m.id, m.dose != null ? fmtNum(m.dose) : '');
  renderPickList();
  renderData();
  toast(`${m.name} ajouté`);
});
$('#f-prise').addEventListener('submit', ev => {
  ev.preventDefault();
  const t = fromInput($('#p-when').value);
  if (t === null) { toast('Heure invalide.'); return; }
  if (pEdit) {
    const name = $('#p-med').value;
    const dose = parseNum($('#p-dose').value);
    if (!(dose > 0)) { toast('Indique la dose en mg.'); return; }
    const e = { id: pEdit.id, type: 'prise', t, dose };
    const m = meds().find(x => x.name === name);
    if (name) e.med = name;
    if (m) e.medId = m.id;
    if (upsert(e)) { $('#d-prise').close(); render(); toast('Prise modifiée'); }
    return;
  }
  if (!pSel.size) { toast('Touche au moins un médicament.'); return; }
  const list = [];
  for (const [id, raw] of pSel) {
    const m = meds().find(x => x.id === id);
    if (!m) continue;
    const dose = parseNum(raw);
    if (!(dose > 0)) { toast(`Indique la dose de ${m.name}.`); return; }
    list.push([m, dose]);
  }
  list.forEach(([m, dose]) => {
    db.entries.push({ id: uid(), type: 'prise', t, med: m.name, medId: m.id, dose });
    m.dose = dose; // la dernière dose devient la dose habituelle
  });
  sortEntries();
  if (persist()) {
    $('#d-prise').close();
    render();
    toast(`Noté à ${hm(t)} : ${list.map(([m]) => m.name).join(', ')}`);
  }
});
$('#p-cancel').addEventListener('click', () => $('#d-prise').close());

/* ---------- Bilan du matin ---------- */
let bState = null;
const bilanFor = day => db.entries.find(e => e.type === 'bilan' && e.day === day) || null;
function bilanSummary(b) {
  const p = [];
  if (b.sommeil_h != null) p.push(optLabel(BILAN_SCALES.sommeil_h, b.sommeil_h));
  if (b.sommeil_q != null) p.push(optLabel(BILAN_SCALES.sommeil_q, b.sommeil_q).toLowerCase());
  if (!p.length && b.note) p.push('note');
  return p.join(' · ');
}
function openBilan(day) {
  day = day || dayKey(Date.now());
  const ex = bilanFor(day);
  bState = { id: ex ? ex.id : null, vals: { sommeil_h: ex && ex.sommeil_h != null ? ex.sommeil_h : null, sommeil_q: ex && ex.sommeil_q != null ? ex.sommeil_q : null } };
  $('#bilan-title').textContent = ex ? 'Modifier le bilan' : 'Bilan du matin';
  $('#b-day').value = day;
  $('#b-note').value = (ex && ex.note) || '';
  buildScales($('#b-scales'), BILAN_SCALES, bState.vals);
  setDelete('#b-del', !!ex, () => { removeEntry(ex.id); goBack(); toast('Bilan supprimé'); });
  show('bilan');
}
$('#f-bilan').addEventListener('submit', ev => {
  ev.preventDefault();
  const day = $('#b-day').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { toast('Date invalide.'); return; }
  const v = bState.vals;
  const note = $('#b-note').value.trim();
  if (v.sommeil_h == null && v.sommeil_q == null && !note) { toast('Choisis au moins une valeur.'); return; }
  const other = bilanFor(day);
  let id = bState.id || (other && other.id) || uid();
  if (other && bState.id && other.id !== bState.id) { removeEntry(bState.id); id = other.id; } // un seul bilan par nuit
  const [y, m, d] = day.split('-').map(Number);
  const e = { id, type: 'bilan', day, t: new Date(y, m - 1, d, 7, 0).getTime() };
  if (v.sommeil_h != null) e.sommeil_h = v.sommeil_h;
  if (v.sommeil_q != null) e.sommeil_q = v.sommeil_q;
  if (note) e.note = note;
  if (upsert(e)) { toast(bState.id ? 'Bilan modifié' : 'Bilan enregistré'); goBack(); }
});

/* ---------- Graphique ---------- */
function medOnChart(p) {
  const m = p.medId && meds().find(x => x.id === p.medId);
  return m ? m.chart !== false : true;
}
function drawChart(el, items, start, end, mode) {
  const W = 360, H = 200, L = 22, R = 12, B = 22;
  let x0 = start;
  const x1 = end;
  if (mode === 'day') {
    const six = new Date(start); six.setHours(6);
    const first = items.length ? Math.min(...items.map(i => i.t)) : six.getTime();
    x0 = first < six.getTime() ? start : six.getTime();
  }
  const pw = W - L - R;
  const X = t => +(L + (t - x0) / (x1 - x0) * pw).toFixed(1);

  // Prises : regroupées quand elles tombent au même endroit, étiquettes empilées si elles se touchent.
  const clusters = [];
  items.filter(i => i.type === 'prise' && medOnChart(i)).forEach(p => {
    const x = X(p.t), lab = p.med ? abbr(p.med) : fmtDose(p.dose);
    const c = clusters[clusters.length - 1];
    if (c && x - c.x < 5) { if (!c.labels.includes(lab)) c.labels.push(lab); }
    else clusters.push({ x, labels: [lab], row: 0 });
  });
  let rows = 1;
  if (mode === 'day') {
    clusters.forEach((c, i) => {
      c.text = c.labels.join('·');
      c.w = c.text.length * 5.6;
      const prev = clusters.slice(0, i).filter(p => Math.abs(p.x - c.x) < (p.w + c.w) / 2 + 4);
      while (prev.some(p => p.row === c.row)) c.row++;
      rows = Math.max(rows, c.row + 1);
    });
  }
  const T = clusters.length && mode === 'day' ? 10 + rows * 11 : 12;
  const ph = H - T - B;
  const Y = v => +(T + ph - (v / 4) * ph).toFixed(1);

  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution des saisies sur la période">`;
  for (let v = 0; v <= 4; v++) {
    s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="grid${v === 2 ? ' mid' : ''}"/>`;
    s += `<text x="${L - 7}" y="${Y(v) + 3.5}" class="ax" text-anchor="end">${v}</text>`;
  }
  if (mode === 'day') {
    const h0 = new Date(x0).getHours();
    for (let h = h0; h <= 24; h += 3) {
      const d = new Date(start); d.setHours(h);
      s += `<text x="${X(d.getTime())}" y="${H - 6}" class="ax" text-anchor="middle">${pad(h % 24)}h</text>`;
    }
  } else {
    for (let i = 0; i <= 7; i++) {
      const t = addDays(start, i);
      if (i > 0 && i < 7) s += `<line x1="${X(t)}" x2="${X(t)}" y1="${T}" y2="${T + ph}" class="grid"/>`;
      if (i < 7) {
        const d = new Date(t);
        s += `<text x="${X(t + (addDays(start, i + 1) - t) / 2)}" y="${H - 6}" class="ax" text-anchor="middle">${'LMMJVSD'[(d.getDay() + 6) % 7]} ${d.getDate()}</text>`;
      }
    }
  }
  clusters.forEach(c => {
    s += `<line x1="${c.x}" x2="${c.x}" y1="${T - 3}" y2="${T + ph}" class="dose-line"/>`;
    if (mode === 'day') {
      const anchor = c.x < L + 20 ? 'start' : c.x > W - R - 20 ? 'end' : 'middle';
      s += `<text x="${c.x}" y="${T - 6 - c.row * 11}" class="dose-lab" text-anchor="${anchor}">${esc(c.text)}</text>`;
    }
  });
  const hidden = hiddenSeries();
  let drawn = 0;
  for (const [k, , , map] of SERIES) {
    if (hidden.includes(k)) continue;
    const pts = items.filter(i => i.type === 'saisie' && i[k] != null).map(i => [X(i.t), Y(map(i[k]))]);
    if (!pts.length) continue;
    drawn++;
    if (pts.length > 1) s += `<polyline points="${pts.map(p => p.join(',')).join(' ')}" class="ln s-${k}"/>`;
    pts.forEach(p => { s += `<circle cx="${p[0]}" cy="${p[1]}" r="3.3" class="f-${k}"/>`; });
  }
  const anySaisie = items.some(i => i.type === 'saisie');
  if (!drawn && !clusters.length) {
    s += `<text x="${L + pw / 2}" y="${T + ph / 2 + 4}" class="empty-msg" text-anchor="middle">${anySaisie ? 'Aucune courbe affichée' : 'Pas encore de saisie sur cette période'}</text>`;
  }
  s += '</svg>';
  let lg = '<div class="legend">';
  SERIES.forEach(([k, lab, col]) => {
    lg += `<button type="button" class="lg" data-k="${k}" aria-pressed="${!hidden.includes(k)}"><i style="background:var(${col})"></i>${lab}</button>`;
  });
  lg += '<span class="hint">Touche une courbe pour l\'afficher ou la masquer. Humeur : 0 déprimé · 2 stable · 4 hypomane. Pointillés : prises.</span></div>';
  el.innerHTML = s + lg;
  el.querySelectorAll('.lg').forEach(b => b.addEventListener('click', () => {
    const h = new Set(hiddenSeries());
    if (h.has(b.dataset.k)) h.delete(b.dataset.k); else h.add(b.dataset.k);
    db.settings.hidden = [...h];
    persist();
    render();
  }));
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ---------- Listes ---------- */
function chip(text, cls) { const c = document.createElement('span'); c.className = 'chip ' + (cls || ''); c.textContent = text; return c; }
function renderList(ol, items, group) {
  ol.replaceChildren();
  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = group ? 'Aucune saisie sur cette période.' : "Rien pour l'instant aujourd'hui. Touche « Nouvelle saisie » pour commencer.";
    ol.append(li);
    return;
  }
  let cur = '';
  let priseGroup = null; // prises notées à la même minute : une seule ligne
  for (const it of [...items].sort((a, b) => b.t - a.t)) {
    if (group) {
      const k = dayKey(it.t);
      if (k !== cur) { cur = k; priseGroup = null; const h = document.createElement('li'); h.className = 'day-h'; h.textContent = fmtDay(it.t); ol.append(h); }
    }
    if (it.type === 'prise') {
      if (!priseGroup || priseGroup.t !== it.t) {
        const li = document.createElement('li');
        const box = document.createElement('div');
        box.className = 'entry prise';
        const time = document.createElement('span');
        time.className = 'e-time';
        time.textContent = hm(it.t);
        const body = document.createElement('span');
        body.className = 'e-body';
        box.append(time, body);
        li.append(box);
        ol.append(li);
        priseGroup = { t: it.t, body };
      }
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'chip dose';
      c.textContent = it.med ? `${it.med} ${fmtDose(it.dose)}` : fmtDose(it.dose);
      c.setAttribute('aria-label', `Modifier la prise : ${prisLabel(it)}`);
      c.addEventListener('click', () => openPrise(it));
      priseGroup.body.append(c);
      continue;
    }
    priseGroup = null;
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'entry ' + it.type;
    const time = document.createElement('span');
    time.className = 'e-time';
    time.textContent = hm(it.t);
    const body = document.createElement('span');
    body.className = 'e-body';
    {
      SAISIE_KEYS.forEach(k => {
        if (it[k] == null) return;
        if (k === 'humeur') body.append(chip(optLabel(SCALES.humeur, it[k]), 'mood m' + (it[k] + 2)));
        else body.append(chip(`${SCALES[k].short} ${it[k]}`));
      });
      const n = NOTE_KEYS.filter(k => it[k]).length;
      if (n) body.append(chip(n === 1 ? '1 note' : `${n} notes`, 'note'));
      btn.addEventListener('click', () => openSaisie(it));
    }
    btn.append(time, body);
    li.append(btn);
    ol.append(li);
  }
}

/* ---------- Rendu ---------- */
let hMode = 'day', hAnchor = startOfDay(Date.now());
function periodOf(mode, anchor) {
  const s = mode === 'day' ? startOfDay(anchor) : startOfWeek(anchor);
  return [s, addDays(s, mode === 'day' ? 1 : 7)];
}
function render() {
  const now = Date.now();
  $('#today-label').textContent = fmtDay(now);
  const lp = lastPrises();
  $('#prise-sub').textContent = lp.length
    ? `Dernière : ${lp.map(e => e.med ? abbr(e.med) : fmtDose(e.dose)).join(', ')}, ${relDay(lp[0].t)} ${hm(lp[0].t)}`
    : 'Noter une prise';
  const b = bilanFor(dayKey(now));
  $('#go-bilan').classList.toggle('todo', !b);
  $('#bilan-sub').textContent = b ? `Fait · ${bilanSummary(b)}` : 'À remplir : sommeil de la nuit';
  const [s, e] = periodOf('day', now);
  const items = db.entries.filter(x => x.t >= s && x.t < e && x.type !== 'bilan');
  drawChart($('#home-chart'), items, s, e, 'day');
  renderList($('#home-list'), items, false);
  renderHist();
  renderData();
}
function renderHist() {
  const [s, e] = periodOf(hMode, hAnchor);
  $('#h-label').textContent = hMode === 'day'
    ? fmtDay(s)
    : `Semaine du ${new Date(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
  $('#h-next').disabled = e > Date.now();
  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === hMode)));
  const items = db.entries.filter(x => x.t >= s && x.t < e && x.type !== 'bilan');
  drawChart($('#h-chart'), items, s, e, hMode);
  const wrap = $('#h-bilans');
  wrap.replaceChildren();
  db.entries.filter(x => x.type === 'bilan' && x.t >= s && x.t < e).sort((a, b) => b.t - a.t).forEach(bl => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bilan-row';
    const l = document.createElement('span');
    l.textContent = hMode === 'day' ? 'Nuit' : 'Nuit · ' + fmtDay(bl.t, { weekday: 'short', day: 'numeric' });
    const r = document.createElement('b');
    r.textContent = bilanSummary(bl);
    btn.append(l, r);
    btn.addEventListener('click', () => openBilan(bl.day));
    wrap.append(btn);
  });
  renderList($('#h-list'), items, hMode === 'week');
}
function renderMeds() {
  const ul = $('#med-list');
  if (ul.contains(document.activeElement)) return; // ne pas casser une saisie en cours
  ul.replaceChildren();
  if (!meds().length) {
    const li = document.createElement('li');
    li.className = 'muted small';
    li.textContent = 'Aucun médicament pour le moment.';
    ul.append(li);
    return;
  }
  meds().forEach(m => {
    const li = document.createElement('li');
    li.className = 'med-item';
    const name = document.createElement('input');
    name.type = 'text';
    name.value = m.name;
    name.setAttribute('aria-label', 'Nom du médicament');
    name.addEventListener('change', () => {
      const v = name.value.trim();
      if (!v) { name.value = m.name; return; }
      m.name = v;
      persist();
      toast('Nom modifié. Les prises déjà notées gardent l\'ancien nom.');
    });
    const dose = document.createElement('input');
    dose.type = 'text';
    dose.inputMode = 'decimal';
    dose.className = 'med-dose';
    dose.value = m.dose != null ? fmtNum(m.dose) : '';
    dose.placeholder = 'dose';
    dose.setAttribute('aria-label', `Dose habituelle de ${m.name} en mg`);
    dose.addEventListener('change', () => {
      const raw = dose.value.trim();
      if (!raw) { m.dose = null; persist(); return; }
      const v = parseNum(raw);
      if (!(v > 0)) { toast('Indique la dose en mg, par exemple 0,25.'); dose.value = m.dose != null ? fmtNum(m.dose) : ''; return; }
      m.dose = v;
      persist();
    });
    const unit = document.createElement('span');
    unit.className = 'med-unit';
    unit.textContent = 'mg';
    const chart = document.createElement('label');
    chart.className = 'check small';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = m.chart !== false;
    cb.addEventListener('change', () => { m.chart = cb.checked; persist(); render(); });
    chart.append(cb, 'Repère sur le graphique');
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'ghost-danger small-del';
    del.dataset.label = 'Retirer';
    setDelete(del, true, () => {
      db.settings.meds = meds().filter(x => x.id !== m.id);
      persist();
      renderMeds();
      toast(`${m.name} retiré de la liste. Ses prises restent dans l'historique.`);
    });
    const line1 = document.createElement('div');
    line1.className = 'med-line';
    line1.append(name, dose, unit);
    const line2 = document.createElement('div');
    line2.className = 'med-line2';
    line2.append(chart, del);
    li.append(line1, line2);
    ul.append(li);
  });
}
function renderData() {
  renderMeds();
  const n = db.entries.length;
  const txt = n ? `${n} enregistrement${n > 1 ? 's' : ''} sur ce téléphone.` : 'Aucun enregistrement pour le moment.';
  $('#store-status').textContent = txt;
  try {
    navigator.storage && navigator.storage.persisted && navigator.storage.persisted().then(p => {
      $('#store-status').textContent = txt + (p ? " Stockage protégé contre l'effacement automatique." : '');
    }).catch(() => {});
  } catch (e) { /* ignoré */ }
}
$('#med-add').addEventListener('click', () => {
  const m = addMed($('#med-name').value, $('#med-dose').value);
  if (!m) return;
  $('#med-name').value = '';
  $('#med-dose').value = '';
  renderMeds();
  toast(`${m.name} ajouté`);
});

/* ---------- Export ---------- */
function buildCsv() {
  const withNotes = $('#x-notes').checked;
  const r = $('#x-range').value;
  const since = r === 'all' ? 0 : addDays(startOfDay(Date.now()), -(Number(r) - 1));
  const cols = ['date', 'heure', 'type', 'humeur', 'humeur_libelle', 'anxiete', 'pensees_negatives', 'irritabilite', 'fatigue', 'concentration', 'appetit', 'medicament', 'dose_mg', 'sommeil_h', 'sommeil_qualite'];
  if (withNotes) cols.push('pensees', 'fantasme', 'declencheur', 'note_bilan');
  const q = v => { if (v == null) return ''; const s = String(v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = db.entries.filter(e => e.t >= since).map(e => {
    const o = {
      date: e.type === 'bilan' ? e.day : dayKey(e.t),
      heure: e.type === 'bilan' ? '' : hm(e.t),
      type: e.type,
      humeur: e.humeur,
      humeur_libelle: e.humeur != null ? optLabel(SCALES.humeur, e.humeur) : '',
      anxiete: e.anxiete, pensees_negatives: e.pensees_neg,
      irritabilite: e.irritabilite, fatigue: e.fatigue, concentration: e.concentration, appetit: e.appetit,
      medicament: e.type === 'prise' ? (e.med || '') : '', dose_mg: e.dose != null ? fmtNum(e.dose) : '',
      sommeil_h: e.sommeil_h, sommeil_qualite: e.sommeil_q,
      pensees: e.pensees, fantasme: e.fantasme, declencheur: e.declencheur, note_bilan: e.note,
    };
    return cols.map(c => q(o[c])).join(';');
  });
  return { name: `moodal-${dayKey(Date.now())}.csv`, text: [cols.join(';'), ...rows].join('\r\n') };
}
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
async function exportCsv(share) {
  const { name, text } = buildCsv();
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  if (share) {
    try {
      const f = new File([blob], name, { type: 'text/csv' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: 'Moodal' }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    toast('Partage indisponible ici, téléchargement à la place.');
  }
  download(blob, name);
}
$('#x-share').addEventListener('click', () => exportCsv(true));
$('#x-dl').addEventListener('click', () => exportCsv(false));

$('#bk-out').addEventListener('click', () => {
  const data = JSON.stringify({ app: 'moodal', version: VERSION, exported: new Date().toISOString(), ...db }, null, 1);
  download(new Blob([data], { type: 'application/json' }), `moodal-sauvegarde-${dayKey(Date.now())}.json`);
});
$('#bk-in').addEventListener('change', async ev => {
  const f = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (!d || !Array.isArray(d.entries)) throw new Error('format');
    const valid = d.entries.filter(e => e && typeof e.id === 'string' && typeof e.t === 'number' && ['saisie', 'prise', 'bilan'].includes(e.type));
    const ids = new Set(db.entries.map(e => e.id));
    const added = valid.filter(e => !ids.has(e.id));
    db.entries.push(...added);
    sortEntries();
    if (d.settings && Array.isArray(d.settings.meds)) {
      const have = new Set(meds().map(m => m.id));
      d.settings.meds.filter(m => m && m.id && m.name && !have.has(m.id)).forEach(m => meds().push(m));
    }
    if (persist()) { render(); toast(added.length ? `${added.length} enregistrement${added.length > 1 ? 's' : ''} restauré${added.length > 1 ? 's' : ''}` : 'Rien de nouveau dans cette sauvegarde'); }
  } catch (e) {
    toast("Ce fichier n'est pas une sauvegarde Moodal lisible.");
  }
});
setDelete('#wipe', true, wipeAll);
function wipeAll() {
  db = { entries: [], settings: {} };
  persist();
  render();
  setDelete('#wipe', true, wipeAll);
  toast('Toutes les données ont été effacées');
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg, actLabel, act) {
  const t = $('#toast');
  $('#toast-msg').textContent = msg;
  const b = $('#toast-act');
  b.hidden = !actLabel;
  if (actLabel) { b.textContent = actLabel; b.onclick = () => { t.hidden = true; act(); }; }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, actLabel ? 6000 : 2800);
}

/* ---------- Données d'exemple (aperçu seulement) ---------- */
function sampleData() {
  const now = Date.now(), today = startOfDay(now), out = [];
  const at = (d, h, m) => { const x = new Date(addDays(today, d)); x.setHours(h, m, 0, 0); return x.getTime(); };
  const medList = (window.MOODAL_PREVIEW_MEDS || [{ name: 'Médicament A', dose: 10 }, { name: 'Médicament B', dose: 20 }])
    .map(m => ({ id: uid() + m.name.length, name: m.name, dose: m.dose, chart: true }));
  const days = [
    // [prise h (null = pas de prise du dernier médicament), sommeil h, qualité, saisies [h, m, humeur, anx, pen, irr, fat, conc, app]]
    [8.1, 6, 2, [[7, 30, -1, 3, 3, 3, 3, 1, 1], [10, 15, 0, 1, 1, 1, 2, 3, 1], [13, 0, 0, 1, 1, 1, 1, 3, 1], [17, 40, 0, 2, 2, 2, 2, 2, 2], [21, 10, -1, 3, 3, 3, 3, 1, 3]]],
    [8.0, 7, 3, [[7, 45, 0, 2, 2, 2, 2, 1, null], [11, 0, 0, 1, 1, 1, 1, 3, 1], [15, 30, 0, 1, 1, 1, 2, 3, null], [20, 30, 0, 2, 1, 2, 3, 2, 2]]],
    [null, 5, 1, [[9, 0, -1, 3, 3, 3, 3, 1, 2], [14, 0, -1, 3, 4, 3, 4, 1, 2], [19, 0, -2, 4, 4, 4, 4, 0, 3]]],
    [null, 8, 3, [[10, 0, 0, 2, 2, 2, 2, 2, 2], [16, 0, 1, 1, 1, 1, 1, 2, 2], [22, 0, 1, 2, 1, 2, 2, 1, 2]]],
    [8.3, 7, 2, [[8, 0, 0, 2, 2, 2, 3, 1, null], [11, 30, 0, 1, 1, 1, 1, 3, 1], [18, 0, 0, 2, 1, 2, 2, 2, 2]]],
    [8.0, 6, 2, [[7, 50, -1, 2, 3, 2, 3, 1, null], [12, 0, 0, 1, 1, 1, 2, 3, 1], [21, 0, 0, 2, 2, 2, 3, 2, 2]]],
    [8.2, 7, 3, [[9, 0, 0, 1, 1, 1, 2, 3, 1], [16, 0, 1, 1, 0, 1, 1, 3, 1]]],
  ];
  days.forEach(([ph, sh, sq, sx], i) => {
    const d = -i;
    out.push({ id: uid() + i + 'b', type: 'bilan', day: dayKey(addDays(today, d)), t: at(d, 7, 0), sommeil_h: sh, sommeil_q: sq });
    const t = at(d, 8, ph != null ? Math.round((ph % 1) * 60) : 5);
    medList.forEach((m, j) => {
      if (ph == null && j === medList.length - 1) return;
      out.push({ id: uid() + i + 'p' + j, type: 'prise', t, med: m.name, medId: m.id, dose: m.dose });
    });
    sx.forEach(([h, mn, hu, an, pn, ir, fa, co, ap], j) => {
      const e = { id: uid() + i + 's' + j, type: 'saisie', t: at(d, h, mn), humeur: hu, anxiete: an, pensees_neg: pn, irritabilite: ir, fatigue: fa, concentration: co };
      if (ap != null) e.appetit = ap;
      if (i === 0 && j === 0) e.declencheur = 'Week-end lourd, réveil difficile';
      out.push(e);
    });
  });
  return { entries: out.filter(e => e.t <= now).sort((a, b) => a.t - b.t), settings: { meds: medList } };
}

/* ---------- Démarrage ---------- */
document.querySelectorAll('.app-version').forEach(el => { el.textContent = 'v' + VERSION; });
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => goTab(b.dataset.tab)));
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', goBack));
$('#go-saisie').addEventListener('click', () => openSaisie(null));
$('#go-prise').addEventListener('click', () => openPrise(null));
$('#go-bilan').addEventListener('click', () => openBilan());
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { hMode = b.dataset.mode; renderHist(); }));
$('#h-prev').addEventListener('click', () => { hAnchor = addDays(hAnchor, hMode === 'day' ? -1 : -7); renderHist(); });
$('#h-next').addEventListener('click', () => { hAnchor = addDays(hAnchor, hMode === 'day' ? 1 : 7); renderHist(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

if (PREVIEW) {
  $('#preview-banner').hidden = false;
  if (!db.entries.length) { db = sampleData(); persist(); }
  $('#preview-clear').addEventListener('click', () => { wipeAll(); $('#preview-banner').hidden = true; });
}

goTab('home');

// Raccourcis de l'icône (appui long) : #saisie, #prise, #bilan
const shortcut = location.hash.slice(1);
if (shortcut) {
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignoré */ }
  if (shortcut === 'saisie') openSaisie(null);
  else if (shortcut === 'prise') openPrise(null);
  else if (shortcut === 'bilan') openBilan();
}

try {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(renderData).catch(() => {});
} catch (e) { /* ignoré */ }
if (!PREVIEW && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
