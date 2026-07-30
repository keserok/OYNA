# OYNA — Ödeme Modu Sistemi (Nakit / Online)

> **Migration:** `20260829000001_odeme_modu_sistemi.sql` — **üretime uygulandı** (28 Temmuz 2026)
> **Amaç:** Paranın nasıl toplandığını tek yerden, deploy'suz ve denetlenebilir biçimde yönetmek.

---

## 1. Mimari: iki katman, bir tavan

```
app_config.payment_mode_global   ← platform admini   (TAVAN)
              ↓  kısıtlar
pitches.payment_mode             ← saha sahibi       (TERCİH)
              ↓
        resolve_payment_mode()   ← TEK DOĞRULUK KAYNAĞI
              ↓
   effective_mode / cash_allowed / online_allowed
```

**Global mod bir tavandır.** Tesis kendi tercihini saklayabilir, ama global izin
vermiyorsa etkin mod aşağı çekilir. Böylece platform admini **tek anahtarla** tüm
online ödemeyi durdurabilir.

### Modlar

| Mod | Anlamı |
|---|---|
| `CASH_ONLY` | Uygulama içinde para hareketi yok. Rezervasyon bir **talep**tir, ödeme tesiste yapılır. |
| `ONLINE_ONLY` | Ödeme uygulama içinde zorunludur. |
| `HYBRID` | Global'de "tesis karar versin", tesiste "oyuncu seçsin". |

### Çözümleme kuralı

| Global | Sağlayıcı canlı? | Etkin mod |
|---|---|---|
| herhangi | **hayır** | `CASH_ONLY` (`PROVIDER_NOT_LIVE`) |
| `CASH_ONLY` | evet | `CASH_ONLY` (`GLOBAL_CASH_ONLY`) |
| `ONLINE_ONLY` | evet | `ONLINE_ONLY` (`GLOBAL_ONLINE_ONLY`) |
| `HYBRID` | evet | tesisin tercihi (`PITCH_CHOICE`) |

---

## 2. Güvenlik tasarımı

Sistem **fail-safe**: her belirsizlik durumunda para akmaz.

1. **Global varsayılan `CASH_ONLY`** — anahtar hiç kurulmasa bile online açılmaz.
2. **Sağlayıcı kilidi** — `payment_provider` `SIMULATION`/`DISABLED` iken online
   ödeme hiçbir koşulda teklif edilmez.
3. **Bilinmeyen değer** — global moda geçersiz bir metin yazılırsa `CASH_ONLY`'ye düşer.
4. **Sunucu tarafı zorlama** — `assert_payment_method_allowed(pitch_id, method)`
   arayüz atlatılıp doğrudan RPC çağrılsa bile yanlış yöntemi reddeder.
5. **İstemci fail-safe** — `resolvePaymentMode()` ağ hatası/boş yanıt durumunda
   online'ı **açmaz** (birim testleriyle korunuyor).
6. **Etkin mod istemcide hesaplanmaz** — tek kaynak sunucudur.

---

## 3. Veritabanı yüzeyi

| Nesne | Rol | Yetki |
|---|---|---|
| `app_config.payment_mode_global` | Global mod | admin yazar (`admin_set_config`, audit'li) |
| `pitches.payment_mode` | Tesis tercihi | sahibi/admin |
| `pitches.payment_mode_locked_by_admin` | Admin kilidi | admin |
| `resolve_payment_mode(pitch_id?)` | Etkin modu çözer | `anon`, `authenticated` |
| `assert_payment_method_allowed(pitch_id, method)` | Sunucu zorlaması | `authenticated` |
| `owner_set_payment_mode(pitch_id, mode)` | Sahip anahtarı | `authenticated` (sahiplik + kilit kontrollü) |
| `admin_set_pitch_payment_mode(pitch_id, mode, locked)` | Admin override | admin, **audit'li** |
| `admin_list_pitch_payment_modes()` | Admin tablosu | admin |

---

## 4. Arayüz

**Saha sahibi** (`Menü → Ödeme Modu`): mod seçici + "şu an geçerli" şeridi.
Tercih ile fiilî durum ayrıştığında **gizlenmez**, gerekçesiyle söylenir
("Platform şu anda nakit modunda"). Admin kilidi varsa seçici kapalı ve sebebi yazılı.

**Admin** (`Sistem Parametreleri`): global mod açılır listesi + tesis bazlı tablo
(arama, kilitleme, seçili↔fiilî ayrışma uyarısı). Enum anahtarlar artık serbest
metin değil açılır liste — yazım hatasıyla geçersiz değer yazılamaz.

---

## 5. Bilinen açık noktalar

- **`assert_payment_method_allowed` henüz rezervasyon/ödeme RPC'lerine bağlı değil.**
  Fonksiyon hazır; çağrı noktalarına eklenmesi ayrı bir iştir.
- **Tüketici uygulaması modu henüz tüketmiyor.** Cüzdan/ödeme yüzeylerinin moda
  göre gizlenmesi ve rezervasyonun `PENDING`/`CASH`/`WAIVED` talebe dönüşmesi
  5 günlük planın 1. gününde duruyor.
- **Edge fonksiyonu ayrı bir kaynaktan okuyor.** `create-payment` içinde
  `Deno.env.get('PAYMENT_PROVIDER') ?? 'SIMULATION'` — yani **edge secret'ı
  silinirse sessizce simülasyona düşer** ve niyeti gerçek para çekmeden `PAID`
  işaretler. Bu fail-open varsayılan sertleştirilmeli (secret yoksa hata fırlat).
- **İki kaynak ayrışabilir:** `app_config.payment_provider` (DB) ile edge
  secret'ı ayrı ayrı ayarlanır. Bugün DB `IYZICO` diyor; edge tarafı da
  fiilen iyzico'ya gidiyor (canlı `payment_intents`: 6 PAID / 10 FAILED).
  Sandbox mı canlı mı olduğu `IYZICO_BASE_URL` secret'ına bağlıdır ve panelden
  görünmez — go-live öncesi elle doğrulanmalı.

---

## 6. Lansman kullanımı

v1 (ödemesiz sürüm) için gereken tek ayar: **`payment_mode_global = CASH_ONLY`**
— migration bunu varsayılan olarak kurdu, üretimde 6 tesisin 6'sı da nakit modda.

iyzico canlıya alındığında sıra: sağlayıcı doğrula → global'i `HYBRID` yap →
tesisler kendi modunu seçsin. Geri dönüş tek anahtarla mümkündür.
