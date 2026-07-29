import React, { useEffect, useState } from 'react';
import { Goalkeeper, Referee } from '../../../types';
import { MapPin, Shield, Scale, Award, Zap, Clock, Edit3, Eye, Smartphone, Power, Wallet, BadgeCheck, RefreshCcw } from 'lucide-react';
import { MarketplaceCard } from '../../../components/Marketplace/MarketplaceCard';
import { fetchProviderOpsAdmin, updateProviderOpsAdmin, toTurkishAdminError, type ProviderOpsInfo } from '../../services/adminService';
import { useAdminToast } from '../context/AdminToastContext';

type Provider = Goalkeeper | Referee;

interface ProviderDetailPanelProps {
  provider: Provider;
  type: 'GK' | 'REF';
  onEdit: () => void;
  onClose: () => void;
}

// HR-G: bilinmeyen istatistik sahte 80 ile doldurulmaz; değeri yoksa "—" ve
// boş bar gösterilir (dürüst boşluk).
const statNum = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

const StatBar: React.FC<{ label: string; value: number | null }> = ({ label, value }) => {
  const known = value !== null;
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-gray-500 font-bold uppercase">{label}</span>
        <span className="text-white font-mono">{known ? value : '—'}</span>
      </div>
      <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-red-500 to-purple-600 rounded-full" style={{ width: known ? `${Math.min(100, value as number)}%` : '0%' }} />
      </div>
    </div>
  );
};

const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

const PAYOUT_STATUS_TR: Record<string, { label: string; cls: string }> = {
  PENDING:    { label: 'BEKLİYOR',   cls: 'text-yellow-400' },
  PROCESSING: { label: 'İŞLENİYOR',  cls: 'text-blue-400' },
  COMPLETED:  { label: 'ÖDENDİ',     cls: 'text-green-400' },
  FAILED:     { label: 'BAŞARISIZ',  cls: 'text-red-400' },
  CANCELLED:  { label: 'İPTAL',      cls: 'text-gray-400' },
};

export const ProviderDetailPanel: React.FC<ProviderDetailPanelProps> = ({ provider, type, onEdit, onClose }) => {
  const isGk = type === 'GK';
  const gk = provider as Goalkeeper;
  const ref = provider as Referee;
  const stats = (provider.stats || {}) as Record<string, number | string>;
  const skills = (gk.skills || {}) as Record<string, number>;
  const zones = provider.preferredZones || [];
  const isDemo = Boolean((provider as Goalkeeper & { isDemo?: boolean }).isDemo);
  const { success, error: toastError } = useAdminToast();

  // FAZ 8A — canlı operasyon durumu (müsaitlik, doğrulama, saatler, son çekimler)
  const [ops, setOps] = useState<ProviderOpsInfo | null>(null);
  const [opsLoading, setOpsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [whDays, setWhDays] = useState<string[]>([]);
  const [whStart, setWhStart] = useState('19:00');
  const [whEnd, setWhEnd] = useState('23:00');

  const loadOps = async () => {
    setOpsLoading(true);
    try {
      const info = await fetchProviderOpsAdmin(provider.id, type);
      setOps(info);
      if (info.workingHours?.activeDays?.length) setWhDays(info.workingHours.activeDays);
      const hours = info.workingHours?.activeHours;
      if (hours && hours.includes('-')) {
        const [s, e] = hours.split('-').map((h) => h.trim());
        if (s) setWhStart(s);
        if (e) setWhEnd(e);
      }
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setOpsLoading(false);
    }
  };

  useEffect(() => {
    void loadOps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider.id, type]);

  const toggleAvailability = async () => {
    if (!ops) return;
    setBusy(true);
    try {
      await updateProviderOpsAdmin(provider.id, type, { isAvailable: !ops.isAvailable });
      setOps({ ...ops, isAvailable: !ops.isAvailable });
      success(!ops.isAvailable ? 'Sağlayıcı müsait yapıldı — eşleştirmede görünür.' : 'Sağlayıcı pasife alındı — yeni talep almaz.');
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  const saveWorkingHours = async () => {
    if (whDays.length === 0) {
      toastError('En az bir aktif gün seçin.');
      return;
    }
    setBusy(true);
    try {
      const workingHours = { activeDays: whDays, activeHours: `${whStart} - ${whEnd}` };
      await updateProviderOpsAdmin(provider.id, type, { workingHours });
      setOps(ops ? { ...ops, workingHours } : ops);
      success('Çalışma saatleri güncellendi — uygulamada anında görünür.');
    } catch (err) {
      toastError(toTurkishAdminError(err));
    } finally {
      setBusy(false);
    }
  };

  const verifTone = ops?.verificationStatus === 'approved'
    ? { label: 'ONAYLI', cls: 'bg-green-500/15 text-green-400 border-green-500/30' }
    : ops?.verificationStatus === 'rejected'
      ? { label: 'REDDEDİLDİ', cls: 'bg-red-500/15 text-red-400 border-red-500/30' }
      : { label: 'ONAY BEKLİYOR', cls: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' };

  const consumerCapabilities = isGk
    ? [
        'Marketplace\'te kaleci olarak listelenir',
        'Kaptanlardan gerçek hizmet talebi alır (blokaj + %10 komisyon)',
        'ServiceDashboard\'da müsaitlik, ücret ve cüzdanını yönetir',
        'Kayıtlı IBAN/kartına anlık payout çeker (TC kimlik kapılı)',
        'Maç sonu 1-10 puanlanır; puan profiline işlenir',
      ]
    : [
        'Marketplace\'te hakem olarak listelenir',
        'Kaptanlardan gerçek hizmet talebi alır (blokaj + %10 komisyon)',
        'ServiceDashboard\'da müsaitlik, ücret ve cüzdanını yönetir',
        'Kayıtlı IBAN/kartına anlık payout çeker (TC kimlik kapılı)',
        'Maç skoru girer; maç sonu 1-10 puanlanır',
      ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#0D1117] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-white/5 flex items-start gap-4">
          <div
            className="w-20 h-20 rounded-2xl bg-cover bg-center border-2 border-white/10 shrink-0"
            style={{ backgroundImage: `url(${provider.avatar})`, backgroundColor: '#333' }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-extrabold text-white">{provider.name}</h3>
              {isDemo && <span className="text-[8px] font-extrabold px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">DEMO</span>}
              {provider.isElite && <span className="text-[8px] font-extrabold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">ELITE</span>}
              {!opsLoading && (
                <span className={`text-[8px] font-extrabold px-2 py-0.5 rounded border ${verifTone.cls}`}>{verifTone.label}</span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              {isGk ? <Shield size={12} className="text-green-400" /> : <Scale size={12} className="text-yellow-400" />}
              {isGk ? (gk.style || 'Kaleci') : (ref.level || 'Hakem')} • {Number(provider.rating) > 0 ? `${Number(provider.rating).toFixed(1)}★` : '—'}
            </p>
            <p className="text-[10px] font-mono text-gray-600 mt-1">ID: {provider.id.slice(0, 8)}…</p>
          </div>
          <button onClick={onEdit} className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold rounded-xl uppercase">
            <Edit3 size={12} /> Düzenle
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ── Sol: Uygulama önizlemesi — kaptanın Marketplace'te gördüğü GERÇEK kart ── */}
          <div className="space-y-5">
            <section>
              <h4 className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1">
                <Smartphone size={12} /> Uygulama Önizlemesi — kaptanın gördüğü
              </h4>
              <div className="mx-auto max-w-[360px] bg-[#0A0E14] rounded-[28px] border border-white/10 p-4 shadow-inner">
                <MarketplaceCard item={provider} type={type} onClick={() => {}} />
              </div>
            </section>

            <section>
              <h4 className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1"><Eye size={12} /> Profil Metni</h4>
              <p className="text-sm text-gray-300 leading-relaxed">{provider.bio || '—'}</p>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <div className="bg-black/30 rounded-xl p-3 border border-white/5 text-center">
                  <p className="text-[9px] text-gray-500 uppercase">Ücret</p>
                  <p className="text-green-400 font-extrabold">₺{provider.fee || 0}</p>
                </div>
                <div className="bg-black/30 rounded-xl p-3 border border-white/5 text-center">
                  <p className="text-[9px] text-gray-500 uppercase">Maç</p>
                  <p className="text-white font-extrabold">{provider.matchCount || 0}</p>
                </div>
                <div className="bg-black/30 rounded-xl p-3 border border-white/5 text-center">
                  <p className="text-[9px] text-gray-500 uppercase">Puan</p>
                  <p className="text-yellow-400 font-extrabold">{Number(provider.rating || 0).toFixed(1)}</p>
                </div>
              </div>
            </section>

            {zones.length > 0 && (
              <section>
                <h4 className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1"><MapPin size={12} /> Bölgeler</h4>
                <div className="flex flex-wrap gap-1.5">
                  {zones.map((z: string) => (
                    <span key={z} className="text-[10px] px-2 py-1 rounded-lg bg-white/5 text-gray-300 border border-white/10">{z}</span>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h4 className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1"><Award size={12} /> İstatistikler</h4>
              <div className="space-y-2">
                {isGk ? (
                  <>
                    <StatBar label="Refleks" value={statNum(skills.reflexes ?? stats.reflexes)} />
                    <StatBar label="Dalış" value={statNum(skills.diving ?? stats.diving)} />
                    <StatBar label="Pozisyon" value={statNum(skills.positioning ?? stats.positioning)} />
                    <p className="text-[10px] text-gray-500 mt-2">Kurtarış %: {stats.savePercentage ?? '—'} • Penaltı: {stats.penaltySaveRate ?? '—'}</p>
                  </>
                ) : (
                  <>
                    <StatBar label="Otorite" value={statNum(stats.authority)} />
                    <StatBar label="Kondisyon" value={statNum(stats.fitness)} />
                    <StatBar label="İletişim" value={statNum(stats.communication)} />
                    <p className="text-[10px] text-gray-500 mt-2">Ort. kart: {stats.avgCards ?? '—'}</p>
                  </>
                )}
              </div>
            </section>
          </div>

          {/* ── Sağ: Canlı yönetim — müsaitlik / saatler / cüzdan ── */}
          <div className="space-y-5">
            <section className="bg-black/25 rounded-xl p-4 border border-white/5">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest flex items-center gap-1">
                  <Power size={12} /> Müsaitlik (eşleştirme motoru)
                </h4>
                <button
                  onClick={() => void loadOps()}
                  title="Yenile"
                  className="p-1 text-gray-500 hover:text-white transition-colors"
                >
                  <RefreshCcw size={12} className={opsLoading ? 'animate-spin' : ''} />
                </button>
              </div>
              {opsLoading ? (
                <p className="text-[11px] text-gray-500 py-2">Yükleniyor…</p>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-300">
                    {ops?.isAvailable
                      ? 'MÜSAİT — kaptan aramalarında ve önerilerde listelenir.'
                      : 'PASİF — yeni hizmet talebi almaz.'}
                  </p>
                  <button
                    onClick={() => void toggleAvailability()}
                    disabled={busy}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase border transition-all disabled:opacity-40 ${
                      ops?.isAvailable
                        ? 'bg-green-500/15 text-green-400 border-green-500/30 hover:bg-red-500/15 hover:text-red-400 hover:border-red-500/30'
                        : 'bg-red-500/15 text-red-400 border-red-500/30 hover:bg-green-500/15 hover:text-green-400 hover:border-green-500/30'
                    }`}
                  >
                    {ops?.isAvailable ? 'MÜSAİT · KAPAT' : 'PASİF · AÇ'}
                  </button>
                </div>
              )}
            </section>

            <section className="bg-black/25 rounded-xl p-4 border border-white/5">
              <h4 className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1">
                <Clock size={12} /> Çalışma Saatleri (uygulamadaki filtreyi besler)
              </h4>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {DAYS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setWhDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold border transition-all ${
                      whDays.includes(d)
                        ? 'bg-red-600/20 text-red-300 border-red-500/40'
                        : 'bg-white/5 text-gray-500 border-white/10 hover:text-gray-300'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 mb-3">
                <select value={whStart} onChange={(e) => setWhStart(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white [&>option]:bg-gray-900">
                  {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                <span className="text-gray-500 text-xs">—</span>
                <select value={whEnd} onChange={(e) => setWhEnd(e.target.value)}
                  className="flex-1 bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white [&>option]:bg-gray-900">
                  {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <button
                onClick={() => void saveWorkingHours()}
                disabled={busy || opsLoading}
                className="w-full py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[10px] font-extrabold uppercase disabled:opacity-40"
              >
                Saatleri Kaydet
              </button>
            </section>

            <section className="bg-black/25 rounded-xl p-4 border border-white/5">
              <h4 className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1">
                <Wallet size={12} /> Son Çekim Talepleri
              </h4>
              {opsLoading ? (
                <p className="text-[11px] text-gray-500">Yükleniyor…</p>
              ) : !ops || ops.recentPayouts.length === 0 ? (
                <p className="text-[11px] text-gray-500">Henüz çekim talebi yok.</p>
              ) : (
                <div className="space-y-2">
                  {ops.recentPayouts.map((p) => {
                    const st = PAYOUT_STATUS_TR[p.status] ?? { label: p.status, cls: 'text-gray-400' };
                    return (
                      <div key={p.id} className="flex items-center justify-between text-[11px] bg-black/30 rounded-lg px-3 py-2 border border-white/5">
                        <div className="min-w-0">
                          <span className="text-white font-bold">₺{p.amount}</span>
                          <span className="text-gray-500 ml-2 font-mono text-[10px] truncate">{p.iban}</span>
                        </div>
                        <span className={`font-extrabold text-[9px] uppercase ${st.cls}`}>{st.label}</span>
                      </div>
                    );
                  })}
                  <p className="text-[9px] text-gray-600">Onay/ret işlemleri Finans → Payout kuyruğundan yapılır.</p>
                </div>
              )}
            </section>

            <section>
              <h4 className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1"><Zap size={12} /> Uygulama Yetenekleri</h4>
              <ul className="space-y-1.5">
                {consumerCapabilities.map((cap) => (
                  <li key={cap} className="text-xs text-gray-400 flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">•</span> {cap}
                  </li>
                ))}
              </ul>
            </section>

            <section className="bg-black/25 rounded-xl p-4 border border-white/5">
              <h4 className="text-[10px] font-extrabold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1"><BadgeCheck size={12} /> Admin Notu</h4>
              <p className="text-[11px] text-gray-500">
                Bu paneldeki müsaitlik/saat değişiklikleri <strong className="text-white">anında</strong> uygulamadaki
                eşleştirme ve filtrelere yansır; katalog alanları (ad/ücret/bio/stat) için "Düzenle"yi kullanın.
                Tüm işlemler denetim kaydına yazılır.
              </p>
            </section>
          </div>
        </div>

        <div className="p-4 border-t border-white/5 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white">Kapat</button>
        </div>
      </div>
    </div>
  );
};
