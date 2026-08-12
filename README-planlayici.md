# KT Akademi Program Planlayıcı

Tek dosyalık, çevrimdışı çalışan eğitim programı planlama aracı.
Hem oryantasyon programının özel ihtiyaçlarını karşılar, hem de herhangi bir
eğitim/gelişim programı için kullanılabilir.

**Dosya:** `takvim-planlayici.html` (~1.4 MB) — çift tıkla, tarayıcıda açılır.
Kurulum, sunucu, internet gerekmez. Tüm veri tarayıcının yerel deposunda tutulur.

---

## Esneklik nasıl sağlanıyor

Uygulamanın kendisi jenerik bir motordur; oryantasyon programı bir **şablondur**.
Kurulum sekmesinden her şey değiştirilebilir:

| Ne | Nasıl |
|---|---|
| Hafta ve gün sayısı | İstenildiği kadar hafta, her haftaya istenildiği kadar gün |
| Günün iskeleti | Zaman blokları eklenir/silinir (ders veya ara), saat ve kapasiteleri serbest |
| Gün türleri | Renk + varsayılan lokasyon (Fiziki/Online, ya da kendi tanımın) |
| Oturum alanları | İstenilen bilgi eklenir/çıkarılır; kartta ve takvimde görünürlüğü ayrı ayrı seçilir |
| Güne özel etkinlikler | Kahvaltı, yemek, açılış — takvimde ara bloğuna çift tıklayarak |

**Hazır şablonlar:** Oryantasyon (2 hafta), Gelişim Programı (1 hafta),
Atölye/Seminer (3 gün), Boş Program.

### Oryantasyon için korunan işlevler
Çoklu grup sekmeleri · ders havuzu · sürükle-bırak · slot doluluk denetimi ·
eğitmen müsaitlik matrisi ve çoklu eğitmen · gün önerisi · tam gün (6 saat) bloğu ·
tanışma kahvaltısı ve ilk gün yemeği · fiziki/online hafta ayrımı ve tür kontrolü ·
katılımcı listesi (aday + personel eşleştirme, GM/Şube) · Excel içe/dışa aktarma ·
görsel çıktı · otomatik kayıt.

---

## Dört görünüm, tek veri

- **Takvim** — sürükle-bırak planlama ekranı
- **Kartlar** — sadece eğitim olan günler; eğitim adı, saat, eğitmen, platform, süre.
  Logolu başlıkla, katılımcıyla paylaşmaya/yazdırmaya hazır
- **Ajanda** — gün gün akış, resmî duyuru düzeninde (metin olarak kopyalanabilir)
- **Tablo** — tüm alanlar, aranabilir, Excel'e birebir

---

## Yapay zekâ özellikleri

Azure OpenAI (`gpt-5.1-ptu`) üzerinden çalışır. **Tamamen isteğe bağlıdır:**
servise erişim yoksa uygulama tüm planlama işlevleriyle çevrimdışı çalışmaya devam eder.

| # | Özellik | Nerede |
|---|---|---|
| 1 | Metinden program oluşturma | Araç çubuğu → *Metinden Program* |
| 2 | Akıllı içe aktarma (her formatta Excel + serbest metin) | Araç çubuğu → *İçe Aktar* |
| 7 | Yönetici özeti | Araç çubuğu → *Özet* |
| 8 | Davet e-postası üretimi | Araç çubuğu → *Davet Metni* |
| 10 | Eğitim açıklaması üretimi | Kart görünümü → *Açıklamaları Üret* |
| 13 | Komut çubuğu (doğal dil komutları) | **Ctrl+K** |
| 14 | Plan asistanı (sohbet) | Sağ üstteki konuşma balonu |
| 15 | Akıllı isim eşleştirme | Katılımcılar → *Akıllı Eşleştir* |
| 16 | GM/Şube sınıflandırma | Katılımcılar → *GM/Şube Sınıflandır* |
| 17 | Eksik veri raporu | Katılımcılar → *Eksik Veri Raporu* |

Ayrıca AI gerektirmeyen yerel işlevler: plan denetimi (Ctrl+K → *Planı denetle*)
ve otomatik dağıtım (havuz → *Dağıt*).

### Bağlantı hakkında önemli not

Servisin `OPTIONS` (CORS preflight) isteğine **404** döndüğü tespit edildi.
Bu nedenle çağrılar, tarayıcının preflight göndermeyeceği biçimde yapılır:

- anahtar `subscription-key` adres parametresiyle gönderilir,
- gövde `Content-Type` başlığı olmadan (boş tipli Blob) gönderilir,
- başka özel başlık kullanılmaz.

Klasik `api-key` başlığı yöntemi yedek olarak durur; servis tarafında CORS açılırsa
ya da sayfa bir sunucudan yayınlanırsa otomatik olarak ona geçilir. Başarılı olan
yöntem hatırlanır. Kurulum sekmesindeki **Bağlantıyı Test Et** hangi yöntemin
çalıştığını söyler.

API anahtarı dosyanın içine gömülüdür (talep edildiği gibi). Dosyayı alan herkes
anahtarı kullanabilir; dağıtımını buna göre yap. Anahtar Kurulum sekmesinden
değiştirilebilir.

---

## Geliştirme

Dosya `src/` altındaki parçalardan derlenir:

```
src/00_head.html    tasarım sistemi (CSS)
src/10_body.html    ikonlar + arayüz iskeleti
src/20_core.js      durum, şema, şablonlar, depolama
src/30_views.js     takvim / kart / ajanda / tablo
src/40_editor.js    oturum, gün, blok, alan düzenleme + kurulum
src/50_data.js      Excel içe/dışa aktarma, katılımcı modülü
src/60_ai.js        yapay zekâ katmanı
```

Derlemek için:

```bash
python3 build.py      # → takvim-planlayici.html
```

Logo ve kütüphaneler (SheetJS, html2canvas) `vendor/` altından okunur ve
dosyaya gömülür; çalışma anında hiçbir dış kaynağa istek gitmez.
