/* ============================================================
   DÜZENLEME — oturum, gün, blok, alan, kurulum
   ============================================================ */

/* ---------------- OTURUM ---------------- */
function newSession(p, over = {}) {
  return Object.assign({
    id: uid('s'), title: 'Yeni Oturum', duration: 3, type: (p.dayTypes[0] || {}).id || 'phy',
    instructors: [{ name: '', availability: [] }], selectedInstr: 0,
    dayId: null, blockId: null, fullDay: false, order: p.sessions.length, v: {}
  }, over);
}
function openNewSession(dayId, blockId) {
  const p = P();
  const s = newSession(p, { dayId: dayId || null, blockId: blockId || null });
  if (dayId) { const d = dayById(p, dayId); if (d) s.type = d.type; }
  p.sessions.push(s); save();
  openSession(s.id, true);
}
function deleteSession(id) {
  const p = P(), s = p.sessions.find(x => x.id === id); if (!s) return;
  if (!confirm(`"${s.title}" silinsin mi?`)) return;
  p.sessions = p.sessions.filter(x => x.id !== id); save(); render(); toast('Oturum silindi.', 'ok');
}

function openSession(id, isNew) {
  const p = P(), s = p.sessions.find(x => x.id === id); if (!s) return;
  const placeOpts = `<option value="">— Havuzda bırak —</option>` + allDays(p).map(d => {
    const date = dayDate(p, d);
    return sessionBlocks(p).map(b =>
      `<option value="${d.id}|${b.id}" ${s.dayId === d.id && s.blockId === b.id ? 'selected' : ''}>
        ${esc(d.name)} ${date ? fmtShort(date) : ''} · ${esc(b.label)} (${b.start})</option>`).join('');
  }).join('');

  const fields = p.fields.filter(f => !['title', 'duration', 'type', 'instructors'].includes(f.key)).map(f => {
    const v = (s.v && s.v[f.key]) ?? f.def ?? '';
    const inp = f.type === 'textarea'
      ? `<textarea id="sf_${f.key}" placeholder="${esc(f.label)}">${esc(v)}</textarea>`
      : `<input id="sf_${f.key}" type="${f.type === 'number' ? 'number' : (f.type === 'date' ? 'date' : 'text')}" value="${esc(v)}" placeholder="${esc(f.label)}">`;
    return `<div class="field"><label class="lbl">${esc(f.label)}</label>${inp}</div>`;
  }).join('');

  openModal({
    title: isNew ? 'Yeni Oturum' : 'Oturumu Düzenle', icon: 'i-book', size: 'modal-lg',
    sub: 'Alanlar Kurulum sekmesinden değiştirilebilir',
    body: `<div class="grid2">
      <div>
        <div class="field"><label class="lbl">Eğitim Adı</label><input id="sfTitle" value="${esc(s.title)}"></div>
        <div class="row">
          <div class="field"><label class="lbl">Süre (saat)</label><input id="sfDur" type="number" step="0.5" min="0.5" value="${s.duration}"></div>
          <div class="field"><label class="lbl">Tür</label><select id="sfType">
            ${p.dayTypes.map(t => `<option value="${t.id}" ${s.type === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div>
        </div>
        <div class="field"><label class="lbl">Yerleşim</label><select id="sfPlace">${placeOpts}</select></div>
        <div class="field"><label class="lbl">Eğitmenler</label>
          <div id="instrList"></div>
          <button class="btn btn-sm" onclick="addInstr('${s.id}')"><svg class="ic ic-sm"><use href="#i-plus"/></svg> Eğitmen Ekle</button>
          <button class="btn btn-sm" onclick="saveSessionForm('${s.id}',false);openMatrix('${s.id}')"><svg class="ic ic-sm"><use href="#i-cal"/></svg> Müsaitlik Matrisi</button>
        </div>
      </div>
      <div>${fields}
        <button class="btn btn-sm" onclick="saveSessionForm('${s.id}',false);aiDescribe('${s.id}',true)">
          <svg class="ic ic-sm"><use href="#i-spark"/></svg> Açıklamayı AI ile üret</button>
      </div></div>`,
    foot: `<button class="btn btn-danger lt" onclick="closeModal();deleteSession('${s.id}')"><svg class="ic"><use href="#i-trash"/></svg> Sil</button>
      <button class="btn" onclick="closeModal()">Vazgeç</button>
      <button class="btn btn-primary" onclick="saveSessionForm('${s.id}',true)"><svg class="ic"><use href="#i-check"/></svg> Kaydet</button>`
  });
  renderInstrList(s.id);
}
function renderInstrList(sid) {
  const p = P(), s = p.sessions.find(x => x.id === sid); if (!s || !$('instrList')) return;
  $('instrList').innerHTML = s.instructors.map((it, i) => `<div class="frow">
      <input type="radio" name="instrSel" ${i === (s.selectedInstr || 0) ? 'checked' : ''} onchange="P().sessions.find(x=>x.id==='${sid}').selectedInstr=${i};save()" title="Asıl eğitmen">
      <input type="text" value="${esc(it.name)}" placeholder="Ad Soyad" oninput="P().sessions.find(x=>x.id==='${sid}').instructors[${i}].name=this.value">
      <span class="chip">${(it.availability || []).length} slot</span>
      ${s.instructors.length > 1 ? `<button class="btn btn-sm btn-ghost" onclick="delInstr('${sid}',${i})"><svg class="ic ic-sm"><use href="#i-x"/></svg></button>` : ''}
    </div>`).join('');
}
function addInstr(sid) { const s = P().sessions.find(x => x.id === sid); s.instructors.push({ name: '', availability: [] }); save(); renderInstrList(sid); }
function delInstr(sid, i) {
  const s = P().sessions.find(x => x.id === sid); s.instructors.splice(i, 1);
  if ((s.selectedInstr || 0) >= s.instructors.length) s.selectedInstr = 0;
  save(); renderInstrList(sid);
}
function saveSessionForm(sid, close) {
  const p = P(), s = p.sessions.find(x => x.id === sid); if (!s) return;
  s.title = $('sfTitle').value.trim() || 'Adsız Oturum';
  s.duration = Math.max(0.5, parseFloat($('sfDur').value) || 1);
  s.type = $('sfType').value;
  p.fields.filter(f => !['title', 'duration', 'type', 'instructors'].includes(f.key)).forEach(f => {
    const el = $('sf_' + f.key); if (el) { s.v = s.v || {}; s.v[f.key] = el.value; }
  });
  const pl = $('sfPlace').value;
  if (!pl) { s.dayId = null; s.blockId = null; s.fullDay = false; }
  else {
    const [d, b] = pl.split('|');
    s.dayId = d; s.blockId = b; s.fullDay = +s.duration >= dayCapacity(p);
  }
  save(); if (close) closeModal(); render();
}

/* ---------------- satır içi düzenleme ---------------- */
function inlineEdit(el, sid, what) {
  const p = P(), s = p.sessions.find(x => x.id === sid); if (!s) return;
  const cur = what === 'duration' ? s.duration : activeInstructor(s).name;
  const inp = document.createElement('input');
  inp.className = 'inline-in'; inp.type = what === 'duration' ? 'number' : 'text';
  if (what === 'duration') { inp.step = '0.5'; inp.min = '0.5'; }
  inp.value = cur;
  el.innerHTML = ''; el.appendChild(inp); inp.focus(); inp.select();
  const done = () => {
    if (what === 'duration') s.duration = Math.max(0.5, parseFloat(inp.value) || 1);
    else activeInstructor(s).name = inp.value.trim();
    if (s.dayId) s.fullDay = +s.duration >= dayCapacity(p);
    save(); render();
  };
  inp.onblur = done;
  inp.onkeydown = e => { if (e.key === 'Enter') done(); if (e.key === 'Escape') render(); };
  inp.onclick = e => e.stopPropagation();
  inp.ondblclick = e => e.stopPropagation();
}

/* ---------------- müsaitlik matrisi ---------------- */
function openMatrix(sid) {
  const p = P(), s = p.sessions.find(x => x.id === sid); if (!s) return;
  const cols = [];
  allDays(p).forEach(d => sessionBlocks(p).forEach(b =>
    cols.push({ id: d.id + '|' + b.id, l1: d.name.slice(0, 3) + ' ' + (fmtShort(dayDate(p, d)) || ''), l2: b.start })));
  const rows = s.instructors.map((it, i) => `<tr class="${i === (s.selectedInstr || 0) ? 'sel' : ''}">
      <td class="nm"><label style="display:flex;gap:7px;align-items:center;cursor:pointer">
        <input type="radio" name="mx" ${i === (s.selectedInstr || 0) ? 'checked' : ''} onchange="setInstr('${sid}',${i})">
        ${esc(it.name || '(isimsiz)')}</label></td>
      ${cols.map(c => `<td class="mcell ${(it.availability || []).includes(c.id) ? 'on' : ''}" onclick="toggleAvail('${sid}',${i},'${c.id}')"></td>`).join('')}
    </tr>`).join('');
  openModal({
    title: 'Eğitmen Müsaitliği', sub: `${s.title} · ${round1(s.duration)} saat · hücreye tıklayarak müsait zamanları işaretle`,
    icon: 'i-cal', size: 'modal-xl',
    body: `<div style="overflow:auto;max-height:56vh"><table class="matrix">
      <thead><tr><th class="nm" style="z-index:4">Eğitmen</th>${cols.map(c => `<th>${esc(c.l1)}<br><small>${esc(c.l2)}</small></th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="hint" style="margin-top:10px">Hiç işaret koymazsan eğitmen her zaman müsait kabul edilir. İşaretlediğinde takvime yerleştirirken uyarı alırsın ve öneriler buna göre daralır.</p>`,
    foot: `<button class="btn btn-sm lt" onclick="clearAvail('${sid}')">Tümünü Temizle</button>
      <button class="btn btn-primary" onclick="closeModal();render()">Tamam</button>`
  });
}
function toggleAvail(sid, i, cid) {
  const s = P().sessions.find(x => x.id === sid), it = s.instructors[i];
  it.availability = it.availability || [];
  it.availability = it.availability.includes(cid) ? it.availability.filter(x => x !== cid) : it.availability.concat(cid);
  save(); openMatrix(sid);
}
function setInstr(sid, i) { const s = P().sessions.find(x => x.id === sid); s.selectedInstr = i; save(); openMatrix(sid); }
function clearAvail(sid) { const s = P().sessions.find(x => x.id === sid); s.instructors.forEach(i => i.availability = []); save(); openMatrix(sid); }

/* ---------------- gün / hafta / blok ---------------- */
function setDayLoc(id, v) { const d = dayById(P(), id); if (d) { d.loc = v; save(); if (VIEW !== 'grid') render(); } }
function editWeekLabel(wid, el) {
  const w = P().weeks.find(x => x.id === wid);
  const inp = document.createElement('input'); inp.className = 'inline-in'; inp.value = w.label;
  el.replaceWith(inp); inp.focus(); inp.select();
  const done = () => { w.label = inp.value.trim() || w.label; save(); render(); };
  inp.onblur = done; inp.onkeydown = e => { if (e.key === 'Enter') done(); };
}
function editDay(id) {
  const p = P(), d = dayById(p, id);
  openModal({
    title: 'Günü Düzenle', icon: 'i-cal',
    body: `<div class="field"><label class="lbl">Gün Adı</label><input id="dName" value="${esc(d.name)}"></div>
      <div class="field"><label class="lbl">Tür</label><select id="dType">
        ${p.dayTypes.map(t => `<option value="${t.id}" ${d.type === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div>
      <div class="field"><label class="lbl">Lokasyon</label><input id="dLoc" value="${esc(d.loc || '')}" placeholder="${esc(typeById(p, d.type).location || '')}"></div>
      <div class="field"><label class="lbl">Tarih (boş bırakılırsa otomatik)</label><input id="dDate" type="date" value="${esc(d.date || '')}"></div>
      <label class="cbx" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="dOff" ${d.off ? 'checked' : ''}> Bu gün program dışı (tatil vb.)</label>`,
    foot: `<button class="btn btn-danger lt" onclick="closeModal();removeDay('${id}')">Günü Sil</button>
      <button class="btn" onclick="closeModal()">Vazgeç</button>
      <button class="btn btn-primary" onclick="saveDay('${id}')">Kaydet</button>`
  });
}
function saveDay(id) {
  const d = dayById(P(), id);
  d.name = $('dName').value.trim() || d.name; d.type = $('dType').value;
  d.loc = $('dLoc').value.trim(); d.date = $('dDate').value || null; d.off = $('dOff').checked;
  save(); closeModal(); render();
}
function addDay(wid) {
  const p = P(), w = p.weeks.find(x => x.id === wid);
  const last = w.days[w.days.length - 1];
  const idx = last ? (TRDAYS.indexOf(last.name) + 1) % 7 : 1;
  w.days.push({ id: uid('d'), name: TRDAYS[idx] || 'Yeni Gün', type: last ? last.type : p.dayTypes[0].id, loc: '', off: false });
  save(); render();
}
function removeDay(id) {
  const p = P();
  if (p.sessions.some(s => s.dayId === id) && !confirm('Bu güne yerleşmiş oturumlar havuza geri gönderilecek. Devam?')) return;
  p.sessions.forEach(s => { if (s.dayId === id) { s.dayId = null; s.blockId = null; s.fullDay = false; } });
  p.fixed = p.fixed.filter(f => f.dayId !== id);
  p.weeks.forEach(w => w.days = w.days.filter(d => d.id !== id));
  save(); closeModal(); render();
}
function addWeek() {
  const p = P();
  p.weeks.push(makeWeek(`${p.weeks.length + 1}. Hafta`, ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'], p.dayTypes[0].id, p.weeks.length));
  save(); render();
}
function removeWeek(wid) {
  const p = P(), w = p.weeks.find(x => x.id === wid);
  if (!confirm(`"${w.label}" ve içindeki günler silinsin mi? Oturumlar havuza döner.`)) return;
  w.days.forEach(d => p.sessions.forEach(s => { if (s.dayId === d.id) { s.dayId = null; s.blockId = null; s.fullDay = false; } }));
  p.weeks = p.weeks.filter(x => x.id !== wid); save(); render();
}
function editFixed(dayId, blockId) {
  const p = P(), fx = p.fixed.find(f => f.dayId === dayId && f.blockId === blockId);
  const b = blockById(p, blockId);
  openModal({
    title: 'Güne Özel Etkinlik', sub: `${dayById(p, dayId).name} · ${b.label}`, icon: 'i-spark',
    body: `<div class="field"><label class="lbl">Etkinlik Metni</label>
        <input id="fxLabel" value="${esc(fx ? fx.label : '')}" placeholder="Örn: ☕ Tanışma Kahvaltısı"></div>
      <p class="hint">Boş bırakıp kaydedersen bu güne özel etkinlik kaldırılır ve blok "${esc(b.label)}" olarak görünür.</p>`,
    foot: `<button class="btn" onclick="closeModal()">Vazgeç</button>
      <button class="btn btn-primary" onclick="saveFixed('${dayId}','${blockId}')">Kaydet</button>`
  });
  setTimeout(() => $('fxLabel')?.focus(), 60);
}
function saveFixed(dayId, blockId) {
  const p = P(), v = $('fxLabel').value.trim();
  p.fixed = p.fixed.filter(f => !(f.dayId === dayId && f.blockId === blockId));
  if (v) p.fixed.push({ id: uid('f'), dayId, blockId, label: v });
  save(); closeModal(); render();
}

/* ---------------- KURULUM SAYFASI ---------------- */
function renderSetup() {
  const p = P();
  const ai = DB.settings.ai;
  $('setupPane').innerHTML = `
  <div class="pane-head"><div><h2><svg class="ic ic-lg"><use href="#i-cog"/></svg> Kurulum</h2>
    <p>Bu program için her şeyi buradan şekillendir · değişiklikler anında uygulanır</p></div></div>

  <div class="grid2" style="align-items:start">
   <div>
    <div class="panel">
      <div class="panel-h"><svg class="ic"><use href="#i-file"/></svg><h3>Program Bilgileri</h3></div>
      <div class="panel-b">
        <div class="field"><label class="lbl">Program Adı</label><input value="${esc(p.name)}" onchange="P().name=this.value;save();renderTabs();render()"></div>
        <div class="row">
          <div class="field"><label class="lbl">Kurum</label><input value="${esc(p.meta.org || '')}" onchange="P().meta.org=this.value;save()"></div>
          <div class="field"><label class="lbl">Sorumlu</label><input value="${esc(p.meta.owner || '')}" onchange="P().meta.owner=this.value;save()"></div>
        </div>
        <div class="field"><label class="lbl">Başlangıç Tarihi</label><input type="date" value="${esc(p.startDate || '')}" onchange="onStartDateChange(this.value)"></div>
        <div class="field"><label class="lbl">Not / Açıklama</label><textarea onchange="P().meta.note=this.value;save()" placeholder="Programın amacı, hedef kitlesi…">${esc(p.meta.note || '')}</textarea></div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-h"><svg class="ic"><use href="#i-clock"/></svg>
        <div style="flex:1"><h3>Zaman Blokları</h3><p>Günün iskeleti — ders blokları ve aralar</p></div>
        <button class="btn btn-sm" onclick="addBlock()"><svg class="ic ic-sm"><use href="#i-plus"/></svg> Blok</button></div>
      <div class="panel-b">${p.blocks.map((b, i) => `<div class="frow">
          <span class="grip"><svg class="ic ic-sm"><use href="#i-grip"/></svg></span>
          <input type="text" value="${esc(b.label)}" onchange="P().blocks[${i}].label=this.value;save();render()">
          <input type="time" value="${esc(b.start)}" style="width:104px;flex:none" onchange="P().blocks[${i}].start=this.value;save();render()">
          <input type="time" value="${esc(b.end)}" style="width:104px;flex:none" onchange="P().blocks[${i}].end=this.value;save();render()">
          <select onchange="P().blocks[${i}].kind=this.value;save();render()">
            <option value="session" ${b.kind === 'session' ? 'selected' : ''}>Ders</option>
            <option value="break" ${b.kind === 'break' ? 'selected' : ''}>Ara</option></select>
          ${b.kind === 'session' ? `<input type="number" step="0.5" value="${b.cap ?? 3}" style="width:66px;flex:none" title="Kapasite (saat)" onchange="P().blocks[${i}].cap=parseFloat(this.value)||3;save();render()">` : ''}
          <button class="btn btn-sm btn-ghost" onclick="removeBlock(${i})"><svg class="ic ic-sm"><use href="#i-x"/></svg></button>
        </div>`).join('')}
        <p class="hint">Kapasite, o bloğa sığacak toplam ders saatidir. Toplam gün kapasitesi <b>${dayCapacity(p)} saat</b> — bu süreye eşit oturumlar "tam gün" sayılır.</p>
      </div>
    </div>

    <div class="panel">
      <div class="panel-h"><svg class="ic"><use href="#i-pin"/></svg>
        <div style="flex:1"><h3>Gün Türleri</h3><p>Renk ve varsayılan lokasyon</p></div>
        <button class="btn btn-sm" onclick="addDayType()"><svg class="ic ic-sm"><use href="#i-plus"/></svg> Tür</button></div>
      <div class="panel-b">${p.dayTypes.map((t, i) => `<div class="frow">
          <input type="color" value="${esc(t.color)}" style="width:42px;flex:none" onchange="P().dayTypes[${i}].color=this.value;save();render()">
          <input type="text" value="${esc(t.label)}" onchange="P().dayTypes[${i}].label=this.value;save();render()">
          <input type="text" value="${esc(t.location || '')}" placeholder="Varsayılan lokasyon" onchange="P().dayTypes[${i}].location=this.value;save();render()">
          <select style="min-width:92px" onchange="P().dayTypes[${i}].icon=this.value;save();render()">
            <option value="i-pin" ${t.icon === 'i-pin' ? 'selected' : ''}>Salon</option>
            <option value="i-video" ${t.icon === 'i-video' ? 'selected' : ''}>Online</option>
            <option value="i-book" ${t.icon === 'i-book' ? 'selected' : ''}>Atölye</option></select>
          ${p.dayTypes.length > 1 ? `<button class="btn btn-sm btn-ghost" onclick="removeDayType(${i})"><svg class="ic ic-sm"><use href="#i-x"/></svg></button>` : ''}
        </div>`).join('')}</div>
    </div>
   </div>

   <div>
    <div class="panel">
      <div class="panel-h"><svg class="ic"><use href="#i-layers"/></svg>
        <div style="flex:1"><h3>Haftalar ve Günler</h3><p>Takvimin uzunluğu tamamen serbest</p></div>
        <button class="btn btn-sm" onclick="addWeek()"><svg class="ic ic-sm"><use href="#i-plus"/></svg> Hafta</button></div>
      <div class="panel-b">${p.weeks.map(w => `<div style="margin-bottom:14px">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:7px">
            <input type="text" value="${esc(w.label)}" onchange="P().weeks.find(x=>x.id==='${w.id}').label=this.value;save();render()">
            <button class="btn btn-sm" onclick="addDay('${w.id}')"><svg class="ic ic-sm"><use href="#i-plus"/></svg> Gün</button>
            <button class="btn btn-sm btn-ghost" onclick="removeWeek('${w.id}')"><svg class="ic ic-sm"><use href="#i-trash"/></svg></button>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${w.days.map(d => {
            const t = typeById(p, d.type);
            return `<button class="btn btn-sm" onclick="editDay('${d.id}')" style="border-left:3px solid ${esc(t.color)}${d.off ? ';opacity:.5' : ''}">
              ${esc(d.name)} <span class="hint">${fmtShort(dayDate(p, allDays(p).find(x => x.id === d.id))) || ''}</span></button>`;
          }).join('')}</div></div>`).join('') || '<p class="hint">Henüz hafta yok.</p>'}</div>
    </div>

    <div class="panel">
      <div class="panel-h"><svg class="ic"><use href="#i-list"/></svg>
        <div style="flex:1"><h3>Oturum Alanları</h3><p>İstediğin bilgiyi ekle, çıkar, kartta göster</p></div>
        <button class="btn btn-sm" onclick="addField()"><svg class="ic ic-sm"><use href="#i-plus"/></svg> Alan</button></div>
      <div class="panel-b">${p.fields.map((f, i) => `<div class="frow ${f.core ? 'core' : ''}">
          <span class="grip" title="${f.core ? 'Çekirdek alan' : 'Sırala'}"><svg class="ic ic-sm"><use href="#i-grip"/></svg></span>
          <input type="text" value="${esc(f.label)}" onchange="P().fields[${i}].label=this.value;save();render()">
          ${f.core ? `<span class="chip">çekirdek</span>` : `<select onchange="P().fields[${i}].type=this.value;save();render()">
            <option value="text" ${f.type === 'text' ? 'selected' : ''}>Metin</option>
            <option value="textarea" ${f.type === 'textarea' ? 'selected' : ''}>Uzun metin</option>
            <option value="number" ${f.type === 'number' ? 'selected' : ''}>Sayı</option>
            <option value="date" ${f.type === 'date' ? 'selected' : ''}>Tarih</option>
            <option value="url" ${f.type === 'url' ? 'selected' : ''}>Bağlantı</option></select>`}
          <label class="cbx"><input type="checkbox" ${f.card ? 'checked' : ''} onchange="P().fields[${i}].card=this.checked;save();render()"> kart</label>
          <label class="cbx"><input type="checkbox" ${f.grid ? 'checked' : ''} onchange="P().fields[${i}].grid=this.checked;save();render()"> takvim</label>
          ${f.core ? '' : `<button class="btn btn-sm btn-ghost" onclick="removeField(${i})"><svg class="ic ic-sm"><use href="#i-x"/></svg></button>`}
        </div>`).join('')}</div>
    </div>

    <div class="panel">
      <div class="panel-h"><svg class="ic"><use href="#i-spark"/></svg>
        <div style="flex:1"><h3>Güne Özel Etkinlikler</h3><p>Kahvaltı, yemek, açılış konuşması…</p></div></div>
      <div class="panel-b">${p.fixed.length ? p.fixed.map(f => {
        const d = dayById(p, f.dayId); const b = blockById(p, f.blockId);
        return `<div class="frow"><span class="chip">${esc(d ? d.name : '?')} · ${esc(b ? b.label : '?')}</span>
          <input type="text" value="${esc(f.label)}" onchange="(P().fixed.find(x=>x.id==='${f.id}')||{}).label=this.value;save();render()">
          <button class="btn btn-sm btn-ghost" onclick="P().fixed=P().fixed.filter(x=>x.id!=='${f.id}');save();render()"><svg class="ic ic-sm"><use href="#i-x"/></svg></button></div>`;
      }).join('') : '<p class="hint">Takvimde bir ara bloğuna çift tıklayarak o güne özel etkinlik tanımlayabilirsin.</p>'}</div>
    </div>

    <div class="panel">
      <div class="panel-h"><svg class="ic"><use href="#i-cog"/></svg><h3>Davranış</h3></div>
      <div class="panel-b">
        <label class="frow" style="cursor:pointer"><input type="checkbox" ${p.opts.enforceType ? 'checked' : ''} onchange="P().opts.enforceType=this.checked;save()">
          <div><b>Tür eşleşmesi zorunlu</b><div class="hint">Online oturum fiziki güne bırakılırsa uyarır (oryantasyonda açık olmalı).</div></div></label>
        <label class="frow" style="cursor:pointer"><input type="checkbox" ${p.opts.showSuggest ? 'checked' : ''} onchange="P().opts.showSuggest=this.checked;save();render()">
          <div><b>Havuzda yer önerisi göster</b><div class="hint">Müsaitlik ve doluluk hesabına göre uygun günleri listeler.</div></div></label>
        <div class="field" style="margin-top:10px"><label class="lbl">Kapasite toleransı (saat)</label>
          <input type="number" step="0.5" value="${p.opts.tolerance}" onchange="P().opts.tolerance=parseFloat(this.value)||0;save()"></div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-h"><svg class="ic"><use href="#i-spark"/></svg>
        <div style="flex:1"><h3>Yapay Zekâ Bağlantısı</h3><p>Kurum içi Azure OpenAI servisi</p></div>
        <span class="ai-badge">gpt-5.1</span></div>
      <div class="panel-b">
        <label class="frow" style="cursor:pointer"><input type="checkbox" ${ai.enabled ? 'checked' : ''} onchange="DB.settings.ai.enabled=this.checked;save();render()">
          <div><b>AI özelliklerini kullan</b><div class="hint">Kapalıyken uygulama tüm planlama işlevleriyle çevrimdışı çalışır.</div></div></label>
        <div class="field"><label class="lbl">Endpoint</label><input value="${esc(ai.endpoint)}" onchange="DB.settings.ai.endpoint=this.value;save()"></div>
        <div class="row">
          <div class="field"><label class="lbl">Deployment</label><input value="${esc(ai.deployment)}" onchange="DB.settings.ai.deployment=this.value;save()"></div>
          <div class="field"><label class="lbl">API Version</label><input value="${esc(ai.apiVersion)}" onchange="DB.settings.ai.apiVersion=this.value;save()"></div>
        </div>
        <div class="field"><label class="lbl">API Anahtarı</label><input type="password" value="${esc(ai.key)}" onchange="DB.settings.ai.key=this.value;save()"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button class="btn" onclick="testAI()"><svg class="ic"><use href="#i-refresh"/></svg> Bağlantıyı Test Et</button>
          <button class="btn" onclick="aiDiagnose()"><svg class="ic"><use href="#i-alert"/></svg> Tanılama Raporu</button>
        </div>
        <p id="aiTestOut" class="hint" style="margin-top:10px"></p>
        <p class="hint" style="margin-top:8px">Bağlantı kurulamıyorsa <b>Tanılama Raporu</b> sorunun ağda mı,
        anahtarda mı yoksa tarayıcıda mı olduğunu tespit eder ve yöneticine iletebileceğin bir metin üretir.</p>
      </div>
    </div>
   </div>
  </div>`;
}
function addBlock() {
  P().blocks.push({ id: uid('b'), label: 'Yeni Blok', start: '17:00', end: '18:00', kind: 'session', cap: 1 });
  save(); render();
}
function removeBlock(i) {
  const p = P(), b = p.blocks[i];
  if (p.sessions.some(s => s.blockId === b.id) && !confirm('Bu bloktaki oturumlar havuza dönecek. Devam?')) return;
  p.sessions.forEach(s => { if (s.blockId === b.id) { s.dayId = null; s.blockId = null; s.fullDay = false; } });
  p.fixed = p.fixed.filter(f => f.blockId !== b.id);
  p.blocks.splice(i, 1); save(); render();
}
function addDayType() { P().dayTypes.push({ id: uid('t'), label: 'Yeni Tür', color: '#0891b2', location: '', icon: 'i-pin' }); save(); render(); }
function removeDayType(i) {
  const p = P(), t = p.dayTypes[i];
  if (allDays(p).some(d => d.type === t.id)) return toast('Bu tür kullanımda — önce günlerin türünü değiştir.', 'warn');
  p.dayTypes.splice(i, 1); save(); render();
}
function addField() {
  const key = 'f_' + Math.random().toString(36).slice(2, 7);
  P().fields.push({ key, label: 'Yeni Alan', type: 'text', card: true, grid: false, def: '' });
  save(); render();
}
function removeField(i) {
  const p = P(), f = p.fields[i];
  if (!confirm(`"${f.label}" alanı ve içindeki veriler silinsin mi?`)) return;
  p.sessions.forEach(s => { if (s.v) delete s.v[f.key]; });
  p.fields.splice(i, 1); save(); render();
}
