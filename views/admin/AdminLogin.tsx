import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Terminal, ChevronLeft } from 'lucide-react';

interface Props { onUnlock: () => void; onBack: () => void; }

const AdminLogin: React.FC<Props> = ({ onUnlock, onBack }) => {
    const [pw, setPw] = useState('');
    const [err, setErr] = useState(false);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (pw.toUpperCase() === 'YE') { onUnlock(); return; }
        setErr(true); setTimeout(() => setErr(false), 500); setPw('');
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    };

    return (
        <div className="min-h-screen bg-[#050812] flex flex-col items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none opacity-20">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
            </div>
            <button onClick={onBack} className="absolute top-6 left-6 w-12 h-12 flex items-center justify-center bg-white/5 rounded-full border border-white/10 hover:bg-white/10 text-white z-10">
                <ChevronLeft size={24} />
            </button>
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm z-10">
                <div className="text-center mb-8">
                    <div className="w-20 h-20 mx-auto bg-gradient-to-br from-red-500 to-purple-900 rounded-2xl flex items-center justify-center shadow-[0_0_50px_rgba(239,68,68,0.3)] mb-6 border border-red-500/30">
                        <Lock size={32} className="text-white" />
                    </div>
                    <h1 className="text-3xl font-black text-white uppercase tracking-[0.3em]">PATRON</h1>
                    <p className="text-xs text-red-400 font-mono tracking-widest mt-2 uppercase">Master Kontrol Merkezi</p>
                </div>
                <form onSubmit={submit}>
                    <motion.div animate={err ? { x: [-12, 12, -12, 12, 0] } : {}} transition={{ duration: 0.4 }}>
                        <input
                            type="password" value={pw} onChange={e => setPw(e.target.value)} maxLength={4} autoFocus
                            placeholder="••••"
                            className={`w-full h-16 bg-black/50 border-2 rounded-2xl text-center text-3xl text-white font-black tracking-[1em] focus:outline-none backdrop-blur-md transition-colors ${err ? 'border-red-500 text-red-400' : 'border-white/10 focus:border-red-500/50'}`}
                        />
                    </motion.div>
                    <button type="submit" className="w-full h-14 mt-6 bg-gradient-to-r from-red-600 to-purple-800 rounded-2xl text-white font-black text-sm tracking-widest uppercase hover:shadow-[0_0_30px_rgba(239,68,68,0.4)] transition-all flex items-center justify-center gap-2">
                        SİSTEME GİRİŞ <Terminal size={16} />
                    </button>
                </form>
                <p className="text-center text-[10px] text-gray-600 font-mono mt-8 uppercase tracking-widest">OYNA OS v3.0 • Yetkisiz Erişim İzleniyor</p>
            </motion.div>
        </div>
    );
};

export default AdminLogin;
