import React from 'react';

export interface ShortcutItem {
    icon: React.ReactNode;
    label: string;
    value: string;
    /** Verilmezse hücre tıklanamaz bilgi kutusu olarak çizilir (salt-okunur profil). */
    onClick?: () => void;
}

const cellClass = 'flex-1 min-w-0 rounded-2xl py-3.5 px-1.5 bg-white/[0.03] border border-white/[0.08] flex flex-col items-center gap-2';

/** Profil kısayol satırı — Cüzdan / Takımlarım / Arkadaşlarım (veya salt-okunur karşılıkları). */
export const ProfileShortcuts: React.FC<{ items: ShortcutItem[] }> = ({ items }) => (
    <div className="flex gap-2">
        {items.map((item) => {
            const content = (
                <>
                    <div className="w-[34px] h-[34px] rounded-[10px] bg-white/[0.06] border border-white/[0.12] flex items-center justify-center text-white/85">
                        {item.icon}
                    </div>
                    <span className="text-[9px] font-black text-white/55 leading-[1.2] text-center truncate max-w-full">{item.label}</span>
                    <span className="text-sm font-black text-white truncate max-w-full">{item.value}</span>
                </>
            );
            return item.onClick ? (
                <button key={item.label} onClick={item.onClick} className={`${cellClass} hover:bg-white/[0.06] active:scale-[0.98] transition-all`}>
                    {content}
                </button>
            ) : (
                <div key={item.label} className={cellClass}>
                    {content}
                </div>
            );
        })}
    </div>
);
