# OYNA APP — Push Notification Mimarisi
## Supabase + Capacitor Push Notification Sistemi

---

## 1. Genel Mimari Bakışı

```
[Olaylar (Maç, Davet, İptal)]
        ↓
[PostgreSQL Trigger]
        ↓
[Supabase Realtime & Edge Function]
        ↓
[Supabase Push Table → Cihaz Push Token]
        ↓
[Capacitor PushNotifications Plugin]
        ↓
[iOS & Android Native Bildirim]
        ↓
[Kullanıcı Profil Ayarları = Filtre Katmanı]
```

Sistem tamamen **Firebase bağımsız**dır. Bildirim gönderimi için tek otorite **Supabase Edge Functions + Apple APNs / Google FCM HTTP v1 API** doğrudan kullanılır. Firebase SDK uygulamadan **tamamen kaldırılacak**.

---

## 2. Supabase Veritabanı Şeması (Eklemeler)

### 2.1. `profiles` Tablosu — Yeni Sütunlar

```sql
-- Cihaz Token ve Bildirim Tercihleri
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
  push_token TEXT DEFAULT NULL;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
  push_token_platform TEXT DEFAULT NULL; -- 'ios' | 'android'

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
  notification_preferences JSONB DEFAULT '{
    "match_joined":       { "enabled": true,  "mandatory": true  },
    "match_cancelled":    { "enabled": true,  "mandatory": true  },
    "match_invite":       { "enabled": true,  "mandatory": true  },
    "team_invite":        { "enabled": true,  "mandatory": true  },
    "gk_accepted":        { "enabled": true,  "mandatory": true  },
    "gk_rejected":        { "enabled": true,  "mandatory": true  },
    "ref_accepted":       { "enabled": true,  "mandatory": true  },
    "ref_rejected":       { "enabled": true,  "mandatory": true  },
    "match_reminder_1h":  { "enabled": true,  "mandatory": false },
    "match_reminder_24h": { "enabled": true,  "mandatory": false },
    "nearby_match":       { "enabled": false, "mandatory": false },
    "promo_offers":       { "enabled": false, "mandatory": false },
    "weekly_summary":     { "enabled": true,  "mandatory": false }
  }'::jsonb;
```

### 2.2. `notifications` Tablosu — Yeniden Tasarım

```sql
-- Mevcut tabloyu genişletiyoruz (DROP + CREATE şeklinde değil, ALTER ile)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type_key TEXT NOT NULL DEFAULT 'system',
  -- Hangi notification_preferences key'ine karşılık geldiği
  -- match_joined | match_cancelled | match_invite | team_invite |
  -- gk_accepted | gk_rejected | ref_accepted | ref_rejected |
  -- match_reminder_1h | match_reminder_24h | nearby_match | promo_offers | system

  ADD COLUMN IF NOT EXISTS match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS deep_link TEXT DEFAULT NULL,
  -- Örn: "oyna://match/abc-uuid" veya "oyna://profile/xyz-uuid"
  ADD COLUMN IF NOT EXISTS push_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS push_error TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS action_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS action_taken TEXT DEFAULT NULL; -- 'accepted' | 'rejected' | null
```

### 2.3. `push_log` Tablosu — Gönderim Takibi

```sql
-- Push gönderim logları (hata ayıklama & istatistik için)
CREATE TABLE IF NOT EXISTS public.push_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  push_token TEXT NOT NULL,
  platform TEXT NOT NULL,  -- 'ios' | 'android'
  status TEXT DEFAULT 'pending', -- 'pending' | 'sent' | 'failed' | 'invalid_token'
  apns_response JSONB DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Push loglarını da gerçek zamanlı dinle
ALTER PUBLICATION supabase_realtime ADD TABLE public.push_log;
```

### 2.4. `notification_templates` Tablosu — Şablonlar

```sql
-- Bildirim şablonları (Admin Panel'den yönetilebilir)
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type_key TEXT UNIQUE NOT NULL,  -- match_joined, match_cancelled, vb.
  title_tr TEXT NOT NULL,         -- Türkçe başlık şablonu
  body_tr TEXT NOT NULL,          -- Türkçe içerik ({{player_name}} gibi placeholder)
  title_en TEXT,
  body_en TEXT,
  icon TEXT DEFAULT 'notification', -- ios/android bildirim ikonu
  is_mandatory BOOLEAN DEFAULT false,
  can_user_disable BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Varsayılan şablonlar
INSERT INTO public.notification_templates (type_key, title_tr, body_tr, is_mandatory, can_user_disable) VALUES
  ('match_joined',       '⚽ Yeni Oyuncu!',          '{{player_name}}, {{match_date}} tarihli maçına katıldı.', true, false),
  ('match_cancelled',    '❌ Maç İptal Edildi',       '{{match_date}} tarihli {{pitch_name}} maçı iptal edildi.',true, false),
  ('match_invite',       '📩 Maç Daveti',             '{{sender_name}} seni {{match_date}} maçına davet etti!',  true, false),
  ('team_invite',        '🛡️ Takım Daveti',           '{{team_name}} takımına davet edildiniz.',                 true, false),
  ('gk_accepted',        '🧤 Kaleci Onayladı',        '{{gk_name}}, {{match_date}} maçını kabul etti.',          true, false),
  ('gk_rejected',        '🧤 Kaleci Reddetti',        '{{gk_name}}, {{match_date}} maçına katılamayacağını bildirdi.', true, false),
  ('ref_accepted',       '🟡 Hakem Onayladı',         '{{ref_name}}, {{match_date}} maçını kabul etti.',         true, false),
  ('ref_rejected',       '🟡 Hakem Reddetti',         '{{ref_name}}, {{match_date}} maçına katılamayacağını bildirdi.', true, false),
  ('match_reminder_1h',  '⏰ Maç 1 Saat Kaldı!',     '{{pitch_name}} maçına 1 saat kaldı. Hazır ol!',           false, true),
  ('match_reminder_24h', '📅 Yarın Maç Var!',         'Yarın {{match_time}} saatinde {{pitch_name}} maçın var.', false, true),
  ('nearby_match',       '📍 Yakında Maç!',           '{{distance}} km yakınında açık bir maç var!',             false, true),
  ('promo_offers',       '🎁 Özel Fırsat!',           '{{promo_text}}',                                          false, true),
  ('weekly_summary',     '📊 Haftalık Özet',          'Bu hafta {{match_count}} maç oynadın. Puanın: {{rating}}',false, true)
ON CONFLICT (type_key) DO NOTHING;
```

---

## 3. PostgreSQL Trigger'ları (Otomatik Bildirim Tetikleyicileri)

```sql
-- ─────────────────────────────────────────────────────────────────
-- TRIGGER 1: Maça Yeni Oyuncu Katıldığında (match_participants)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_match_joined()
RETURNS TRIGGER AS $$
DECLARE
  match_record RECORD;
  template RECORD;
  player_name TEXT;
BEGIN
  -- Maç kaptanına bildirim gönder
  SELECT * INTO match_record FROM public.matches WHERE id = NEW.match_id;
  SELECT full_name INTO player_name FROM public.profiles WHERE id = NEW.user_id;
  SELECT * INTO template FROM public.notification_templates WHERE type_key = 'match_joined';

  INSERT INTO public.notifications (user_id, title, body, type, type_key, match_id, sender_id, action_required)
  VALUES (
    match_record.captain_id,
    template.title_tr,
    REPLACE(REPLACE(template.body_tr, '{{player_name}}', player_name), '{{match_date}}', match_record.date::TEXT),
    'MATCH_JOINED',
    'match_joined',
    NEW.match_id,
    NEW.user_id,
    false
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────
-- TRIGGER 2: Maç İptal Edildiğinde (matches.status = 'CANCELLED')
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_match_cancelled()
RETURNS TRIGGER AS $$
DECLARE
  participant RECORD;
  template RECORD;
  pitch_name_val TEXT;
BEGIN
  IF NEW.status = 'CANCELLED' AND OLD.status != 'CANCELLED' THEN
    SELECT * INTO template FROM public.notification_templates WHERE type_key = 'match_cancelled';
    pitch_name_val := COALESCE(NEW.pitch_name, 'Belirtilmemiş Saha');

    -- Tüm katılımcılara bildirim gönder
    FOR participant IN
      SELECT DISTINCT user_id FROM public.match_participants WHERE match_id = NEW.id
    LOOP
      INSERT INTO public.notifications (user_id, title, body, type, type_key, match_id)
      VALUES (
        participant.user_id,
        template.title_tr,
        REPLACE(REPLACE(template.body_tr, '{{match_date}}', NEW.date::TEXT), '{{pitch_name}}', pitch_name_val),
        'MATCH_CANCELLED',
        'match_cancelled',
        NEW.id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Maç iptalini dinle
CREATE TRIGGER on_match_cancelled
  AFTER UPDATE ON public.matches
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION notify_match_cancelled();
```

---

## 4. Supabase Edge Function — Push Gönderici

### `/supabase/functions/send-push/index.ts`

```typescript
// Supabase Edge Function: send-push
// Bu fonksiyon notifications tablosuna INSERT yapıldığında
// Database Webhook tarafından tetiklenir.
// Apple APNs ve Google FCM HTTP v1 API'yi doğrudan çağırır.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

interface PushPayload {
  notification_id: string
  user_id: string
  title: string
  body: string
  type_key: string
  match_id?: string
  deep_link?: string
}

Deno.serve(async (req) => {
  const payload: PushPayload = await req.json()

  // 1. Kullanıcının push token ve preferences'ını çek
  const { data: profile } = await supabase
    .from('profiles')
    .select('push_token, push_token_platform, notification_preferences')
    .eq('id', payload.user_id)
    .single()

  if (!profile?.push_token) {
    return new Response('No push token', { status: 200 })
  }

  // 2. Kullanıcı bu bildirim tipini devre dışı bırakmış mı?
  const prefs = profile.notification_preferences || {}
  const prefForType = prefs[payload.type_key]
  if (prefForType && prefForType.enabled === false && !prefForType.mandatory) {
    return new Response('User disabled this notification type', { status: 200 })
  }

  // 3. Platform'a göre push gönder
  if (profile.push_token_platform === 'ios') {
    await sendApns(profile.push_token, payload)
  } else {
    await sendFcmDirect(profile.push_token, payload)
  }

  return new Response('OK', { status: 200 })
})

async function sendApns(token: string, payload: PushPayload) {
  // Apple APNs HTTP/2 push — JWT tabanlı kimlik doğrulama
  // Supabase secrets: APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY
  // ...
}

async function sendFcmDirect(token: string, payload: PushPayload) {
  // Google FCM HTTP v1 API (Firebase SDK'sız doğrudan API çağrısı)
  // Supabase secrets: GOOGLE_SERVICE_ACCOUNT_KEY
  // ...
}
```

**Supabase Secrets (Dashboard > Settings > Edge Functions):**
```
APNS_KEY_ID=...
APNS_TEAM_ID=...
APNS_PRIVATE_KEY=...
APNS_BUNDLE_ID=com.oyna.app
GOOGLE_SERVICE_ACCOUNT_KEY=...  # FCM için servis hesabı JSON
```

---

## 5. Capacitor Entegrasyonu (Frontend)

### 5.1. Kuracağımız Paketler

```bash
npm install @capacitor/push-notifications @capacitor/local-notifications
npx cap sync
```

### 5.2. `/notifications/pushService.ts` — Servis Dosyası

```typescript
import { PushNotifications, Token, PushNotificationSchema } from '@capacitor/push-notifications';
import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';

export const initPushNotifications = async () => {
  // 1. İzin İste
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') return;

  // 2. Kayıt ol (token al)
  await PushNotifications.register();

  // 3. Token Dinleyici
  PushNotifications.addListener('registration', async (token: Token) => {
    const platform = (window as any).Capacitor?.getPlatform() ?? 'web';
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    // Token'ı Supabase profiles tablosuna kaydet
    await supabase.from('profiles').update({
      push_token: token.value,
      push_token_platform: platform
    }).eq('id', userId);
  });

  // 4. Ön Planda Bildirim
  PushNotifications.addListener('pushNotificationReceived', (notification: PushNotificationSchema) => {
    // Uygulama açıkken in-app bildirim göster (Zustand store üzerinden)
    // useAppStore.getState().addUserNotification(...)
  });

  // 5. Bildirime Tıklandığında
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const deepLink = action.notification.data?.deep_link;
    if (deepLink) handleDeepLink(deepLink);
  });
};

export const handleDeepLink = (link: string) => {
  // oyna://match/UUID → setView('MATCH_JOIN') + setSelectedMatch
  const [, , resource, id] = link.split('/');
  if (resource === 'match') {
    // useAppStore.getState().setView('MATCH_JOIN')
    // ...
  }
};
```

---

## 6. Bildirim Türleri Referansı

| `type_key`            | Türkçe Adı              | Zorunlu | Kullanıcı Kapatabilir |
|-----------------------|-------------------------|---------|------------------------|
| `match_joined`        | Maça Oyuncu Katıldı     | ✅      | ❌                     |
| `match_cancelled`     | Maç İptal Edildi        | ✅      | ❌                     |
| `match_invite`        | Kişisel Maç Daveti      | ✅      | ❌                     |
| `team_invite`         | Takım Maç Daveti        | ✅      | ❌                     |
| `gk_accepted`         | Kaleci Kabul Etti       | ✅      | ❌                     |
| `gk_rejected`         | Kaleci Reddetti         | ✅      | ❌                     |
| `ref_accepted`        | Hakem Kabul Etti        | ✅      | ❌                     |
| `ref_rejected`        | Hakem Reddetti          | ✅      | ❌                     |
| `match_reminder_1h`   | 1 Saat Hatırlatıcı      | ❌      | ✅                     |
| `match_reminder_24h`  | 24 Saat Hatırlatıcı     | ❌      | ✅                     |
| `nearby_match`        | Yakında Maç             | ❌      | ✅                     |
| `promo_offers`        | Özel Kampanyalar        | ❌      | ✅                     |
| `weekly_summary`      | Haftalık Özet           | ❌      | ✅                     |

---

## 7. Profil Ayarları Entegrasyonu

`SettingsScreen.tsx` içindeki **Bildirimler** bölümü şu şekilde genişletilecek:

- **Zorunlu bildirimler:** Toggle kapalı görünür, kilitleme ikonu ⚙️ ile "Güvenlik nedeniyle kapatılamaz" yazısı gösterilir.
- **Opsiyonel bildirimler:** Toggle açık/kapalı yapılabilir. Değişiklik anında `profiles.notification_preferences` JSONB'ye Supabase üzerinden yazılır.
- **"Bildirim İzni Ver" Butonu:** Cihazda bildirim izni henüz verilmemişse bu buton aktif görünür. Tıklandığında `PushNotifications.requestPermissions()` çağrılır.

---

## 8. Uygulama Adımları

### Aşama A — Veritabanı (Supabase SQL Editor)
1. `profiles` tablosuna yeni sütunlar eklenir (`push_token`, `push_token_platform`, `notification_preferences`)
2. `notifications` tablosu güncellenir (yeni sütunlar)
3. `push_log` tablosu oluşturulur
4. `notification_templates` tablosu oluşturulup varsayılan şablonlar eklenir
5. PostgreSQL Trigger'ları (`notify_match_joined`, `notify_match_cancelled`, vb.) tanımlanır
6. RLS (Row Level Security) kuralları sıkılaştırılır

### Aşama B — Supabase Edge Functions
1. `supabase/functions/send-push/` klasörü oluşturulur
2. Edge Function kodu yazılır (APNs + FCM HTTP v1 doğrudan çağrı)
3. Supabase Dashboard'dan Secrets eklenir
4. Database Webhook: `notifications` INSERT → `send-push` fonksiyonu

### Aşama C — Capacitor (Frontend)
1. `@capacitor/push-notifications` paketi kurulur
2. `/notifications/pushService.ts` oluşturulur
3. `App.tsx` içinde `initPushNotifications()` çağrılır (kullanıcı giriş yapınca)
4. `iOS/android` native config güncellenir (entitlements, AndroidManifest)

### Aşama D — UI (ProfileScreen & SettingsScreen)
1. `SettingsScreen.tsx` içine **Bildirim Ayarları** bölümü eklenir
2. Zorunlu/opsiyonel toggle ayrımı yapılır
3. Supabase realtime ile profil güncellemeleri anlık yansıtılır

---

## 9. Row Level Security (RLS) Kuralları

```sql
-- Notifications: Kullanıcı sadece kendi bildirimlerini görebilir
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Only service role can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can update own notification read status"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Push Log: Sadece service role yazabilir, kullanıcılar kendi kayıtlarını görebilir
ALTER TABLE public.push_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own push logs"
  ON public.push_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Only service role can insert push logs"
  ON public.push_log FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Notification Templates: Herkes okuyabilir, sadece admin yazabilir
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read templates"
  ON public.notification_templates FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Only admins can modify templates"
  ON public.notification_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'ADMIN'
    )
  );
```

---

## 10. Dosya Yapısı (Bu Klasörde)

```
notifications/
├── PUSH_NOTIFICATION_PLAN.md    ← Bu dosya (Genel Plan)
├── schema_additions.sql          ← Veritabanı eklemeleri (Supabase'e eklenecek SQL)
├── triggers.sql                  ← PostgreSQL Trigger'ları
├── rls_policies.sql              ← Row Level Security kuralları
├── pushService.ts                ← Capacitor Push Service (Frontend)
├── notificationPreferences.ts    ← Kullanıcı tercihleri yönetimi
└── edge-function/
    └── send-push/
        └── index.ts              ← Supabase Edge Function
```
