import React, { useEffect, useState } from 'react';
import { ArrowLeft, ImageOff, MapPin, Star } from 'lucide-react';
import { OwnerBottomSheet } from '../components/OwnerBottomSheet';
import { Spinner } from '../../../components/ui/Spinner';
import { money } from '../finance/financeUi';
import { formatCapacityRange } from '../../../shared/pitchShowcaseMapper';
import { getPitchShowcase } from '../../../services/pitchOwnerService';
import type { Pitch } from '../../../types';

// ─── "Oyuncu beni nasıl görüyor?" (köprü paketi #1, 9 Ağu 2026) ─────────────
// Oyuncu keşfiyle AYNI veri yolundan (PITCH_SHOWCASE_SELECT +
// mapDbPitchToUiPitch) beslenen ayna: önce keşif KARTI, dokununca DETAY.
// Panel oyuncu paketinden bilerek ayrık (bundle ayrımı) — ekranlar hafif
// birer kopya ama veri bire bir oyuncunun gördüğüdür.

interface Props {
  pitchId: string;
  onClose: () => void;
}

export const OwnerShowcasePreviewModal: React.FC<Props> = ({ pitchId, onClose }) => {
  const [pitch, setPitch] = useState<Pitch | null>(null);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(false);

  useEffect(() => {
    let active = true;
    getPitchShowcase(pitchId)
      .then((p) => { if (active) setPitch(p); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [pitchId]);

  const ratingBadge = pitch && (pitch.ratingCount ?? 0) > 0
    ? <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-amber-300"><Star size={12} fill="currentColor" /> {Number(pitch.rating ?? 0).toFixed(1)}</span>
    : <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">YENİ</span>;

  return (
    <OwnerBottomSheet open onClose={onClose} title="Oyuncu Beni Nasıl Görüyor?"
      subtitle={detail ? 'Tesis detay sayfası' : 'Keşif listesindeki kartın'}>
      {loading ? (
        <div className="py-10 flex justify-center"><Spinner size={22} /></div>
      ) : !pitch ? (
        <p className="text-sm text-gray-500 text-center py-8">Vitrin verisi yüklenemedi — tesis yayında olmayabilir.</p>
      ) : detail ? (
        <div className="space-y-4">
          <button type="button" onClick={() => setDetail(false)}
            className="flex items-center gap-1.5 text-xs font-extrabold text-gray-400 hover:text-white">
            <ArrowLeft size={14} /> Karta dön
          </button>
          {/* Galeri */}
          {pitch.images.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
              {pitch.images.map((img, i) => (
                <img key={i} src={img} alt="" className="h-28 w-40 shrink-0 rounded-2xl object-cover border border-white/10" />
              ))}
            </div>
          ) : (
            <div className="h-28 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col items-center justify-center text-gray-500 text-xs gap-1"><ImageOff size={18} /> Fotoğraf yok — oyuncu boş kutu görür</div>
          )}
          <div>
            <h3 className="text-lg font-extrabold text-white">{pitch.name}</h3>
            <p className="text-[11px] text-gray-500 flex items-center gap-1"><MapPin size={11} /> {pitch.location || pitch.district}</p>
          </div>
          <p className="text-[13px] text-gray-300 leading-relaxed">
            {pitch.description?.trim() || <span className="text-amber-400">Açıklama boş — oyuncu tesisin hikâyesini göremiyor.</span>}
          </p>
          {/* Kortlar */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-extrabold text-gray-500 uppercase">Sahalar</h4>
            {(pitch.courts ?? []).length === 0 ? (
              <p className="text-xs text-amber-400">Aktif saha yok — oyuncu rezervasyon yapamaz.</p>
            ) : (pitch.courts ?? []).map((c) => (
              <div key={c.id} className="bg-[#0A0E14] border border-white/5 rounded-xl px-3 py-2.5 flex justify-between items-center">
                <span className="text-xs font-bold text-white">{c.name}{formatCapacityRange(c.minCapacity, c.maxCapacity, c.capacity) ? ` · ${formatCapacityRange(c.minCapacity, c.maxCapacity, c.capacity)}` : ''}</span>
                <span className="text-xs font-extrabold text-emerald-400 tabular-nums">{money(c.price ?? 0)}</span>
              </div>
            ))}
          </div>
          {(pitch.amenities ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(pitch.amenities ?? []).map((a) => (
                <span key={a} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-400">{a}</span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] text-gray-500">Oyuncunun keşif listesinde gördüğü kart — dokununca detay sayfası açılır.</p>
          <button type="button" onClick={() => setDetail(true)}
            className="w-full text-left bg-[#161B22] border border-white/10 rounded-3xl overflow-hidden active:scale-[0.99] transition-all">
            {pitch.image ? (
              <img src={pitch.image} alt="" className="w-full h-40 object-cover" />
            ) : (
              <div className="w-full h-40 bg-white/[0.04] flex flex-col items-center justify-center text-gray-500 text-xs gap-1"><ImageOff size={20} /> Fotoğraf yok</div>
            )}
            <div className="p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-extrabold text-white truncate">{pitch.name}</h3>
                {ratingBadge}
              </div>
              <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5"><MapPin size={11} /> {pitch.district}</p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-[11px] text-gray-400">{(pitch.courts ?? []).length} saha</span>
                <span className="text-sm font-extrabold text-emerald-400 tabular-nums">{money(pitch.totalPrice ?? 0)}<span className="text-[10px] text-gray-500 font-bold">'den</span></span>
              </div>
            </div>
          </button>
          {!pitch.isPublished && (
            <p className="text-xs text-amber-400">Tesis şu an YAYINDA DEĞİL — oyuncular bu kartı görmüyor.</p>
          )}
        </div>
      )}
    </OwnerBottomSheet>
  );
};
