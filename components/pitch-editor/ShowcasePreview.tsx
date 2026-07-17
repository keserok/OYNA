/**
 * "Vitrinde Önizle" (Karar #18): owner, tesisin oyuncu vitrinindeki görünümünü
 * kaydetmeden önce oyuncu gözüyle görür. Vitrin detayının salt-okunur aynasıdır
 * (rezervasyon/ödeme aksiyonları hariç).
 */
import React, { useEffect, useState } from 'react';
import { Star, Thermometer, Wind, X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { splitAmenities } from '../../shared/amenities';
import { transformedImageUrl } from '../../utils/imageTransform';

interface PreviewData {
  name: string;
  district: string | null;
  city: string | null;
  rating: number | null;
  rating_count: number | null;
  google_review_count: number | null;
  description: string | null;
  amenities: string[] | null;
  images: string[] | null;
  image: string | null;
  total_price: number | null;
  courts: {
    id: string;
    name: string;
    court_type: string | null;
    price: number | null;
    is_active: boolean | null;
    description: string | null;
    lighting_grade: string | null;
    grass_grade: string | null;
    grades_status: string | null;
  }[];
}

export const ShowcasePreview: React.FC<{ pitchId: string; onClose: () => void }> = ({ pitchId, onClose }) => {
  const [data, setData] = useState<PreviewData | null>(null);

  useEffect(() => {
    supabase
      .from('pitches')
      .select('name, district, city, rating, rating_count, google_review_count, description, amenities, images, image, total_price, courts(id, name, court_type, price, is_active, description, lighting_grade, grass_grade, grades_status)')
      .eq('id', pitchId)
      .single()
      .then(({ data: d }) => setData(d as unknown as PreviewData));
  }, [pitchId]);

  const amenitySplit = splitAmenities(data?.amenities ?? []);
  const activeCourts = (data?.courts ?? []).filter((c) => c.is_active !== false);
  const placements = [
    { key: 'CLOSED', label: 'Kapalı Saha', icon: Thermometer, courts: activeCourts.filter(c => c.court_type === 'CLOSED') },
    { key: 'OPEN', label: 'Açık Saha', icon: Wind, courts: activeCourts.filter(c => c.court_type !== 'CLOSED') },
  ].filter(p => p.courts.length > 0);
  const graded = activeCourts.find(c => c.grades_status === 'approved' && (c.lighting_grade || c.grass_grade));

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-sm max-h-[90vh] bg-[#0A0E14] border border-white/10 rounded-[32px] overflow-hidden flex flex-col">
        <div className="absolute top-3 left-0 right-0 z-10 flex items-center justify-between px-4">
          <span className="px-2.5 py-1 rounded-full bg-[#FFFF00] text-black text-[9px] font-black uppercase tracking-wider">
            Oyuncu Gözüyle Önizleme
          </span>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-black/60 border border-white/15 flex items-center justify-center text-white">
            <X size={16} />
          </button>
        </div>

        {!data ? (
          <div className="h-64 flex items-center justify-center text-sm text-gray-500">Yükleniyor…</div>
        ) : (
          <div className="overflow-y-auto custom-scrollbar">
            <div className="relative h-52 bg-[linear-gradient(160deg,#143a22_0%,#0b1f14_55%,#05080c_100%)]">
              {(data.image || data.images?.[0]) && (
                <img
                  src={transformedImageUrl(data.image ?? data.images?.[0], 'detail')}
                  alt={data.name}
                  className="w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#0A0E14] to-transparent" />
              {(data.images?.length ?? 0) > 1 && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {data.images!.map((_, i) => (
                    <span key={i} className={`h-1.5 rounded-full ${i === 0 ? 'w-4 bg-white' : 'w-1.5 bg-white/50'}`} />
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 -mt-4 relative pb-6">
              <h2 className="text-xl font-black italic uppercase tracking-[-0.03em] text-white leading-none">{data.name}</h2>
              <div className="flex items-center gap-1.5 mt-2 text-xs text-white/60 font-medium">
                {/* V-2: gerçek değerlendirme yoksa sahte 5.0 değil "Yeni". */}
                {((data.rating_count ?? 0) > 0 || (data.google_review_count ?? 0) > 0) ? (
                  <>
                    <Star size={11} className="fill-white text-white" />
                    <span className="text-white font-bold">{(data.rating ?? 0).toFixed(1)}</span>
                  </>
                ) : (
                  <span className="text-white/50 font-bold uppercase tracking-wide">Yeni</span>
                )}
                <span className="opacity-50">·</span>
                <span>{data.district ?? data.city ?? ''}</span>
                {data.total_price ? (<><span className="opacity-50">·</span><span>~₺{data.total_price}/saat</span></>) : null}
              </div>
              {data.description && (
                <p className="mt-3 text-[13px] leading-relaxed text-white/70 font-medium">{data.description}</p>
              )}

              {(amenitySplit.known.length > 0 || amenitySplit.other.length > 0) && (
                <>
                  <h3 className="mt-5 mb-2 text-sm font-extrabold text-white">Tesis İmkanları</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {amenitySplit.known.map(a => {
                      const Icon = a.icon;
                      return (
                        <span key={a.value} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-[11px] font-semibold text-white/80">
                          <Icon size={12} className="text-[#39FF14]" /> {a.value}
                        </span>
                      );
                    })}
                    {amenitySplit.other.map(a => (
                      <span key={a} className="px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/5 text-[11px] text-white/50">{a}</span>
                    ))}
                  </div>
                </>
              )}

              {placements.length > 0 && (
                <>
                  <h3 className="mt-5 mb-2 text-sm font-extrabold text-white">Saha Tipi</h3>
                  <div className="space-y-2">
                    {placements.map(({ key, label, icon: Icon, courts }) => (
                      <div key={key} className="flex items-center justify-between p-3 rounded-2xl bg-[#161B22] border border-white/5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-[#39FF14]">
                            <Icon size={17} />
                          </div>
                          <div>
                            <div className="text-[13px] font-extrabold text-white">{label}</div>
                            <div className="text-[10px] text-white/50">{courts[0].description?.trim() || '6v6 / 7v7 oynanabilir'}{courts.length > 1 ? ` · ${courts.length} kort` : ''}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-black text-white">₺{courts[0].price ?? data.total_price ?? '—'}</div>
                          <div className="text-[8px] font-extrabold uppercase text-white/40">ort./saat</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {graded && (
                <div className="mt-4 flex items-center justify-around bg-[#0D111A] border border-white/[0.06] rounded-2xl p-3.5">
                  <div className="text-center">
                    <div className="text-[8px] font-black uppercase tracking-widest text-white/40">Aydınlatma</div>
                    <div className="text-lg font-black text-[#39FF14] mt-0.5">{graded.lighting_grade ?? '—'}</div>
                  </div>
                  <div className="w-px h-7 bg-white/10" />
                  <div className="text-center">
                    <div className="text-[8px] font-black uppercase tracking-widest text-white/40">Zemin</div>
                    <div className="text-lg font-black text-[#39FF14] mt-0.5">{graded.grass_grade ?? '—'}</div>
                  </div>
                </div>
              )}

              <div className="mt-5 flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex-1">
                  <div className="text-[9px] font-black uppercase tracking-wider text-white/40">Kapora · örnek</div>
                  <div className="text-base font-black italic text-white">₺{Math.round((placements[0]?.courts[0]?.price ?? data.total_price ?? 0) * 0.3 / 10) * 10}</div>
                </div>
                <div className="px-4 py-3 rounded-xl bg-[#FFFF00] text-black text-[11px] font-black italic uppercase opacity-70">
                  Kaporayı Öde
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShowcasePreview;
