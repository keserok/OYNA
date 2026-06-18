import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, ShieldAlert, ChevronLeft, Loader2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';

interface Props { onUnlock: () => void; onBack: () => void; }

// Güvenlik: admin erişimi artık istemci tarafında gömülü parola ile DEĞİL,
// sunucu-otoriter rol kontrolü ile yapılır. is_admin() SECURITY DEFINER fonksiyonu
// oturum açmış kullanıcının profiles.role değerini okur (ADMIN/SUPER_ADMIN).
// Veri zaten RLS ile korunuyor; bu ekran yalnız arayüz erişimini kapatır.
const AdminLogin: React.FC<Props> = ({ onUnlock, onBack }) => {
    const [state, setState] = useState<'checking' | 'denied'>('checking');

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const { data, error } = await supabase.rpc('is_admin');
                if (!active) return;
                if (!error && data === true) {
                    onUnlock();
                } else {
                    setState('denied');
                }
            } catch {
                if (active) setState('denied');
            }
        })();
        return () => { active = false; };
    }, [onUnlock]);

    return (
        <div className="min-h-screen bg-[#050812] flex flex-col items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none opacity-20">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
            </div>
            <button onClick={onBack} className="absolute top-6 left-6 w-12 h-12 flex items-center justify-center bg-white/5 rounded-full border border-white/10 hover:bg-white/10 text-white z-10">
                <ChevronLeft size={24} />
            </button>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm z-10 text-center">
                {state === 'checking' ? (
                    <>
                        <div className="w-20 h-20 mx-auto bg-gradient-to-br from-red-500 to-purple-900 rounded-2xl flex items-center justify-center shadow-[0_0_50px_rgba(239,68,68,0.3)] mb-6 border border-red-500/30">
                            <Lock size={32} className="text-white" />
                        </div>
                        <h1 className="text-3xl font-black text-white uppercase tracking-[0.3em]">PATRON</h1>
                        <p className="text-xs text-red-400 font-mono tracking-widest mt-2 uppercase flex items-center justify-center gap-2">
                            <Loader2 size={12} className="animate-spin" /> Yetki Doğrulanıyor
                        </p>
                    </>
                ) : (
                    <>
                        <div className="w-20 h-20 mx-auto bg-gradient-to-br from-red-600 to-red-900 rounded-2xl flex items-center justify-center shadow-[0_0_50px_rgba(239,68,68,0.3)] mb-6 border border-red-500/30">
                            <ShieldAlert size={32} className="text-white" />
                        </div>
                        <h1 className="text-2xl font-black text-white uppercase tracking-[0.2em]">ERİŞİM REDDEDİLDİ</h1>
                        <p className="text-xs text-gray-400 mt-3 leading-relaxed">
                            Bu alan yalnızca yönetici hesaplarına açıktır. Hesabınızda yönetici yetkisi bulunmuyor.
                        </p>
                        <button onClick={onBack} className="mt-8 w-full h-14 bg-white/5 border border-white/10 rounded-2xl text-white font-black text-sm tracking-widest uppercase hover:bg-white/10 transition-all">
                            Geri Dön
                        </button>
                    </>
                )}
                <p className="text-center text-[10px] text-gray-600 font-mono mt-8 uppercase tracking-widest">OYNA OS v3.0 • Yetkisiz Erişim İzleniyor</p>
            </motion.div>
        </div>
    );
};

export default AdminLogin;
