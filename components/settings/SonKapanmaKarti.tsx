// ════════════════════════════════════════════════════════════════════════════
// "SON KAPANMA SEBEBİ" KARTI (Ayarlar → Destek)
// ----------------------------------------------------------------------------
// Uygulamanın kendi kendine kapanması bildirildiğinde, sebebi tahmin etmek
// yerine telefona sormak gerekir. Android 11'den beri sistem her kapanışın
// sebebini tutuyor; bu kart o kaydı sade Türkçe gösterir.
//
// KART NE ZAMAN GÖRÜNÜR: yalnız Android'de VE kayıt varsa. Tarayıcıda, iOS'ta
// ya da hiç anormal kapanma olmamışsa hiçbir şey çizmez — normal kullanıcı bu
// kartı hiç görmez.
//
// NEDEN AYARLAR'DA: kullanıcı kapanmadan sonra uygulamayı açıp buraya bakar ve
// ekran görüntüsünü paylaşır. Böylece hangi sebebin gerçek olduğu tahmine değil
// telefonun kendi kaydına dayanır.
// ════════════════════════════════════════════════════════════════════════════

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { sonKapanmaRaporu, ariza, type KapanmaRaporu } from '../../services/exitReasonService';
import { type_ } from '../../ui/type';

const SonKapanmaKarti: React.FC = () => {
  const [rapor, setRapor] = useState<KapanmaRaporu | null>(null);

  useEffect(() => {
    let iptal = false;
    void sonKapanmaRaporu().then((r) => { if (!iptal) setRapor(r); });
    return () => { iptal = true; };
  }, []);

  // Bilgi yok (tarayıcı / iOS / hiç anormal kapanma olmamış) → hiçbir şey çizme.
  if (!rapor) return null;

  if (!rapor.destekleniyor) {
    return (
      <div className="mt-3 rounded-2xl border border-white/8 bg-[#161B22] p-4">
        <div className="flex items-start gap-2.5">
          <Info size={16} className="text-ink-4 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className={`${type_.body} font-bold text-ink-2`}>Son kapanma sebebi</p>
            <p className={`${type_.caption} text-ink-4 mt-1`}>
              {rapor.not || 'Bu telefonun Android sürümü kapanma sebebini bildirmiyor.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (rapor.kayitlar.length === 0) {
    return (
      <div className="mt-3 rounded-2xl border border-white/8 bg-[#161B22] p-4">
        <div className="flex items-start gap-2.5">
          <Info size={16} className="text-ink-4 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className={`${type_.body} font-bold text-ink-2`}>Son kapanma sebebi</p>
            <p className={`${type_.caption} text-ink-4 mt-1`}>
              Kayıt yok — uygulama bu telefonda beklenmedik şekilde hiç kapanmamış.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const enSon = rapor.kayitlar[0];
  const sorunlu = ariza(enSon);

  return (
    <div
      className={`mt-3 rounded-2xl border p-4 ${
        sorunlu ? 'border-warning-line bg-warning-bg' : 'border-white/8 bg-[#161B22]'
      }`}
    >
      <div className="flex items-start gap-2.5">
        {sorunlu
          ? <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
          : <Info size={16} className="text-ink-4 shrink-0 mt-0.5" />}
        <div className="min-w-0 flex-1">
          <p className={`${type_.body} font-bold ${sorunlu ? 'text-warning' : 'text-ink-2'}`}>
            Son kapanma sebebi
          </p>

          <p className={`${type_.bodyLg} text-ink mt-1.5 font-semibold`}>{enSon.sebep}</p>

          <dl className={`${type_.caption} text-ink-3 mt-2.5 space-y-1`}>
            <div className="flex gap-2">
              <dt className="text-ink-4 shrink-0">Ne zaman:</dt>
              <dd className="min-w-0">{enSon.zaman}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-4 shrink-0">Kullanıyor muydun:</dt>
              <dd className="min-w-0">{enSon.onPlandaMiydi}</dd>
            </div>
            {enSon.bellekMB > 0 && (
              <div className="flex gap-2">
                <dt className="text-ink-4 shrink-0">O anki bellek:</dt>
                <dd className="min-w-0">{enSon.bellekMB} MB</dd>
              </div>
            )}
            {enSon.aciklama ? (
              <div className="flex gap-2">
                <dt className="text-ink-4 shrink-0">Sistem notu:</dt>
                <dd className="min-w-0 break-words">{enSon.aciklama}</dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt className="text-ink-4 shrink-0">Kod:</dt>
              <dd className="min-w-0">{enSon.sebepKodu}</dd>
            </div>
          </dl>

          {rapor.kayitlar.length > 1 && (
            <details className="mt-3">
              <summary className={`${type_.caption} text-ink-4 cursor-pointer`}>
                Daha eski {rapor.kayitlar.length - 1} kapanış
              </summary>
              <ul className={`${type_.caption} text-ink-3 mt-2 space-y-1.5`}>
                {rapor.kayitlar.slice(1).map((k, i) => (
                  <li key={i} className="border-l-2 border-white/10 pl-2.5">
                    <span className="text-ink-4">{k.zaman}</span> — {k.sebep} (kod {k.sebepKodu})
                  </li>
                ))}
              </ul>
            </details>
          )}

          <p className={`${type_.caption} text-ink-4 mt-3 leading-relaxed`}>
            Bu bilgi telefonunda kalır, hiçbir yere gönderilmez. Uygulama beklenmedik
            şekilde kapanıyorsa bu ekranın görüntüsünü paylaşman sebebi bulmayı sağlar.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SonKapanmaKarti;
