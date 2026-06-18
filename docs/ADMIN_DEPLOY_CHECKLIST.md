# OYNA OS Admin Panel — Deploy Checklist

Production'a admin paneli çıkmadan önce:

## Veritabanı

- [ ] `supabase db push` — tüm migration'lar uygulandı
- [ ] Özellikle `20260623000001_admin_panel_complete.sql` (revoke, revenue trend, billing events, payout_mode)
- [ ] `profiles.is_admin = true` olan en az bir admin hesabı var
- [ ] `admin_team_members` tablosu erişilebilir

## Edge Functions

- [ ] `supabase functions deploy admin-create-user`
- [ ] `supabase functions deploy admin-broadcast` (opsiyonel — UI doğrudan RPC kullanır)
- [ ] Edge function env: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`

## Ortam Değişkenleri

- [ ] `VITE_SUPABASE_URL`
- [ ] `VITE_SUPABASE_ANON_KEY`
- [ ] `VITE_APP_URL` — ghost deep-link için (örn. `https://oyna.app`)

## Build & Test

- [ ] `npm run lint` — TypeScript hatasız
- [ ] `npm run admin:verify` — yeni RPC'ler remote'da mevcut
- [ ] `npm run build` — admin.html bundle dahil
- [ ] `npm run test:admin` — Playwright smoke green
- [ ] Admin URL: `https://oyna.app/admin.html` veya `admin.oyna.app`

## Güvenlik

- [ ] `VITE_ADMIN_DEV_BYPASS` production'da **tanımlı değil**
- [ ] RLS: `is_platform_admin()` tüm admin RPC'lerde aktif
- [ ] Service role key yalnızca edge function secrets'ta (client'ta yok)

## Smoke Test (Manuel)

1. Admin girişi → dashboard DB verisi gösterir (mock değil)
2. Kullanıcı ban → `admin_audit_log`'da `BAN` kaydı
3. KVKK silme → `admin_process_account_deletion` çalışır
4. Ghost mode → consumer app'te banner + audit `IMPERSONATE`
5. ACL revoke → ekip üyesi kaldırılabilir
6. Finans → ledger'da kullanıcı adları görünür
