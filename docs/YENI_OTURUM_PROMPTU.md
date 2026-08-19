# Yeni oturum promptu — canlı veritabanına tam bağlı doğrulama

Bu dosya, ağ politikası açıldıktan **sonra** başlatılacak oturuma verilecek metni
taşır. Amaç: OYNA'yı gerçek Supabase'e karşı, gerçek kullanıcı gibi uçtan uca
sürmek ve şu ana dek yalnız hermetik (taklit sunucu) testlerle kanıtlanmış olan
her şeyi canlı veriyle kanıtlamak.

---

## ÖNCE: ortam ayarı (oturumu açmadan önce yapılacak)

`claude.ai/code` → mesaj kutusunun üstündeki **bulut simgesi** → ortamın yanındaki
**dişli** (ya da **Add cloud environment** ile yeni bir ortam) →

- **Network access:** `Custom`
- **Allowed domains:**

```
*.supabase.co
*.supabase.com
api.iyzipay.com
sandbox-api.iyzipay.com
api.netgsm.com.tr
*.frame.claudeusercontent.com
```

- **"Also include default list of common package managers"** → **işaretli**
  (işaretlenmezse npm ve GitHub da kapanır)

Ayar mevcut oturuma geçmez; **yeni oturum** açılmalı.

İsteğe bağlı, aynı pencerede **Environment variables**:
`SUPABASE_ACCESS_TOKEN` (yalnız `supabase` CLI gerekiyorsa).

---

## SONRA: oturuma yapıştırılacak prompt

> OYNA deposunda `claude/payment-auth-refactor-twux72` dalında çalışıyoruz
> (birleştiyse `main`). Bu oturumun ortamına Supabase, iyzico ve Netgsm alan
> adları için ağ izni verildi — yani önceki oturumlarda yapılamayan **canlı
> doğrulama** artık mümkün.
>
> **Birinci iş — bağlantıyı kanıtla.** Şu dört hostu tek tek ölç ve bana
> "açıldı / açılmadı" diye rapor et; kapalı olan varsa devam etme, söyle:
>
> ```
> curl -sS -o /dev/null -w "%{http_code}\n" https://iikvzgyccvgcybzdfwlv.supabase.co/auth/v1/health
> curl -sS -o /dev/null -w "%{http_code}\n" https://sandbox-api.iyzipay.com/
> curl -sS -o /dev/null -w "%{http_code}\n" https://api.netgsm.com.tr/
> curl -sS -o /dev/null -w "%{http_code}\n" https://api.supabase.com/
> ```
>
> Hata alırsan `curl -sS "$HTTPS_PROXY/__agentproxy/status"` çıktısındaki
> `recentRelayFailures` alanına bak — sebebi orada yazıyor.
>
> **İkinci iş — uygulamayı gerçek kullanıcı olarak sür.** `.claude/skills/verify`
> reçetesini kullan ama **`sb-shim.mjs` tünelini kurma** — artık gerek yok,
> doğrudan `https://iikvzgyccvgcybzdfwlv.supabase.co` kullan. Reçetedeki demo
> giriş bölümü **eskidir**: e-posta + şifre yolu kaldırıldı. Giriş için
> `+90 500 000 00 00` numarası ve `500000` kodu kullanılacak (Supabase panelinde
> Phone → Test OTP satırı girilmiş olmalı). Reçeteyi bu iki noktada güncelle.
>
> Sırayla şu rolleri **ayrı ayrı** deneyimle ve her adımda ekran görüntüsü al:
>
> 1. **Yeni oyuncu** — numarayla kayıt, ad-soyad, konum izni, ana sayfa
> 2. **Oyuncu** — saha ara → saat seç → kapora öde (sandbox kart) → rezervasyonu
>    gör → iptal et → iade tutarını doğrula
> 3. **Kaptan** — maç kur → kadro doldur → kapora → maçı oyna → maç sonu ekranı
> 4. **Kaleci ve hakem** — `500 000 00 00` hesabıyla gir, rol değiştiriciyle
>    kaleci ve hakem panellerinin **tamamını** gez
> 5. **Tesis sahibi** — takvim, elle rezervasyon, nakit slot, finans sekmesi
> 6. **Yönetici** — admin panelinde aynı işlemlerin karşılığını gör: kim ne kadar
>    ödedi, hangi kapora iptal edildi, hangi iade bekliyor
>
> Her rolde ekranın **gerçekten** ne gösterdiğini yaz — "çalışıyor" değil, ne
> gördüğünü. Bulduğun her kusuru bana soru olarak getir.
>
> **Üçüncü iş — para zincirini sandbox'ta uçtan uca doğrula.** iyzico
> sandbox'ında sırayla:
>
> 1. 3DS ile kapora tahsilatı → `payment_intents` satırı `PAID` mi
> 2. Aynı niyette iyzico'nun **gerçek komisyonu** kaydedildi mi
>    (`raw → psp` alanı) — bize ne kestiğini buradan öğreneceğiz
> 3. Rezervasyon iptali → iade tutarı ekranda yazanla birebir aynı mı
> 4. Maç kaporası tahsilatı ve iptali
> 5. Yuvarlama: kullanıcının ödediği her tutar 10'un katı mı
>
> **Dördüncü iş — SMS.** Netgsm anahtarları girilmişse gerçek bir numaraya kod
> gönderip doğrula. Anahtar yoksa fonksiyonun fail-closed davrandığını
> (sessizce yutmadığını) doğrula.
>
> **Kurallar:** Canlı veritabanında test verisi bırakma — açtığın her kaydı
> kapat. Para yollarına dokunmadan önce sor. `OYNA_PRENSIPLER.md` bağlayıcıdır;
> `docs/OYNA_DEVIR_LISTESI` sayfasındaki kararlar da öyle. Sonunda devir
> listesini bulgularınla güncelle.

---

## Bu oturumdan devredilen bilgi

- Canlı proje: `iikvzgyccvgcybzdfwlv` (OYNA)
- Göçler `supabase db push` ile **gitmez** (ham TCP 5432 proxy'den geçmiyor);
  Supabase MCP `apply_migration` kullanılacak
- Hermetik testler: `npm run test:e2e:studio` (4010), `npm run test:visual` (4020)
- Demo hesap: `+90 500 000 00 00` · kod `500000` · roller kaleci + hakem + oyuncu
