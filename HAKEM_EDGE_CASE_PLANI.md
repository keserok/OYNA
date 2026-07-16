# HAKEM (REFEREE) — Edge-Case Planı ve Uygulama Kaydı

Bu belge, oyuncu → kaleci → **hakem** → tesis büyük planının hakem fazını
kayıt altına alır. Kaleci fazındaki (KALECI_EDGE_CASE_PLANI.md) paylaşılan
altyapı düzeltmeleri hakemlere de taşındı; burada yalnız **hakeme-özgü**
bulgular ve çözümleri listelenir.

> Not: Para-kancalı (escrow/payout) maddeler bilinçli olarak KALECI_ODEME_DEVIR.md
> içinde devredildi — hakem tarafında da aynı sınır geçerlidir. Aşağıdaki
> maddeler operasyonel/dürüstlük/veri-bütünlüğü kapsamındadır.

## Test ortamı
- Canlı Supabase (proje `iikvzgyccvgcybzdfwlv`) üzerine migration + `execute_sql`
  ile rollback'li doğrulama (demo veri her testte eski haline getirildi).
- Sandbox: shim (localhost:54321) + Vite (5199) + Playwright (hakem oturumu),
  `tests/gk-smoke.mjs` regresyon kapısı (hakem parametreleriyle 4/4).
- `tsc --noEmit` her maddede temiz; `vitest run` → 260/260 birim testi geçiyor.

---

## Bulgular ve Çözümler

| Kod  | Önem   | Özet | Durum |
|------|--------|------|-------|
| HR-A | KRİTİK | Hakem skor girişi sahte — hiçbir sunucu yazımı yok, sahte "kaptanlara iletildi" bildirimi | ✅ |
| HR-B | Yüksek | Hakem kimlik kartı tamamen sabit sahte veri (FIFA/OTORİTER/Ordu/150/%98/4.9 + yabancı stok foto) | ✅ |
| HR-C | Orta   | Yeni hakemde `matchCount`, self-report "deneyim yılı" ile şişiriliyordu | ✅ |
| HR-D | Orta   | Başvuruda "Deneyim (yıl)" alanının hiç validasyonu yoktu | ✅ |
| HR-E | Yüksek | Teklif modalindeki "Kaptana Gidecek Kartın" sabit sahte kimlik (Cüneyt (FIFA) 4.9/150) | ✅ |
| HR-F | Yüksek | Kendi satırı yoksa loadProfile başka sağlayıcının kimliğine düşüyordu (kimlik sızıntısı) | ✅ |
| HR-G | Orta   | Admin panel: hakem stat barları veri yoksa sahte 80/80/80, puansızda 0.0★ | ✅ |
| HR-H | Orta   | Admin stat editörü eksik statları 80 ile tohumlayıp DB'ye sahte değer + puan yazıyordu | ✅ |
| HR-I | Orta   | Hakem (kırmızı) panelinde kaleci yeşili + 🧤 glove ikon sızıntısı | ✅ |

---

### HR-A — Resmi skor girişi (KRİTİK)
**Sorun:** "MAÇ SONU RAPORU" ekranında hakem skor giriyordu ama alanlar
kontrolsüzdü, gönder butonu yerel durumu FINISHED'e çevirip **"her iki kaptana
skor onayı iletildi"** diye SAHTE başarı gösteriyordu — hiçbir DB yazımı yoktu.
Kök neden: `finalize_match` RPC yalnız creatorId/captain_id/admin'e izin
veriyor, **atanmış hakem (refereeId) yetkisizdi** → hakemin skor yazma
sunucu yolu YOKTU.

**Çözüm:**
- Migration `hr_referee_finalize_score`: `finalize_match` yetkisine
  `m."refereeId" = auth.uid()` eklendi. Ödül/güvenilirlik + is_successful kapısı
  + idempotentlik AYNEN korundu.
- `scoreService.submitRefereeMatchScore()` sarmalayıcısı (skor doğrulama +
  dürüst hata eşlemesi).
- UI: kontrollü skor alanları (0-99), gerçek RPC yazımı, başarıda maç store'a
  taze çekilir (`getMatchDetails` + `applyMatchLocal`), başarısızlıkta modal
  açık + dürüst hata. Sahte mesaj yerine "Maç skoru resmi olarak kaydedildi:
  H–A". Hakem için anlamsız centilmenlik yıldızı gizlendi.

**Test:** yetki kapısı (hakem yazar ✓ / yabancı UNAUTHORIZED ✓, rollback);
uçtan uca gerçek transport (hakem token + PostgREST → 4–2, COMPLETED); demo
veri restore.

### HR-B — Kimlik kartı de-fake
**Sorun:** Kart yabancı stok fotosu + sabit FIFA/OTORİTER/Ordu/YÖNETİM 150/
VAR %98/PUAN 4.9/ELİT/A+ gösteriyordu.
**Çözüm:** gerçek foto (yoksa Scale ikonu), gerçek level/style/authority/
varCallAccuracy/rating; veri yoksa "—". `loadProfile`'a `level` eklendi.
**Test:** ekran görüntüsü — YUSUF / UEFA B / SIKI DİSİPLİNCİ / 93 / — / 8.9.

### HR-C / HR-D — matchCount + deneyim validasyonu
**Sorun:** `matchCount: data.experienceYears` — platform maç sayısı, self-report
deneyimle şişiriliyordu; alanın validasyonu da yoktu.
**Çözüm:** `matchCount: 0` (kaleciyle tutarlı); deneyim `stats.experienceYears`'a
dürüstçe yazılır. Başvuruda zorunlu, 0-60 tam sayı validasyonu + hata gösterimi.
**Test:** DB rollback — matchCount=0 ✓, stats.experienceYears='12' ✓, rating=0 ✓.

### HR-E / HR-F — teklif kartı + kimlik fallback
**Sorun:** "Kaptana Gidecek Kartın" her hakemde sabit "Cüneyt (FIFA) 4.9/150";
kendi satırı yoksa loadProfile katalog[0]'a düşüp başkasının kimliğini gösteriyordu.
**Çözüm:** teklif kartı gerçek kimlik/"—"; giriş yapmış kullanıcı için başka
sağlayıcıya düşülmez (gerçek oturum + boş stat). Misafirde demo görsel korunur.

### HR-G / HR-H — admin sahte istatistik
**Sorun:** stat barları veri yoksa 80 gösteriyor; stat editörü eksik statları
80 ile tohumlayıp rating'le birlikte DB'ye yazıyordu (uydurma veri enjeksiyonu).
**Çözüm:** StatBar bilinmeyen değerde "—" + boş bar; editör yalnız gerçekten
girilmiş statları tutar, rating sadece mevcut statlardan hesaplanır (GK + REF).

### HR-I — tema sızıntısı + ikon
**Sorun:** Hakem (kırmızı) panelinde çok sayıda bölüm kaleci yeşili/#39FF14 ve
🧤 glove ikonu gösteriyordu.
**Çözüm:** SIRADAKİ MAÇLARIM, Gelen Teklifler, GELEN TALEPLER ve JOBS feed
`isRef` ile temaya bağlandı; 🧤 → ⚖️. Anlamsal yeşiller (para, başarı/ödendi,
kaleci-özel kart, saha görseli, "zaten onaylısın") korundu.

---

## Kapanış
Hakem fazının hakeme-özgü tüm bulguları (HR-A…HR-I) çözüldü, canlı test edildi
ve `claude/player-edge-cases-plan-ggtezh` dalına push'landı. Paylaşılan altyapı
(kimlik/marketplace/gizlilik/uygunluk) kaleci fazından taşındı. Para-kancalı
işler KALECI_ODEME_DEVIR.md sınırında kalır.
