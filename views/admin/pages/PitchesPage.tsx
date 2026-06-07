import React, { useState } from 'react';
import { useAppStore } from '../../../store';
import { DataTable } from '../components/DataTable';
import { ActionConfirmModal, ActionConfirmOptions } from '../components/ActionConfirmModal';
import { AddPitchModal } from '../components/AddPitchModal';
import { MapPin, TrendingUp, Edit2, Trash2, PlusCircle, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

interface PitchesPageProps {
    onEditPitch: (pitch: any) => void;
    onDeletePitch: (id: string) => void;
}

export const PitchesPage: React.FC<PitchesPageProps> = ({ onEditPitch, onDeletePitch }) => {
    const { adminPitches, updatePitch, addPitch, deletePitch, addAdminLog } = useAppStore();
    const [multiplier, setMultiplier] = useState(1.0);
    const [selectedPitchIdx, setSelectedPitchIdx] = useState(0);
    const [toast, setToast] = useState<string | null>(null);
    const [confirmModal, setConfirmModal] = useState<ActionConfirmOptions | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 2500);
    };

    const handleApplyPricingRequest = () => {
        const pitch = adminPitches[selectedPitchIdx];
        if (!pitch) return;
        
        setConfirmModal({
            title: 'Fiyat Çarpanı Güncellemesi',
            description: `Seçilen ${pitch.name} sahası için fiyatlandırma ${multiplier}x olarak güncellenecek. Bu işlem hemen yayına alınır.`,
            impactText: `Yeni K/B Fiyat: ₺${Math.round(pitch.pricePerPerson * multiplier)} | Yeni Toplam Fiyat: ₺${Math.round(pitch.totalPrice * multiplier)}`,
            actionType: 'PRICE_CHANGE',
            targetId: pitch.id,
            targetName: pitch.name,
            onCancel: () => setConfirmModal(null),
            onConfirm: () => {
                updatePitch({ 
                    ...pitch, 
                    pricePerPerson: Math.round(pitch.pricePerPerson * multiplier), 
                    totalPrice: Math.round(pitch.totalPrice * multiplier) 
                });
                addAdminLog({
                    action: 'PRICE_CHANGE',
                    targetId: pitch.id,
                    targetName: pitch.name,
                    details: `Çarpan: ${multiplier}x`,
                    adminId: 'ADMIN_CURRENT'
                });
                showToast(`${pitch.name} fiyatı güncellendi: ${multiplier}x çarpan uygulandı ✓`);
                setConfirmModal(null);
            }
        });
    };

    const handleDeleteRequest = (p: any) => {
        setConfirmModal({
            title: 'Saha Silme İşlemi',
            description: `"${p.name}" adlı sahayı sistemden tamamen silmek üzeresiniz. Bu işlem geri alınamaz.`,
            impactText: 'Bağlı olan geçmiş maç verileri korunacak ancak aktif rezervasyonlar iptal edilebilir.',
            actionType: 'SETTINGS_CHANGE',
            targetId: p.id,
            targetName: p.name,
            onCancel: () => setConfirmModal(null),
            onConfirm: () => {
                deletePitch(p.id);
                showToast(`🗑️ ${p.name} başarıyla silindi`);
                setConfirmModal(null);
            }
        });
    };

    const GradeBadge = ({ g }: { g?: 'A' | 'B' | 'C' }) => {
        if (!g) return <span className="text-gray-600 text-[10px]">—</span>;
        const colors = { 
            A: 'bg-green-500/20 text-green-400 border-green-500/30 shadow-[0_0_10px_rgba(74,222,128,0.2)]', 
            B: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', 
            C: 'bg-red-500/20 text-red-400 border-red-500/30' 
        };
        return <span className={`px-2 py-0.5 rounded border text-[9px] font-black ${colors[g]}`}>{g}</span>;
    };

    const pitchColumns = [
        { 
            header: 'GÖRSEL', 
            render: (p: any) => <img src={p.image} alt={p.name} className="w-10 h-10 rounded-lg object-cover border border-white/10" />
        },
        { 
            header: 'SAHA ADI & BÖLGE', 
            render: (p: any) => (
                <div>
                    <div className="font-bold text-white text-xs">{p.name}</div>
                    <div className="text-[10px] text-gray-500">{p.district || p.location?.split(',')[0] || 'Belirtilmedi'}</div>
                </div>
            )
        },
        { 
            header: 'FİYAT (KİŞİ / TOPLAM)', 
            render: (p: any) => (
                <div className="font-mono text-[10px]">
                    <span className="text-[#39FF14] font-bold">₺{p.pricePerPerson}</span> / <span className="text-gray-400">₺{p.totalPrice}</span>
                </div>
            )
        },
        { 
            header: 'IŞIK', 
            render: (p: any) => <GradeBadge g={p.lightingGrade} />
        },
        { 
            header: 'ZEMİN', 
            render: (p: any) => <GradeBadge g={p.grassGrade} />
        },
        { 
            header: 'SOYUNMA ODASI', 
            render: (p: any) => <GradeBadge g={p.lockerRoomGrade} />
        },
        { 
            header: 'AKSİYONLAR', 
            render: (p: any) => (
                <div className="flex gap-2">
                    <button onClick={() => onEditPitch(p)} className="p-1.5 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg border border-blue-500/20 transition-all">
                        <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDeleteRequest(p)} className="p-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg border border-red-500/20 transition-all shadow-[0_0_10px_rgba(239,68,68,0.0)] hover:shadow-[0_0_10px_rgba(239,68,68,0.2)]">
                        <Trash2 size={14} />
                    </button>
                </div>
            )
        }
    ];

    return (
        <div className="p-6 space-y-6">
            {/* Header & Add Button */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <Zap size={20} className="text-[#39FF14]" /> Tesis Yönetimi
                    </h2>
                    <p className="text-[10px] text-gray-500 mt-1">Platformdaki tüm sahaları buradan ekleyebilir ve düzenleyebilirsiniz.</p>
                </div>
                <button 
                    onClick={() => setIsAddModalOpen(true)}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#39FF14] text-black font-black text-xs uppercase tracking-widest rounded-xl hover:bg-[#39FF14]/90 transition-all shadow-[0_0_20px_rgba(57,255,20,0.3)]"
                >
                    <PlusCircle size={16} /> YENİ SAHA EKLE
                </button>
            </div>

            {/* Quick Actions Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Fast Price Multiplier */}
                <div className="bg-[#161B22]/60 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-xl">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <TrendingUp size={14} className="text-[#FFFF00]" /> HIZLI FİYAT ÇARPANI DÜZENLEYİCİ
                    </p>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div>
                            <label className="text-[8px] text-gray-500 font-black uppercase tracking-widest block mb-1">Saha Seçin</label>
                            <select 
                                value={selectedPitchIdx} 
                                onChange={e => setSelectedPitchIdx(+e.target.value)}
                                className="w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-[#FFFF00]/50"
                            >
                                {adminPitches.map((p, i) => <option key={p.id} value={i} className="bg-[#0D1117] text-white">{p.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[8px] text-gray-500 font-black uppercase tracking-widest block mb-1">Çarpan</label>
                            <select 
                                value={multiplier} 
                                onChange={e => setMultiplier(+e.target.value)}
                                className="w-full h-10 bg-black/40 border border-white/10 rounded-xl px-3 text-xs text-white focus:outline-none focus:border-[#FFFF00]/50"
                            >
                                <option value="1.0" className="bg-[#0D1117]">1.0x (Normal)</option>
                                <option value="1.2" className="bg-[#0D1117]">1.2x (Yoğun)</option>
                                <option value="1.5" className="bg-[#0D1117]">1.5x (Zirve Saat)</option>
                                <option value="2.0" className="bg-[#0D1117]">2.0x (Süper Pik)</option>
                            </select>
                        </div>
                    </div>
                    <button 
                        onClick={handleApplyPricingRequest}
                        className="h-10 w-full bg-[#FFFF00] hover:bg-[#FFFF00]/90 text-black font-black text-[10px] uppercase tracking-widest transition-all rounded-xl shadow-[0_0_15px_rgba(255,255,0,0.2)]"
                    >
                        FİYAT ÇARPANINI UYGULA
                    </button>
                    {toast && toast.includes('fiyatı') && <p className="text-[9px] text-green-400 font-bold mt-2 text-center">{toast}</p>}
                </div>

                <div className="bg-[#161B22]/60 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-xl flex items-center justify-center flex-col text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#39FF14]/5 rounded-full blur-2xl"></div>
                    <MapPin size={32} className="text-[#39FF14] mb-3" />
                    <p className="text-sm font-bold text-white">Toplam {adminPitches.length} Tesis</p>
                    <p className="text-[10px] text-gray-500 mt-1">Platformdaki tüm sahalar burada listelenir.</p>
                </div>
            </div>

            {/* Pitches Table */}
            <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-white flex items-center justify-between mb-4 px-1">
                    <span className="flex items-center gap-2"><MapPin size={14} className="text-gray-400" /> Tesisler Veritabanı</span>
                    {toast && !toast.includes('fiyatı') && <span className="text-[9px] text-green-400 font-bold bg-green-500/10 px-2 py-1 rounded-md">{toast}</span>}
                </h3>
                <DataTable columns={pitchColumns} data={adminPitches} />
            </div>

            <ActionConfirmModal isOpen={!!confirmModal} options={confirmModal} />
            
            <AddPitchModal 
                isOpen={isAddModalOpen} 
                onClose={() => setIsAddModalOpen(false)} 
                onAdd={(pitch) => {
                    addPitch(pitch);
                    showToast(`✅ ${pitch.name} eklendi`);
                }}
            />
        </div>
    );
};
