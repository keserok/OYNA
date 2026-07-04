# Runbook — Yanlışlıkla Silme & PITR Geri-Yükleme (Soru 96)

> **Amaç:** Yanlışlıkla veri silme / bozulma durumunda hızlı, güvenli geri dönüş.
> **Ön koşul (🙋 senin aksiyonun):** Supabase planında **Point-in-Time Recovery (PITR)** açık olmalı.
> **RPO hedefi:** ≤ 5 dk (PITR granülaritesi) · **RTO hedefi:** ≤ 60 dk.

## 0. Önce yaz — panik yok
Olay anını (UTC), etkilenen tabloyu/kaydı ve son iyi bilinen zamanı not al. PITR ileri değil **geriye** gider; yeni yazımlar restore sonrası kaybolabilir, o yüzden önce kapsamı daralt.

## 1. Kapsamı belirle (çoğu vaka tam restore GEREKTİRMEZ)
Yıkıcı admin işlemleri artık denetlenir. İlk durak:
1. Panel → **Denetim Kayıtları** → ilgili aksiyonu bul (ör. `PITCH_DELETE`, `USER_UPDATE`).
2. Satırdaki **Diff** ile eski değeri gör. Tek kayıt/alan ise → **manuel geri yaz** (aşağıda §4), PITR'e gerek yok.
3. **Zincir Doğrula** ile audit bütünlüğünü teyit et (tamper yoksa güvenilir kaynak).

## 2. Nokta seç (PITR)
Supabase Dashboard → Project → **Database → Backups → Point in Time**.
- Olaydan **hemen önceki** zamanı seç (audit log'daki `created_at` − 1 dk).

## 3. Güvenli restore (branch/staging'e önce)
**Doğrudan prod'a restore SON çare.** Sıra:
1. Supabase **Branch** (veya ayrı staging projesi) oluştur ve seçilen zamana restore et.
2. Kaybolan satırları staging'den doğrula (SELECT).
3. Yalnız etkilenen satırları prod'a **taşı** (aşağıdaki desen), tüm DB'yi geri sarmadan.
4. Zorunlu tam restore gerekiyorsa: bakım moduna al (Panel → Ayarlar → Bakım Modu, "BAKIM" yaz-onayla), prod'u restore et, doğrula, bakımdan çık.

## 4. Tek-kayıt geri yazma deseni (audit diff'ten)
```sql
-- Örnek: yanlışlıkla değiştirilen bir sahayı audit'teki old_value'dan geri al.
-- old_value denetim kaydından (Diff ekranı) alınır.
-- MODERATOR+ yetkisiyle admin_update_pitch üzerinden yaz (guard + tekrar audit):
select admin_update_pitch(
  '<pitch_id>'::uuid,
  '<old_value_json>'::jsonb  -- yalnız geri alınacak alanlar
);
```
Silinmiş bir kaydı geri getirmek için staging'den `INSERT ... SELECT` ile yalnız o satırı kopyala.

## 5. Doğrulama & kapanış
- Etkilenen ekranı panelden aç, veriyi teyit et.
- **Zincir Doğrula** yeniden koştur.
- Olayı `docs/runbook/INCIDENT_RESPONSE.md` formatında kaydet; kök nedeni not et.
- Yıkıcı RPC'ler zaten yaz-onayla + audit; tekrarı önlemek için gerekiyorsa app_config eşiklerini sıkılaştır.

## 6. Prova (çeyrekte bir — 🙋 ekip)
Staging'de kasıtlı bir "yanlış silme" yarat → bu runbook'la geri al → süreyi ölç (RTO). Son prova tarihini CommandCenter sağlık panosuna işle.
