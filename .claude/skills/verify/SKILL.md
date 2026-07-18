---
name: verify
description: OYNA'yı sandbox'ta canlı Supabase'e karşı Playwright ile sür — kurulum, giriş ve bilinen tuzaklar.
---

# OYNA doğrulama sürüşü reçetesi

## Kurulum
1. `npm run dev -- --port 5199 --strictPort` (arka planda). Env yoksa gömülü
   üretim Supabase yedeği devreye girer; `.env` ile override edilebilir.
2. **Sandbox proxy tuzağı:** Chromium'un TLS'i ajan proxy'sinin MITM'iyle
   `ERR_CONNECTION_RESET` veriyor (curl/Node çalışır). Çözüm: Supabase'i yerel
   şimden geçir — `scratchpad/sb-shim.mjs` deseni: localhost:54321 → CONNECT
   tüneli (CA: /root/.ccr/ca-bundle.crt) → supabase.co; WS upgrade dahil.
   `.env`: `VITE_SUPABASE_URL=http://localhost:54321` + anon key.
3. Playwright: `executablePath: '/opt/pw-browsers/chromium'`, viewport
   390×844, `proxy: { server: HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }`.

## Giriş
- Demo hesaplar: `oyuncuNN@oyna.app` (NN=01..15), şifre `password123`
  (alan boş bırakılamaz — buton şifre ister). KVKK kutusu özel buton:
  koordinatla tıkla (~55,805) ya da `p:has-text("okudum")` kardeş butonu.
- Girişin oturmasını `getByText('Sosyal').waitFor({timeout:40000})` ile bekle.
- Kalıcı oturum işi sonrası: oturum tarayıcı restartında da korunur
  (persistentAuthStorage, daima localStorage) — aynı kalıcı profille yeniden
  açınca auth ekranı görünmemeli; görünürse bu bir REGRESYONDUR. Temiz/yeni
  profil doğal olarak kayıt-öncelikli AUTH'a düşer → koşuya giriş prelüdü koy.
  Eski/bozuk profil dizini girişte YÜKLENİYOR'da takılabiliyor → profili sil,
  temiz aç.

## Sürüş notları
- Alt nav 'Sosyal' → kabuk; Takımlar→Takımlarım varsayılan.
- Dizinde ÜYE olunan takım satırı vitrin yerine doğrudan Takım Detayı'na gider.
- Sheet aksiyonları için gerekirse `scrollIntoViewIfNeeded` + JS click yedeği.
- Kanıt: her adımda screenshot (`scratchpad/shots/`); sunucu yan doğrulaması
  için Supabase MCP `execute_sql` (join istekleri, notifications.inbox vb.).
