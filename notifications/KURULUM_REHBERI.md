# OYNA APP — Push Notification Uygulama Rehberi
## Adım Adım Kurulum Kılavuzu

---

## ADIM 1: Supabase SQL Editor

Aşağıdaki SQL dosyalarını **sırayla** Supabase Dashboard → SQL Editor'e yapıştırın:

### 1a. Şema Eklemeleri
```
notifications/schema_additions.sql
```
Bu dosya şunları oluşturur:
- `profiles` tablosuna `push_token`, `push_token_platform`, `notification_preferences` sütunları
- `match_participants` tablosu (yeni — trigger için kritik)
- `push_log` tablosu
- `notification_templates` tablosu + varsayılan veriler

### 1b. Trigger'lar
```
notifications/triggers.sql
```
Bu dosya şunları oluşturur:
- `notify_match_joined()` → maça biri katıldığında kaptana bildirim
- `notify_match_cancelled()` → maç iptal edildiğinde herkese bildirim  
- `notify_gk_ref_status_change()` → kaleci/hakem kabul-red durumlarında bildirim
- `send_match_invite()` RPC fonksiyonu → kişisel & takım daveti gönderme

### 1c. RLS Politikaları
```
notifications/rls_policies.sql
```
Bu dosya güvenlik katmanını oluşturur.

---

## ADIM 2: Supabase Edge Function Kurulumu

### 2a. Edge Function Deploy
```bash
# Supabase CLI kurulu değilse:
npm install -g supabase

# Giriş yap
supabase login

# Projeye bağlan (Supabase project ref ID'ni gir)
supabase link --project-ref YOUR_PROJECT_REF

# send-push fonksiyonunu deploy et
supabase functions deploy send-push
```

### 2b. Supabase Secrets Ekle
Supabase Dashboard → Settings → Edge Functions → Secrets:

```
# Apple APNs (iOS) — Apple Developer portalından alınır
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=XXXXXXXXXX  
APNS_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
APNS_BUNDLE_ID=com.oyna.app
APNS_PRODUCTION=false   # Test için false, yayın için true

# Google FCM (Android) — Google Cloud Console Service Account
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":...}
GOOGLE_PROJECT_ID=your-firebase-project-id

# Webhook güvenlik anahtarı (isteğe bağlı)
WEBHOOK_SECRET=gizli-bir-anahtar
```

### 2c. Database Webhook Oluştur
Supabase Dashboard → Database → Webhooks → "Create a new hook":

```
Name: send_push_on_notification
Table: notifications
Events: INSERT
HTTP Method: POST
URL: https://YOUR_PROJECT.supabase.co/functions/v1/send-push
Headers:
  Authorization: Bearer WEBHOOK_SECRET
```

---

## ADIM 3: Capacitor Push Notifications Kurulumu

### 3a. Paketleri Kur
```bash
npm install @capacitor/push-notifications @capacitor/local-notifications
npx cap sync
```

### 3b. iOS Yapılandırması
`ios/App/App/AppDelegate.swift` dosyasına:
```swift
import UIKit
import Capacitor
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions ...) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }
}
```

`ios/App/App.entitlements` dosyasına:
```xml
<key>aps-environment</key>
<string>development</string>   <!-- production için: production -->
```

### 3c. Android Yapılandırması
`android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
```

`android/app/build.gradle`:
```groovy
dependencies {
    // FCM için (SDK değil, sadece native bridge)
    implementation platform('com.google.firebase:firebase-bom:32.0.0')
    implementation 'com.google.firebase:firebase-messaging'
}
```

`android/app/google-services.json` → Firebase Console'dan indir (FCM için gerekli).

---

## ADIM 4: Frontend Entegrasyonu

### 4a. App.tsx Güncelle
```tsx
import { initPushNotifications, subscribeToInAppNotifications } from './notifications/pushService';

// Kullanıcı giriş yaptıktan sonra:
useEffect(() => {
  if (auth.currentUser) {
    initPushNotifications(
      auth.currentUser.uid,
      (notification) => {
        // In-app bildirim göster
        useAppStore.getState().addUserNotification({...});
      },
      (deepLink) => {
        // Deep link yönet
        handleDeepLink(deepLink, setView, setSelectedMatch);
      }
    );

    // Realtime in-app bildirimleri dinle
    const unsubscribe = subscribeToInAppNotifications(
      auth.currentUser.uid,
      (notification) => {
        useAppStore.getState().addUserNotification({...});
      }
    );

    return () => unsubscribe();
  }
}, [auth.currentUser?.uid]);
```

### 4b. SettingsScreen Güncelle
`views/SettingsScreen.tsx` içine Bildirim Ayarları bölümü eklenecek.
`notifications/notificationPreferences.ts` kullanılacak.

---

## ADIM 5: Test

### 5a. Supabase Üzerinden Manuel Test
```sql
-- Test bildirimi ekle (Edge Function tetiklenmeli)
INSERT INTO public.notifications (user_id, title, body, type_key, is_active)
VALUES ('KULLANICI_UUID', 'Test Bildirimi', 'Bu bir test.', 'system', true);
```

### 5b. Push Log Kontrolü
```sql
SELECT * FROM public.push_log ORDER BY created_at DESC LIMIT 10;
```

---

## Gerekli Supabase Secrets Özeti

| Secret | Nereden | Zorunlu |
|--------|---------|---------|
| `APNS_KEY_ID` | Apple Developer → Certificates → Keys | iOS için ✅ |
| `APNS_TEAM_ID` | Apple Developer → Membership | iOS için ✅ |
| `APNS_PRIVATE_KEY` | Apple Developer → Keys (p8 dosyası) | iOS için ✅ |
| `APNS_BUNDLE_ID` | Xcode → Bundle Identifier | iOS için ✅ |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Google Cloud Console | Android için ✅ |
| `GOOGLE_PROJECT_ID` | Firebase Console | Android için ✅ |
| `WEBHOOK_SECRET` | Kendin belirle (UUID) | Opsiyonel |
