package com.oyna.app;

import android.annotation.TargetApi;
import android.app.ActivityManager;
import android.app.ApplicationExitInfo;
import android.content.ComponentCallbacks2;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * OYNA ana ekran (Capacitor koprusu).
 *
 * ── WEBVIEW COKME KORUMASI ────────────────────────────────────────────────
 * OYNA'nin arayuzu Android'in WebView'i icinde calisir. WebView, arayuzu
 * uygulamanin KENDI surecinde degil, ayri bir "render" surecinde cizer.
 * Telefonun bellegi daralinca (giris seviyesi, 2-3 GB RAM'li cihazlarda cok
 * sik) Android bu render surecini oldurur.
 *
 * Android'in VARSAYILAN davranisi: render sureci olunce uygulamanin sureci de
 * aninda oldurulur. Kullanicinin gordugu sey, uygulamanin hicbir hata mesaji
 * vermeden bir anda kapanmasidir. Kullanicilarin bildirdigi "uygulama kendini
 * kapatti" sikayetinin teknik karsiligi tam olarak budur.
 *
 * Asagidaki onRenderProcessGone gecersiz kilmasi bu zinciri kirar: olu WebView
 * temizlenir ve uygulama TEMIZ sekilde yeniden baslatilir. Kullanici, sessizce
 * kapanan bir uygulama yerine yeniden acilan bir uygulama gorur.
 *
 * `true` dondurmek Android'e "bu durumu ben ele aldim, surecimi oldurme" der.
 * `false` donseydi (ya da bu metot hic olmasaydi) uygulama olurdu.
 *
 * NOT: onRenderProcessGone Android 8.0 (API 26) ile geldi. Uygulamanin tabani
 * API 24 oldugu icin surum kontrolu var; API 24-25'te metot hic cagrilmaz ve
 * davranis eskisi gibi kalir.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "OYNA";

    /**
     * @capacitor/preferences eklentisinin Android'de kullandigi SharedPreferences
     * dosyasi. AYNI dosyaya yazdigimiz icin, buradan yazilani JS tarafi
     * Preferences.get({key}) ile okuyabilir — arada ozel bir eklenti yazmaya
     * gerek kalmaz. (Kaynak: @capacitor/preferences → PreferencesConfiguration.)
     */
    private static final String PREFS_GROUP = "CapacitorStorage";

    /** Uygulamanin BIR ONCEKI kapanisinin sebebi (JSON). Ayarlar ekraninda gosterilir. */
    private static final String KEY_SON_KAPANMA = "oyna.sonKapanmaSebebi";

    /** Push bildirimleri bu pakette CALISABILIR mi? ("true"/"false") */
    private static final String KEY_PUSH_KULLANILABILIR = "oyna.pushKullanilabilir";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        kaydetOncekiKapanmaSebebi();
        kaydetPushKullanilabilirMi();
        kurWebViewCokmeKorumasi();
    }

    // ════════════════════════════════════════════════════════════════════════
    // PUSH ALTYAPISI YOKSA UYGULAMA COKMESIN — "kendi kendine kapanma"nin
    // GERCEK sebebi buydu
    // ------------------------------------------------------------------------
    // ZINCIR (gercek cihazdan alinan yigin izi ile dogrulandi):
    //   1. `android/app/build.gradle` google-services eklentisini YALNIZCA
    //      `google-services.json` dosyasi varsa uygular. Dosya depoda yok
    //      (gizli bilgi oldugu icin .gitignore'da) ve derleme sirasinda da
    //      yazilmadiysa eklenti hic uygulanmaz.
    //   2. Eklenti uygulanmayinca Firebase yapilandirmasi APK'ya girmez ve
    //      Firebase HIC kurulmaz.
    //   3. Uygulama giristen ~1-2 saniye sonra `PushNotifications.register()`
    //      cagirir (notifications/pushService.ts).
    //   4. Native taraf Firebase'i ister ve
    //      `IllegalStateException: Default FirebaseApp is not initialized`
    //      atar.
    //   5. Capacitor bu hatayi yakalar ama `RuntimeException` olarak YENIDEN
    //      FIRLATIR (Bridge.java). Hata JS'e degil, native bir Handler
    //      is parcacigina dusen olumcul hataya donusur.
    //   6. Uygulama aninda kapanir. Kullanicinin gordugu: "ana ekrani gectikten
    //      1-2 saniye sonra uygulama kapaniyor".
    //
    // NEDEN JS TARAFINDA TRY/CATCH YETMEZ: 5. adimdaki hata JS'e hic ulasmaz;
    // sozun (promise) reddi olarak degil, surec olduren bir hata olarak
    // dogar. Bu yuzden tek dogru cozum, altyapi yokken O CAGRIYI HIC YAPMAMAK.
    //
    // Burasi o karari verir ve JS'in okuyabilecegi yere yazar. Not: iOS'ta push
    // Firebase'siz (dogrudan APNs ile) calisir; bu bayrak yalniz Android icindir.
    // ════════════════════════════════════════════════════════════════════════
    private void kaydetPushKullanilabilirMi() {
        boolean kullanilabilir = false;
        String neden;
        try {
            // Firebase kurulduysa varsayilan uygulama listede olur. Yapilandirma
            // dosyasi yoksa liste BOS doner (Firebase sessizce kurulamaz).
            kullanilabilir = !com.google.firebase.FirebaseApp.getApps(this).isEmpty();
            neden = kullanilabilir
                ? "Firebase kurulu — push kullanilabilir."
                : "Firebase kurulamadi (google-services.json pakete girmemis) — push devre disi.";
        } catch (Throwable t) {
            // Sinif hic yoksa (eklenti kaldirilmis) ya da beklenmedik bir durum:
            // guvenli taraf HER ZAMAN "kullanilamaz"dir. Push'un calismamasi,
            // uygulamanin cokmesinden kat kat iyidir.
            neden = "Firebase durumu okunamadi (" + t.getClass().getSimpleName() + ") — push devre disi.";
        }
        Log.i(TAG, neden);
        yazTercih(KEY_PUSH_KULLANILABILIR, kullanilabilir ? "true" : "false");
    }

    // ════════════════════════════════════════════════════════════════════════
    // "UYGULAMA KENDI KENDINE KAPANIYOR" — SEBEBI TAHMIN ETMEYI BIRAK, SOR
    // ------------------------------------------------------------------------
    // Bir uygulamanin kapanmasinin BIRDEN COK sebebi olabilir ve disaridan
    // bakinca hepsi ayni gorunur: ekran birden ana ekrana doner.
    //   • Telefonun bellegi doldu, Android uygulamayi kapatti (LOW_MEMORY)
    //   • Uygulama arka plandayken sistem yerini geri aldi (SIGNALED/FREEZER)
    //   • Kodda hata olustu (CRASH)
    //   • WebView/sistem kutuphanesinde derin cokme (CRASH_NATIVE)
    //   • Uygulama donduğu icin sistem kapatti (ANR)
    //   • Uretici firmanin "pil koruma" yazilimi kapatti (genelde SIGNALED)
    //
    // Bunlarin ILACLARI BIRBIRINDEN TAMAMEN FARKLIDIR. Yanlis sebebe gore
    // duzeltme yapmak zaman kaybidir — nitekim ilk turda WebView render
    // surecinin olumune karsi koruma yazildi ve sorun devam etti; demek ki
    // sebep o degil (ya da yalnizca o degil).
    //
    // Android 11'den beri sistem, uygulamanin ONCEKI kapanislarinin sebebini
    // KENDISI tutuyor (getHistoricalProcessExitReasons). Yani tahmin etmeye
    // gerek yok: dogrudan sorabiliyoruz. Bu metot o kaydi okur, sade Turkceye
    // cevirir ve JS tarafinin okuyabilecegi yere yazar; Ayarlar ekranindaki
    // "Son kapanma sebebi" satirinda gorunur.
    //
    // GIZLILIK: Hicbir yere gonderilmez, telefonda kalir. Kisisel veri icermez;
    // yalnizca kapanma sebebi, zamani ve o andaki bellek kullanimi.
    // ════════════════════════════════════════════════════════════════════════
    private void kaydetOncekiKapanmaSebebi() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                yazTercih(KEY_SON_KAPANMA, new JSONObject()
                    .put("destekleniyor", false)
                    .put("not", "Bu Android surumu kapanma sebebini bildirmiyor (Android 11 ve ustu gerekir).")
                    .toString());
                return;
            }

            ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            if (am == null) return;

            // Son 5 kapanis (en yeni basta).
            List<ApplicationExitInfo> kayitlar =
                am.getHistoricalProcessExitReasons(getPackageName(), 0, 5);

            JSONArray dizi = new JSONArray();
            for (ApplicationExitInfo k : kayitlar) {
                JSONObject o = new JSONObject();
                o.put("sebep", sebepAdi(k.getReason()));
                o.put("sebepKodu", k.getReason());
                // Ariza mi, normal mi? Karar BURADA verilir cunku sebep kodlarinin
                // isimlendirilmis sabitleri yalnizca Android tarafinda var. JS'e
                // ham sayilari tasitip orada yeniden eslemek hataya acikti
                // (kodlarin sayisal degerleri sezgisel degil: 7 = baslatilamadi,
                // 10 = kullanici kapatti gibi).
                o.put("zararsiz", zararsizKapanis(k.getReason()));
                o.put("aciklama", k.getDescription() == null ? "" : k.getDescription());
                o.put("onPlandaMiydi", onPlandaMiydi(k.getImportance()));
                o.put("bellekMB", k.getPss() > 0 ? Math.round(k.getPss() / 1024.0) : -1);
                o.put("zaman", new SimpleDateFormat("dd.MM.yyyy HH:mm", new Locale("tr", "TR"))
                    .format(new Date(k.getTimestamp())));
                dizi.put(o);
            }

            yazTercih(KEY_SON_KAPANMA, new JSONObject()
                .put("destekleniyor", true)
                .put("kayitlar", dizi)
                .toString());

            if (dizi.length() > 0) {
                Log.i(TAG, "Onceki kapanis: " + dizi.getJSONObject(0).toString());
            }
        } catch (Exception e) {
            // Teshis kodu ASLA uygulamayi dusurmemeli — sessizce vazgec.
            Log.w(TAG, "Kapanma sebebi okunamadi", e);
        }
    }

    /** ApplicationExitInfo sebep kodunu sade Turkceye cevirir. */
    private static String sebepAdi(int reason) {
        switch (reason) {
            case ApplicationExitInfo.REASON_LOW_MEMORY:
                return "Telefonun bellegi doldu — Android uygulamayi kapatti";
            case ApplicationExitInfo.REASON_CRASH:
                return "Uygulama kodunda hata (Java tarafi)";
            case ApplicationExitInfo.REASON_CRASH_NATIVE:
                return "Derin cokme (WebView ya da sistem kutuphanesi)";
            case ApplicationExitInfo.REASON_ANR:
                return "Uygulama yanit vermedi (dondu) — sistem kapatti";
            case ApplicationExitInfo.REASON_SIGNALED:
                return "Sistem uygulamayi zorla sonlandirdi (bellek geri alimi ya da pil koruma yazilimi)";
            case ApplicationExitInfo.REASON_USER_REQUESTED:
                return "Kullanici kapatti (son kullanilanlardan kaydirma)";
            case ApplicationExitInfo.REASON_USER_STOPPED:
                return "Kullanici ayarlardan zorla durdurdu";
            case ApplicationExitInfo.REASON_DEPENDENCY_DIED:
                return "Bagli oldugu bir servis oldu";
            case ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE:
                return "Asiri kaynak kullanimi";
            case ApplicationExitInfo.REASON_INITIALIZATION_FAILURE:
                return "Baslatilamadi";
            case ApplicationExitInfo.REASON_PERMISSION_CHANGE:
                return "Izin degisikligi";
            case ApplicationExitInfo.REASON_PACKAGE_STATE_CHANGE:
                return "Uygulama paketi degisti";
            case ApplicationExitInfo.REASON_PACKAGE_UPDATED:
                return "Uygulama guncellendi";
            case ApplicationExitInfo.REASON_EXIT_SELF:
                return "Uygulama kendi kendini sonlandirdi";
            case ApplicationExitInfo.REASON_FREEZER:
                return "Arka planda dondurulmusken sonlandirildi";
            case ApplicationExitInfo.REASON_OTHER:
                return "Diger";
            default:
                return "Bilinmiyor (kod " + reason + ")";
        }
    }

    /**
     * Bu kapanis BEKLENEN bir kapanis mi?
     * Kullanicinin kendi kapattigi ya da guncelleme/izin degisikligi kaynakli
     * kapanislar ariza degildir; teshis ekraninda uyari rengiyle gosterilmemeli.
     */
    private static boolean zararsizKapanis(int reason) {
        return reason == ApplicationExitInfo.REASON_USER_REQUESTED
            || reason == ApplicationExitInfo.REASON_USER_STOPPED
            || reason == ApplicationExitInfo.REASON_PACKAGE_STATE_CHANGE
            || reason == ApplicationExitInfo.REASON_PACKAGE_UPDATED
            || reason == ApplicationExitInfo.REASON_PERMISSION_CHANGE;
    }

    /**
     * Kapanma aninda kullanici uygulamaya BAKIYOR MUYDU?
     * Bu ayrim kritik: on planda kapanma gercek bir hatadir; arka planda
     * kapanma Android'in normal bellek geri alimi olabilir (kullanici geri
     * dondugunde uygulama bastan acilir ve bu da "kendi kendine kapandi"
     * gibi hissettirir ama sebebi bambaskadir).
     */
    private static String onPlandaMiydi(int importance) {
        if (importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND) {
            return "EVET — kullanici uygulamayi kullaniyordu";
        }
        if (importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE) {
            return "Kismen — uygulama gorunuyordu";
        }
        return "HAYIR — uygulama arka plandaydi";
    }

    private void yazTercih(String anahtar, String deger) {
        SharedPreferences p = getSharedPreferences(PREFS_GROUP, Context.MODE_PRIVATE);
        p.edit().putString(anahtar, deger).apply();
    }

    // ════════════════════════════════════════════════════════════════════════
    // BELLEK BASKISINDA ONCE YEDEKLENEBILIR SEYLERI BIRAK
    // ------------------------------------------------------------------------
    // Android, bellek daralinca once uygulamalara "elindekini birak" diye haber
    // verir; birakmayan uygulamayi OLDURUR. Bu cagriya cevap vermeyen bir
    // uygulama, oldurulme sirasinda one gecer.
    //
    // WebView'in karo/gorsel onbellegi tam da birakilabilir turden: silinince
    // icerik kaybolmaz, yalnizca yeniden indirilir. Haritanin karolari ve saha
    // fotograflari bu onbellekte durur ve MB'larca yer tutar.
    // ════════════════════════════════════════════════════════════════════════
    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        if (level < ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) {
            return; // Hafif baskı — dokunma, gereksiz yere yavaşlatma.
        }
        try {
            Bridge kopru = getBridge();
            WebView wv = kopru == null ? null : kopru.getWebView();
            if (wv != null) {
                // false = disk onbellegine dokunma, yalnizca BELLEKTEKI kismi bosalt.
                wv.clearCache(false);
                Log.i(TAG, "Bellek baskisi (seviye " + level + ") — WebView bellek onbellegi bosaltildi");
            }
        } catch (Exception e) {
            Log.w(TAG, "Onbellek bosaltilamadi", e);
        }
    }

    private void kurWebViewCokmeKorumasi() {
        // API 26 altinda gecersiz kilinan metot hic cagrilmaz — bosuna kurma.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        // BridgeActivity.onCreate, WebView olusturulamazsa kopruyu kurmadan
        // doner (cihazda WebView bileseni eksik/guncelleniyor olabilir).
        Bridge kopru = getBridge();
        if (kopru == null || kopru.getWebView() == null) {
            Log.w(TAG, "Kopru/WebView yok — cokme korumasi kurulamadi");
            return;
        }
        // Capacitor'in resmi yolu: kendi istemcisinin ALT SINIFI verilir, boylece
        // eklenti/derin baglanti davranislarinin tamami aynen korunur.
        kopru.setWebViewClient(new OynaWebViewClient(kopru));
    }

    @TargetApi(Build.VERSION_CODES.O)
    private class OynaWebViewClient extends BridgeWebViewClient {

        OynaWebViewClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
            boolean cokme = detail != null && detail.didCrash();
            // cokme=false => surec cokmedi, Android BELLEK icin oldurdu.
            Log.w(TAG, "WebView render sureci sonlandi (cokme=" + cokme + ") — uygulama yeniden baslatiliyor");

            // Olu WebView'i agactan cikar ve serbest birak; birakilmazsa
            // yeniden baslatma sirasinda bellekte asili kalir.
            try {
                if (view != null) {
                    ViewGroup ebeveyn = (ViewGroup) view.getParent();
                    if (ebeveyn != null) {
                        ebeveyn.removeView(view);
                    }
                    view.destroy();
                }
            } catch (Exception e) {
                Log.w(TAG, "Olu WebView temizlenemedi", e);
            }

            try {
                Intent yeniden = new Intent(getApplicationContext(), MainActivity.class);
                yeniden.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                startActivity(yeniden);
            } catch (Exception e) {
                Log.e(TAG, "Yeniden baslatma basarisiz", e);
            }
            finish();

            return true; // true => Android uygulama surecini OLDURMEZ.
        }
    }
}
