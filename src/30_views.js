/* ============================================================
   GÖRÜNÜMLER — takvim ızgarası, kartlar, ajanda, tablo
   ============================================================ */

/* ---------------- TAKVİM IZGARASI ---------------- */
function renderGrid() {
  const p = P();
  renderPool();
  const board = $('board');
  if (!p.weeks.length) {
    board.innerHTML = emptyBox('i-cal', 'Henüz gün tanımlı değil', 'Kurulum sekmesinden hafta ve gün ekleyerek başla.',
      `<button class="btn btn-primary" onclick="setView('setup')">Kuruluma Git</button>`);
    return;
  }
  board.innerHTML = p.weeks.map((w, wi) => weekHTML(p, w, wi)).join('');
}

function weekHTML(p, w, wi) {
  const time = p.blocks.map(b => b.kind === 'session'
    ? `<div class="tlabel" style="height:var(--block-h)"><span>${esc(b.start)}</span><small>${esc(b.end)}</small></div>`
    : `<div class="tlabel break" style="height:34px">${esc(b.start)}</div>`).join('');
  return `<div class="week">
    <div class="week-bar">
      <h4><svg class="ic ic-sm"><use href="#i-layers"/></svg> <span class="editable" ondblclick="editWeekLabel('${w.id}',this)">${esc(w.label)}</span></h4>
      <div class="rt">
        <span class="chip">${w.days.length} gün · ${round1(w.days.reduce((a, d) => a + dayLoad(p, d.id), 0))} saat</span>
        <button class="btn btn-sm" onclick="addDay('${w.id}')"><svg class="ic ic-sm"><use href="#i-plus"/></svg> Gün</button>
      </div>
    </div>
    <div class="week-grid">
      <div class="timecol">${time}</div>
      <div class="days">${w.days.map((d, di) => dayHTML(p, d, wi, di)).join('')}</div>
    </div>
  </div>`;
}

function dayHTML(p, d, wi, di) {
  const t = typeById(p, d.type);
  const date = dayDate(p, { ...d, wi, di });
  const load = dayLoad(p, d.id), cap = dayCapacity(p);
  const pct = Math.min(100, cap ? (load / cap) * 100 : 0);
  const cls = load > cap ? 'over' : (load >= cap * .8 ? 'warn' : '');
  const body = p.blocks.map(b => b.kind === 'session'
    ? sessionBlockHTML(p, d, b)
    : breakBlockHTML(p, d, b)).join('');
  return `<div class="daycol ${d.off ? 'off' : ''}" data-day="${d.id}">
    <div class="dhead" style="background:${esc(t.color)}">
      <b>${esc(d.name)}</b><span>${date ? fmtShort(date) : '--.--'}</span>
      <div class="dh-tools">
        <button onclick="editDay('${d.id}')" title="Günü düzenle"><svg class="ic ic-sm"><use href="#i-edit"/></svg></button>
        <button onclick="removeDay('${d.id}')" title="Günü sil"><svg class="ic ic-sm"><use href="#i-x"/></svg></button>
      </div>
    </div>
    ${body}
    <div class="loadbar"><i class="${cls}" style="width:${pct}%"></i></div>
    <div class="dfoot"><input value="${esc(d.loc || t.location || '')}" placeholder="Lokasyon"
        onchange="setDayLoc('${d.id}',this.value)" title="Bu günün lokasyonu"></div>
  </div>`;
}

function sessionBlockHTML(p, d, b) {
  const list = sessionsIn(p, d.id, b.id);
  const load = slotLoad(p, d.id, b.id);
  const over = load > (+b.cap || 3) + (p.opts.tolerance || 0);
  const first = sessionBlocks(p)[0].id === b.id;
  const cards = list.map(s => s.fullDay && !first ? contHTML(p, s) : cardHTML(p, s, false)).join('');
  return `<div class="block ${over ? 'full' : ''}" style="height:var(--block-h)" data-day="${d.id}" data-block="${b.id}"
     ondragover="allowDrop(event)" ondragleave="leaveDrop(event)" ondrop="dropSession(event)"
     ondblclick="if(event.target===this)openNewSession('${d.id}','${b.id}')">${cards}</div>`;
}

function breakBlockHTML(p, d, b) {
  const fx = p.fixed.find(f => f.dayId === d.id && f.blockId === b.id);
  return `<div class="block-break ${fx ? 'fixed' : ''}" style="height:34px" ondblclick="editFixed('${d.id}','${b.id}')" title="Çift tıkla: bu güne özel etkinlik">
    ${fx ? esc(fx.label) : esc(b.label)}
    <span class="bb-edit"><svg class="ic ic-sm"><use href="#i-edit"/></svg></span></div>`;
}

function contHTML(p, s) {
  return `<div class="card" style="opacity:.55;border-left-color:${esc(typeById(p, s.type).color)};cursor:default" draggable="false">
    <div class="card-t" style="padding-right:0">↳ ${esc(s.title)}</div>
    <div class="card-m"><span>tam gün devam</span></div></div>`;
}

function cardHTML(p, s, inPool) {
  const t = typeById(p, s.type);
  const instr = activeInstructor(s).name;
  const gridFields = p.fields.filter(f => f.grid && !['title', 'duration', 'instructors', 'type'].includes(f.key));
  const extra = gridFields.map(f => {
    const v = s.v && s.v[f.key]; if (!v) return '';
    return `<span title="${esc(f.label)}"><b>${esc(v)}</b></span>`;
  }).join('');
  const sugg = inPool && p.opts.showSuggest ? suggestHTML(p, s) : '';
  return `<div class="card" id="c_${s.id}" draggable="true" data-sid="${s.id}"
      style="border-left-color:${esc(t.color)}"
      ondragstart="dragStart(event,'${s.id}')" ondragend="dragEnd(event)" ondblclick="openSession('${s.id}')">
    <div class="card-tools">
      <button onclick="event.stopPropagation();openMatrix('${s.id}')" title="Eğitmen müsaitliği"><svg class="ic ic-sm"><use href="#i-cal"/></svg></button>
      <button onclick="event.stopPropagation();openSession('${s.id}')" title="Düzenle"><svg class="ic ic-sm"><use href="#i-edit"/></svg></button>
      <button onclick="event.stopPropagation();deleteSession('${s.id}')" title="Sil"><svg class="ic ic-sm"><use href="#i-trash"/></svg></button>
    </div>
    <div class="card-t" title="${esc(s.title)}">${esc(s.title)}${s.fullDay ? ' <span style="opacity:.6">· tam gün</span>' : ''}</div>
    <div class="card-m">
      <span class="editable" ondblclick="event.stopPropagation();inlineEdit(this,'${s.id}','instr')" title="Eğitmen"><svg class="ic ic-sm"><use href="#i-user"/></svg><b>${esc(instr)}</b></span>
      ${extra}
      <span class="dur-pill editable" ondblclick="event.stopPropagation();inlineEdit(this,'${s.id}','duration')">${round1(s.duration)}s</span>
    </div>
    ${sugg}</div>`;
}

function suggestHTML(p, s) {
  const cands = suggestSlots(p, s).slice(0, 4);
  if (!cands.length) return `<div class="sugg"><b>Öneri</b><span style="color:var(--danger)">Uygun boş yer yok</span></div>`;
  return `<div class="sugg"><b>Önerilen yerler</b>${cands.map(c =>
    `<u onclick="event.stopPropagation();place('${s.id}','${c.dayId}','${c.blockId}')">${esc(c.label)}</u>`).join('')}</div>`;
}

function suggestSlots(p, s) {
  const out = [];
  const av = activeInstructor(s).availability || [];
  const full = +s.duration >= dayCapacity(p);
  allDays(p).forEach(d => {
    if (d.off) return;
    if (p.opts.enforceType && s.type && d.type !== s.type) return;
    const date = dayDate(p, d);
    if (full) {
      if (p.sessions.some(x => x.dayId === d.id && x.id !== s.id)) return;
      if (av.length && !sessionBlocks(p).some(b => av.includes(d.id + '|' + b.id))) return;
      out.push({ dayId: d.id, blockId: sessionBlocks(p)[0].id, label: `${fmtShort(date)} ${d.name}` });
    } else {
      sessionBlocks(p).forEach(b => {
        if (av.length && !av.includes(d.id + '|' + b.id)) return;
        if (slotLoad(p, d.id, b.id, s.id) + (+s.duration) > (+b.cap || 3) + (p.opts.tolerance || 0)) return;
        out.push({ dayId: d.id, blockId: b.id, label: `${fmtShort(date)} ${d.name.slice(0, 3)} ${b.start}` });
      });
    }
  });
  return out;
}

function renderPool() {
  const p = P(), pool = poolSessions(p);
  $('poolCount').textContent = pool.length;
  $('poolBody').innerHTML = pool.length
    ? pool.map(s => cardHTML(p, s, true)).join('')
    : `<div class="pool-empty"><svg class="ic"><use href="#i-inbox"/></svg>
        Havuz boş.<br>Tüm oturumlar takvime yerleşti.</div>`;
}

/* ---------------- SÜRÜKLE & BIRAK ---------------- */
let DRAG = null;
function dragStart(e, id) { DRAG = id; e.dataTransfer.setData('sid', id); e.currentTarget.classList.add('dragging'); }
function dragEnd(e) { e.currentTarget.classList.remove('dragging'); document.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over')); DRAG = null; }
function allowDrop(e) { e.preventDefault(); const t = e.currentTarget; t.classList.add('drag-over'); }
function leaveDrop(e) { e.currentTarget.classList.remove('drag-over'); }

function dropSession(e) {
  e.preventDefault();
  const box = e.currentTarget; box.classList.remove('drag-over');
  const id = e.dataTransfer.getData('sid') || DRAG; if (!id) return;
  const p = P(), s = p.sessions.find(x => x.id === id); if (!s) return;

  if (box.id === 'poolBody') { s.dayId = null; s.blockId = null; s.fullDay = false; save(); render(); return; }

  const dayId = box.dataset.day, blockId = box.dataset.block;
  const before = e.target.closest('.card');
  if (!place(id, dayId, blockId, before && before.dataset.sid !== id ? before.dataset.sid : null)) return;
}

function place(id, dayId, blockId, beforeId) {
  const p = P(), s = p.sessions.find(x => x.id === id); if (!s) return false;
  const day = dayById(p, dayId); if (!day) return false;
  const b = blockById(p, blockId);

  if (p.opts.enforceType && s.type && day.type !== s.type) {
    if (!confirm(`Bu oturum "${typeById(p, s.type).label}" türünde, gün ise "${typeById(p, day.type).label}". Yine de yerleştirilsin mi?`)) return false;
  }
  const av = activeInstructor(s).availability || [];
  if (av.length) {
    const ok = s.duration >= dayCapacity(p)
      ? sessionBlocks(p).some(x => av.includes(dayId + '|' + x.id))
      : av.includes(dayId + '|' + blockId);
    if (!ok && !confirm(`${activeInstructor(s).name} bu zaman diliminde müsait görünmüyor. Yine de atansın mı?`)) return false;
  }
  if (+s.duration >= dayCapacity(p)) {
    const busy = p.sessions.some(x => x.id !== id && x.dayId === dayId);
    if (busy) { toast('Tam günlük oturum için günün tamamen boş olması gerekir.', 'warn'); return false; }
    s.fullDay = true; s.blockId = sessionBlocks(p)[0].id;
  } else {
    s.fullDay = false;
    const load = slotLoad(p, dayId, blockId, id);
    if (load + (+s.duration) > (+b.cap || 3) + (p.opts.tolerance || 0)) {
      if (!confirm(`Bu bloğun süresi aşılıyor (${round1(load + +s.duration)} / ${b.cap} saat). Devam edilsin mi?`)) return false;
    }
    s.blockId = blockId;
  }
  s.dayId = dayId;
  reorder(p, s, beforeId);
  save(); render(); return true;
}
function reorder(p, s, beforeId) {
  const sibs = p.sessions.filter(x => x.dayId === s.dayId && x.blockId === s.blockId && x.id !== s.id)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const idx = beforeId ? sibs.findIndex(x => x.id === beforeId) : sibs.length;
  sibs.splice(idx < 0 ? sibs.length : idx, 0, s);
  sibs.forEach((x, i) => x.order = i);
}

/* ---------------- KART GÖRÜNÜMÜ ---------------- */
function docHero(p) {
  const days = allDays(p).map(d => dayDate(p, d)).filter(Boolean).sort((a, b) => a - b);
  const range = days.length ? `${fmtDate(days[0], true)} – ${fmtDate(days[days.length - 1], true)}` : 'Tarih belirlenmedi';
  const hours = round1(p.sessions.filter(s => s.dayId).reduce((a, s) => a + (+s.duration || 0), 0));
  return `<div class="doc-hero">
    <img src="${LOGO}" alt="Kuveyt Türk Akademi"><div class="dh-sep"></div>
    <div style="flex:1">
      <h1>${esc(p.name)}</h1>
      <div class="sub">
        <span><svg class="ic ic-sm"><use href="#i-cal"/></svg> ${esc(range)}</span>
        <span><svg class="ic ic-sm"><use href="#i-clock"/></svg> ${hours} saat</span>
        <span><svg class="ic ic-sm"><use href="#i-book"/></svg> ${p.sessions.filter(s => s.dayId).length} oturum</span>
        ${p.participants.length ? `<span><svg class="ic ic-sm"><use href="#i-users"/></svg> ${p.participants.length} katılımcı</span>` : ''}
      </div>
    </div></div>`;
}

function plannedDays(p) {
  return allDays(p)
    .map(d => ({ day: d, date: dayDate(p, d), items: p.sessions.filter(s => s.dayId === d.id) }))
    .filter(x => x.items.length)
    .sort((a, b) => (a.date && b.date) ? a.date - b.date : 0)
    .map(x => {
      x.items.sort((a, b) => {
        const bi = p.blocks.findIndex(z => z.id === a.blockId) - p.blocks.findIndex(z => z.id === b.blockId);
        return bi !== 0 ? bi : (a.order || 0) - (b.order || 0);
      });
      return x;
    });
}

function renderCards() {
  const p = P(), groups = plannedDays(p);
  const head = `<div class="pane-head">
      <div><h2><svg class="ic ic-lg"><use href="#i-grid"/></svg> Program Kartları</h2>
      <p>Sadece eğitim olan günler gösterilir · katılımcıyla paylaşmaya hazır</p></div>
      <div class="rt">
        <button class="btn" onclick="aiDescribeAll()"><svg class="ic"><use href="#i-spark"/></svg> Açıklamaları Üret</button>
        <button class="btn" onclick="exportImage('cardsDoc')"><svg class="ic"><use href="#i-img"/></svg> Görsel</button>
        <button class="btn" onclick="window.print()"><svg class="ic"><use href="#i-print"/></svg> Yazdır</button>
      </div></div>`;
  if (!groups.length) { $('cardsPane').innerHTML = head + emptyBox('i-grid', 'Takvimde yerleşmiş oturum yok', 'Takvim sekmesinden oturumları günlere yerleştir; burada otomatik olarak kart görünümüne dönüşsün.'); return; }

  const body = groups.map(g => {
    const t = typeById(p, g.day.type);
    return `<div class="daygroup">
      <div class="dg-head">
        <div class="dg-badge" style="background:${esc(t.color)}">
          <b>${g.date ? g.date.getDate() : '–'}</b><span>${g.date ? TRMONTHS[g.date.getMonth()].slice(0, 3) : ''}</span></div>
        <div>
          <h3>${esc(g.day.name)}${g.date ? ' · ' + fmtDate(g.date) : ''}</h3>
          <div class="dg-meta">
            <span><svg class="ic ic-sm"><use href="#${t.icon || 'i-pin'}"/></svg> ${esc(g.day.loc || t.location || t.label)}</span>
            <span><svg class="ic ic-sm"><use href="#i-clock"/></svg> ${round1(g.items.reduce((a, s) => a + (+s.duration || 0), 0))} saat</span>
            <span><svg class="ic ic-sm"><use href="#i-book"/></svg> ${g.items.length} oturum</span>
          </div></div>
        <div class="rt"><span class="pill" style="background:${esc(t.color)}22;color:${esc(t.color)}">${esc(t.label)}</span></div>
      </div>
      <div class="cardgrid">${g.items.map(s => sessionCardHTML(p, s)).join('')}</div>
    </div>`;
  }).join('');

  $('cardsPane').innerHTML = head + `<div class="doc" id="cardsDoc">${docHero(p)}<div class="doc-body">${body}</div></div>`;
}

function sessionCardHTML(p, s) {
  const t = typeById(p, s.type);
  const instr = activeInstructor(s).name;
  const rows = [];
  rows.push(`<div><svg class="ic ic-sm"><use href="#i-user"/></svg><b>${esc(instr)}</b></div>`);
  const plat = sessionPlatform(p, s);
  if (plat) rows.push(`<div><svg class="ic ic-sm"><use href="#${t.icon || 'i-pin'}"/></svg><b>${esc(plat)}</b></div>`);
  p.fields.filter(f => f.card && !['title', 'duration', 'type', 'instructors', 'platform', 'desc'].includes(f.key)).forEach(f => {
    const v = s.v && s.v[f.key]; if (!v) return;
    const ic = f.type === 'url' ? 'i-arrow' : (f.key === 'quota' ? 'i-users' : 'i-info');
    const val = f.type === 'url' ? `<a href="${esc(v)}" target="_blank">${esc(f.label)}</a>` : `${esc(f.label)}: <b>${esc(v)}</b>`;
    rows.push(`<div><svg class="ic ic-sm"><use href="#${ic}"/></svg><span>${val}</span></div>`);
  });
  const desc = s.v && s.v.desc;
  const showDesc = fieldByKey(p, 'desc')?.card && desc;
  return `<div class="scard" style="--c:${esc(t.color)}">
    <div class="scard-tools">
      <button onclick="aiDescribe('${s.id}')" title="AI ile açıklama üret"><svg class="ic ic-sm"><use href="#i-spark"/></svg></button>
      <button onclick="openSession('${s.id}')" title="Düzenle"><svg class="ic ic-sm"><use href="#i-edit"/></svg></button>
    </div>
    <div class="scard-top">
      <div class="scard-time"><b>${esc((sessionTime(p, s) || '').split(' - ')[0] || '--:--')}</b><span>${round1(s.duration)} saat</span></div>
      <h4>${esc(s.title)}</h4>
    </div>
    ${showDesc ? `<div class="scard-desc">${esc(desc)}</div>` : ''}
    <div class="scard-meta">${rows.join('')}</div>
  </div>`;
}

/* ---------------- AJANDA ---------------- */
function renderAgenda() {
  const p = P(), groups = plannedDays(p);
  const head = `<div class="pane-head">
      <div><h2><svg class="ic ic-lg"><use href="#i-list"/></svg> Ajanda</h2><p>Program akışı, resmî duyuru düzeninde</p></div>
      <div class="rt">
        <button class="btn" onclick="copyAgenda()"><svg class="ic"><use href="#i-copy"/></svg> Metni Kopyala</button>
        <button class="btn" onclick="window.print()"><svg class="ic"><use href="#i-print"/></svg> Yazdır</button>
      </div></div>`;
  if (!groups.length) { $('agendaPane').innerHTML = head + emptyBox('i-list', 'Gösterilecek gün yok', 'Oturumları takvime yerleştirdiğinde ajanda otomatik oluşur.'); return; }
  const body = groups.map(g => `<div class="ag-day">
      <div class="ag-dh"><b>${esc(g.day.name)}</b><span>${g.date ? fmtDate(g.date, true) : ''} · ${esc(g.day.loc || typeById(p, g.day.type).location || '')}</span></div>
      ${g.items.map(s => `<div class="ag-row">
        <div class="t">${esc(sessionTime(p, s))}</div>
        <div class="c"><b>${esc(s.title)}</b>
          <small>
            <span><svg class="ic ic-sm"><use href="#i-user"/></svg> ${esc(activeInstructor(s).name)}</span>
            <span><svg class="ic ic-sm"><use href="#i-clock"/></svg> ${round1(s.duration)} saat</span>
            ${sessionPlatform(p, s) ? `<span><svg class="ic ic-sm"><use href="#i-pin"/></svg> ${esc(sessionPlatform(p, s))}</span>` : ''}
          </small></div></div>`).join('')}
    </div>`).join('');
  $('agendaPane').innerHTML = head + `<div class="doc">${docHero(p)}<div class="doc-body"><div class="agenda">${body}</div></div></div>`;
}
function agendaText() {
  const p = P();
  let out = `${p.name}\n${'='.repeat(p.name.length)}\n\n`;
  plannedDays(p).forEach(g => {
    out += `${g.date ? fmtDate(g.date, true) + ' ' : ''}${g.day.name} — ${g.day.loc || typeById(p, g.day.type).location || ''}\n`;
    g.items.forEach(s => out += `  ${sessionTime(p, s)}  ${s.title} (${activeInstructor(s).name}, ${round1(s.duration)} saat)\n`);
    out += '\n';
  });
  return out;
}
function copyAgenda() { copyText(agendaText()); }

/* ---------------- TABLO ---------------- */
let TBLQ = '';
function renderTable() {
  const p = P();
  const cols = p.fields.filter(f => f.key !== 'desc');
  const head = `<div class="pane-head">
      <div><h2><svg class="ic ic-lg"><use href="#i-table"/></svg> Tablo</h2><p>Tüm oturumlar, tüm alanlar · hücreye tıklayarak düzenle</p></div>
      <div class="rt">
        <input id="tblQ" placeholder="Ara…" style="width:210px" value="${esc(TBLQ)}" oninput="TBLQ=this.value;renderTable();setTimeout(()=>{const e=$('tblQ');e.focus();e.setSelectionRange(e.value.length,e.value.length)},0)">
        <button class="btn" onclick="openNewSession()"><svg class="ic"><use href="#i-plus"/></svg> Oturum</button>
        <button class="btn" onclick="exportExcel()"><svg class="ic"><use href="#i-down"/></svg> Excel</button>
      </div></div>`;
  const q = TBLQ.toLocaleLowerCase('tr-TR');
  const rows = p.sessions.filter(s => !q || JSON.stringify(s).toLocaleLowerCase('tr-TR').includes(q));
  const body = rows.map(s => {
    const d = s.dayId ? dayById(p, s.dayId) : null;
    const date = d ? dayDate(p, d) : null;
    return `<tr>
      <td>${d ? `<b>${esc(d.name)}</b><br><span class="hint">${date ? fmtDate(date) : ''} · ${esc(sessionTime(p, s))}</span>` : '<span class="pill pill-muted">Havuzda</span>'}</td>
      ${cols.map(f => `<td>${tableCell(p, s, f)}</td>`).join('')}
      <td style="white-space:nowrap">
        <button class="btn btn-sm btn-ghost" onclick="openSession('${s.id}')"><svg class="ic ic-sm"><use href="#i-edit"/></svg></button>
        <button class="btn btn-sm btn-ghost" onclick="deleteSession('${s.id}')"><svg class="ic ic-sm"><use href="#i-trash"/></svg></button></td></tr>`;
  }).join('');
  $('tablePane').innerHTML = head + (rows.length
    ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Gün / Saat</th>${cols.map(f => `<th>${esc(f.label)}</th>`).join('')}<th></th></tr></thead><tbody>${body}</tbody></table></div>`
    : emptyBox('i-table', 'Kayıt yok', 'Bu programda henüz oturum bulunmuyor.'));
}
function tableCell(p, s, f) {
  if (f.key === 'title') return `<b>${esc(s.title)}</b>`;
  if (f.key === 'duration') return round1(s.duration) + ' saat';
  if (f.key === 'type') { const t = typeById(p, s.type); return `<span class="pill" style="background:${esc(t.color)}22;color:${esc(t.color)}">${esc(t.label)}</span>`; }
  if (f.key === 'instructors') return esc(activeInstructor(s).name) + (s.instructors.length > 1 ? ` <span class="hint">+${s.instructors.length - 1}</span>` : '');
  if (f.key === 'platform') return esc(sessionPlatform(p, s));
  const v = s.v ? s.v[f.key] : '';
  return f.type === 'url' && v ? `<a href="${esc(v)}" target="_blank">bağlantı</a>` : esc(v || '');
}

/* ---------------- ortak ---------------- */
function emptyBox(icon, title, text, extra = '') {
  return `<div class="empty"><svg class="ic"><use href="#${icon}"/></svg><b>${esc(title)}</b><p>${esc(text)}</p>
    <div style="margin-top:14px">${extra}</div></div>`;
}
