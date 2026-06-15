import React, { useState } from 'react';
import { seedGodviewDemo, purgeGodviewDemo, toTurkishAdminError } from '../../../services/adminService';
import { useAppStore } from '../../../store';
import { Database, Trash2, Sparkles } from 'lucide-react';

export const DemoDataPanel: React.FC<{ onRefresh?: () => Promise<void> }> = ({ onRefresh }) => {
  const { loadServices } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    await loadServices();
    if (onRefresh) await onRefresh();
  };

  const handleSeed = async () => {
    if (!confirm('Demo verileri yüklensin mi? Mevcut demo kayıtlar önce silinir.')) return;
    setLoading(true);
    setError(null);
    try {
      const result = await seedGodviewDemo();
      await refresh();
      setMessage(`Demo yüklendi: ${JSON.stringify(result)}`);
    } catch (err) {
      setError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePurge = async () => {
    if (!confirm('Tüm Godview demo verileri silinsin mi?')) return;
    setLoading(true);
    setError(null);
    try {
      await purgeGodviewDemo();
      await refresh();
      setMessage('Demo veriler temizlendi.');
    } catch (err) {
      setError(toTurkishAdminError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#161B22]/60 border border-white/5 rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
        <Database size={16} className="text-purple-400" /> Demo Veri Yönetimi
      </h3>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        Kaleci, hakem, maç, topluluk, promo kod ve turnuva için <strong className="text-yellow-400">isDemo</strong> işaretli örnek kayıtlar.
        Ana uygulamada marketplace ve admin panelde görünür; istediğinizde tek tıkla silinir.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => void handleSeed()}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-black rounded-xl disabled:opacity-50"
        >
          <Sparkles size={14} /> Demo Verileri Yükle
        </button>
        <button
          onClick={() => void handlePurge()}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 bg-red-900/40 hover:bg-red-900/60 text-red-400 text-xs font-black rounded-xl border border-red-500/20 disabled:opacity-50"
        >
          <Trash2 size={14} /> Demo Verileri Sil
        </button>
      </div>
      {message && <p className="text-green-400 text-xs font-bold">{message}</p>}
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
};
