/**
 * Faz B (ayrıştırma): Yönetim paneli artık mobil/ana pakete gömülü değildir.
 * Store binary'sinde admin kodu taşımamak (güvenlik + inceleme riski) için
 * panel ayrı web adresinde yaşar; buradaki ekran yalnız yönlendirir.
 */
import React from 'react';
import { ArrowLeft, ExternalLink, ShieldCheck } from 'lucide-react';

const ADMIN_PANEL_URL =
  (import.meta.env.VITE_ADMIN_PANEL_URL as string | undefined) || 'https://oynaturkiyepotansiyeli.com';

const AdminRedirect: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className="min-h-screen bg-[#0A0E14] flex flex-col items-center justify-center p-8 text-center">
    <div className="w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/25 flex items-center justify-center mb-6">
      <ShieldCheck size={36} className="text-red-400" />
    </div>
    <h1 className="text-xl font-black text-white mb-2">Yönetim Paneli Taşındı</h1>
    <p className="text-sm text-gray-400 leading-relaxed max-w-sm">
      Güvenlik gereği OYNA OS artık ayrı ve korumalı bir web adresinde çalışır.
      Panele tarayıcınızdan giriş yapın; admin hesabınız ve MFA doğrulamanız istenecektir.
    </p>
    <a
      href={ADMIN_PANEL_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-8 flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-sm font-black text-white uppercase tracking-wide"
    >
      <ExternalLink size={16} /> Paneli Aç
    </a>
    <button
      type="button"
      onClick={onBack}
      className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-gray-400 hover:text-white"
    >
      <ArrowLeft size={14} /> Uygulamaya Dön
    </button>
  </div>
);

export default AdminRedirect;
