/* ============================================================
   YAPAY ZEKÂ KATMANI — Azure OpenAI (gpt-5.1)
   ============================================================ */
const AI_DEFAULTS = {
  enabled: true,
  endpoint: 'https://apim-ai-management.azure-api.net/prod-ktbusiness-apim/openai',
  deployment: 'gpt-5.1-ptu',
  apiVersion: '2024-12-01-preview',
  key: 'a668836ff8ab431489f93101d9a47e40',
  authMode: 'query'
};

function aiURL() {
  const a = DB.settings.ai;
  return `${a.endpoint.replace(/\/$/, '')}/deployments/${a.deployment}/chat/completions?api-version=${a.apiVersion}`;
}

/* Tarayıcıdan çağrı iki modda denenir:
   query — anahtar adres satırında, gövde Content-Type'sız Blob olarak gider.
           Böylece istek "basit istek" sayılır ve tarayıcı OPTIONS preflight
           göndermez. Servis preflight'a 404 döndüğü için normal yol budur.
   header — klasik api-key başlığı. Preflight gerektirir; ancak servis tarafında
           CORS açıksa veya sayfa aynı origin'den sunuluyorsa çalışır.
   Başarılı olan mod hatırlanır.                                              */
async function aiFetch(body) {
  const a = DB.settings.ai;
  const base = aiURL();
  const modes = a.authMode === 'header' ? ['header', 'query'] : ['query', 'header'];
  let last = null;
  for (const mode of modes) {
    let res;
    try {
      res = mode === 'query'
        ? await fetch(`${base}&subscription-key=${encodeURIComponent(a.key)}`,
          { method: 'POST', body: new Blob([JSON.stringify(body)]) })
        : await fetch(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': a.key },
          body: JSON.stringify(body)
        });
    } catch (e) {
      last = new Error('Servise ulaşılamadı. Ağ/VPN bağlantını kontrol et — uygulamanın geri kalanı çevrimdışı çalışmaya devam eder.');
      continue;
    }
    if (res.ok) {
      if (a.authMode !== mode) { a.authMode = mode; save(); }
      return res.json();
    }
    const t = await res.text().catch(() => '');
    last = new Error(`Servis hatası (${res.status}). ${t.slice(0, 180)}`);
    if (![401, 403, 404].includes(res.status)) throw last;
  }
  throw last;
}

async function askAI(messages, { json = false, maxTokens = 4000 } = {}) {
  const a = DB.settings.ai;
  if (!a.enabled) throw new Error('AI özellikleri kapalı. Kurulum sekmesinden açabilirsin.');
  const body = { messages, max_completion_tokens: maxTokens };
  if (json) body.response_format = { type: 'json_object' };
  const d = await aiFetch(body);
  const txt = d.choices?.[0]?.message?.content || '';
  if (!json) return txt;
  try { return JSON.parse(txt); }
  catch (e) {
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (_) { } }
    throw new Error('Model beklenen biçimde yanıt vermedi.');
  }
}

async function testAI() {
  const out = $('aiTestOut');
  if (!out) return;
  out.innerHTML = '<span class="spin"></span> test ediliyor…';
  try {
    const r = await askAI([{ role: 'user', content: 'Sadece "hazır" yaz.' }], { maxTokens: 20 });
    const mode = DB.settings.ai.authMode === 'query' ? 'adres satırı (preflight’sız)' : 'api-key başlığı';
    out.innerHTML = `<span style="color:var(--success);font-weight:700">✓ Bağlantı başarılı</span> — yanıt: ${esc(r.slice(0, 30))} · kimlik doğrulama: ${mode}`;
  } catch (e) { out.innerHTML = `<span style="color:var(--danger);font-weight:700">✕ ${esc(e.message)}</span>`; }
}

/* ---------- plan bağlamı ---------- */
function planContext(full = true) {
  const p = P();
  const ctx = {
    program: p.name, not: p.meta.note || '', baslangic: p.startDate,
    bloklar: p.blocks.map(b => ({ id: b.id, ad: b.label, baslangic: b.start, bitis: b.end, tur: b.kind, kapasite: b.cap })),
    gunTurleri: p.dayTypes.map(t => ({ id: t.id, ad: t.label, lokasyon: t.location })),
    gunler: allDays(p).map(d => ({
      id: d.id, ad: d.name, tarih: fmtDate(dayDate(p, d)), tur: typeById(p, d.type).label,
      lokasyon: d.loc || typeById(p, d.type).location, programDisi: !!d.off,
      doluluk: round1(dayLoad(p, d.id)) + '/' + dayCapacity(p) + ' saat'
    })),
    alanlar: p.fields.map(f => ({ anahtar: f.key, etiket: f.label })),
    oturumlar: p.sessions.map(s => ({
      id: s.id, baslik: s.title, sure: s.duration, tur: typeById(p, s.type).label,
      egitmen: activeInstructor(s).name,
      gun: s.dayId ? (dayById(p, s.dayId) || {}).name : 'HAVUZ',
      gunId: s.dayId || null, blokId: s.blockId || null,
      saat: sessionTime(p, s), platform: sessionPlatform(p, s),
      ...(full && s.v && s.v.desc ? { aciklama: String(s.v.desc).slice(0, 200) } : {})
    }))
  };
  if (p.participants.length) ctx.katilimciSayisi = p.participants.length;
  return ctx;
}

const SYS_TR = 'Sen Kuveyt Türk Akademi için çalışan bir eğitim programı planlama asistanısın. Türkçe, kısa ve kurumsal bir dille yanıt ver. Uydurma bilgi ekleme; veride olmayan şeyi olmuş gibi yazma.';

/* ---------- ortak AI modal ---------- */
function aiModal(title, sub, icon = 'i-spark') {
  openModal({
    title, sub, icon, size: 'modal-lg',
    body: `<div class="ai-busy"><span class="spin"></span> Yapay zekâ çalışıyor…</div>`,
    foot: `<button class="btn" onclick="closeModal()">Kapat</button>`
  });
}
function aiFail(e) {
  $('modalBody').innerHTML = `<div class="ai-out" style="border-color:var(--danger)">
    <b style="color:var(--danger)">İşlem tamamlanamadı</b><br>${esc(e.message)}</div>`;
}
function aiTextResult(text, actions = '') {
  $('modalBody').innerHTML = `<div class="ai-out" id="aiOut">${esc(text)}</div>`;
  $('modalFoot').innerHTML = `${actions}
    <button class="btn" onclick="closeModal()">Kapat</button>
    <button class="btn btn-primary" onclick="copyText($('aiOut').innerText)"><svg class="ic"><use href="#i-copy"/></svg> Kopyala</button>`;
}
/* Pano API'si kurum politikasıyla kapatılmış olabilir; o durumda
   gizli bir textarea üzerinden eski yöntemle kopyalar. */
function copyText(t) {
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      toast(ok ? 'Panoya kopyalandı.' : 'Kopyalanamadı — metni elle seçip kopyalayabilirsin.', ok ? 'ok' : 'warn');
    } catch (e) { toast('Kopyalanamadı — metni elle seçip kopyalayabilirsin.', 'warn'); }
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(() => toast('Panoya kopyalandı.', 'ok'), fallback);
  } else fallback();
}

/* ============================================================
   1 · METİNDEN PROGRAM OLUŞTURMA
   ============================================================ */
function openAIPlan() {
  openModal({
    title: 'Metinden Program Oluştur', sub: 'Programı kelimelerle anlat, taslağı yapay zekâ kursun', icon: 'i-wand', size: 'modal-lg',
    body: `<div class="field"><label class="lbl">Program tarifi</label>
      <textarea id="nlPlan" style="min-height:150px" placeholder="Örnek: 3 günlük şube satış geliştirme programı. Sabahları teorik eğitim, öğleden sonraları vaka çalışması olsun. İlk gün açılış ve tanışma, son gün sunumlar ve değerlendirme. Eğitmenler Ali Veli ve Ayşe Demir. Yer: Bankacılık Üssü."></textarea></div>
    <div class="grid2">
      <label class="frow" style="cursor:pointer"><input type="checkbox" id="nlStruct" checked>
        <div><b>Takvim yapısını da kursun</b><div class="hint">Gün sayısı, hafta ve bloklar tarife göre yeniden oluşturulur.</div></div></label>
      <label class="frow" style="cursor:pointer"><input type="checkbox" id="nlReplace" checked>
        <div><b>Mevcut oturumların yerine geçsin</b><div class="hint">Kapalıysa üzerine eklenir.</div></div></label>
    </div>
    <p class="hint">Sonuç bir taslaktır — oluştuktan sonra her ayrıntıyı elle düzenleyebilirsin.</p>`,
    foot: `<button class="btn" onclick="closeModal()">Vazgeç</button>
      <button class="btn btn-primary" onclick="runAIPlan()"><svg class="ic"><use href="#i-spark"/></svg> Oluştur</button>`
  });
  setTimeout(() => $('nlPlan')?.focus(), 60);
}

async function runAIPlan() {
  const text = $('nlPlan').value.trim();
  if (!text) return toast('Önce programı tarif et.', 'warn');
  const struct = $('nlStruct').checked, replace = $('nlReplace').checked;
  const p = P();
  aiModal('Program Oluşturuluyor', 'Taslak hazırlanıyor…', 'i-wand');
  try {
    const schema = `{
 "programAdi": "kısa program adı",
 "not": "programın amacı, 1-2 cümle",
 ${struct ? `"haftalar":[{"etiket":"1. Hafta","gunler":[{"ad":"Pazartesi","tur":"fiziki|online","lokasyon":"..."}]}],
 "bloklar":[{"ad":"Sabah","baslangic":"09:30","bitis":"12:30","tur":"ders","kapasite":3},{"ad":"Öğle Arası","baslangic":"12:30","bitis":"14:00","tur":"ara"}],` : ''}
 "oturumlar":[{"baslik":"...","sure":3,"egitmen":"...","tur":"fiziki|online","gunIndex":0,"blok":"Sabah","aciklama":"1-2 cümle","platform":"..."}]
}`;
    const d = await askAI([
      { role: 'system', content: SYS_TR + ' Yanıtı SADECE geçerli JSON olarak ver.' },
      {
        role: 'user', content: `Aşağıdaki tarife göre bir eğitim programı taslağı üret.
Mevcut yapı: ${JSON.stringify({ bloklar: p.blocks.map(b => b.label), gunTurleri: p.dayTypes.map(t => t.label), gunSayisi: allDays(p).length })}
gunIndex: 0'dan başlayan gün sırası. blok: oturumun yerleşeceği ders bloğunun adı (ör. "Sabah").
Şema: ${schema}

TARİF:
${text}` }
    ], { json: true, maxTokens: 8000 });

    applyAIPlan(d, struct, replace);
    closeModal();
    toast(`Taslak hazır — <b>${(d.oturumlar || []).length}</b> oturum oluşturuldu.`, 'ok');
  } catch (e) { aiFail(e); }
}

/* Modelin verdiği blok bilgisini güvenli biçimde çözer.
   Ad, ders bloğu sırası ya da tüm blokların sırası — hangisi gelirse gelsin
   sonuç her zaman geçerli bir ders bloğudur.                                */
function resolveBlock(p, o) {
  const sb = sessionBlocks(p);
  if (!sb.length) return null;
  if (o.blok != null && isNaN(+o.blok)) {
    const q = norm(o.blok);
    const hit = sb.find(b => norm(b.label) === q) || sb.find(b => norm(b.label).includes(q) || q.includes(norm(b.label)))
      || sb.find(b => b.start === String(o.blok).trim());
    if (hit) return hit.id;
  }
  const i = +(o.blok ?? o.blokIndex);
  if (!isNaN(i)) {
    if (i >= 0 && i < sb.length) return sb[i].id;
    const all = p.blocks[i];                       // tüm bloklar üzerinden indeks
    if (all) {
      if (all.kind === 'session') return all.id;
      const after = p.blocks.slice(i).find(b => b.kind === 'session');
      return (after || sb[sb.length - 1]).id;      // aradan sonraki ilk ders bloğu
    }
  }
  return sb[0].id;
}

function applyAIPlan(d, struct, replace) {
  const p = P();
  if (d.programAdi && replace) { p.name = d.programAdi; }
  if (d.not) p.meta.note = d.not;

  if (struct && Array.isArray(d.bloklar) && d.bloklar.length) {
    p.blocks = d.bloklar.map((b, i) => ({
      id: 'b' + i, label: b.ad || ('Blok ' + (i + 1)), start: b.baslangic || '09:00', end: b.bitis || '12:00',
      kind: /ara|mola|yemek|kahvalt/i.test(b.tur || b.ad || '') ? 'break' : 'session',
      cap: +b.kapasite || 3
    }));
    if (!sessionBlocks(p).length) p.blocks[0].kind = 'session';
  }
  if (struct && Array.isArray(d.haftalar) && d.haftalar.length) {
    p.weeks = d.haftalar.map((w, wi) => ({
      id: uid('w'), label: w.etiket || `${wi + 1}. Hafta`,
      days: (w.gunler || []).map(g => ({
        id: uid('d'), name: g.ad || 'Gün',
        type: (p.dayTypes.find(t => norm(t.label).includes(norm(g.tur || '').slice(0, 4))) || p.dayTypes[0]).id,
        loc: g.lokasyon || '', off: false
      }))
    })).filter(w => w.days.length);
    p.sessions.forEach(s => { s.dayId = null; s.blockId = null; s.fullDay = false; });
  }
  const days = allDays(p), sblocks = sessionBlocks(p);
  const made = (d.oturumlar || []).map((o, i) => {
    const s = newSession(p, { id: uid('s'), order: i });
    s.title = o.baslik || 'Oturum';
    s.duration = Math.max(0.5, +o.sure || 3);
    s.instructors = [{ name: o.egitmen || '', availability: [] }];
    s.type = (p.dayTypes.find(t => norm(t.label).includes(norm(o.tur || '').slice(0, 4))) || p.dayTypes[0]).id;
    if (o.aciklama) s.v.desc = o.aciklama;
    if (o.platform) s.v.platform = o.platform;
    const dd = days[o.gunIndex ?? -1];
    if (dd) {
      s.dayId = dd.id;
      s.blockId = resolveBlock(p, o);
      s.fullDay = s.duration >= dayCapacity(p);
    }
    return s;
  });
  p.sessions = replace ? made : p.sessions.concat(made);
  save(); render();
}

/* ============================================================
   2 · AKILLI İÇE AKTARMA
   ============================================================ */
async function importPasted() {
  const txt = ($('pasteBox').value || '').trim();
  const replace = $('impReplace').checked;
  if (!txt) return toast('Yapıştırılan metin boş.', 'warn');
  const p = P();
  aiModal('Metin Ayrıştırılıyor', 'Oturumlar çıkarılıyor…', 'i-spark');
  try {
    const d = await askAI([
      { role: 'system', content: SYS_TR + ' Yanıtı SADECE geçerli JSON olarak ver.' },
      {
        role: 'user', content: `Aşağıdaki serbest metinden eğitim oturumlarını çıkar.
Mevcut günler (id ve ad): ${JSON.stringify(allDays(p).map(d => ({ id: d.id, ad: d.name, tarih: fmtDate(dayDate(p, d)) })))}
Mevcut ders blokları: ${JSON.stringify(sessionBlocks(p).map(b => ({ id: b.id, ad: b.label, baslangic: b.start })))}
Gün ya da saat belirtilmemişse gunId/blokId alanlarını null bırak.
Şema: {"oturumlar":[{"baslik":"...","sure":3,"egitmen":"...","platform":"...","aciklama":"","gunId":null,"blokId":null}]}

METİN:
${txt}` }
    ], { json: true, maxTokens: 6000 });

    const made = (d.oturumlar || []).map((o, i) => {
      const s = newSession(p, { id: uid('s'), order: i });
      s.title = o.baslik || 'Oturum';
      s.duration = Math.max(0.5, +o.sure || 3);
      s.instructors = [{ name: o.egitmen || '', availability: [] }];
      if (o.platform) s.v.platform = o.platform;
      if (o.aciklama) s.v.desc = o.aciklama;
      if (o.gunId && dayById(p, o.gunId)) {
        s.dayId = o.gunId;
        s.blockId = o.blokId && blockById(p, o.blokId) ? o.blokId : sessionBlocks(p)[0].id;
        s.fullDay = s.duration >= dayCapacity(p);
        const d2 = dayById(p, s.dayId); if (d2) s.type = d2.type;
      }
      return s;
    });
    if (!made.length) throw new Error('Metinde oturum bulunamadı.');
    applyImported(made, replace);
  } catch (e) { aiFail(e); }
}

async function aiMapSessions(headers, samples, data) {
  aiModal('Sütunlar Tanınıyor', 'Başlıklar eşleştiriliyor…', 'i-spark');
  try {
    const d = await askAI([
      { role: 'system', content: SYS_TR + ' Yanıtı SADECE geçerli JSON olarak ver.' },
      {
        role: 'user', content: `Bir Excel dosyasının sütunlarını eğitim oturumu alanlarıyla eşleştir.
Başlıklar (index sırasıyla): ${JSON.stringify(headers)}
Örnek satırlar: ${JSON.stringify(samples)}
Şema: {"baslik":<index>,"sure":<index|null>,"egitmen":<index|null>,"tur":<index|null>,"gun":<index|null>,"saat":<index|null>,"platform":<index|null>,"aciklama":<index|null>}` }
    ], { json: true, maxTokens: 800 });
    const p = P();
    const made = data.map((r, i) => {
      const s = newSession(p, { id: uid('s'), order: i });
      s.title = String(r[d.baslik] ?? 'Eğitim').trim();
      s.duration = Math.max(0.5, parseFloat(String(r[d.sure] ?? 3).replace(',', '.')) || 3);
      s.instructors = [{ name: d.egitmen != null ? String(r[d.egitmen] || '').trim() : '', availability: [] }];
      if (d.platform != null) s.v.platform = String(r[d.platform] || '');
      if (d.aciklama != null) s.v.desc = String(r[d.aciklama] || '');
      const tv = d.tur != null ? norm(r[d.tur]) : '';
      s.type = (p.dayTypes.find(t => tv && norm(t.label).includes(tv.slice(0, 4))) || p.dayTypes[0]).id;
      if (d.gun != null && r[d.gun]) {
        const day = allDays(p).find(x => norm(x.name) === norm(r[d.gun]));
        if (day) { s.dayId = day.id; s.blockId = sessionBlocks(p)[0].id; s.fullDay = s.duration >= dayCapacity(p); }
      }
      return s;
    }).filter(s => s.title);
    applyImported(made, false);
  } catch (e) { aiFail(e); }
}

async function aiMapPeople() {
  if (!PEOPLE_FILES.candRows) return;
  const headers = PEOPLE_FILES.candRows[0] || [];
  const samples = PEOPLE_FILES.candRows.slice(1, 4);
  toast('Sütunlar AI ile eşleştiriliyor…', 'info', 2500);
  try {
    const d = await askAI([
      { role: 'system', content: SYS_TR + ' Yanıtı SADECE geçerli JSON olarak ver.' },
      {
        role: 'user', content: `Katılımcı listesi sütunlarını eşleştir. Değer yoksa null yaz.
Başlıklar: ${JSON.stringify(headers)}
Örnek satırlar: ${JSON.stringify(samples)}
Şema: {"tckn":<index|null>,"name":<index|null>,"pos":<index|null>,"org":<index|null>,"email1":<index|null>,"email2":<index|null>,"phone":<index|null>,"date":<index|null>}` }
    ], { json: true, maxTokens: 600 });
    Object.keys(PMAP).forEach(k => { if (d[k] != null) PMAP[k] = +d[k]; });
    render(); toast('Sütunlar eşleştirildi.', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

/* ============================================================
   7 · YÖNETİCİ ÖZETİ
   ============================================================ */
function openBrief() {
  aiModal('Program Özeti', 'Yönetici brifingi hazırlanıyor…', 'i-chart');
  runBrief();
}
async function runBrief() {
  const p = P();
  try {
    const local = auditPlan(p);
    const txt = await askAI([
      { role: 'system', content: SYS_TR },
      {
        role: 'user', content: `Aşağıdaki eğitim programı için kısa bir yönetici brifingi yaz.
Bölümler: 1) Genel Bakış (2-3 cümle) 2) Sayılarla Program 3) Dikkat Edilmesi Gerekenler.
Madde işareti kullan, abartma, sadece verideki bilgiye dayan.

PLAN: ${JSON.stringify(planContext(false))}
OTOMATİK KONTROLLER: ${JSON.stringify(local)}` }
    ], { maxTokens: 2500 });
    aiTextResult(txt);
  } catch (e) { aiFail(e); }
}

/* yerel plan denetimi — AI olmadan da çalışır */
function auditPlan(p) {
  const w = [];
  const cap = dayCapacity(p);
  allDays(p).forEach(d => {
    const l = dayLoad(p, d.id);
    if (l > cap) w.push(`${d.name} (${fmtShort(dayDate(p, d))}) kapasite aşımı: ${round1(l)}/${cap} saat`);
    if (!l && !d.off) w.push(`${d.name} (${fmtShort(dayDate(p, d))}) tamamen boş`);
  });
  const pool = poolSessions(p);
  if (pool.length) w.push(`${pool.length} oturum hâlâ havuzda: ${pool.map(s => s.title).slice(0, 6).join(', ')}`);
  const byInstr = {};
  p.sessions.filter(s => s.dayId).forEach(s => {
    const k = activeInstructor(s).name; if (!k) return;
    const slot = s.dayId + '|' + s.blockId;
    (byInstr[k] = byInstr[k] || []).push(slot);
  });
  Object.entries(byInstr).forEach(([n, slots]) => {
    const dup = slots.filter((x, i) => slots.indexOf(x) !== i);
    if (dup.length) w.push(`${n} aynı zaman diliminde birden fazla oturumda`);
  });
  p.sessions.forEach(s => { if (!activeInstructor(s).name) w.push(`"${s.title}" oturumunda eğitmen atanmamış`); });
  return w;
}

/* ============================================================
   8 · DAVET METNİ
   ============================================================ */
function openInvite() {
  openModal({
    title: 'Davet Metni Üret', sub: 'Katılımcılara gönderilecek e-posta', icon: 'i-mail',
    body: `<div class="field"><label class="lbl">Kime</label>
        <select id="invAud">
          <option>Katılımcılar</option><option>Eğitmenler</option><option>Yöneticiler</option></select></div>
      <div class="field"><label class="lbl">Üslup</label>
        <select id="invTone"><option>Resmî</option><option>Samimi ama kurumsal</option><option>Kısa ve öz</option></select></div>
      <div class="field"><label class="lbl">Eklemek istediğin notlar</label>
        <textarea id="invNote" placeholder="Örn: Kıyafet serbest, kimlik kartı zorunlu, ulaşım servisi 08:15'te kalkacak"></textarea></div>
      <label class="frow" style="cursor:pointer"><input type="checkbox" id="invTable" checked>
        <div><b>Program tablosunu ekle</b><div class="hint">Gün gün eğitim listesi metnin içine eklenir.</div></div></label>`,
    foot: `<button class="btn" onclick="closeModal()">Vazgeç</button>
      <button class="btn btn-primary" onclick="runInvite()"><svg class="ic"><use href="#i-spark"/></svg> Üret</button>`
  });
}
async function runInvite() {
  const aud = $('invAud').value, tone = $('invTone').value, note = $('invNote').value, tbl = $('invTable').checked;
  aiModal('Davet Metni', 'Hazırlanıyor…', 'i-mail');
  try {
    const p = P();
    const txt = await askAI([
      { role: 'system', content: SYS_TR },
      {
        role: 'user', content: `"${p.name}" programı için ${aud.toLowerCase()} kitlesine gönderilecek bir davet e-postası yaz.
Üslup: ${tone}. Kurum: ${p.meta.org || 'Kuveyt Türk'}.
Konu satırıyla başla ("Konu: ..."), sonra e-posta gövdesi gelsin. İmza yerine [Ad Soyad] / [Birim] yer tutucuları kullan.
${tbl ? 'Program akışını gün gün, saatleriyle birlikte düz metin liste hâlinde ekle.' : 'Program tablosu ekleme, sadece genel bilgi ver.'}
${note ? 'Şu notları mutlaka dahil et: ' + note : ''}

PROGRAM AKIŞI:
${agendaText()}` }
    ], { maxTokens: 3000 });
    aiTextResult(txt);
  } catch (e) { aiFail(e); }
}

/* ============================================================
   10 · EĞİTİM AÇIKLAMASI
   ============================================================ */
async function aiDescribe(sid, inForm) {
  const p = P(), s = p.sessions.find(x => x.id === sid); if (!s) return;
  toast('Açıklama üretiliyor…', 'info', 2200);
  try {
    const d = await askAI([
      { role: 'system', content: SYS_TR + ' Yanıtı SADECE geçerli JSON olarak ver.' },
      {
        role: 'user', content: `"${s.title}" başlıklı ${s.duration} saatlik eğitim için kurumsal bir tanıtım açıklaması yaz.
Program bağlamı: ${p.name}${p.meta.note ? ' — ' + p.meta.note : ''}. Eğitmen: ${activeInstructor(s).name || 'belirtilmemiş'}.
Şema: {"aciklama":"2-3 cümlelik tanım","kazanimlar":["...","..."],"hedefKitle":"kısa"}` }
    ], { json: true, maxTokens: 900 });
    s.v = s.v || {};
    s.v.desc = d.aciklama + (d.kazanimlar?.length ? '\n\nKazanımlar: ' + d.kazanimlar.join(' · ') : '');
    if (fieldByKey(p, 'audience') && d.hedefKitle) s.v.audience = d.hedefKitle;
    save();
    if (inForm && $('sf_desc')) { $('sf_desc').value = s.v.desc; if ($('sf_audience')) $('sf_audience').value = s.v.audience || ''; }
    else render();
    toast('Açıklama eklendi.', 'ok');
  } catch (e) { toast(e.message, 'err', 6000); }
}
async function aiDescribeAll() {
  const p = P();
  const targets = p.sessions.filter(s => s.dayId && !(s.v && s.v.desc));
  if (!targets.length) return toast('Açıklaması eksik oturum yok.', 'info');
  if (!confirm(`${targets.length} oturum için açıklama üretilecek. Devam?`)) return;
  aiModal('Açıklamalar Üretiliyor', `${targets.length} oturum işleniyor…`, 'i-spark');
  try {
    const d = await askAI([
      { role: 'system', content: SYS_TR + ' Yanıtı SADECE geçerli JSON olarak ver.' },
      {
        role: 'user', content: `Aşağıdaki eğitimlerin her biri için 2 cümlelik kurumsal açıklama yaz.
Program: ${p.name}${p.meta.note ? ' — ' + p.meta.note : ''}
Eğitimler: ${JSON.stringify(targets.map(s => ({ id: s.id, baslik: s.title, sure: s.duration })))}
Şema: {"sonuc":[{"id":"...","aciklama":"..."}]}` }
    ], { json: true, maxTokens: 6000 });
    let n = 0;
    (d.sonuc || []).forEach(r => {
      const s = p.sessions.find(x => x.id === r.id);
      if (s && r.aciklama) { s.v = s.v || {}; s.v.desc = r.aciklama; n++; }
    });
    save(); closeModal(); render();
    toast(`<b>${n}</b> açıklama eklendi.`, 'ok');
  } catch (e) { aiFail(e); }
}

/* ============================================================
   13 · KOMUT PALETİ
   ============================================================ */
const QUICK = [
  { t: 'Metinden program oluştur', d: 'Programı anlat, taslağı AI kursun', i: 'i-wand', f: () => { closePalette(); openAIPlan(); } },
  { t: 'Yönetici özeti üret', d: 'Plan hakkında brifing metni', i: 'i-chart', f: () => { closePalette(); openBrief(); } },
  { t: 'Davet metni üret', d: 'Katılımcı e-postası', i: 'i-mail', f: () => { closePalette(); openInvite(); } },
  { t: 'Planı denetle', d: 'Boşluk, çakışma, kapasite kontrolü', i: 'i-alert', f: () => { closePalette(); showAudit(); } },
  { t: 'Havuzu otomatik dağıt', d: 'Uygun günlere yerleştir', i: 'i-spark', f: () => { closePalette(); autoPlace(); } },
  { t: 'Oturum ekle', d: 'Yeni eğitim kaydı', i: 'i-plus', f: () => { closePalette(); openNewSession(); } },
  { t: 'Excel’e aktar', d: 'Programı indir', i: 'i-down', f: () => { closePalette(); exportExcel(); } },
  { t: 'Görsel olarak indir', d: 'PNG çıktısı', i: 'i-img', f: () => { closePalette(); exportImage(); } },
  { t: 'Kurulum', d: 'Gün, blok, alan ayarları', i: 'i-cog', f: () => { closePalette(); setView('setup'); } }
];
let PALSEL = 0;
function openPalette() {
  $('palOvl').classList.add('on'); $('palette').classList.add('on');
  $('palInput').value = ''; PALSEL = 0; renderPalette('');
  setTimeout(() => $('palInput').focus(), 40);
  $('palInput').oninput = e => { PALSEL = 0; renderPalette(e.target.value); };
  $('palInput').onkeydown = palKey;
}
function closePalette() { $('palOvl').classList.remove('on'); $('palette').classList.remove('on'); }
function renderPalette(q) {
  const list = QUICK.filter(c => !q || norm(c.t + c.d).includes(norm(q)));
  const ai = q.trim().length > 2 ? `<div class="pal-sec">Yapay zekâ komutu</div>
    <div class="pal-item ${PALSEL === 0 ? 'sel' : ''}" onclick="runCommand()">
      <svg class="ic"><use href="#i-spark"/></svg>
      <div class="t"><b>"${esc(q)}"</b><span>komutunu plana uygula · Enter</span></div><kbd>↵</kbd></div>` : '';
  const offset = ai ? 1 : 0;
  $('palBody').innerHTML = ai + (list.length ? `<div class="pal-sec">Hızlı işlemler</div>` + list.map((c, i) =>
    `<div class="pal-item ${PALSEL === i + offset ? 'sel' : ''}" onclick="QUICK[${QUICK.indexOf(c)}].f()">
      <svg class="ic"><use href="#${c.i}"/></svg><div class="t"><b>${esc(c.t)}</b><span>${esc(c.d)}</span></div></div>`).join('') : '');
}
function palKey(e) {
  const q = $('palInput').value;
  const list = QUICK.filter(c => !q || norm(c.t + c.d).includes(norm(q)));
  const total = (q.trim().length > 2 ? 1 : 0) + list.length;
  if (e.key === 'ArrowDown') { e.preventDefault(); PALSEL = (PALSEL + 1) % total; renderPalette(q); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); PALSEL = (PALSEL - 1 + total) % total; renderPalette(q); }
  else if (e.key === 'Enter') {
    e.preventDefault();
    const offset = q.trim().length > 2 ? 1 : 0;
    if (offset && PALSEL === 0) runCommand();
    else if (list[PALSEL - offset]) list[PALSEL - offset].f();
  }
}

async function runCommand() {
  const q = $('palInput').value.trim(); if (!q) return;
  closePalette();
  aiModal('Komut Uygulanıyor', esc(q), 'i-spark');
  try {
    const p = P();
    const d = await askAI([
      { role: 'system', content: SYS_TR + ' Sen bir komut yorumlayıcısısın. Yanıtı SADECE geçerli JSON olarak ver. Emin olmadığın işlemi üretme.' },
      {
        role: 'user', content: `Kullanıcının doğal dil komutunu, plan üzerinde uygulanacak işlemlere çevir.

KULLANILABİLİR İŞLEMLER:
- {"op":"tasi","oturumId":"...","gunId":"...","blokId":"..."} — oturumu bir gün/bloğa taşı
- {"op":"havuza","oturumId":"..."} — oturumu havuza geri al
- {"op":"gunuBosalt","gunId":"..."} — günün tüm oturumlarını havuza al
- {"op":"sureDegistir","oturumId":"...","sure":3}
- {"op":"egitmenAta","oturumId":"...","egitmen":"Ad Soyad"}
- {"op":"lokasyon","gunId":"...","deger":"..."} — günün lokasyonu
- {"op":"alanYaz","oturumId":"...","alan":"platform","deger":"..."}
- {"op":"oturumEkle","baslik":"...","sure":3,"egitmen":"","gunId":null,"blokId":null}
- {"op":"oturumSil","oturumId":"..."}
- {"op":"gunKapat","gunId":"...","kapali":true} — günü program dışı yap
- {"op":"otomatikDagit"} — havuzdaki her şeyi uygun yerlere dağıt

Şema: {"islemler":[...],"aciklama":"kullanıcıya tek cümlelik özet"}
Komuta uymayan hiçbir işlem üretme. Hiçbir işlem uygulanamıyorsa islemler boş dizi olsun ve aciklama'da nedenini yaz.

PLAN: ${JSON.stringify(planContext(false))}

KOMUT: ${q}` }
    ], { json: true, maxTokens: 3000 });

    const res = applyOps(d.islemler || []);
    $('modalBody').innerHTML = `<div class="ai-out">
      <b>${esc(d.aciklama || 'Komut işlendi')}</b>
      ${res.log.length ? '<br><br>' + res.log.map(l => '• ' + esc(l)).join('<br>') : '<br><br>Uygulanan değişiklik yok.'}</div>`;
    $('modalFoot').innerHTML = `<button class="btn btn-primary" onclick="closeModal()">Tamam</button>`;
    if (res.n) toast(`<b>${res.n}</b> değişiklik uygulandı.`, 'ok');
  } catch (e) { aiFail(e); }
}

function applyOps(ops) {
  const p = P(); const log = []; let n = 0;
  const S = id => p.sessions.find(x => x.id === id) || p.sessions.find(x => norm(x.title) === norm(id));
  const D = id => dayById(p, id) || allDays(p).find(x => norm(x.name) === norm(id));
  ops.forEach(o => {
    try {
      if (o.op === 'tasi') {
        const s = S(o.oturumId), d = D(o.gunId); if (!s || !d) return;
        s.dayId = d.id; s.blockId = blockById(p, o.blokId) ? o.blokId : sessionBlocks(p)[0].id;
        s.fullDay = +s.duration >= dayCapacity(p); n++; log.push(`"${s.title}" → ${d.name}`);
      } else if (o.op === 'havuza') {
        const s = S(o.oturumId); if (!s) return;
        s.dayId = null; s.blockId = null; s.fullDay = false; n++; log.push(`"${s.title}" havuza alındı`);
      } else if (o.op === 'gunuBosalt') {
        const d = D(o.gunId); if (!d) return;
        let c = 0; p.sessions.forEach(s => { if (s.dayId === d.id) { s.dayId = null; s.blockId = null; s.fullDay = false; c++; } });
        n += c; log.push(`${d.name} boşaltıldı (${c} oturum)`);
      } else if (o.op === 'sureDegistir') {
        const s = S(o.oturumId); if (!s) return;
        s.duration = Math.max(0.5, +o.sure || s.duration); n++; log.push(`"${s.title}" süresi ${s.duration} saat`);
      } else if (o.op === 'egitmenAta') {
        const s = S(o.oturumId); if (!s) return;
        activeInstructor(s).name = o.egitmen || ''; n++; log.push(`"${s.title}" eğitmeni: ${o.egitmen}`);
      } else if (o.op === 'lokasyon') {
        const d = D(o.gunId); if (!d) return;
        d.loc = o.deger || ''; n++; log.push(`${d.name} lokasyonu: ${o.deger}`);
      } else if (o.op === 'alanYaz') {
        const s = S(o.oturumId); if (!s) return;
        s.v = s.v || {}; s.v[o.alan] = o.deger; n++; log.push(`"${s.title}" · ${o.alan}: ${o.deger}`);
      } else if (o.op === 'oturumEkle') {
        const s = newSession(p, { id: uid('s'), title: o.baslik || 'Oturum', duration: Math.max(0.5, +o.sure || 3) });
        s.instructors = [{ name: o.egitmen || '', availability: [] }];
        const d = o.gunId ? D(o.gunId) : null;
        if (d) { s.dayId = d.id; s.blockId = blockById(p, o.blokId) ? o.blokId : sessionBlocks(p)[0].id; s.type = d.type; }
        p.sessions.push(s); n++; log.push(`"${s.title}" eklendi`);
      } else if (o.op === 'oturumSil') {
        const s = S(o.oturumId); if (!s) return;
        p.sessions = p.sessions.filter(x => x.id !== s.id); n++; log.push(`"${s.title}" silindi`);
      } else if (o.op === 'gunKapat') {
        const d = D(o.gunId); if (!d) return;
        d.off = o.kapali !== false; n++; log.push(`${d.name} ${d.off ? 'program dışı' : 'programa dahil'}`);
      } else if (o.op === 'otomatikDagit') {
        const c = autoPlace(true); n += c; log.push(`${c} oturum otomatik yerleştirildi`);
      }
    } catch (e) { }
  });
  if (n) { save(); render(); }
  return { n, log };
}

/* yerel otomatik dağıtım */
function autoPlace(silent) {
  const p = P();
  const pool = poolSessions(p);
  let n = 0;
  pool.forEach(s => {
    const c = suggestSlots(p, s)[0];
    if (!c) return;
    s.dayId = c.dayId; s.blockId = c.blockId;
    s.fullDay = +s.duration >= dayCapacity(p);
    s.order = p.sessions.filter(x => x.dayId === c.dayId && x.blockId === c.blockId).length;
    n++;
  });
  save(); render();
  if (!silent) toast(n ? `<b>${n}</b> oturum yerleştirildi.` : 'Uygun boş yer bulunamadı.', n ? 'ok' : 'warn');
  return n;
}
function showAudit() {
  const w = auditPlan(P());
  openModal({
    title: 'Plan Denetimi', sub: w.length ? `${w.length} bulgu` : 'Sorun görünmüyor', icon: 'i-alert', size: 'modal-lg',
    body: w.length ? `<div class="ai-out">${w.map(x => '• ' + esc(x)).join('<br>')}</div>`
      : `<div class="ai-out"><b style="color:var(--success)">✓ Plan tutarlı görünüyor.</b><br>Kapasite aşımı, çakışma veya eksik eğitmen tespit edilmedi.</div>`,
    foot: `<button class="btn" onclick="closeModal()">Kapat</button>
      <button class="btn btn-primary" onclick="closeModal();openBrief()"><svg class="ic"><use href="#i-spark"/></svg> AI Yorumu Al</button>`
  });
}

/* ============================================================
   14 · PLAN ASİSTANI
   ============================================================ */
let CHAT = [];
function initAssistant() {
  $('chatBody').innerHTML = `<div class="msg-hint">
    Plan hakkında soru sorabilirsin.<br><br>
    <b>"Kaç saat online eğitim var?"</b><br><b>"En yoğun gün hangisi?"</b><br>
    <b>"Hangi eğitmen kaç saat ders veriyor?"</b><br><b>"Programda eksik ne var?"</b></div>`;
}
function toggleAssistant() { $('assistant').classList.toggle('on'); }
function chatKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }
async function sendChat() {
  const inp = $('chatInput'), q = inp.value.trim(); if (!q) return;
  inp.value = '';
  if (!CHAT.length) $('chatBody').innerHTML = '';
  pushMsg('u', q);
  const busy = pushMsg('a', '…');
  try {
    CHAT.push({ role: 'user', content: q });
    const txt = await askAI([
      { role: 'system', content: SYS_TR + ' Kullanıcının planı hakkındaki sorularını yanıtla. Sayısal soruları verideki değerleri toplayarak yanıtla. Kısa tut.' },
      { role: 'system', content: 'GÜNCEL PLAN: ' + JSON.stringify(planContext(false)) },
      ...CHAT.slice(-8)
    ], { maxTokens: 2000 });
    busy.textContent = txt;
    CHAT.push({ role: 'assistant', content: txt });
  } catch (e) { busy.textContent = '⚠ ' + e.message; }
  $('chatBody').scrollTop = $('chatBody').scrollHeight;
}
function pushMsg(kind, text) {
  const el = document.createElement('div');
  el.className = 'msg ' + kind; el.textContent = text;
  $('chatBody').appendChild(el);
  $('chatBody').scrollTop = $('chatBody').scrollHeight;
  return el;
}

/* ============================================================
   15 · AKILLI İSİM EŞLEŞTİRME
   ============================================================ */
async function aiMatchNames() {
  const p = P();
  const missing = p.participants.filter(u => !u.sicil || !u.corp);
  if (!missing.length) return toast('Eksik sicil/kurum e-postası olan kişi yok.', 'info');
  if (!PEOPLE_FILES.staffRows) return toast('Önce personel listesini yükle.', 'warn');

  const staff = PEOPLE_FILES.staffRows.slice(1).map(r => ({
    tckn: String(r[SMAP.tckn] ?? '').trim(), sicil: r[SMAP.sicil] ?? '', email: r[SMAP.email] ?? '',
    name: r.find((c, i) => i !== SMAP.tckn && typeof c === 'string' && /^[A-Za-zÇĞİÖŞÜçğıöşü ]{5,}$/.test(c)) || ''
  }));

  // önce yerel eşleştirme (çevrimdışı da çalışır)
  const key = s => norm(s).replace(/[^a-zçğıöşü]/g, '');
  let local = 0;
  missing.forEach(u => {
    const k = key(u.name);
    const hit = staff.find(s => key(s.name) === k);
    if (hit) { u.sicil = u.sicil || hit.sicil; u.corp = u.corp || hit.email; local++; }
  });
  const rest = p.participants.filter(u => !u.sicil || !u.corp);
  if (local) { save(); render(); }
  if (!rest.length) return toast(`<b>${local}</b> kişi yerel eşleştirmeyle tamamlandı.`, 'ok');

  aiModal('Akıllı Eşleştirme', `${rest.length} kişi için personel listesinde karşılık aranıyor…`, 'i-spark');
  try {
    const d = await askAI([
      { role: 'system', content: SYS_TR + ' Yanıtı SADECE geçerli JSON olarak ver. Emin olmadığın eşleşmeyi yapma.' },
      {
        role: 'user', content: `Katılımcı isimlerini personel listesindeki isimlerle eşleştir. Türkçe karakter, kısaltma ve yazım farklarını dikkate al.
Katılımcılar: ${JSON.stringify(rest.map(u => ({ id: u.id, ad: u.name })))}
Personel: ${JSON.stringify(staff.filter(s => s.name).slice(0, 400).map((s, i) => ({ i, ad: s.name })))}
Şema: {"eslesme":[{"id":"katilimciId","i":<personelIndex>,"guven":0-100}]}` }
    ], { json: true, maxTokens: 4000 });
    let n = 0;
    (d.eslesme || []).forEach(m => {
      if ((m.guven ?? 100) < 70) return;
      const u = p.participants.find(x => x.id === m.id), s = staff.filter(z => z.name)[m.i];
      if (u && s) { u.sicil = u.sicil || s.sicil; u.corp = u.corp || s.email; n++; }
    });
    save(); closeModal(); render();
    toast(`<b>${local + n}</b> kişi eşleştirildi (${local} yerel, ${n} AI).`, 'ok');
  } catch (e) { aiFail(e); }
}

/* ============================================================
   16 · GM / ŞUBE SINIFLANDIRMA
   ============================================================ */
async function aiClassifyOrg() {
  const p = P();
  if (!p.participants.length) return toast('Liste boş.', 'warn');
  const orgs = [...new Set(p.participants.map(u => u.org).filter(Boolean))];
  aiModal('Organizasyon Sınıflandırma', `${orgs.length} farklı birim inceleniyor…`, 'i-spark');
  try {
    const d = await askAI([
      { role: 'system', content: SYS_TR + ' Yanıtı SADECE geçerli JSON olarak ver.' },
      {
        role: 'user', content: `Bir bankanın organizasyon birimlerini sınıflandır.
"Şube" = müşteriye hizmet veren şube birimleri. "GM" = genel müdürlük birimleri (koordinasyon, bölge, merkez, genel müdürlük müdürlükleri dahil).
Ayrıca birim adını düzgün yazımıyla normalize et (fazla boşluk, büyük/küçük harf).
Birimler: ${JSON.stringify(orgs)}
Şema: {"sonuc":[{"org":"orijinal metin","tip":"GM|Şube","duzgun":"normalize edilmiş ad"}]}` }
    ], { json: true, maxTokens: 6000 });
    const map = {};
    (d.sonuc || []).forEach(r => map[r.org] = r);
    let n = 0;
    p.participants.forEach(u => {
      const r = map[u.org]; if (!r) return;
      if (r.tip && r.tip !== u.type) { u.type = r.tip; n++; }
      if (r.duzgun) u.org = r.duzgun;
    });
    save(); closeModal(); render();
    toast(`Sınıflandırma tamam — <b>${n}</b> kayıt güncellendi.`, 'ok');
  } catch (e) { aiFail(e); }
}

/* ============================================================
   17 · EKSİK VERİ RAPORU
   ============================================================ */
async function aiDataReport() {
  const p = P();
  if (!p.participants.length) return toast('Liste boş.', 'warn');
  const issues = auditPeople(p.participants);
  aiModal('Eksik Veri Raporu', `${issues.rows.length} kayıtta bulgu var`, 'i-alert');
  try {
    const txt = await askAI([
      { role: 'system', content: SYS_TR },
      {
        role: 'user', content: `Katılımcı listesi veri kalitesi raporunu yaz. Önce 3-4 maddelik özet, sonra öncelikli aksiyon önerileri.
Toplam kişi: ${p.participants.length}
Otomatik bulgular: ${JSON.stringify(issues.summary)}
Örnek sorunlu kayıtlar: ${JSON.stringify(issues.rows.slice(0, 25))}` }
    ], { maxTokens: 2500 });
    aiTextResult(txt, `<button class="btn lt" onclick="exportIssues()"><svg class="ic"><use href="#i-down"/></svg> Sorunlu Kayıtları İndir</button>`);
  } catch (e) { aiFail(e); }
}
function auditPeople(list) {
  const rows = [], seen = {}, summary = { eksikTckn: 0, gecersizTckn: 0, eksikMail: 0, eksikTelefon: 0, eksikSicil: 0, tekrar: 0 };
  list.forEach(u => {
    const errs = [];
    if (!u.tckn) { errs.push('TC yok'); summary.eksikTckn++; }
    else if (!/^\d{11}$/.test(String(u.tckn).trim())) { errs.push('TC 11 hane değil'); summary.gecersizTckn++; }
    if (!u.email1 && !u.email2 && !u.corp) { errs.push('e-posta yok'); summary.eksikMail++; }
    if (!u.phone) { errs.push('telefon yok'); summary.eksikTelefon++; }
    if (!u.sicil) { errs.push('sicil yok'); summary.eksikSicil++; }
    const k = norm(u.name) + '|' + u.tckn;
    if (seen[k]) { errs.push('tekrar eden kayıt'); summary.tekrar++; } else seen[k] = 1;
    if (errs.length) rows.push({ ad: u.name, org: u.org, sorunlar: errs.join(', ') });
  });
  return { rows, summary };
}
function exportIssues() {
  const r = auditPeople(P().participants).rows;
  if (!r.length) return toast('Sorunlu kayıt yok.', 'ok');
  sheetToBook(r.map(x => ({ 'Ad Soyad': x.ad, 'Organizasyon': x.org, 'Sorunlar': x.sorunlar })), 'Bulgular', `${P().name}-veri-bulgulari.xlsx`);
  toast('Rapor indirildi.', 'ok');
}
