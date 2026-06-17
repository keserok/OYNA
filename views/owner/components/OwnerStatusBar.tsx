import React, { useMemo } from 'react';
import { AlertTriangle, Building2, CreditCard, FlaskConical, ShieldAlert } from 'lucide-react';

export type OwnerStatusBanner = {
  id: string;
  message: string;
  tone: 'demo' | 'warning' | 'danger' | 'info';
  icon?: React.ReactNode;
};

interface OwnerStatusBarProps {
  banners: OwnerStatusBanner[];
}

const toneStyles: Record<OwnerStatusBanner['tone'], string> = {
  demo: 'bg-amber-500/90 text-black',
  warning: 'bg-amber-600/90 text-black',
  danger: 'bg-red-600/95 text-white',
  info: 'bg-blue-600/20 border-b border-blue-500/30 text-blue-100',
};

const defaultIcons: Record<OwnerStatusBanner['tone'], React.ReactNode> = {
  demo: <FlaskConical size={14} />,
  warning: <CreditCard size={14} />,
  danger: <ShieldAlert size={14} />,
  info: <Building2 size={14} />,
};

/** Birden fazla banner'ı tek kompakt şeritte birleştirir (SaaS best practice) */
export const OwnerStatusBar: React.FC<OwnerStatusBarProps> = ({ banners }) => {
  const primary = useMemo(() => banners[0] ?? null, [banners]);
  const restCount = banners.length - 1;

  if (!primary) return null;

  return (
    <div className={`sticky top-0 z-50 ${toneStyles[primary.tone]}`}>
      <div className="flex items-center justify-center gap-2 text-[11px] font-bold py-2 px-4 text-center">
        {primary.icon ?? defaultIcons[primary.tone]}
        <span className="leading-tight">{primary.message}</span>
        {restCount > 0 && (
          <span className="opacity-80 text-[10px] font-black">+{restCount}</span>
        )}
      </div>
      {restCount > 0 && (
        <div className="border-t border-black/10 px-4 py-1.5 space-y-1 bg-black/10">
          {banners.slice(1).map((b) => (
            <p key={b.id} className="text-[10px] font-medium flex items-center gap-1.5 justify-center">
              <AlertTriangle size={10} className="opacity-70" />
              {b.message}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};
