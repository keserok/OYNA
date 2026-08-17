import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Share2, Calendar, Clock, MapPin, ShieldCheck, Download, Loader2, AlertTriangle } from 'lucide-react';
import QRCode from 'qrcode';
import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';
import { supabase } from '../supabaseClient';
import { formatTRY } from '../utils/formatTRY';
import { readTicketCache, writeTicketCache, type TicketSnapshot } from '../utils/ticketCache';
import { formatTRYAmount } from '../utils/formatTRY';
import { dosyaKaydetVeyaPaylas } from '../utils/dosyaKaydet';

/**
 * DİJİTAL BİLET — DÜRÜST (C4).
 *
 * ÖNCEKİ SORUN: bilet her zaman "ONAYLANDI" gösteriyordu, QR gerçek değildi
 * (lucide ikonu — taranamaz), ID sabitti ("OYNA-8293-TX") ve butonlar ölüydü.
 *
 * ŞİMDİ: bilet GERÇEK rezervasyon kaydından türer (store.ticketBookingId →
 * pitch_bookings). Durum ödemenin gerçeğini yansıtır (SIMULATION dahi olsa
 * dürüst): PAID/PARTIAL/PENDING/CANCELLED. Ödeme yoksa "ONAYLANDI" bileti YOK.
 * QR gerçek: rezervasyon referansını kodlar (turnikede/temsilcide doğrulanabilir).
 */

type PayState = 'PAID' | 'PARTIAL' | 'PENDING' | 'CANCELLED' | 'UNKNOWN';

interface BookingRow {
  id: string;
  status: string | null;
  payment_status: string | null;
  paid_amount: number | null;
  price: number | null;
  deposit_amount: number | null;
  booking_date: string | null;
  start_time: string | null;
  end_time: string | null;
  court_id: string | null;
  pitch_id: string | null;
  pitches: { name: string | null; district: string | null } | null;
  courts: { name: string | null } | null;
}

/** Çevrimdışı anlık görüntüyü ekranın beklediği satır biçimine çevirir. */
const snapshotToRow = (s: TicketSnapshot): BookingRow => ({
  id: s.id,
  status: s.status,
  payment_status: s.payment_status,
  paid_amount: s.paid_amount,
  price: s.price,
  deposit_amount: s.deposit_amount,
  booking_date: s.booking_date,
  start_time: s.start_time,
  end_time: s.end_time,
  court_id: s.court_id,
  pitch_id: s.pitch_id,
  pitches: (s.pitch_name || s.pitch_district) ? { name: s.pitch_name, district: s.pitch_district } : null,
  courts: s.court_name ? { name: s.court_name } : null,
});

interface MatchTicketProps {
  onBack: () => void;
}

const STATE_STYLE: Record<PayState, { label: string; bg: string; text: string; note: string }> = {
  PAID:      { label: 'ONAYLANDI',      bg: '#39FF14', text: '#0A0E14', note: 'Ödeme tamamlandı. Tesiste bu kartı göster.' },
  PARTIAL:   { label: 'KAPORA ÖDENDİ',  bg: '#FACC15', text: '#0A0E14', note: 'Kapora alındı; kalan tutar tesiste ödenir.' },
  PENDING:   { label: 'ÖDEME BEKLİYOR', bg: '#F59E0B', text: '#0A0E14', note: 'Rezervasyon henüz ödenmedi.' },
  CANCELLED: { label: 'İPTAL EDİLDİ',   bg: '#F87171', text: '#0A0E14', note: 'Bu rezervasyon iptal edilmiştir.' },
  UNKNOWN:   { label: 'DURUM BİLİNMİYOR', bg: '#6B7280', text: '#fff',   note: 'Rezervasyon durumu okunamadı.' },
};

const MatchTicket: React.FC<MatchTicketProps> = ({ onBack }) => {
  const { bookingPitch, bookingCourt, bookingDate, bookingSlot, ticketBookingId, currentUserProfile } = useAppStore();
  const [booking, setBooking] = useState<BookingRow | null>(null);
  const [loading, setLoading] = useState<boolean>(!!ticketBookingId);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [shareMsg, setShareMsg] = useState('');
  // BULGU-109: sorgu düşerse hata okunuyor, çevrimdışı kopyaya düşülüyor ve
  // kullanıcıya gerçek bir kurtarma yolu ("Tekrar Dene") veriliyor.
  const [loadError, setLoadError] = useState(false);
  const [fromCache, setFromCache] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Gerçek rezervasyonu çek (varsa). RLS: kullanıcı kendi rezervasyonunu görür.
  useEffect(() => {
    let alive = true;
    if (!ticketBookingId) { setLoading(false); return; }
    (async () => {
      setLoading(true); setLoadError(false);
      try {
        // Saha/kort ADI da buradan gelir (BULGU-085): store.bookingPitch kalıcı
        // değil ve başka tesise bakıldıysa YANLIŞ adı gösteriyordu.
        const { data, error } = await supabase
          .from('pitch_bookings')
          .select('id,status,payment_status,paid_amount,price,deposit_amount,booking_date,start_time,end_time,court_id,pitch_id,pitches(name,district),courts(name)')
          .eq('id', ticketBookingId)
          .maybeSingle();
        if (error) throw error;
        if (!alive) return;
        setBooking((data as unknown as BookingRow) ?? null);
        setFromCache(null);
        if (data) writeTicketCache(data as never);
      } catch {
        if (!alive) return;
        // Ağ düştü: son başarılı kopyayı çiz. QR yerelde yeniden üretilir.
        const snap = readTicketCache(ticketBookingId);
        if (snap) { setBooking(snapshotToRow(snap)); setFromCache(snap.savedAt); }
        else { setBooking(null); setLoadError(true); }
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [ticketBookingId, reloadKey]);

  // Ödeme durumu — GERÇEK kayıttan türetilir (sahte "ONAYLANDI" yok).
  const payState: PayState = useMemo(() => {
    if (!ticketBookingId) return 'UNKNOWN';        // referans yok → onay iddia edilmez
    if (loading) return 'UNKNOWN';
    if (!booking) return 'UNKNOWN';
    if (booking.status === 'CANCELLED') return 'CANCELLED';
    const ps = (booking.payment_status ?? '').toUpperCase();
    const paid = Number(booking.paid_amount) || 0;
    const price = Number(booking.price) || 0;
    if (ps === 'PAID' || (price > 0 && paid >= price)) return 'PAID';
    if (paid > 0) return 'PARTIAL';
    return 'PENDING';
  }, [ticketBookingId, loading, booking]);

  const style = STATE_STYLE[payState];

  // GERÇEK QR — rezervasyon referansını kodlar (turnikede doğrulanabilir).
  // İçerik: oyna://ticket/<bookingId> ; kayıt yoksa QR üretilmez (yalan yok).
  useEffect(() => {
    let alive = true;
    const ref = booking?.id ?? ticketBookingId;
    if (!ref || payState === 'CANCELLED' || payState === 'UNKNOWN') { setQrDataUrl(''); return; }
    QRCode.toDataURL(`oyna://ticket/${ref}`, {
      width: 320, margin: 1,
      color: { dark: '#0A0E14', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    }).then(url => { if (alive) setQrDataUrl(url); }).catch(() => { if (alive) setQrDataUrl(''); });
    return () => { alive = false; };
  }, [booking?.id, ticketBookingId, payState]);

  const formatDateString = (dateStr: string | null) => {
    if (!dateStr) return 'Seçilmedi';
    try {
      return new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
    } catch { return dateStr; }
  };

  // Görüntü verisi: gerçek rezervasyon > store booking* (yedek).
  const dateStr = formatDateString(booking?.booking_date ?? bookingDate);
  const timeStr = booking?.start_time
    ? `${booking.start_time.slice(0, 5)}${booking.end_time ? ' - ' + booking.end_time.slice(0, 5) : ''}`
    : (bookingSlot || 'Saat bilgisi yok');
  const pitchName = booking?.pitches?.name || bookingPitch?.name || 'Saha';
  const pitchNameParts = pitchName.split(' ');
  const districtLabel = booking?.pitches?.district || bookingPitch?.district || '—';
  const courtName = booking?.courts?.name || bookingCourt?.name || '';
  // BULGU-094: e-posta parçalamak ad değildir; gerçek ad zaten store'da.
  const captainName = currentUserProfile?.name || auth.currentUser?.displayName || '—';
  const refShort = (booking?.id ?? ticketBookingId ?? '').slice(0, 8).toUpperCase();

  const handleShare = async () => {
    const text = `OYNA rezervasyonum: ${pitchName}${courtName ? ' · ' + courtName : ''} · ${dateStr} ${timeStr}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'OYNA Rezervasyon', text }); return; }
      await navigator.clipboard?.writeText(text);
      setShareMsg('Rezervasyon bilgisi kopyalandı.');
      setTimeout(() => setShareMsg(''), 2500);
    } catch { /* kullanıcı iptal etti */ }
  };

  const handleSaveImage = async () => {
    if (!qrDataUrl) return;
    // `<a download>` paketlenmiş uygulamada SESSİZCE çalışmaz (iOS WKWebView /
    // Android WebView) — bilet QR'ı hiç kaydedilemiyordu. Ortak yardımcı pakette
    // dosyayı diske yazıp sistemin paylaşım sayfasını açar, tarayıcıda indirmeye
    // düşer. Mesaj DÖNEN SONUCA göre verilir: 'IPTAL'de (kullanıcı vazgeçti) ve
    // 'DESTEKLENMIYOR'da asla "kaydedildi" YAZILMAZ.
    try {
      const blob = await (await fetch(qrDataUrl)).blob();
      const sonuc = await dosyaKaydetVeyaPaylas(
        blob, `oyna-bilet-${refShort || 'qr'}.png`, 'OYNA Bilet',
      );
      if (sonuc === 'PAYLASILDI') setShareMsg('Bilet paylaşıma hazır.');
      else if (sonuc === 'INDIRILDI') setShareMsg('Bilet kaydedildi.');
      else if (sonuc === 'DESTEKLENMIYOR') setShareMsg('Bilet bu cihazda kaydedilemedi.');
    } catch {
      setShareMsg('Bilet kaydedilemedi.');
    }
    setTimeout(() => setShareMsg(''), 2500);
  };

  const canEnter = payState === 'PAID' || payState === 'PARTIAL';

  // Boş durum ÜÇ ayrı sebebe ayrılır: referans yok / ağ düştü / kayıt yok.
  // Eskiden üçü de "Rezervasyon durumu okunamadı." diyordu ve çıkış yolu yoktu.
  const emptyNote = !ticketBookingId
    ? 'Bilet referansı yok. Maçlarım ekranından rezervasyonu tekrar aç.'
    : loadError
      ? 'Bilet yüklenemedi. İnternetin zayıf olabilir — tekrar dene.'
      : !booking
        ? 'Bu rezervasyon bulunamadı.'
        : style.note;

  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col items-center justify-center p-6 relative">

      <div className="w-full max-w-md animate-in slide-in-from-bottom duration-700">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-extrabold text-white tracking-tight">MAÇ KARTINIZ</h1>
          <p className="text-gray-400 text-sm">
            {/* F4.1 dürüstlük: turnike/okuyucu sistemi YOK — bilet tesiste
                gösterilen rezervasyon referansıdır. */}
            {canEnter ? 'Girişte bu kartı tesis görevlisine göster.' : 'Ödeme tamamlanınca giriş için geçerli olur.'}
          </p>
        </div>

        {/* BEYAZ KART — uygulamanın TEK açık yüzeyi. Buradaki gri sınıflar koyu-zemin
            ink ölçeğine ÇEVRİLMEZ: --color-ink-2 (#A9B4C0) beyaz üzerinde 2.0:1 olur. */}
        <div className="bg-white rounded-[32px] overflow-hidden relative shadow-[0_0_50px_rgba(255,255,255,0.1)]">
          {/* Üst — durum GERÇEK ödemeye göre */}
          <div className="p-6 pb-12 relative" style={{ background: style.bg }}>
            <div className="flex justify-between items-start relative z-10">
              <div className="px-3 py-1 rounded-lg text-xs font-extrabold uppercase tracking-wider"
                style={{ background: style.text, color: style.bg }}>
                {loading ? 'YÜKLENİYOR…' : style.label}
              </div>
              <ShieldCheck size={24} style={{ color: style.text }} className="opacity-50" />
            </div>
            <div className="mt-4">
              <h2 className="text-3xl font-extrabold leading-none uppercase" style={{ color: style.text }}>
                {pitchNameParts[0]}
                {pitchNameParts.length > 1 && <><br />{pitchNameParts.slice(1).join(' ')}</>}
              </h2>
              <p className="font-bold text-sm mt-1" style={{ color: style.text, opacity: 0.6 }}>
                {districtLabel}
              </p>
            </div>
            <div className="absolute -bottom-6 -right-6 w-24 h-24 bg-white/20 rounded-full blur-xl" />
          </div>

          {/* Kesik efekti */}
          <div className="relative h-4 bg-white">
            <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-[#0A0E14] rounded-full" />
            <div className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-[#0A0E14] rounded-full" />
            <div className="absolute top-1/2 left-4 right-4 h-0.5 border-t-2 border-dashed border-gray-300" />
          </div>

          {/* Detaylar */}
          <div className="bg-white p-6 pt-2">
            <div className="grid grid-cols-2 gap-6 mb-6">
              <Detail icon={<Calendar size={10} />} label="TARİH" value={dateStr} />
              <Detail icon={<Clock size={10} />} label="SAAT" value={timeStr} />
              <Detail icon={<MapPin size={10} />} label="SAHA" value={courtName || pitchName} />
              <Detail label="REZERVASYON SAHİBİ" value={captainName} />
            </div>

            {/* Ödeme özeti — gerçek tutarlar */}
            {booking && (
              <div className="mb-5 rounded-2xl bg-gray-50 border border-gray-200 p-3 flex justify-between text-[0.75rem]">
                <span className="text-gray-600 font-bold">
                  {payState === 'PARTIAL' ? 'Ödenen kapora' : payState === 'PAID' ? 'Ödendi' : 'Ödenen'}
                </span>
                <span className="text-black font-extrabold font-numeric">
                  {formatTRYAmount(Number(booking.paid_amount) || 0)}
                  {Number(booking.price) > 0 && <span className="text-gray-600"> / {formatTRYAmount(Number(booking.price))}</span>}
                </span>
              </div>
            )}

            {/* QR — GERÇEK (rezervasyon referansı). Yoksa dürüst boş durum. */}
            <div className="rounded-2xl flex flex-col items-center justify-center relative overflow-hidden p-4"
              style={{ background: canEnter ? '#0A0E14' : '#F3F4F6' }}>
              {loading ? (
                // IP-08: bu kutunun zemini KOŞULLU (canEnter → #0A0E14 koyu,
                // değilse #F3F4F6 açık). Sabit gray-600 koyu zeminde 2.56:1'e
                // düşüyordu — "Bilet hazırlanıyor…" okunmuyordu. Metin artık
                // zeminle birlikte dönüyor.
                <div className={`py-10 flex flex-col items-center gap-2 ${canEnter ? 'text-gray-300' : 'text-gray-600'}`}>
                  <Loader2 size={28} className="animate-spin" /><span className="text-[0.6875rem] font-bold">Bilet hazırlanıyor…</span>
                </div>
              ) : canEnter && qrDataUrl ? (
                <>
                  <img src={qrDataUrl} alt="Rezervasyon QR kodu" className="w-[150px] h-[150px]" />
                  <p className="text-[0.6875rem] text-gray-400 mt-2 font-mono">REF: {refShort || '—'}</p>
                </>
              ) : (
                <div className="py-8 flex flex-col items-center gap-2 text-center px-4">
                  <AlertTriangle size={26} className="text-gray-600" />
                  <p className="text-[0.75rem] font-bold text-gray-600">{emptyNote}</p>
                  {loadError ? (
                    <button
                      onClick={() => setReloadKey(k => k + 1)}
                      className="mt-2 h-11 px-4 rounded-xl bg-[#0A0E14] text-white text-[0.8125rem] font-extrabold active:scale-95 transition-transform">
                      Tekrar Dene
                    </button>
                  ) : booking ? (
                    <p className="text-[0.6875rem] text-gray-600">Giriş QR kodu yalnız ödeme tamamlanınca oluşur.</p>
                  ) : null}
                </div>
              )}
            </div>

            {fromCache !== null && (
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-[0.6875rem] font-bold text-gray-600">
                  Çevrimdışı kopya — son güncelleme{' '}
                  {new Date(fromCache).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                </p>
                <button onClick={() => setReloadKey(k => k + 1)}
                  className="shrink-0 h-9 px-3 rounded-lg bg-[#0A0E14] text-white text-[0.6875rem] font-extrabold active:scale-95 transition-transform">
                  Yenile
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Aksiyonlar — gerçekten çalışır */}
        <div className="flex gap-4 mt-8">
          <button onClick={handleShare}
            className="flex-1 bg-[#161B22] border border-white/10 text-white py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-white/5 transition-colors">
            <Share2 size={18} /> Paylaş
          </button>
          <button onClick={handleSaveImage} disabled={!qrDataUrl}
            className={`flex-1 py-4 rounded-2xl font-extrabold text-sm flex items-center justify-center gap-2 transition-colors ${
              qrDataUrl ? 'bg-[#FACC15] text-black hover:bg-yellow-300 shadow-lg shadow-yellow-900/20' : 'bg-gray-700 text-gray-400'
            }`}>
            <Download size={18} /> QR'ı Kaydet
          </button>
        </div>
        {/* Çıkış başparmak bölgesinde ve tam genişlikte: eski `absolute top-6 left-6`
            ikon butonunu çevrimdışı şeridi (fixed top-0 z-[100]) tamamen örtüyordu
            ve bu ekranda başka çıkış yolu yoktu (BULGU-110). */}
        <button onClick={onBack}
          className="w-full mt-3 py-4 rounded-2xl bg-[#161B22] border border-white/10 text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform">
          <ArrowLeft size={18} /> Maçlarım'a Dön
        </button>
        {shareMsg && <p className="text-center text-[0.6875rem] text-[#39FF14] mt-3">{shareMsg}</p>}
      </div>
    </div>
  );
};

const Detail: React.FC<{ icon?: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div>
    <p className="text-[0.6875rem] text-gray-600 font-bold uppercase mb-1 flex items-center gap-1">{icon}{label}</p>
    <p className="text-lg font-extrabold text-black truncate">{value}</p>
  </div>
);

export default MatchTicket;
