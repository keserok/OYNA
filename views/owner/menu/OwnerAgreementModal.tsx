import React, { useEffect, useState } from 'react';
import { Handshake, Lock } from 'lucide-react';
import {
  getMyPitchAgreement,
  toTurkishError,
  type MyPitchAgreement,
} from '../../../services/pitchOwnerService';
import { useOwnerToast } from '../components/useOwnerToast';
import { OwnerCenteredModal } from './OwnerModalFrame';
import { formatTRYAmount } from '../../../utils/formatTRY';

interface Props {
  onClose: () => void;
  facilityId: string;
}

const para = (n: number) => formatTRYAmount(n);

/**
 * OYNA ANLAŞMAM — salt okunur.
 *
 * Karar 6a: tesis sahibi anlaşmasını görebilir ama buradan değiştiremez;
 * değişiklik OYNA yönetimiyle konuşulur. Ekran YALNIZ tesis sahibine açılır —
 * müdür ve personel bu satırı menüde görmez, görse bile sunucu reddeder.
 */
export const OwnerAgreementModal: React.FC<Props> = ({ onClose, facilityId }) => {
  const notify = useOwnerToast();
  const [veri, setVeri] = useState<MyPitchAgreement | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const gercekSaha = !!facilityId && !facilityId.startsWith('mock-');

  useEffect(() => {
    if (!gercekSaha) { setYukleniyor(false); return; }
    getMyPitchAgreement(facilityId)
      .then(setVeri)
      .catch((err) => notify(toTurkishError(err), 'error'))
      .finally(() => setYukleniyor(false));
  }, [facilityId, gercekSaha, notify]);

  return (
    <OwnerCenteredModal title="OYNA Anlaşmam" onClose={onClose}>
      {yukleniyor ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-16 rounded-2xl bg-white/5 animate-pulse" />)}
        </div>
      ) : !veri ? (
        <p className="text-sm text-gray-400">Anlaşma bilgisi okunamadı.</p>
      ) : (
        <div className="space-y-5">
          {/* Örnek hesap önce: sahip için asıl soru "bana ne kalıyor". */}
          <div className="p-4 rounded-2xl bg-[#0A0E14] border border-emerald-500/20">
            <p className="text-[10px] text-gray-500 uppercase font-bold">
              {para(veri.ornekTaban)}&apos;lik bir saatte
            </p>
            <p className="text-2xl font-extrabold text-emerald-400 mt-1">{para(veri.ornekSahaya)}</p>
            <p className="text-xs text-gray-400 mt-0.5">hesabına geçen tutar</p>
            <div className="mt-3 pt-3 border-t border-white/5">
              <p className="text-xs text-gray-400">
                Oyunculardan toplanan: <b className="text-white">{para(veri.ornekOyuncudan)}</b>
              </p>
              <p className="text-[10px] text-gray-500 mt-1">
                Aradaki fark OYNA&apos;nın komisyonu ve uygulama payıdır.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-[#0A0E14] border border-white/5">
              <p className="text-[10px] text-gray-500 uppercase font-bold">Komisyon</p>
              <p className="text-lg font-extrabold text-white mt-1">%{veri.ratePct}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">saat ücretinden düşülür</p>
            </div>
            <div className="p-4 rounded-2xl bg-[#0A0E14] border border-white/5">
              <p className="text-[10px] text-gray-500 uppercase font-bold">Serbest iptal</p>
              <p className="text-lg font-extrabold text-white mt-1">{veri.iptalSaati} saat</p>
              <p className="text-[10px] text-gray-500 mt-0.5">bu süreden sonra iade yok</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#0A0E14] border border-white/5 space-y-1.5">
            <p className="text-xs text-gray-400">
              Anlaşma türü:{' '}
              <b className="text-white">
                {veri.ozel ? 'Sahana özel anlaşma' : 'Genel OYNA koşulları'}
              </b>
            </p>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              {veri.model === 'MODEL_B'
                ? 'Saatini OYNA kiralar, oyunculara kendi belirlediğimiz fiyattan sunar. Sen anlaştığımız tutarı alırsın.'
                : 'Tarifende yazan tutar sahanın fiyatıdır; oyunculardan toplanan tutarın üstüne uygulama payı eklenir.'}
            </p>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
            <Lock size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              Bu koşullar OYNA ile yaptığın anlaşmadan gelir ve buradan değiştirilemez.
              Değişiklik için OYNA ekibiyle iletişime geç. Zaten kurulmuş maçların hesabı,
              koşullar sonradan değişse bile kurulduğu günkü haliyle kalır.
            </p>
          </div>

          <div className="flex items-center gap-2 justify-center text-gray-600">
            <Handshake size={13} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Salt okunur</span>
          </div>
        </div>
      )}
    </OwnerCenteredModal>
  );
};
