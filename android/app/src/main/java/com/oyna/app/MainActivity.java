package com.oyna.app;

import android.annotation.TargetApi;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        kurWebViewCokmeKorumasi();
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
