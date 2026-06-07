import React, { useState } from 'react';
import { ArrowLeft, LayoutDashboard, Palette, Eye, Save, Star, Shield, Users } from 'lucide-react';
import { useAppStore } from '../../store';
import { motion } from 'framer-motion';

interface UIBuilderProps {
  onBack: () => void;
}

export const UIBuilder: React.FC<UIBuilderProps> = ({ onBack }) => {
  const { facilityUIConfigs, setFacilityUIConfigs, roleAppearanceRules, setRoleAppearanceRules } = useAppStore();

  const [activeTab, setActiveTab] = useState<'THEME' | 'ROLES'>('THEME');

  // Local state for theme
  const [primaryColor, setPrimaryColor] = useState('#39FF14');
  const [secondaryColor, setSecondaryColor] = useState('#121620');
  const [cardStyle, setCardStyle] = useState<'GLASS' | 'SOLID' | 'MINIMAL'>('GLASS');
  const [customGreeting, setCustomGreeting] = useState('Arena Sport Center\'a Hoş Geldiniz!');

  // Local state for roles
  const [refBadge, setRefBadge] = useState('VIP Hakem');
  const [refTier, setRefTier] = useState<'gold' | 'silver' | 'bronze'>('gold');
  const [gkBadge, setGkBadge] = useState('Panter');
  const [gkTier, setGkTier] = useState<'gold' | 'silver' | 'bronze'>('silver');

  const handleSaveTheme = () => {
    setFacilityUIConfigs([
      {
        id: '1',
        facilityId: '1',
        primaryColor,
        secondaryColor,
        cardStyle,
        badgeIcon: '🏟️',
        customGreetingText: customGreeting,
        allowReferees: true,
        allowGoalkeepers: true,
      }
    ]);
    alert('Tema ayarları Supabase veritabanına kaydedildi ve store güncellendi.');
  };

  const handleSaveRoles = () => {
    setRoleAppearanceRules([
      {
        id: 'r1',
        facilityId: '1',
        roleType: 'REF',
        tierOverride: refTier,
        customBadge: refBadge,
      },
      {
        id: 'r2',
        facilityId: '1',
        roleType: 'GK',
        tierOverride: gkTier,
        customBadge: gkBadge,
      }
    ]);
    alert('Rol görünümleri güncellendi.');
  };

  return (
    <div className="flex flex-col h-full bg-[#0A0E14] text-white animate-in slide-in-from-bottom-4 duration-300">
      
      {/* Header */}
      <div className="bg-[#161B22] p-4 flex flex-col gap-4 border-b border-white/5 safe-area-top shadow-lg z-10">
        <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
                <button onClick={onBack} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors">
                    <ArrowLeft size={20} />
                </button>
                <h2 className="text-white font-black text-lg uppercase italic tracking-wider">UI Builder</h2>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#FFFF00]/10 border border-[#FFFF00]/20 flex items-center justify-center text-[#FFFF00]">
                <LayoutDashboard size={18} />
            </div>
        </div>
        <p className="text-[10px] text-gray-500 font-bold uppercase">Uygulama İçi Görünümleri Konfigüre Edin</p>

        {/* Tabs */}
        <div className="flex gap-2 bg-black/40 p-1 rounded-xl border border-white/5">
            <button onClick={() => setActiveTab('THEME')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'THEME' ? 'bg-[#FFFF00] text-black' : 'text-gray-500'}`}>Tesis Teması</button>
            <button onClick={() => setActiveTab('ROLES')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${activeTab === 'ROLES' ? 'bg-[#FFFF00] text-black' : 'text-gray-500'}`}>Rol Kuralları</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        
        {activeTab === 'THEME' && (
          <div className="space-y-6">
            
            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Ana Renk (Primary Color)</label>
              <div className="flex gap-3">
                <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="w-12 h-12 rounded-xl bg-transparent border-0 cursor-pointer" />
                <input type="text" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="flex-1 bg-[#161B22] border border-white/10 rounded-xl px-4 text-xs font-bold text-white uppercase" />
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Kart Tasarım Stili</label>
              <div className="grid grid-cols-3 gap-2">
                {['GLASS', 'SOLID', 'MINIMAL'].map(style => (
                  <button 
                    key={style}
                    onClick={() => setCardStyle(style as any)}
                    className={`py-3 text-[10px] font-black uppercase tracking-wider border rounded-xl transition-all ${cardStyle === style ? 'border-[#39FF14] text-[#39FF14] bg-[#39FF14]/10' : 'border-white/10 text-gray-500 bg-black/20'}`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Özel Karşılama Mesajı</label>
              <textarea 
                value={customGreeting}
                onChange={e => setCustomGreeting(e.target.value)}
                rows={3}
                className="w-full bg-[#161B22] border border-white/10 rounded-xl p-4 text-xs font-bold text-white resize-none"
              />
            </div>

            {/* Preview */}
            <div className="mt-8">
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2"><Eye size={12} /> CANLI ÖNİZLEME (Müşteri Görünümü)</h3>
              <div 
                className="p-5 rounded-3xl border border-white/20 transition-all"
                style={{
                  backgroundColor: cardStyle === 'SOLID' ? secondaryColor : 'transparent',
                  background: cardStyle === 'GLASS' ? 'rgba(255,255,255,0.03)' : undefined,
                  backdropFilter: cardStyle === 'GLASS' ? 'blur(10px)' : undefined
                }}
              >
                <div className="flex gap-4 items-center">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg" style={{ backgroundColor: primaryColor, color: '#000' }}>
                    🏟️
                  </div>
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-tight text-white">{customGreeting}</h4>
                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">1 Maç Bulundu</span>
                  </div>
                </div>
              </div>
            </div>

            <button onClick={handleSaveTheme} className="w-full h-14 bg-gradient-to-r from-blue-600 to-indigo-500 text-white font-black rounded-2xl text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all">
              <Save size={16} /> TEMAYI KAYDET
            </button>

          </div>
        )}

        {activeTab === 'ROLES' && (
          <div className="space-y-6">

            {/* Referee Override */}
            <div className="bg-[#161B22] p-5 rounded-[24px] border border-white/5 space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10"><Shield size={64} /></div>
              <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2 relative z-10"><Shield size={14} className="text-blue-400" /> Hakem Arayüz Kuralları</h3>
              
              <div className="space-y-2 relative z-10">
                <label className="text-[9px] font-bold text-gray-500 uppercase">Özel Rozet İsmi</label>
                <input type="text" value={refBadge} onChange={e => setRefBadge(e.target.value)} className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-3 text-xs font-bold text-white focus:border-blue-500/50 outline-none" />
              </div>
              
              <div className="space-y-2 relative z-10">
                <label className="text-[9px] font-bold text-gray-500 uppercase">Görünüm Seviyesi (Tier)</label>
                <div className="flex gap-2">
                  {['gold', 'silver', 'bronze'].map(tier => (
                    <button key={tier} onClick={() => setRefTier(tier as any)} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg border transition-all ${refTier === tier ? 'border-amber-400 bg-amber-400/10 text-amber-400' : 'border-white/10 text-gray-500 bg-[#0A0E14]'}`}>{tier}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* GK Override */}
            <div className="bg-[#161B22] p-5 rounded-[24px] border border-white/5 space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10"><Users size={64} /></div>
              <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2 relative z-10"><Users size={14} className="text-emerald-400" /> Kaleci Arayüz Kuralları</h3>
              
              <div className="space-y-2 relative z-10">
                <label className="text-[9px] font-bold text-gray-500 uppercase">Özel Rozet İsmi</label>
                <input type="text" value={gkBadge} onChange={e => setGkBadge(e.target.value)} className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-3 text-xs font-bold text-white focus:border-emerald-500/50 outline-none" />
              </div>
              
              <div className="space-y-2 relative z-10">
                <label className="text-[9px] font-bold text-gray-500 uppercase">Görünüm Seviyesi (Tier)</label>
                <div className="flex gap-2">
                  {['gold', 'silver', 'bronze'].map(tier => (
                    <button key={tier} onClick={() => setGkTier(tier as any)} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg border transition-all ${gkTier === tier ? 'border-emerald-400 bg-emerald-400/10 text-emerald-400' : 'border-white/10 text-gray-500 bg-[#0A0E14]'}`}>{tier}</button>
                  ))}
                </div>
              </div>
            </div>

            <button onClick={handleSaveRoles} className="w-full h-14 bg-emerald-500 text-black font-black rounded-2xl text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2 active:scale-95 transition-all">
              <Save size={16} /> KURALLARI KAYDET
            </button>

          </div>
        )}

      </div>
    </div>
  );
};
