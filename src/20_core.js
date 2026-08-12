/* ============================================================
   ÇEKİRDEK — durum, şema, depolama, yardımcılar
   ============================================================ */
const STORE_KEY = 'ktPlanner.v1';
const $ = id => document.getElementById(id);
const uid = p => (p || 'x') + Math.random().toString(36).slice(2, 9);
const clone = o => JSON.parse(JSON.stringify(o));
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TRDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const TRMONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

let DB = { programs: {}, order: [], active: '', settings: {} };
let VIEW = 'grid';

/* ---------- varsayılan alanlar ---------- */
function defaultFields() {
  return [
    { key: 'title', label: 'Eğitim Adı', type: 'text', core: true, card: true, grid: true },
    { key: 'duration', label: 'Süre (saat)', type: 'number', core: true, card: true, grid: true, def: 3 },
    { key: 'type', label: 'Tür', type: 'daytype', core: true, card: true, grid: false },
    { key: 'instructors', label: 'Eğitmen', type: 'instructor', core: true, card: true, grid: true },
    { key: 'platform', label: 'Platform / Salon', type: 'text', card: true, grid: false, def: '' },
    { key: 'desc', label: 'Açıklama', type: 'textarea', card: true, grid: false, def: '' },
    { key: 'category', label: 'Kategori', type: 'text', card: false, grid: false, def: '' },
    { key: 'audience', label: 'Hedef Kitle', type: 'text', card: false, grid: false, def: '' },
    { key: 'quota', label: 'Kontenjan', type: 'number', card: false, grid: false, def: '' },
    { key: 'link', label: 'Bağlantı', type: 'url', card: true, grid: false, def: '' }
  ];
}

/* ---------- ön tanımlı program şablonları ---------- */
const PRESETS = {
  orientation: {
    label: 'Oryantasyon (2 hafta)',
    hint: '1. hafta fiziki 6 gün, 2. hafta online 5 gün, kahvaltı ve öğle yemeği etkinlikleriyle.',
    build() {
      const p = blankProgram('Oryantasyon Grubu');
      p.preset = 'orientation';
      p.meta.note = 'Yeni işe başlayan çalışanlar için oryantasyon programı';
      p.blocks = [
        { id: 'bf', label: 'Karşılama', start: '08:00', end: '09:30', kind: 'break' },
        { id: 'm', label: 'Sabah', start: '09:30', end: '12:30', kind: 'session', cap: 3 },
        { id: 'l', label: 'Öğle Arası', start: '12:30', end: '14:00', kind: 'break' },
        { id: 'a', label: 'Öğleden Sonra', start: '14:00', end: '17:00', kind: 'session', cap: 3 }
      ];
      p.dayTypes = [
        { id: 'phy', label: 'Fiziki', color: '#2563eb', location: 'Bankacılık Üssü', icon: 'i-pin' },
        { id: 'onl', label: 'Online', color: '#7c3aed', location: 'MS Teams', icon: 'i-video' }
      ];
      p.weeks = [
        makeWeek('1. Hafta · Fiziki', ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'], 'phy', 0),
        makeWeek('2. Hafta · Online', ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'], 'onl', 1)
      ];
      const tue = p.weeks[0].days[1].id;
      p.fixed = [
        { id: uid('f'), dayId: tue, blockId: 'bf', label: '☕ Tanışma Kahvaltısı' },
        { id: uid('f'), dayId: tue, blockId: 'l', label: '🍲 İlk Gün Öğle Yemeği' }
      ];
      p.opts.enforceType = true;
      return p;
    }
  },
  training: {
    label: 'Gelişim Programı (1 hafta)',
    hint: 'Tek hafta, 5 gün, tek lokasyon. Genel amaçlı eğitim programları için.',
    build() {
      const p = blankProgram('Gelişim Programı');
      p.preset = 'training';
      p.weeks = [makeWeek('Program Haftası', ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'], 'phy', 0)];
      p.opts.enforceType = false;
      return p;
    }
  },
  workshop: {
    label: 'Atölye / Seminer (3 gün)',
    hint: 'Üç günlük yoğun program. Tek blok yapısı, sabah–öğleden sonra.',
    build() {
      const p = blankProgram('Atölye Programı');
      p.preset = 'workshop';
      p.weeks = [makeWeek('Atölye', ['Pazartesi', 'Salı', 'Çarşamba'], 'phy', 0)];
      p.opts.enforceType = false;
      return p;
    }
  },
  blank: {
    label: 'Boş Program',
    hint: 'Hiçbir varsayılan olmadan sıfırdan kur.',
    build() {
      const p = blankProgram('Yeni Program');
      p.preset = 'blank';
      p.weeks = [makeWeek('1. Hafta', ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'], 'phy', 0)];
      p.opts.enforceType = false;
      return p;
    }
  }
};

function makeWeek(label, dayNames, typeId, wi) {
  return {
    id: 'w' + wi + '_' + Math.random().toString(36).slice(2, 6),
    label,
    days: dayNames.map((n, i) => ({ id: `w${wi}d${i}_` + Math.random().toString(36).slice(2, 6), name: n, type: typeId, loc: '', off: false }))
  };
}

function blankProgram(name) {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() + ((8 - today.getDay()) % 7 || 7));
  return {
    id: uid('p'), name, preset: 'blank',
    meta: { org: 'Kuveyt Türk Akademi', owner: '', note: '' },
    startDate: iso(monday),
    blocks: [
      { id: 'm', label: 'Sabah', start: '09:30', end: '12:30', kind: 'session', cap: 3 },
      { id: 'l', label: 'Öğle Arası', start: '12:30', end: '14:00', kind: 'break' },
      { id: 'a', label: 'Öğleden Sonra', start: '14:00', end: '17:00', kind: 'session', cap: 3 }
    ],
    dayTypes: [
      { id: 'phy', label: 'Yüz Yüze', color: '#2563eb', location: 'Eğitim Salonu', icon: 'i-pin' },
      { id: 'onl', label: 'Online', color: '#7c3aed', location: 'MS Teams', icon: 'i-video' }
    ],
    weeks: [], fields: defaultFields(), sessions: [], fixed: [], participants: [],
    opts: { enforceType: false, showSuggest: true, tolerance: 0.5 }
  };
}

/* ---------- kısayollar ---------- */
const P = () => DB.programs[DB.active];
const sessionBlocks = p => p.blocks.filter(b => b.kind === 'session');
const dayCapacity = p => sessionBlocks(p).reduce((s, b) => s + (+b.cap || 3), 0);
const allDays = p => { const o = []; p.weeks.forEach((w, wi) => w.days.forEach((d, di) => o.push({ ...d, wi, di, week: w }))); return o; };
const dayById = (p, id) => allDays(p).find(d => d.id === id);
const typeById = (p, id) => p.dayTypes.find(t => t.id === id) || p.dayTypes[0] || { label: '-', color: '#64748b', location: '' };
const blockById = (p, id) => p.blocks.find(b => b.id === id);
const fieldByKey = (p, k) => p.fields.find(f => f.key === k);

/* ---------- tarih ---------- */
function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function parseISO(s) { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function dayDate(p, day) {
  if (day.date) return parseISO(day.date);
  const s = parseISO(p.startDate); if (!s) return null;
  const d = new Date(s); d.setDate(s.getDate() + day.wi * 7 + day.di); return d;
}
function fmtDate(d, long) {
  if (!d) return '';
  return long ? `${d.getDate()} ${TRMONTHS[d.getMonth()]} ${d.getFullYear()}`
    : `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}
function fmtShort(d) { return d ? `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}` : ''; }

/* ---------- depolama ---------- */
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); }
  catch (e) { toast('Kaydedilemedi: tarayıcı depolama alanı dolu olabilir.', 'err'); }
}
function load() {
  let raw = null;
  try { raw = localStorage.getItem(STORE_KEY); } catch (e) { }
  if (raw) {
    try {
      const d = JSON.parse(raw);
      if (d && d.programs && Object.keys(d.programs).length) {
        DB = d;
        DB.settings = Object.assign({ theme: 'light', ai: {} }, DB.settings || {});
        DB.settings.ai = Object.assign(clone(AI_DEFAULTS), DB.settings.ai || {});
        Object.values(DB.programs).forEach(migrate);
        if (!DB.programs[DB.active]) DB.active = DB.order[0];
        return;
      }
    } catch (e) { console.warn('Kayıt okunamadı', e); }
  }
  const p = PRESETS.orientation.build();
  DB = { programs: { [p.id]: p }, order: [p.id], active: p.id, settings: { theme: 'light', ai: clone(AI_DEFAULTS) } };
  save();
}
function migrate(p) {
  p.meta = p.meta || { org: 'Kuveyt Türk Akademi' };
  p.opts = Object.assign({ enforceType: false, showSuggest: true, tolerance: 0.5 }, p.opts || {});
  p.fields = p.fields && p.fields.length ? p.fields : defaultFields();
  p.fixed = p.fixed || []; p.participants = p.participants || []; p.sessions = p.sessions || [];
  p.sessions.forEach(s => { s.v = s.v || {}; s.instructors = s.instructors || [{ name: '-', availability: [] }]; });
}

/* ---------- tema ---------- */
function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  applyTheme(dark ? 'light' : 'dark');
  DB.settings.theme = dark ? 'light' : 'dark'; save();
}
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  $('themeIcon').innerHTML = `<use href="#i-${t === 'dark' ? 'sun' : 'moon'}"/>`;
}

/* ---------- toast ---------- */
function toast(msg, kind = 'info', ms = 4200) {
  const icons = { ok: 'i-check', err: 'i-alert', warn: 'i-alert', info: 'i-info' };
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = `<svg class="ic"><use href="#${icons[kind] || 'i-info'}"/></svg><div>${msg}</div>`;
  $('toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 240); }, ms);
}

/* ---------- modal ---------- */
let modalOnClose = null;
function openModal({ title, sub = '', icon = 'i-edit', body, foot = '', size = '' }) {
  $('modalTitle').textContent = title;
  $('modalSub').textContent = sub;
  $('modalIcon').innerHTML = `<use href="#${icon}"/>`;
  $('modalBody').innerHTML = body;
  $('modalFoot').innerHTML = foot;
  $('modalBox').className = 'modal ' + size;
  $('modalOvl').classList.add('on');
}
function closeModal() { $('modalOvl').classList.remove('on'); if (modalOnClose) { const f = modalOnClose; modalOnClose = null; f(); } }

/* ---------- görünüm ---------- */
function setView(v) {
  VIEW = v;
  document.querySelectorAll('.view').forEach(s => s.classList.remove('on'));
  $('view-' + v).classList.add('on');
  document.querySelectorAll('#viewNav button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  const planViews = ['grid', 'cards', 'agenda', 'table'];
  $('toolbar').style.display = planViews.includes(v) ? 'flex' : 'none';
  render();
}

/* ---------- program sekmeleri ---------- */
function renderTabs() {
  const bar = $('tabBar'); bar.innerHTML = '';
  DB.order.forEach(id => {
    const p = DB.programs[id]; if (!p) return;
    const el = document.createElement('div');
    el.className = 'tab' + (id === DB.active ? ' on' : '');
    el.draggable = true;
    el.innerHTML = `<span class="tab-dot"></span><span ondblclick="renameProgram('${id}')">${esc(p.name)}</span>
      <span class="tab-x" onclick="deleteProgram('${id}',event)"><svg class="ic ic-sm"><use href="#i-x"/></svg></span>`;
    el.onclick = e => { if (!e.target.closest('.tab-x')) switchProgram(id); };
    el.ondragstart = e => e.dataTransfer.setData('tab', id);
    bar.appendChild(el);
  });
  const add = document.createElement('button');
  add.className = 'tab-add';
  add.innerHTML = `<svg class="ic ic-sm"><use href="#i-plus"/></svg> Program`;
  add.onclick = openNewProgram;
  bar.appendChild(add);

  const right = document.createElement('div');
  right.className = 'tabbar-right';
  right.innerHTML = `
    <button class="btn btn-sm" onclick="duplicateProgram()"><svg class="ic ic-sm"><use href="#i-copy"/></svg> Kopyala</button>
    <button class="btn btn-sm" onclick="exportJSON()"><svg class="ic ic-sm"><use href="#i-save"/></svg> Yedek Al</button>
    <button class="btn btn-sm" onclick="importJSON()"><svg class="ic ic-sm"><use href="#i-up"/></svg> Yedek Yükle</button>`;
  bar.appendChild(right);
}
function dropTab(e) {
  e.preventDefault();
  const id = e.dataTransfer.getData('tab'); if (!id) return;
  const t = e.target.closest('.tab'); if (!t) return;
  const names = [...$('tabBar').querySelectorAll('.tab')];
  const to = names.indexOf(t); const from = DB.order.indexOf(id);
  if (to < 0 || from < 0 || to === from) return;
  DB.order.splice(from, 1); DB.order.splice(to, 0, id);
  save(); renderTabs();
}
function switchProgram(id) { DB.active = id; save(); renderTabs(); render(); }

function openNewProgram() {
  const opts = Object.entries(PRESETS).map(([k, v]) =>
    `<label class="frow" style="cursor:pointer;align-items:flex-start">
      <input type="radio" name="pre" value="${k}" ${k === 'orientation' ? 'checked' : ''} style="margin-top:2px">
      <div><b style="font-size:13px">${v.label}</b><div class="hint">${v.hint}</div></div>
    </label>`).join('');
  openModal({
    title: 'Yeni Program', sub: 'Bir şablon seç — sonradan her ayrıntısını değiştirebilirsin', icon: 'i-layers',
    body: `<div class="field"><label class="lbl">Program Adı</label><input id="npName" placeholder="Örn: Mart Dönemi Oryantasyonu"></div>
           <label class="lbl">Şablon</label>${opts}`,
    foot: `<button class="btn" onclick="closeModal()">Vazgeç</button>
           <button class="btn btn-primary" onclick="createProgram()"><svg class="ic"><use href="#i-check"/></svg> Oluştur</button>`
  });
  setTimeout(() => $('npName')?.focus(), 60);
}
function createProgram() {
  const name = ($('npName').value || '').trim();
  const key = document.querySelector('input[name=pre]:checked').value;
  const p = PRESETS[key].build();
  if (name) p.name = name;
  DB.programs[p.id] = p; DB.order.push(p.id); DB.active = p.id;
  save(); closeModal(); renderTabs(); render();
  toast(`<b>${esc(p.name)}</b> oluşturuldu.`, 'ok');
}
function renameProgram(id) {
  const p = DB.programs[id];
  openModal({
    title: 'Programı Yeniden Adlandır', icon: 'i-edit',
    body: `<div class="field"><label class="lbl">Ad</label><input id="rnName" value="${esc(p.name)}"></div>`,
    foot: `<button class="btn" onclick="closeModal()">Vazgeç</button>
           <button class="btn btn-primary" onclick="(function(){const v=$('rnName').value.trim(); if(v){DB.programs['${id}'].name=v;save();renderTabs();render();} closeModal();})()">Kaydet</button>`
  });
  setTimeout(() => $('rnName')?.select(), 60);
}
function duplicateProgram() {
  const p = clone(P()); p.id = uid('p'); p.name = P().name + ' (kopya)';
  DB.programs[p.id] = p; DB.order.push(p.id); DB.active = p.id;
  save(); renderTabs(); render(); toast('Program kopyalandı.', 'ok');
}
function deleteProgram(id, e) {
  e && e.stopPropagation();
  if (DB.order.length <= 1) return toast('Son program silinemez.', 'warn');
  if (!confirm(`"${DB.programs[id].name}" silinsin mi? Bu işlem geri alınamaz.`)) return;
  delete DB.programs[id]; DB.order = DB.order.filter(x => x !== id);
  if (DB.active === id) DB.active = DB.order[0];
  save(); renderTabs(); render(); toast('Program silindi.', 'ok');
}

/* ---------- yedekleme ---------- */
function exportJSON() {
  const blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
  dl(blob, `planlayici-yedek-${iso(new Date())}.json`);
  toast('Yedek indirildi.', 'ok');
}
function importJSON() {
  pickFile('.json', f => {
    const r = new FileReader();
    r.onload = e => {
      try {
        const d = JSON.parse(e.target.result);
        if (!d.programs) throw 0;
        if (!confirm('Mevcut tüm programların üzerine yazılacak. Devam edilsin mi?')) return;
        DB = d; DB.settings = Object.assign({ theme: 'light' }, DB.settings || {});
        DB.settings.ai = Object.assign(clone(AI_DEFAULTS), DB.settings.ai || {});
        Object.values(DB.programs).forEach(migrate);
        save(); applyTheme(DB.settings.theme || 'light'); renderTabs(); render();
        toast('Yedek yüklendi.', 'ok');
      } catch (err) { toast('Geçersiz yedek dosyası.', 'err'); }
    };
    r.readAsText(f);
  });
}
function dl(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
function pickFile(accept, cb) {
  const i = $('filePick'); i.value = ''; i.accept = accept;
  i.onchange = () => { if (i.files[0]) cb(i.files[0]); };
  i.click();
}

/* ---------- yük hesapları ---------- */
function slotLoad(p, dayId, blockId, ignoreId) {
  let l = 0;
  p.sessions.forEach(s => {
    if (s.id === ignoreId || s.dayId !== dayId) return;
    if (s.fullDay) l += (+blockById(p, blockId)?.cap || 3);
    else if (s.blockId === blockId) l += +s.duration || 0;
  });
  return l;
}
function dayLoad(p, dayId) {
  return p.sessions.filter(s => s.dayId === dayId).reduce((a, s) => a + (+s.duration || 0), 0);
}
function sessionsIn(p, dayId, blockId) {
  return p.sessions
    .filter(s => s.dayId === dayId && (s.fullDay || s.blockId === blockId))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}
function poolSessions(p) { return p.sessions.filter(s => !s.dayId).sort((a, b) => (a.order || 0) - (b.order || 0)); }
function activeInstructor(s) {
  if (!s.instructors || !s.instructors.length) return { name: '-', availability: [] };
  return s.instructors[Math.min(s.selectedInstr || 0, s.instructors.length - 1)];
}
function sessionTime(p, s) {
  if (!s.dayId) return '';
  if (s.fullDay) {
    const b = sessionBlocks(p);
    return b.length ? `${b[0].start} - ${b[b.length - 1].end}` : '';
  }
  const b = blockById(p, s.blockId);
  return b ? `${b.start} - ${b.end}` : '';
}
function sessionPlatform(p, s) {
  if (s.v && s.v.platform) return s.v.platform;
  const d = s.dayId ? dayById(p, s.dayId) : null;
  if (d) return d.loc || typeById(p, d.type).location || '';
  return typeById(p, s.type).location || '';
}

/* ---------- genel çizim ---------- */
function render() {
  const p = P(); if (!p) return;
  $('startDate').value = p.startDate || '';
  $('brandSub').textContent = p.name;
  renderStats();
  if (VIEW === 'grid') renderGrid();
  else if (VIEW === 'cards') renderCards();
  else if (VIEW === 'agenda') renderAgenda();
  else if (VIEW === 'table') renderTable();
  else if (VIEW === 'people') renderPeople();
  else if (VIEW === 'setup') renderSetup();
}
function renderStats() {
  const p = P();
  const placed = p.sessions.filter(s => s.dayId).length;
  const hours = p.sessions.reduce((a, s) => a + (+s.duration || 0), 0);
  $('statChip').innerHTML = `<b>${p.sessions.length}</b> oturum · <b>${placed}</b> yerleşti · <b>${round1(hours)}</b> saat · <b>${p.participants.length}</b> katılımcı`;
}
const round1 = n => Math.round(n * 10) / 10;

/* ---------- açılış ---------- */
document.addEventListener('DOMContentLoaded', () => {
  load();
  applyTheme(DB.settings.theme || 'light');
  renderTabs(); render();
  bindShortcuts();
  initAssistant();
});
function bindShortcuts() {
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    if (e.key === 'Escape') { closePalette(); if ($('modalOvl').classList.contains('on')) closeModal(); }
  });
}
function onStartDateChange(v) { P().startDate = v; save(); render(); }
