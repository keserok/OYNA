import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';

// ════════════════════════════════════════════════════════════════════════
// REALTIME — KOPUKLUK TELAFİSİ (resync)
// ------------------------------------------------------------------------
// Sorun: supabase-js soket düzeyinde kendi kendine yeniden bağlanır, ama
// KOPUKLUK PENCERESİNDE olan INSERT/UPDATE'ler bir daha gönderilmez. Uygulama
// arka plana alındığında (Capacitor: WebView askıya alınır) veya ağ değiştiğinde
// o aralıkta gelen mesaj / slot değişimi / bildirim SESSİZCE kaybolur; ekran
// yeniden açılana kadar bayat kalır — kullanıcı dolu slotu boş sanabilir.
//
// Çözüm: kanalı kurarken durum (status) geri çağrısını dinle. Bir kez koptuysa
// ve YENİDEN 'SUBSCRIBED' olduysa, ekranın ilk-yükleme fonksiyonunu (onResync)
// tetikle — kaçan aralık tam sorguyla kapanır. Aynısı uygulama öne geldiğinde
// (visibilitychange) kanal sağlıklı değilse de yapılır.
//
// NOT: İLK 'SUBSCRIBED'de onResync ÇAĞRILMAZ — çağıran zaten ilk veriyi çekmiştir;
// aksi hâlde her ekran açılışında gereksiz ikinci sorgu atılırdı.
// ════════════════════════════════════════════════════════════════════════

/** Kanalın koptuğunu gösteren durumlar. */
const KOPUK_DURUMLAR = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

export interface ResyncAboneligi {
  /** Kanal adı — aynı ad iki kez kullanılmamalı (çift abonelik). */
  kanal: string;
  /** `.on(...)` zincirini uygular; kanalı geri döndürmelidir. */
  baglan: (ch: RealtimeChannel) => RealtimeChannel;
  /**
   * Kopukluk sonrası çağrılır: ekranın tam yükleme sorgusu.
   * Kaçan olayları telafi eder. Hata fırlatması akışı bozmaz.
   */
  yenidenYukle: () => void | Promise<void>;
}

/**
 * Kopukluk telafili realtime aboneliği kurar.
 * @returns aboneliği (ve visibilitychange dinleyicisini) kaldıran fonksiyon.
 */
export function subscribeWithResync({ kanal, baglan, yenidenYukle }: ResyncAboneligi): () => void {
  let koptu = false;
  let kapandi = false;

  const tazele = () => {
    if (kapandi) return;
    try {
      void Promise.resolve(yenidenYukle()).catch(() => { /* telafi en-iyi-çaba */ });
    } catch { /* telafi en-iyi-çaba */ }
  };

  const channel = baglan(supabase.channel(kanal)).subscribe((status) => {
    if (kapandi) return;
    if (KOPUK_DURUMLAR.has(status)) {
      koptu = true;
      return;
    }
    if (status === 'SUBSCRIBED' && koptu) {
      // Yeniden bağlandık: kopukluk penceresindeki değişimleri tam sorguyla kapat.
      koptu = false;
      tazele();
    }
  });

  // Uygulama öne geldiğinde kanal sağlıklı değilse de telafi et: Capacitor'da
  // WebView arka planda dondurulduğu için status geri çağrısı hiç koşmayabilir.
  const gorunurlukDegisti = () => {
    if (kapandi || typeof document === 'undefined') return;
    if (document.visibilityState !== 'visible') return;
    if (koptu || channel.state !== 'joined') tazele();
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', gorunurlukDegisti);
  }

  return () => {
    kapandi = true;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', gorunurlukDegisti);
    }
    void supabase.removeChannel(channel);
  };
}
