import React, { useState } from 'react';
import { ArrowLeft, Users, Shield, Settings, Activity, Search, CheckCircle, XCircle, Trophy, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';

interface CommunityAdminDashboardProps {
  onBack: () => void;
}

const CommunityAdminDashboard: React.FC<CommunityAdminDashboardProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'MEMBERS' | 'TOURNAMENTS' | 'SETTINGS'>('MEMBERS');

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white font-sans flex flex-col">
      {/* Header */}
      <div className="pt-12 pb-6 px-6 bg-[#161B22] border-b border-white/10 sticky top-0 z-20">
        <button onClick={onBack} className="mb-4 flex items-center text-slate-400 hover:text-white transition-colors">
          <ArrowLeft size={20} className="mr-2" />
          Geri
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black italic tracking-tight">Yönetici Paneli</h1>
            <p className="text-xs text-emerald-400 font-bold mt-1 uppercase tracking-widest">Boğaziçi Üniversitesi</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30 text-emerald-400">
            <Shield size={24} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex px-6 pt-4 border-b border-white/10 overflow-x-auto hide-scrollbar">
        <button
          onClick={() => setActiveTab('MEMBERS')}
          className={`pb-4 px-4 text-xs font-black uppercase tracking-widest whitespace-nowrap relative ${activeTab === 'MEMBERS' ? 'text-emerald-500' : 'text-slate-500'}`}
        >
          Üye Onayları
          {activeTab === 'MEMBERS' && (
            <motion.div layoutId="adminTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('TOURNAMENTS')}
          className={`pb-4 px-4 text-xs font-black uppercase tracking-widest whitespace-nowrap relative ${activeTab === 'TOURNAMENTS' ? 'text-emerald-500' : 'text-slate-500'}`}
        >
          Turnuvalar
          {activeTab === 'TOURNAMENTS' && (
            <motion.div layoutId="adminTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500" />
          )}
        </button>
        <button
          onClick={() => setActiveTab('SETTINGS')}
          className={`pb-4 px-4 text-xs font-black uppercase tracking-widest whitespace-nowrap relative ${activeTab === 'SETTINGS' ? 'text-emerald-500' : 'text-slate-500'}`}
        >
          Ayarlar
          {activeTab === 'SETTINGS' && (
            <motion.div layoutId="adminTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500" />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'MEMBERS' && (
          <div className="space-y-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input 
                type="text" 
                placeholder="Öğrenci numarası veya isim ara..." 
                className="w-full bg-[#161B22] border border-white/10 rounded-xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Bekleyen Onaylar (3)</h3>
              
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-[#161B22] border border-white/5 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold">
                      M{i}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">Mehmet Yılmaz</h4>
                      <p className="text-[10px] text-slate-400">mehmet.yilmaz{i}@boun.edu.tr</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="w-8 h-8 rounded-full bg-rose-500/20 text-rose-500 flex items-center justify-center hover:bg-rose-500/30 transition-colors">
                      <XCircle size={18} />
                    </button>
                    <button className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center hover:bg-emerald-500/30 transition-colors">
                      <CheckCircle size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'TOURNAMENTS' && (
          <div className="space-y-4">
            <button className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-black py-4 rounded-2xl flex items-center justify-center transition-colors">
              <Trophy size={20} className="mr-2" />
              YENİ TURNUVA OLUŞTUR
            </button>

            <div className="bg-[#161B22] border border-white/5 rounded-2xl p-5">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="bg-emerald-500/20 text-emerald-400 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">Aktif</span>
                    <span className="text-[10px] text-slate-400 font-bold"><Calendar size={10} className="inline mr-1"/>Bahar 2026</span>
                  </div>
                  <h3 className="text-lg font-black italic">Bahar Kupası</h3>
                </div>
                <button className="text-slate-400 hover:text-white"><Settings size={18}/></button>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-black/30 rounded-xl p-3 border border-white/5">
                  <span className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Katılımcı</span>
                  <span className="block text-xl font-black">16 Takım</span>
                </div>
                <div className="bg-black/30 rounded-xl p-3 border border-white/5">
                  <span className="block text-[10px] text-slate-500 font-bold uppercase mb-1">Aşama</span>
                  <span className="block text-xl font-black">Çeyrek Final</span>
                </div>
              </div>

              <button className="w-full bg-white/5 hover:bg-white/10 border border-white/10 py-3 rounded-xl text-xs font-bold transition-colors">
                Eşleşmeleri Yönet
              </button>
            </div>
          </div>
        )}

        {activeTab === 'SETTINGS' && (
          <div className="space-y-4">
            <div className="bg-[#161B22] border border-white/5 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest border-b border-white/10 pb-2 mb-4">Genel Ayarlar</h3>
              
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm">Otomatik Onay</h4>
                  <p className="text-[10px] text-slate-400 mt-1">@boun.edu.tr uzantılı mailleri otomatik onayla</p>
                </div>
                <div className="w-12 h-6 bg-emerald-500 rounded-full relative cursor-pointer">
                  <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/5">
                <div>
                  <h4 className="font-bold text-sm">Sadece Üyeler</h4>
                  <p className="text-[10px] text-slate-400 mt-1">Topluluğu dışarıdan aramalara kapat</p>
                </div>
                <div className="w-12 h-6 bg-slate-700 rounded-full relative cursor-pointer">
                  <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                </div>
              </div>
            </div>

            <button className="w-full bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500/20 font-bold py-4 rounded-2xl transition-colors">
              TOPLULUĞU SİL
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommunityAdminDashboard;
