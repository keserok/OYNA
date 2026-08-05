import React from 'react';

export interface ShortcutItem {
    label: string;
    value: string;
    /** Verilmezse hücre tıklanamaz bilgi kutusu olarak çizilir (salt-okunur profil). */
    onClick?: () => void;
    /**
     * Değer "henüz yok" anlamına geliyorsa (0 takım, 0 arkadaş, boş cüzdan)
     * rakam SOLUK çizilir. Onaylı tasarım yeni kullanıcı ekranında üç kutuyu da
     * böyle gösteriyor: sıfır bir başarı değil, henüz doldurulmamış bir yer.
     */
    dim?: boolean;
}

const cellClass = 'flex-1 min-w-0 rounded-[20px] py-[15px] px-2 bg-surface-1 flex flex-col items-center gap-[7px]';

/**
 * Profil kısayol satırı — Cüzdan / Takımlarım / Arkadaşlarım.
 * Tasarım: ikon yok; üstte değer (Montserrat 800 italik), altında etiket.
 * Kullanıcı kararı: cüzdan tutarı da diğerleri gibi BEYAZ (yeşil vurgu
 * profilde güven halkasına ayrıldı).
 */
export const ProfileShortcuts: React.FC<{ items: ShortcutItem[] }> = ({ items }) => (
    <div className="flex gap-2.5">
        {items.map((item) => {
            const content = (
                <>
                    <span
                        className={`text-[1.0625rem] font-[Montserrat] font-extrabold italic truncate max-w-full ${
                            item.dim ? 'text-[#F5F3EE]/[0.45]' : 'text-white'
                        }`}
                    >
                        {item.value}
                    </span>
                    <span className="text-[0.6875rem] text-[#F5F3EE]/[0.55] leading-[1.2] text-center truncate max-w-full">{item.label}</span>
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
