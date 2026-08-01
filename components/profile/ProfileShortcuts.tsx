import React from 'react';

export interface ShortcutItem {
    label: string;
    value: string;
    /** Verilmezse hücre tıklanamaz bilgi kutusu olarak çizilir (salt-okunur profil). */
    onClick?: () => void;
}

const cellClass = 'flex-1 min-w-0 rounded-[20px] py-3.5 px-2 bg-surface-1 shadow-[0_10px_30px_rgba(0,0,0,0.3)] flex flex-col items-center gap-1.5';

/**
 * Profil kısayol satırı — Cüzdan / Takımlarım / Arkadaşlarım.
 * Tasarım 3a: ikon yok; üstte değer, altında etiket. Kullanıcı kararı: cüzdan
 * tutarı da diğerleri gibi BEYAZ (yeşil vurgu profilde güven halkasına ayrıldı).
 */
export const ProfileShortcuts: React.FC<{ items: ShortcutItem[] }> = ({ items }) => (
    <div className="flex gap-2.5">
        {items.map((item) => {
            const content = (
                <>
                    <span className="text-[1.0625rem] font-bold text-[#F5F3EE] truncate max-w-full">{item.value}</span>
                    <span className="text-[0.6875rem] text-[#F5F3EE]/[0.65] leading-[1.2] text-center truncate max-w-full">{item.label}</span>
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
