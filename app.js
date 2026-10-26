'use strict';
/* Moodal : journal d'humeur, de prises et de sommeil. Tout reste dans le navigateur du téléphone. */

const KEY = 'moodal.v1';
const PREVIEW = !!window.MOODAL_PREVIEW;

const SCALES = {
  humeur:        { label: 'Humeur',        short: 'Humeur',    kind: 'mood',  opts: [[-2, 'Déprimé'], [-1, 'Bas'], [0, 'Stable'], [1, 'Élevé'], [2, 'Hypomane']] },
  irritabilite:  { label: 'Irritabilité',  short: 'Irrit.',    kind: 'level', opts: [[0, 'Aucune'], [1, 'Légère'], [2, 'Moyenne'], [3, 'Forte'], [4, 'Intense']] },
  fatigue:       { label: 'Fatigue',       short: 'Fatigue',   kind: 'level', opts: [[0, 'Aucune'], [1, 'Légère'], [2, 'Moyenne'], [3, 'Forte'], [4, 'Épuisé']] },
  concentration: { label: 'Concentration', short: 'Concentr.', kind: 'level', opts: [[0, 'Nulle'], [1, 'Faible'], [2, 'Moyenne'], [3, 'Bonne'], [4, 'Très bonne']] },
  appetit:       { label: 'Appétit',       short: 'Appétit',   kind: 'level', opts: [[0, 'Aucun'], [1, 'Faible'], [2, 'Normal'], [3, 'Fort'], [4, 'Très fort']] },
};
const SAISIE_KEYS = ['humeur', 'irritabilite', 'fatigue', 'concentration', 'appetit'];
const NOTE_KEYS = ['pensees', 'fantasme', 'declencheur'];
const BILAN_SCALES = {
  sommeil_h: { label: 'Durée du sommeil',   kind: 'level', opts: [[4, '≤ 4 h'], [5, '5 h'], [6, '6 h'], [7, '7 h'], [8, '8 h'], [9, '≥ 9 h']] },
  sommeil_q: { label: 'Qualité du sommeil', kind: 'level', opts: [[0, 'Très mauvaise'], [1, 'Mauvaise'], [2, 'Moyenne'], [3, 'Bonne'], [4, 'Très bonne']] },
};
// [clé, libellé, valeur ramenée sur 0..4]
const SERIES = [
  ['humeur', 'Humeur', v => v + 2],
  ['irritabilite', 'Irritabilité', v => v],
  ['fatigue', 'Fatigue', v => v],
  ['concentration', 'Concentration', v => v],
];
const DOSE_CHIPS = [10, 20, 30, 40];

const $ = s => document.querySelector(s);

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

/* ---------- Dates ---------- */
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
const fmtDose = d => `${String(d).replace('.', ',')} mg`;
function relDay(t) {
  const k = dayKey(t), now = Date.now();
  if (k === dayKey(now)) return "aujourd'hui";
  if (k === dayKey(addDays(startOfDay(now), -1))) return 'hier';
  return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
const optLabel = (cfg, v) => (cfg.opts.find(o => o[0] === v) || [, String(v)])[1];

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
function setDelete(sel, visible, fn) {
  const b = $(sel);
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

/* ---------- Prise ---------- */
const lastPrise = () => { for (let i = db.entries.length - 1; i >= 0; i--) if (db.entries[i].type === 'prise') return db.entries[i]; return null; };
const usualDose = () => db.settings.dose != null ? db.settings.dose : (lastPrise() ? lastPrise().dose : null);

function quickPrise() {
  const now = Date.now();
  const last = lastPrise();
  const dose = usualDose();
  if (dose == null) { openPrise(null, 'Indique la dose de cette prise. Elle sera reprise automatiquement les fois suivantes.'); return; }
  if (last && last.t <= now && now - last.t < 30 * 60000) {
    openPrise(null, `Une prise est déjà notée à ${hm(last.t)}. Enregistrer une deuxième prise ?`);
    return;
  }
  const e = { id: uid(), type: 'prise', t: now, dose };
  if (upsert(e)) { render(); toast(`Prise notée à ${hm(now)} · ${fmtDose(dose)}`, 'Modifier', () => openPrise(e)); }
}

let pEdit = null;
function openPrise(entry, warn) {
  pEdit = entry;
  $('#p-title').textContent = entry ? 'Modifier la prise' : 'Nouvelle prise';
  $('#p-warn').hidden = !warn;
  $('#p-warn').textContent = warn || '';
  $('#p-when').value = toInput(entry ? entry.t : Date.now());
  const d = entry ? entry.dose : usualDose();
  $('#p-dose').value = d != null ? String(d).replace('.', ',') : '';
  setDelete('#p-del', !!entry, () => { removeEntry(entry.id); $('#d-prise').close(); render(); toast('Prise supprimée'); });
  $('#d-prise').showModal();
}
$('#f-prise').addEventListener('submit', ev => {
  ev.preventDefault();
  const t = fromInput($('#p-when').value);
  const dose = parseFloat(String($('#p-dose').value).replace(',', '.'));
  if (t === null) { toast('Heure invalide.'); return; }
  if (!(dose > 0)) { toast('Indique la dose en mg.'); return; }
  const e = { id: pEdit ? pEdit.id : uid(), type: 'prise', t, dose };
  db.settings.dose = dose;
  if (upsert(e)) { $('#d-prise').close(); render(); toast(pEdit ? 'Prise modifiée' : `Prise notée à ${hm(t)} · ${fmtDose(dose)}`); }
});
$('#p-cancel').addEventListener('click', () => $('#d-prise').close());
DOSE_CHIPS.forEach(v => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = `${v} mg`;
  b.addEventListener('click', () => { $('#p-dose').value = v; });
  $('#p-chips').append(b);
});

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
function drawChart(el, items, start, end, mode) {
  const W = 360, H = 196, L = 22, R = 10, T = 20, B = 22;
  const pw = W - L - R, ph = H - T - B;
  let x0 = start;
  const x1 = end;
  if (mode === 'day') {
    const six = new Date(start); six.setHours(6);
    const first = items.length ? Math.min(...items.map(i => i.t)) : six.getTime();
    x0 = first < six.getTime() ? start : six.getTime();
  }
  const X = t => +(L + (t - x0) / (x1 - x0) * pw).toFixed(1);
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
        s += `<text x="${X(addDays(start, i) + (addDays(start, i + 1) - t) / 2)}" y="${H - 6}" class="ax" text-anchor="middle">${'LMMJVSD'[(d.getDay() + 6) % 7]} ${d.getDate()}</text>`;
      }
    }
  }
  const prises = items.filter(i => i.type === 'prise');
  prises.forEach(p => {
    s += `<line x1="${X(p.t)}" x2="${X(p.t)}" y1="${T - 4}" y2="${T + ph}" class="dose-line"/>`;
    if (mode === 'day') s += `<text x="${X(p.t)}" y="${T - 8}" class="dose-lab" text-anchor="middle">${fmtDose(p.dose)}</text>`;
  });
  let drawn = 0;
  for (const [k, , map] of SERIES) {
    const pts = items.filter(i => i.type === 'saisie' && i[k] != null).map(i => [X(i.t), Y(map(i[k]))]);
    if (!pts.length) continue;
    drawn++;
    if (pts.length > 1) s += `<polyline points="${pts.map(p => p.join(',')).join(' ')}" class="ln s-${k}"/>`;
    pts.forEach(p => { s += `<circle cx="${p[0]}" cy="${p[1]}" r="3.3" class="f-${k}"/>`; });
  }
  if (!drawn && !prises.length) s += `<text x="${L + pw / 2}" y="${T + ph / 2 + 4}" class="empty-msg" text-anchor="middle">Pas encore de saisie sur cette période</text>`;
  s += '</svg>';
  const cssVar = { humeur: '--c-humeur', irritabilite: '--c-irr', fatigue: '--c-fat', concentration: '--c-conc' };
  let lg = '<div class="legend">';
  SERIES.forEach(([k, lab]) => { lg += `<span><i style="background:var(${cssVar[k]})"></i>${lab}</span>`; });
  lg += '<span><i style="background:var(--muted);height:1px;border-top:1px dashed var(--muted)"></i>Prise</span>';
  lg += '<span class="hint">Humeur : 0 déprimé · 2 stable · 4 hypomane</span></div>';
  el.innerHTML = s + lg;
}

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
  for (const it of [...items].sort((a, b) => b.t - a.t)) {
    if (group) {
      const k = dayKey(it.t);
      if (k !== cur) { cur = k; const h = document.createElement('li'); h.className = 'day-h'; h.textContent = fmtDay(it.t); ol.append(h); }
    }
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'entry ' + it.type;
    const time = document.createElement('span');
    time.className = 'e-time';
    time.textContent = hm(it.t);
    const body = document.createElement('span');
    body.className = 'e-body';
    if (it.type === 'prise') {
      body.append(chip('Prise · ' + fmtDose(it.dose), 'dose'));
      btn.addEventListener('click', () => openPrise(it));
    } else {
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
  const last = lastPrise();
  $('#prise-sub').textContent = last ? `Dernière : ${fmtDose(last.dose)}, ${relDay(last.t)} ${hm(last.t)}` : "Un toucher note l'heure";
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
function renderData() {
  const d = db.settings.dose;
  if (document.activeElement !== $('#set-dose')) $('#set-dose').value = d != null ? String(d).replace('.', ',') : '';
  const n = db.entries.length;
  let txt = n ? `${n} enregistrement${n > 1 ? 's' : ''} sur ce téléphone.` : 'Aucun enregistrement pour le moment.';
  $('#store-status').textContent = txt;
  try {
    navigator.storage && navigator.storage.persisted && navigator.storage.persisted().then(p => {
      $('#store-status').textContent = txt + (p ? ' Stockage protégé contre l\'effacement automatique.' : '');
    }).catch(() => {});
  } catch (e) { /* ignoré */ }
}

/* ---------- Export ---------- */
function buildCsv() {
  const withNotes = $('#x-notes').checked;
  const r = $('#x-range').value;
  const since = r === 'all' ? 0 : addDays(startOfDay(Date.now()), -(Number(r) - 1));
  const cols = ['date', 'heure', 'type', 'humeur', 'humeur_libelle', 'irritabilite', 'fatigue', 'concentration', 'appetit', 'dose_mg', 'sommeil_h', 'sommeil_qualite'];
  if (withNotes) cols.push('pensees', 'fantasme', 'declencheur', 'note_bilan');
  const esc = v => { if (v == null) return ''; const s = String(v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const num = v => v == null ? '' : String(v).replace('.', ',');
  const rows = db.entries.filter(e => e.t >= since).map(e => {
    const o = {
      date: e.type === 'bilan' ? e.day : dayKey(e.t),
      heure: e.type === 'bilan' ? '' : hm(e.t),
      type: e.type,
      humeur: e.humeur,
      humeur_libelle: e.humeur != null ? optLabel(SCALES.humeur, e.humeur) : '',
      irritabilite: e.irritabilite, fatigue: e.fatigue, concentration: e.concentration, appetit: e.appetit,
      dose_mg: num(e.dose), sommeil_h: e.sommeil_h, sommeil_qualite: e.sommeil_q,
      pensees: e.pensees, fantasme: e.fantasme, declencheur: e.declencheur, note_bilan: e.note,
    };
    return cols.map(c => esc(o[c])).join(';');
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

$('#set-dose-ok').addEventListener('click', () => {
  const raw = $('#set-dose').value.trim();
  if (!raw) { delete db.settings.dose; persist(); toast('Dose habituelle effacée'); return; }
  const v = parseFloat(raw.replace(',', '.'));
  if (!(v > 0)) { toast('Indique une dose en mg, par exemple 20.'); return; }
  db.settings.dose = v;
  if (persist()) toast(`Dose habituelle : ${fmtDose(v)}`);
});

$('#bk-out').addEventListener('click', () => {
  const data = JSON.stringify({ app: 'moodal', version: 1, exported: new Date().toISOString(), ...db }, null, 1);
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
    if (db.settings.dose == null && d.settings && d.settings.dose != null) db.settings.dose = d.settings.dose;
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
  const days = [
    // [prise h, sommeil h, qualité, saisies [h, m, humeur, irr, fat, conc, app]]
    [8.1, 6, 2, [[7, 30, -1, 3, 3, 1, 1], [10, 15, 0, 1, 2, 3, 1], [13, 0, 0, 1, 1, 3, 1], [17, 40, 0, 2, 2, 2, 2], [21, 10, -1, 3, 3, 1, 3]]],
    [8.0, 7, 3, [[7, 45, 0, 2, 2, 1, null], [11, 0, 0, 1, 1, 3, 1], [15, 30, 0, 1, 2, 3, null], [20, 30, 0, 2, 3, 2, 2]]],
    [null, 5, 1, [[9, 0, -1, 3, 3, 1, 2], [14, 0, -1, 3, 4, 1, 2], [19, 0, -2, 4, 4, 0, 3]]],
    [null, 8, 3, [[10, 0, 0, 2, 2, 2, 2], [16, 0, 1, 1, 1, 2, 2], [22, 0, 1, 2, 2, 1, 2]]],
    [8.3, 7, 2, [[8, 0, 0, 2, 3, 1, null], [11, 30, 0, 1, 1, 3, 1], [18, 0, 0, 2, 2, 2, 2]]],
    [8.0, 6, 2, [[7, 50, -1, 2, 3, 1, null], [12, 0, 0, 1, 2, 3, 1], [21, 0, 0, 2, 3, 2, 2]]],
    [8.2, 7, 3, [[9, 0, 0, 1, 2, 3, 1], [16, 0, 1, 1, 1, 3, 1]]],
  ];
  days.forEach(([ph, sh, sq, sx], i) => {
    const d = -i;
    const day = dayKey(addDays(today, d));
    out.push({ id: uid() + i + 'b', type: 'bilan', day, t: at(d, 7, 0), sommeil_h: sh, sommeil_q: sq });
    if (ph != null) out.push({ id: uid() + i + 'p', type: 'prise', t: at(d, Math.floor(ph), Math.round((ph % 1) * 60)), dose: 20 });
    sx.forEach(([h, m, hu, ir, fa, co, ap], j) => {
      const e = { id: uid() + i + 's' + j, type: 'saisie', t: at(d, h, m), humeur: hu, irritabilite: ir, fatigue: fa, concentration: co };
      if (ap != null) e.appetit = ap;
      if (i === 0 && j === 0) e.declencheur = 'Week-end lourd, réveil difficile';
      out.push(e);
    });
  });
  return { entries: out.filter(e => e.t <= now).sort((a, b) => a.t - b.t), settings: { dose: 20 } };
}

/* ---------- Démarrage ---------- */
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => goTab(b.dataset.tab)));
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', goBack));
$('#go-saisie').addEventListener('click', () => openSaisie(null));
$('#go-prise').addEventListener('click', quickPrise);
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
  else if (shortcut === 'prise') quickPrise();
  else if (shortcut === 'bilan') openBilan();
}

try {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(renderData).catch(() => {});
} catch (e) { /* ignoré */ }
if (!PREVIEW && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
