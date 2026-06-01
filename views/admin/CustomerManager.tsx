import React, { useState } from 'react';
import { ArrowLeft, Plus, User, Search, Phone, Shield, ArrowUpRight, ArrowDownRight, Edit3, Trash2, Save, Users, AlertCircle } from 'lucide-react';
import { CRMUser } from '../../types';
import { useAppStore } from '../../store';

interface CustomerManagerProps {
    onBack: () => void;
}

export const CustomerManager: React.FC<CustomerManagerProps> = ({ onBack }) => {
    const { crmUsers, addCrmUser, updateCrmUser, deleteCrmUser } = useAppStore();
    const [searchTerm, setSearchTerm] = useState('');
    const [editingCustomer, setEditingCustomer] = useState<CRMUser | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const filteredCustomers = crmUsers.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleAddNew = () => {
        setEditingCustomer({
            id: Date.now().toString(),
            facilityId: '1',
            userId: '',
            name: '',
            avatar: '',
            role: 'PLAYER',
            loyaltyScore: 100,
            totalSpent: 0,
            isVip: false,
            isBanned: false,
            customNote: '',
            lastVisit: new Date().toISOString()
        });
    };

    const handleSave = async () => {
        if (!editingCustomer || !editingCustomer.name) return;
        setIsSaving(true);
        try {
            const exists = crmUsers.find(c => c.id === editingCustomer.id);
            if (exists) {
                await updateCrmUser(editingCustomer);
            } else {
                await addCrmUser(editingCustomer);
            }
            setEditingCustomer(null);
        } catch (error) {
            alert('Müşteri kaydedilirken bir hata oluştu.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm('Bu müşteriyi silmek istediğinize emin misiniz? Müşterinin hesap geçmişi de silinecektir.')) {
            await deleteCrmUser(id);
            setEditingCustomer(null);
        }
    };

    const totalDebt = crmUsers.reduce((acc, c) => acc + (c.totalSpent > 0 ? c.totalSpent : 0), 0);

    if (editingCustomer) {
        return (
            <div className="flex flex-col h-full bg-[#0A0D14] animate-in slide-in-from-right-8 duration-300">
                <div className="bg-[#161B22] p-4 flex justify-between items-center border-b border-white/5 safe-area-top shadow-lg z-10">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setEditingCustomer(null)} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors">
                            <ArrowLeft size={20} />
                        </button>
                        <h2 className="text-white font-bold text-lg">{editingCustomer.id.length > 5 ? 'Müşteriyi Düzenle' : 'Yeni Müşteri Ekle'}</h2>
                    </div>
                    <button 
                        onClick={handleSave} 
                        disabled={isSaving || !editingCustomer.name}
                        className="p-2 px-5 rounded-xl bg-[#FFFF00] text-black font-black text-xs flex items-center gap-2 hover:bg-yellow-300 disabled:opacity-50 transition-all shadow-[0_0_15px_rgba(255,255,0,0.3)]"
                    >
                        {isSaving ? '...' : <><Save size={16} /> KAYDET</>}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="bg-[#161B22] p-6 rounded-[24px] border border-white/5 space-y-4 shadow-sm">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Ad Soyad / Takım Adı</label>
                            <input 
                                type="text" 
                                value={editingCustomer.name}
                                onChange={e => setEditingCustomer({...editingCustomer, name: e.target.value})}
                                className="w-full bg-[#0A0D14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FFFF00]/50 outline-none transition-colors"
                                placeholder="Örn: Ahmet Yılmaz"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Kullanıcı / Rol</label>
                            <div className="flex items-center bg-[#0A0D14] border border-white/10 rounded-xl focus-within:border-[#FFFF00]/50 transition-colors px-3">
                                <Shield size={18} className="text-gray-500" />
                                <input 
                                    type="text" 
                                    value={editingCustomer.role}
                                    onChange={e => setEditingCustomer({...editingCustomer, role: e.target.value as any})}
                                    className="w-full bg-transparent p-3 text-white font-bold outline-none"
                                    placeholder="PLAYER, CAPTAIN, GK, REF"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase">Toplam Harcama (TL)</label>
                                <input 
                                    type="number" 
                                    value={editingCustomer.totalSpent || 0}
                                    onChange={e => setEditingCustomer({...editingCustomer, totalSpent: parseInt(e.target.value) || 0})}
                                    className="w-full bg-[#0A0D14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FFFF00]/50 outline-none transition-colors"
                                />
                                <p className="text-[10px] text-gray-500 font-medium">+ Değerler borç, - Değerler alacak anlamına gelir.</p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-400 uppercase">Sadakat / Güven Puanı</label>
                                <input 
                                    type="number" 
                                    min="0" max="100"
                                    value={editingCustomer.loyaltyScore || 100}
                                    onChange={e => setEditingCustomer({...editingCustomer, loyaltyScore: parseInt(e.target.value) || 0})}
                                    className="w-full bg-[#0A0D14] border border-white/10 rounded-xl p-3 text-white font-bold focus:border-[#FFFF00]/50 outline-none transition-colors"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Müşteri Notu</label>
                            <textarea 
                                value={editingCustomer.customNote || ''}
                                onChange={e => setEditingCustomer({...editingCustomer, customNote: e.target.value})}
                                rows={3}
                                className="w-full bg-[#0A0D14] border border-white/10 rounded-xl p-3 text-white font-medium text-sm focus:border-[#FFFF00]/50 outline-none transition-colors resize-none"
                                placeholder="Örn: VIP müşteri, kapora alma."
                            />
                        </div>
                    </div>

                    {editingCustomer.id.length > 5 && (
                        <button 
                            onClick={() => handleDelete(editingCustomer.id)}
                            className="w-full py-4 rounded-xl border border-red-500/20 text-red-500 font-bold flex items-center justify-center gap-2 hover:bg-red-500/10 transition-colors"
                        >
                            <Trash2 size={18} /> BU MÜŞTERİYİ SİL
                        </button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#0A0D14] animate-in slide-in-from-right-8 duration-300">
            <div className="bg-[#161B22] p-4 flex flex-col gap-4 border-b border-white/5 safe-area-top shadow-lg z-10">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <button onClick={onBack} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors">
                            <ArrowLeft size={20} />
                        </button>
                        <h2 className="text-white font-bold text-lg">Müşterilerim (CRM)</h2>
                    </div>
                    <button 
                        onClick={handleAddNew} 
                        className="p-2 px-4 rounded-xl bg-blue-500 text-white font-bold text-xs flex items-center gap-2 hover:bg-blue-400 transition-all shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                    >
                        <Plus size={16} /> MÜŞTERİ EKLE
                    </button>
                </div>

                <div className="flex items-center bg-[#0A0D14] border border-white/10 rounded-xl px-4 py-2 focus-within:border-blue-500/50 transition-colors">
                    <Search size={18} className="text-gray-500 mr-2" />
                    <input 
                        type="text" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="İsim veya telefon numarası ara..." 
                        className="w-full bg-transparent text-sm text-white outline-none"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* Dashboard Widgets */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gradient-to-br from-blue-900/40 to-[#161B22] p-4 rounded-2xl border border-blue-500/20">
                        <div className="flex items-center gap-2 mb-2 text-blue-400">
                            <Users size={16} />
                            <span className="text-xs font-bold uppercase tracking-wider">Kayıtlı Müşteri</span>
                        </div>
                        <span className="text-2xl font-black text-white">{customers.length}</span>
                    </div>
                    <div className="bg-gradient-to-br from-red-900/40 to-[#161B22] p-4 rounded-2xl border border-red-500/20">
                        <div className="flex items-center gap-2 mb-2 text-red-400">
                            <ArrowDownRight size={16} />
                            <span className="text-xs font-bold uppercase tracking-wider">Toplam Alacak</span>
                        </div>
                        <span className="text-2xl font-black text-white">₺{totalDebt.toLocaleString('tr-TR')}</span>
                    </div>
                </div>

                {filteredCustomers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-gray-600 mb-4">
                            <Search size={32} />
                        </div>
                        <p className="text-gray-400 text-sm font-medium">Müşteri bulunamadı.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredCustomers.map(customer => (
                            <div key={customer.id} onClick={() => setEditingCustomer(customer)} className="bg-[#161B22] p-4 rounded-[20px] border border-white/5 flex items-center justify-between group cursor-pointer hover:border-white/20 transition-all">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-[#0A0D14] rounded-full flex items-center justify-center text-gray-400 border border-white/10 group-hover:scale-105 transition-transform">
                                        <User size={20} />
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">{customer.name}</h4>
                                        <p className="text-xs text-gray-500 font-medium flex items-center gap-2">
                                            Rol: {customer.role}
                                            {customer.isVip && <span className="text-[10px] text-yellow-500 font-bold bg-yellow-500/10 px-1 rounded">VIP</span>}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right flex flex-col items-end gap-1">
                                    {customer.totalSpent > 0 ? (
                                        <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-md flex items-center gap-1">
                                            ₺{customer.totalSpent} Harcama
                                        </span>
                                    ) : null}
                                    {customer.loyaltyScore < 50 && (
                                        <span className="text-[10px] text-orange-400 flex items-center gap-1"><AlertCircle size={10} /> Riskli ({customer.loyaltyScore})</span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
