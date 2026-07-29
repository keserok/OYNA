import React from 'react';

// İstatistik üçlüsü hücresi — profil sayfası / takım detayı (Spec D22, H46).

interface StatPillProps {
  value: string | number;
  label: string;
  accent?: boolean; // neon vurgu (ekranda en çok bir tane)
  className?: string;
}

const StatPill: React.FC<StatPillProps> = ({ value, label, accent = false, className = '' }) => (
  <div
    className={`flex-1 rounded-2xl border px-3 py-2.5 text-center ${
      accent ? 'bg-[#39FF14]/8 border-[#39FF14]/25' : 'bg-white/4 border-white/8'
    } ${className}`}
  >
    <div className={`text-lg font-extrabold ${accent ? 'text-[#39FF14]' : 'text-white'}`}>{value}</div>
    <div className="text-[10px] font-bold uppercase tracking-widest text-white/40 mt-0.5">{label}</div>
  </div>
);

export default StatPill;
