import React from 'react';
import { Goalkeeper, Referee } from '../../../types';
import { MapPin, Star, Shield, Scale, Award, Zap, Clock, Edit3, Eye } from 'lucide-react';

type Provider = Goalkeeper | Referee;

interface ProviderDetailPanelProps {
  provider: Provider;
  type: 'GK' | 'REF';
  onEdit: () => void;
  onClose: () => void;
}

const StatBar: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div>
    <div className="flex justify-between text-[10px] mb-1">
      <span className="text-gray-500 font-bold uppercase">{label}</span>
      <span className="text-white font-mono">{value}</span>
    </div>
    <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
      <div className="h-full bg-gradient-to-r from-red-500 to-purple-600 rounded-full" style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  </div>
);

export const ProviderDetailPanel: React.FC<ProviderDetailPanelProps> = ({ provider, type, onEdit, onClose }) => {
  const isGk = type === 'GK';
  const gk = provider as Goalkeeper;
  const ref = provider as Referee;
  const stats = (provider.stats || {}) as Record<string, number | string>;
  const skills = (gk.skills || {}) as Record<string, number>;
  const zones = provider.preferredZones || [];
  const isDemo = Boolean((provider as Goalkeeper & { isDemo?: boolean }).isDemo);

  const consumerCapabilities = isGk
    ? [
        'Marketplace\'te kaleci olarak listelenir',
        'Maçlara teklif gönderebilir / kabul edilebilir',
        'ServiceDashboard\'da müsaitlik ve ücret yönetir',
        'Profil fotoğrafı, bio, bölge ve istatistikler görünür',
        'Oyuncular maç oluştururken kiralayabilir',
      ]
    : [
        'Marketplace\'te hakem olarak listelenir',
        'Maçlara hakem teklifi alır / gönderir',
        'ServiceDashboard\'da ücret ve müsaitlik ayarlar',
        'Maç skor girişi ve ihtilaf süreçlerine dahil olur',
        'Profil seviye (FIFA vb.) ve otorite puanı görünür',
      ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[#0D1117] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-white/5 flex items-start gap-4">
          <div
            className="w-20 h-20 rounded-2xl bg-cover bg-center border-2 border-white/10 shrink-0"
            style={{ backgroundImage: `url(${provider.avatar})`, backgroundColor: '#333' }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-black text-white">{provider.name}</h3>
              {isDemo && <span className="text-[8px] font-black px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">DEMO</span>}
              {provider.isElite && <span className="text-[8px] font-black px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">ELITE</span>}
            </div>
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              {isGk ? <Shield size={12} className="text-green-400" /> : <Scale size={12} className="text-yellow-400" />}
              {isGk ? (gk.style || 'Kaleci') : (ref.level || 'Hakem')} • {Number(provider.rating || 0).toFixed(1)}★
            </p>
            <p className="text-[10px] font-mono text-gray-600 mt-1">ID: {provider.id.slice(0, 8)}…</p>
          </div>
          <button onClick={onEdit} className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-black rounded-xl uppercase">
            <Edit3 size={12} /> Düzenle
          </button>
        </div>

        <div className="p-6 space-y-5">
          <section>
            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1"><Eye size={12} /> Oyuncunun Gördüğü</h4>
            <p className="text-sm text-gray-300 leading-relaxed">{provider.bio || '—'}</p>
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-black/30 rounded-xl p-3 border border-white/5 text-center">
                <p className="text-[9px] text-gray-500 uppercase">Ücret</p>
                <p className="text-green-400 font-black">₺{provider.fee || 0}</p>
              </div>
              <div className="bg-black/30 rounded-xl p-3 border border-white/5 text-center">
                <p className="text-[9px] text-gray-500 uppercase">Maç</p>
                <p className="text-white font-black">{provider.matchCount || 0}</p>
              </div>
              <div className="bg-black/30 rounded-xl p-3 border border-white/5 text-center">
                <p className="text-[9px] text-gray-500 uppercase">Puan</p>
                <p className="text-yellow-400 font-black">{Number(provider.rating || 0).toFixed(1)}</p>
              </div>
            </div>
          </section>

          {zones.length > 0 && (
            <section>
              <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1"><MapPin size={12} /> Bölgeler</h4>
              <div className="flex flex-wrap gap-1.5">
                {zones.map((z: string) => (
                  <span key={z} className="text-[10px] px-2 py-1 rounded-lg bg-white/5 text-gray-300 border border-white/10">{z}</span>
                ))}
              </div>
            </section>
          )}

          <section>
            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1"><Zap size={12} /> Uygulama Yetenekleri</h4>
            <ul className="space-y-1.5">
              {consumerCapabilities.map((cap) => (
                <li key={cap} className="text-xs text-gray-400 flex items-start gap-2">
                  <span className="text-green-400 mt-0.5">•</span> {cap}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1"><Award size={12} /> İstatistikler</h4>
            <div className="space-y-2">
              {isGk ? (
                <>
                  <StatBar label="Refleks" value={Number(skills.reflexes ?? stats.reflexes ?? 80)} />
                  <StatBar label="Dalış" value={Number(skills.diving ?? stats.diving ?? 80)} />
                  <StatBar label="Pozisyon" value={Number(skills.positioning ?? stats.positioning ?? 80)} />
                  <p className="text-[10px] text-gray-500 mt-2">Kurtarış %: {stats.savePercentage ?? '—'} • Penaltı: {stats.penaltySaveRate ?? '—'}</p>
                </>
              ) : (
                <>
                  <StatBar label="Otorite" value={Number(stats.authority ?? 80)} />
                  <StatBar label="Kondisyon" value={Number(stats.fitness ?? 80)} />
                  <StatBar label="İletişim" value={Number(stats.communication ?? 80)} />
                  <p className="text-[10px] text-gray-500 mt-2">Ort. kart: {stats.avgCards ?? '—'}</p>
                </>
              )}
            </div>
          </section>

          <section className="bg-black/25 rounded-xl p-4 border border-white/5">
            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1"><Clock size={12} /> Admin Notu</h4>
            <p className="text-[11px] text-gray-500">Bu profildeki değişiklikler anında marketplace ve ServiceDashboard\'da görünür. Demo kayıtlar <strong className="text-yellow-400">purge_godview_demo</strong> ile silinebilir.</p>
          </section>
        </div>

        <div className="p-4 border-t border-white/5 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-xs font-bold text-gray-400 hover:text-white">Kapat</button>
        </div>
      </div>
    </div>
  );
};
