import React, { useState } from 'react';
import { Camera } from 'lucide-react';
import { PLAY_STYLE_META, GENDER_LABEL } from '../../views/onboarding/onboardingShared';

export interface ProfileHeroProps {
    name: string;
    avatarUrl?: string | null;
    verified?: boolean;
    position?: string | null;
    age?: number | null;
    /** Doğum tarihi yoksa yaş satırında gösterilecek onboarding yaş aralığı (ör. "24-30"). */
    ageRange?: string | null;
    /** Onboarding cinsiyet kodu: 'kadin' | 'erkek'. */
    gender?: string | null;
    /** Onboarding oyun stili kodu: 'ciddi' | 'taktiksel' | 'rahat'. */
    playStyle?: string | null;
    matches: number;
    /** 0–100 */
    /**
     * IP-18: `null` = hiç skorlu maç yok. "%0" yazmak yalan olurdu — sıfır
     * başarı ile veri yokluğu aynı şey değil.
     */
    winRate: number | null;
    /** null → "EN İYİ" hücresi gizli (oylama verisi henüz kaydedilmiyor) */
    mvp?: number | null;
    /** undefined → düzenleme yok (salt okunur profil / misafir) */
    onEditAvatar?: () => void;
}

const initialsOf = (name: string) =>
    name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toLocaleUpperCase('tr-TR');

/**
 * Profil kimlik kartı (tasarım 3a "İnce Neon"): solda küçük avatar, sağında isim
 * ve TEK SATIR italik künye (mevki · yaş · cinsiyet · oyun stili); altta
 * Maç/Galibiyet(/En İyi) şeridi.
 *
 * Kullanıcı kararı: koleksiyon kartı (🎴) geçişi kaldırıldı — tasarımda yok.
 * Kullanıcı kararı: şeritteki üç sayı da BEYAZ; yeşil vurgu profilde yalnızca
 * güven puanı halkasında kalır.
 */
export const ProfileHero: React.FC<ProfileHeroProps> = ({
    name, avatarUrl, verified, position, age, ageRange, gender, playStyle,
    matches, winRate, mvp = null,
    onEditAvatar,
}) => {
    // Künye satırı: onboarding'de toplanan dört bilgi, olmayanlar sessizce düşer.
    const styleMeta = playStyle ? PLAY_STYLE_META[playStyle as keyof typeof PLAY_STYLE_META] : undefined;
    const ageText = age != null ? `${age} yaş` : (ageRange ? `${ageRange.replace('-', '–')} yaş` : null);
    const genderText = gender === 'kadin' || gender === 'erkek' ? GENDER_LABEL[gender] : null;
    const kunye = [position, ageText, genderText, styleMeta?.label].filter(Boolean).join(' · ');
    // Avatar yüklenemezse (kırık URL / erişilemeyen host) baş harflere düş.
    const [avatarBroken, setAvatarBroken] = useState(false);
    const showAvatarImg = !!avatarUrl && !avatarBroken;

    return (
        <div
            className="rounded-[28px] border border-white/10 p-5 text-[#F5F3EE] shadow-[0_24px_50px_rgba(0,0,0,0.5)]"
            style={{ background: 'radial-gradient(circle at 88% -12%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.05) 34%, transparent 62%), #0B0D11' }}
        >
            <div className="flex items-center gap-3.5">
                <div className="relative shrink-0">
                    {showAvatarImg ? (
                        <img
                            src={avatarUrl!}
                            alt={name}
                            referrerPolicy="no-referrer"
                            onError={() => setAvatarBroken(true)}
                            className="w-[54px] h-[54px] rounded-full object-cover bg-white/[0.12]"
                        />
                    ) : (
                        <div className="w-[54px] h-[54px] rounded-full bg-white/[0.12] flex items-center justify-center text-[1.1875rem] font-bold">
                            {initialsOf(name)}
                        </div>
                    )}
                    {onEditAvatar && (
                        <button
                            onClick={onEditAvatar}
                            aria-label="Profil fotoğrafını değiştir"
                            className="absolute -bottom-0.5 -right-0.5 w-[22px] h-[22px] rounded-full bg-primary border-2 border-[#0B0D11] flex items-center justify-center text-on-primary active:scale-95 transition-all"
                        >
                            <Camera size={10} strokeWidth={2.6} />
                        </button>
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <h1 className="text-[1.3125rem] font-semibold tracking-[-0.01em] truncate">{name}</h1>
                        {verified && (
                            <svg width="15" height="15" viewBox="0 0 24 24" className="shrink-0" aria-label="Doğrulanmış">
                                <circle cx="12" cy="12" r="10" className="fill-primary" />
                                <path d="M8 12l2.5 2.5L16 9" stroke="#0B0D11" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        )}
                    </div>
                    {kunye && (
                        <p className="mt-1 text-[0.6875rem] italic text-[#F5F3EE]/[0.6] truncate">{kunye}</p>
                    )}
                </div>
            </div>

            {/* ── İstatistik şeridi ── */}
            <div className="flex bg-black/[0.45] border border-white/10 rounded-2xl mt-4 py-3">
                <div className="flex-1 text-center">
                    <p className="text-[1.375rem] font-bold leading-none">{matches}</p>
                    <p className="mt-1 text-[0.625rem] font-normal tracking-[0.16em] text-[#F5F3EE]/[0.55]">MAÇ</p>
                </div>
                <div className="w-px bg-white/[0.12]" />
                <div className="flex-1 text-center">
                    <p className="text-[1.375rem] font-bold leading-none">{winRate === null ? '—' : `%${winRate}`}</p>
                    <p className="mt-1 text-[0.625rem] font-normal tracking-[0.16em] text-[#F5F3EE]/[0.55]">GALİBİYET</p>
                </div>
                {mvp != null && (
                    <>
                        <div className="w-px bg-white/[0.12]" />
                        <div className="flex-1 text-center">
                            <p className="text-[1.375rem] font-bold leading-none">{mvp}</p>
                            <p className="mt-1 text-[0.625rem] font-normal tracking-[0.16em] text-[#F5F3EE]/[0.55]">EN İYİ</p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
