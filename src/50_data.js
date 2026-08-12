/* ============================================================
   VERİ — içe/dışa aktarma, katılımcı modülü
   ============================================================ */

/* ---------------- yardımcılar ---------------- */
const norm = v => String(v ?? '').toLocaleLowerCase('tr-TR').replace(/[\s._-]/g, '');
function readSheet(file, cb) {
  const r = new FileReader();
  r.onload = e => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
      cb(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true }));
    } catch (err) { toast('Dosya okunamadı. Excel veya CSV olmalı.', 'err'); }
  };
  r.readAsArrayBuffer(file);
}
function excelDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400 * 1000));
  const s = String(v || '').trim(); if (!s) return null;
  const m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(s); return isNaN(d) ? null : d;
}
function sheetToBook(rows, name, file) {
  const ws = XLSX.utils.json_to_sheet(rows), wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, name); XLSX.writeFile(wb, file);
}
function guessCol(headers, keys) {
  for (const k of keys) {
    const i = headers.findIndex(h => norm(h).includes(norm(k)));
    if (i >= 0) return i;
  }
  return -1;
}

/* ---------------- OTURUM İÇE AKTARMA ---------------- */
function openImport() {
  openModal({
    title: 'Oturumları İçe Aktar', sub: 'Excel/CSV yükle veya listeyi doğrudan yapıştır', icon: 'i-up', size: 'modal-lg',
    body: `<div class="grid2">
      <div class="drop" onclick="pickFile('.xlsx,.xls,.csv',importSessionsFile)">
        <svg class="ic"><use href="#i-file"/></svg><b>Excel / CSV Yükle</b>
        <span>Sütun başlıkları otomatik eşlenir</span></div>
      <div class="drop" onclick="$('pasteBox').focus()">
        <svg class="ic"><use href="#i-spark"/></svg><b>Serbest Metin</b>
        <span>E-posta, Word tablosu, not — AI ayrıştırır</span></div>
    </div>
    <div class="field" style="margin-top:14px">
      <label class="lbl">Yapıştır</label>
      <textarea id="pasteBox" style="min-height:150px" placeholder="Örnek:
Pazartesi 09:30 Bankacılığa Giriş - Ahmet Yılmaz - 3 saat
Pazartesi 14:00 Ürün Eğitimi - Ayşe Demir - 3 saat
Salı tam gün Mevzuat - Mehmet Kaya"></textarea>
    </div>
    <label class="frow" style="cursor:pointer"><input type="checkbox" id="impReplace">
      <div><b>Mevcut oturumların yerine geçsin</b><div class="hint">İşaretlenmezse yeni oturumlar eklenir.</div></div></label>`,
    foot: `<button class="btn" onclick="closeModal()">Vazgeç</button>
      <button class="btn btn-primary" onclick="importPasted()"><svg class="ic"><use href="#i-spark"/></svg> AI ile Ayrıştır</button>`
  });
}

function importSessionsFile(file) {
  readSheet(file, rows => {
    if (!rows || rows.length < 2) return toast('Dosya boş görünüyor.', 'err');
    const headers = rows[0].map(h => String(h || ''));
    const data = rows.slice(1).filter(r => r.some(c => String(c).trim() !== ''));
    const p = P();
    const cTitle = guessCol(headers, ['egitimadi', 'eğitimadı', 'egitim', 'konu', 'baslik', 'başlık', 'ders', 'title']);
    const cDur = guessCol(headers, ['sure', 'süre', 'saat', 'duration']);
    const cInstr = guessCol(headers, ['egitmen', 'eğitmen', 'trainer', 'konusmaci', 'konuşmacı']);
    const cType = guessCol(headers, ['tur', 'tür', 'type', 'format']);
    const cDay = guessCol(headers, ['sabitgun', 'gun', 'gün', 'day', 'tarih']);
    const cTime = guessCol(headers, ['sabitsaat', 'saat', 'time', 'baslangic']);
    if (cTitle < 0) {
      closeModal();
      return aiMapSessions(headers, data.slice(0, 4), data);
    }
    const made = data.map((r, i) => {
      const s = newSession(p, { id: uid('s'), order: i });
      s.title = String(r[cTitle] || 'Eğitim').trim();
      s.duration = Math.max(0.5, parseFloat(String(r[cDur] ?? 3).replace(',', '.')) || 3);
      const instrs = [];
      if (cInstr >= 0 && r[cInstr]) String(r[cInstr]).split(/[,;\/]| ve /).forEach(n => n.trim() && instrs.push({ name: n.trim(), availability: [] }));
      headers.forEach((h, hi) => { if (/egitmen_?\d|eğitmen ?\d/i.test(h) && r[hi]) instrs.push({ name: String(r[hi]).trim(), availability: [] }); });
      s.instructors = instrs.length ? instrs : [{ name: '', availability: [] }];
      const tv = cType >= 0 ? norm(r[cType]) : '';
      const t = p.dayTypes.find(x => tv && norm(x.label).includes(tv.slice(0, 4))) ||
        (tv.includes('online') || tv.includes('uzakt') ? p.dayTypes.find(x => norm(x.label).includes('online')) : null);
      s.type = (t || p.dayTypes[0]).id;
      // alan eşlemesi: başlık adı = alan etiketi
      p.fields.forEach(f => {
        if (['title', 'duration', 'type', 'instructors'].includes(f.key)) return;
        const ci = guessCol(headers, [f.label, f.key]);
        if (ci >= 0 && r[ci] !== '') { s.v[f.key] = String(r[ci]).trim(); }
      });
      // sabit gün/saat
      if (cDay >= 0 && r[cDay]) {
        const dv = norm(r[cDay]);
        const day = allDays(p).find(d => norm(d.name) === dv || fmtShort(dayDate(p, d)) === String(r[cDay]).trim());
        if (day) {
          const start = cTime >= 0 ? String(r[cTime] || '') : '';
          const blk = sessionBlocks(p).find(b => start && b.start.startsWith(start.slice(0, 2))) || sessionBlocks(p)[0];
          s.dayId = day.id; s.blockId = blk.id; s.fullDay = s.duration >= dayCapacity(p);
        }
      }
      return s;
    });
    applyImported(made, $('impReplace') && $('impReplace').checked);
  });
}

function applyImported(made, replace) {
  const p = P();
  if (replace) p.sessions = made; else p.sessions = p.sessions.concat(made);
  save(); closeModal(); render();
  toast(`<b>${made.length}</b> oturum içe aktarıldı.`, 'ok');
}

/* ---------------- DIŞA AKTARMA ---------------- */
function exportExcel() {
  const p = P();
  const rows = p.sessions.map(s => {
    const d = s.dayId ? dayById(p, s.dayId) : null;
    const date = d ? dayDate(p, d) : null;
    const o = {
      'Gün': d ? d.name : 'Havuz',
      'Tarih': date ? fmtDate(date) : '',
      'Saat': sessionTime(p, s),
      'Eğitim Adı': s.title,
      'Süre (saat)': round1(s.duration),
      'Tür': typeById(p, s.type).label,
      'Eğitmen': activeInstructor(s).name,
      'Alternatif Eğitmenler': s.instructors.filter((_, i) => i !== (s.selectedInstr || 0)).map(i => i.name).filter(Boolean).join(', '),
      'Platform / Lokasyon': sessionPlatform(p, s)
    };
    p.fields.filter(f => !['title', 'duration', 'type', 'instructors', 'platform'].includes(f.key))
      .forEach(f => o[f.label] = (s.v && s.v[f.key]) || '');
    return o;
  });
  if (!rows.length) return toast('Dışa aktarılacak oturum yok.', 'warn');
  sheetToBook(rows, 'Program', `${p.name}.xlsx`);
  toast('Excel indirildi.', 'ok');
}

function exportImage(elId) {
  const el = elId ? $(elId) : (VIEW === 'grid' ? $('board') : $(VIEW + 'Pane'));
  if (!el) return;
  toast('Görsel hazırlanıyor…', 'info', 1800);
  const bg = getComputedStyle(document.body).backgroundColor;
  html2canvas(el, { scale: 2, backgroundColor: bg, useCORS: true, windowWidth: el.scrollWidth + 40 }).then(c => {
    c.toBlob(b => { dl(b, `${P().name}-${VIEW}.png`); toast('Görsel indirildi.', 'ok'); });
  }).catch(() => toast('Görsel oluşturulamadı.', 'err'));
}

/* ============================================================
   KATILIMCI MODÜLÜ
   ============================================================ */
let PEOPLE_FILES = { cand: null, staff: null, candRows: null, staffRows: null };
const PMAP_DEF = { tckn: 0, name: 1, email1: 3, email2: 4, phone: 5, pos: 6, org: 7, date: 8 };
const SMAP_DEF = { sicil: 1, tckn: 12, email: 51 };
const PCOLS = [
  ['tckn', 'TC Kimlik No'], ['sicil', 'Sicil No'], ['name', 'Ad Soyad'], ['pos', 'Pozisyon'],
  ['org', 'Organizasyon'], ['type', 'GM/Şube'], ['email1', 'E-posta'], ['email2', 'E-posta 2'],
  ['corp', 'Kurum E-posta'], ['phone', 'Telefon']
];

function renderPeople() {
  const p = P();
  const list = p.participants || [];
  const miss = list.filter(x => !x.corp || x.corp === '-').length;
  $('peoplePane').innerHTML = `
  <div class="pane-head"><div><h2><svg class="ic ic-lg"><use href="#i-users"/></svg> Katılımcılar</h2>
    <p>Aday listesi ve personel listesini birleştirir, eksikleri raporlar</p></div>
    <div class="rt">
      <button class="btn" onclick="addPerson()"><svg class="ic"><use href="#i-plus"/></svg> Kişi Ekle</button>
      <button class="btn" onclick="exportPeople()"><svg class="ic"><use href="#i-down"/></svg> Excel</button>
    </div></div>

  <div class="panel">
    <div class="panel-h"><svg class="ic"><use href="#i-up"/></svg>
      <div style="flex:1"><h3>Veri Yükleme</h3><p>Sütunlar otomatik tanınır, gerekirse elle düzeltebilirsin</p></div></div>
    <div class="panel-b">
      <div class="grid3">
        <div>
          <label class="lbl">1 · Aday Listesi</label>
          <div class="drop" id="dropCand" onclick="pickFile('.xlsx,.xls,.csv',f=>loadPeopleFile('cand',f))">
            <svg class="ic"><use href="#i-file"/></svg>
            <b id="candName">${PEOPLE_FILES.cand ? esc(PEOPLE_FILES.cand.name) : 'Dosya seç'}</b>
            <span>${PEOPLE_FILES.candRows ? PEOPLE_FILES.candRows.length - 1 + ' satır' : 'Katıl Bize / başvuru listesi'}</span></div>
        </div>
        <div>
          <label class="lbl">2 · Personel Listesi <span class="hint">(opsiyonel)</span></label>
          <div class="drop" onclick="pickFile('.xlsx,.xls,.csv',f=>loadPeopleFile('staff',f))">
            <svg class="ic"><use href="#i-file"/></svg>
            <b id="staffName">${PEOPLE_FILES.staff ? esc(PEOPLE_FILES.staff.name) : 'Dosya seç'}</b>
            <span>${PEOPLE_FILES.staffRows ? PEOPLE_FILES.staffRows.length - 1 + ' satır' : 'Sicil ve kurum e-postası için'}</span></div>
        </div>
        <div>
          <label class="lbl">3 · Tarih Aralığı <span class="hint">(opsiyonel)</span></label>
          <div class="row" style="margin-bottom:8px"><input type="date" id="pFrom"><input type="date" id="pTo"></div>
          <button class="btn btn-primary" style="width:100%" onclick="buildPeople()"><svg class="ic"><use href="#i-refresh"/></svg> Listeyi Oluştur</button>
        </div>
      </div>
      ${PEOPLE_FILES.candRows ? mappingUI() : '<p class="hint" style="margin-top:12px">Aday listesini yükledikten sonra sütun eşleştirme burada görünür.</p>'}
    </div>
  </div>

  <div class="panel">
    <div class="panel-h"><svg class="ic"><use href="#i-users"/></svg>
      <div style="flex:1"><h3>Liste</h3><p>${list.length} kişi${miss ? ` · ${miss} kişide kurum e-postası eksik` : ''}</p></div>
      <button class="btn btn-sm" onclick="aiMatchNames()"><svg class="ic ic-sm"><use href="#i-spark"/></svg> Akıllı Eşleştir</button>
      <button class="btn btn-sm" onclick="aiClassifyOrg()"><svg class="ic ic-sm"><use href="#i-spark"/></svg> GM/Şube Sınıflandır</button>
      <button class="btn btn-sm" onclick="aiDataReport()"><svg class="ic ic-sm"><use href="#i-alert"/></svg> Eksik Veri Raporu</button>
    </div>
    <div class="panel-b">${list.length ? peopleTable(list) : emptyBox('i-users', 'Liste boş', 'Aday listesini yükleyip "Listeyi Oluştur" de, ya da elle kişi ekle.')}</div>
  </div>`;
}

function mappingUI() {
  const h = (PEOPLE_FILES.candRows[0] || []).map((v, i) => `${XLSX.utils.encode_col(i)} · ${String(v || '').slice(0, 22)}`);
  const sel = (key, cur, rows) => `<select onchange="PMAP['${key}']=+this.value" style="min-width:150px">
      <option value="-1">— yok —</option>
      ${rows.map((t, i) => `<option value="${i}" ${cur === i ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const fields = [['tckn', 'TC Kimlik'], ['name', 'Ad Soyad'], ['pos', 'Pozisyon'], ['org', 'Organizasyon'],
  ['email1', 'E-posta'], ['email2', 'E-posta 2'], ['phone', 'Telefon'], ['date', 'Eğitim Tarihi']];
  return `<div style="margin-top:16px;border-top:1px dashed var(--border);padding-top:14px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <b style="font-size:12.5px">Sütun Eşleştirme</b>
      <button class="btn btn-sm" onclick="aiMapPeople()"><svg class="ic ic-sm"><use href="#i-spark"/></svg> AI ile otomatik eşle</button>
    </div>
    <div class="grid3">${fields.map(([k, l]) =>
    `<div><label class="lbl">${l}</label>${sel(k, PMAP[k], h)}</div>`).join('')}</div></div>`;
}

let PMAP = { ...PMAP_DEF }, SMAP = { ...SMAP_DEF };

function loadPeopleFile(which, file) {
  readSheet(file, rows => {
    PEOPLE_FILES[which] = file;
    PEOPLE_FILES[which + 'Rows'] = rows;
    if (which === 'cand') {
      const h = rows[0] || [];
      const g = (keys, def) => { const i = guessCol(h, keys); return i >= 0 ? i : def; };
      PMAP = {
        tckn: g(['tc', 'kimlik', 'tckn'], PMAP_DEF.tckn),
        name: g(['adsoyad', 'ad soyad', 'isim', 'name'], PMAP_DEF.name),
        pos: g(['pozisyon', 'unvan', 'ünvan', 'gorev', 'görev'], PMAP_DEF.pos),
        org: g(['organizasyon', 'birim', 'sube', 'şube', 'departman'], PMAP_DEF.org),
        email1: g(['eposta', 'e-posta', 'mail'], PMAP_DEF.email1),
        email2: g(['eposta2', 'mail2', 'ikincil'], PMAP_DEF.email2),
        phone: g(['telefon', 'gsm', 'cep'], PMAP_DEF.phone),
        date: g(['egitimtarihi', 'eğitim tarihi', 'tarih', 'baslama', 'işbaşı'], PMAP_DEF.date)
      };
    } else {
      const h = rows[0] || [];
      const g = (keys, def) => { const i = guessCol(h, keys); return i >= 0 ? i : def; };
      SMAP = {
        sicil: g(['sicil'], SMAP_DEF.sicil),
        tckn: g(['tc', 'kimlik', 'tckn'], SMAP_DEF.tckn),
        email: g(['kurumeposta', 'eposta', 'e-posta', 'mail'], SMAP_DEF.email)
      };
    }
    render();
    toast(`${file.name} okundu (${rows.length - 1} satır).`, 'ok');
  });
}

function buildPeople() {
  const p = P();
  if (!PEOPLE_FILES.candRows) return toast('Önce aday listesini yükle.', 'warn');
  const from = $('pFrom').value ? parseISO($('pFrom').value) : null;
  const to = $('pTo').value ? parseISO($('pTo').value) : null;
  if (to) to.setHours(23, 59, 59);

  const staffMap = {};
  if (PEOPLE_FILES.staffRows) {
    PEOPLE_FILES.staffRows.slice(1).forEach(r => {
      const tc = String(r[SMAP.tckn] ?? '').trim();
      if (tc) staffMap[tc] = { sicil: r[SMAP.sicil] ?? '', email: r[SMAP.email] ?? '' };
    });
  }
  const out = [];
  PEOPLE_FILES.candRows.slice(1).forEach(r => {
    if (!r.some(c => String(c).trim() !== '')) return;
    if ((from || to) && PMAP.date >= 0) {
      const d = excelDate(r[PMAP.date]);
      if (!d) return;
      if (from && d < from) return;
      if (to && d > to) return;
    }
    const tc = String(r[PMAP.tckn] ?? '').trim();
    const st = staffMap[tc] || {};
    const org = String(r[PMAP.org] ?? '');
    out.push({
      id: uid('u'), tckn: tc, sicil: st.sicil || '', name: String(r[PMAP.name] ?? '').trim(),
      pos: String(r[PMAP.pos] ?? ''), org, type: classifyOrg(org),
      email1: String(r[PMAP.email1] ?? ''), email2: String(r[PMAP.email2] ?? ''),
      corp: st.email || '', phone: String(r[PMAP.phone] ?? '')
    });
  });
  p.participants = out; save(); render();
  toast(`<b>${out.length}</b> katılımcı listeye eklendi.`, 'ok');
}

function classifyOrg(org) {
  const s = String(org || '').toLocaleLowerCase('tr-TR');
  if (s.includes('şubesi') && !s.includes('şube koordinasyon')) return 'Şube';
  return 'GM';
}

function peopleTable(list) {
  return `<div class="tbl-wrap" style="max-height:520px"><table class="tbl">
    <thead><tr>${PCOLS.map(c => `<th>${c[1]}</th>`).join('')}<th></th></tr></thead>
    <tbody>${list.map((u, i) => `<tr>
      ${PCOLS.map(c => {
    if (c[0] === 'type') return `<td><span class="pill ${u.type === 'Şube' ? 'pill-warn' : 'pill-info'}">${esc(u.type)}</span></td>`;
    if (c[0] === 'name') return `<td><b>${esc(u.name)}</b></td>`;
    const v = u[c[0]];
    return `<td>${v ? esc(v) : '<span class="pill pill-bad">eksik</span>'}</td>`;
  }).join('')}
      <td><button class="btn btn-sm btn-ghost" onclick="editPerson(${i})"><svg class="ic ic-sm"><use href="#i-edit"/></svg></button>
          <button class="btn btn-sm btn-ghost" onclick="delPerson(${i})"><svg class="ic ic-sm"><use href="#i-trash"/></svg></button></td>
    </tr>`).join('')}</tbody></table></div>`;
}
function addPerson() { P().participants.push({ id: uid('u'), tckn: '', sicil: '', name: 'Yeni Kişi', pos: '', org: '', type: 'GM', email1: '', email2: '', corp: '', phone: '' }); save(); render(); editPerson(P().participants.length - 1); }
function delPerson(i) { P().participants.splice(i, 1); save(); render(); }
function editPerson(i) {
  const u = P().participants[i];
  openModal({
    title: 'Katılımcı', icon: 'i-user', size: 'modal-lg',
    body: `<div class="grid2">${PCOLS.filter(c => c[0] !== 'type').map(c =>
      `<div class="field"><label class="lbl">${c[1]}</label><input id="pe_${c[0]}" value="${esc(u[c[0]] || '')}"></div>`).join('')}
      <div class="field"><label class="lbl">GM/Şube</label><select id="pe_type">
        <option ${u.type === 'GM' ? 'selected' : ''}>GM</option><option ${u.type === 'Şube' ? 'selected' : ''}>Şube</option></select></div></div>`,
    foot: `<button class="btn" onclick="closeModal()">Vazgeç</button>
      <button class="btn btn-primary" onclick="savePerson(${i})">Kaydet</button>`
  });
}
function savePerson(i) {
  const u = P().participants[i];
  PCOLS.forEach(c => { const el = $('pe_' + c[0]); if (el) u[c[0]] = el.value; });
  save(); closeModal(); render();
}
function exportPeople() {
  const list = P().participants;
  if (!list.length) return toast('Liste boş.', 'warn');
  sheetToBook(list.map(u => {
    const o = {}; PCOLS.forEach(c => o[c[1]] = u[c[0]] || ''); return o;
  }), 'Katılımcılar', `${P().name}-katilimcilar.xlsx`);
  toast('Excel indirildi.', 'ok');
}
