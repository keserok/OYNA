import React from 'react';
import { Camera } from 'lucide-react';
import { PLAY_STYLE_META, GENDER_LABEL } from '../../views/onboarding/onboardingShared';
import { UserAvatar } from '../common/UserAvatar';

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

/**
 * Profil kimlik kartı (tasarım 3a "İnce Neon"): solda avatar, sağında isim;
 * altında mevki/yaş/cinsiyet/oyun stili bilgileri ve Maç/Galibiyet(/En İyi) şeridi.
 *
 * Kullanıcı kararı (2026-08): bu dört bilgi eskiden TEK SATIR italik künyeydi
 * (`mevki · yaş · cinsiyet · oyun stili`) ve satır sığmayınca `truncate` ile
 * KESİLİYORDU — dar telefonlarda oyun stili hiç görünmüyordu. Artık her bilgi
 * kendi kutusunda, ikişerli satırlar hâlinde ve GENİŞ duruyor; punto da büyüdü.
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
    // Onboarding'de toplanan dört bilgi; olmayanlar sessizce düşer.
    const styleMeta = playStyle ? PLAY_STYLE_META[playStyle as keyof typeof PLAY_STYLE_META] : undefined;
    const ageText = age != null ? `${age} yaş` : (ageRange ? `${ageRange.replace('-', '–')} yaş` : null);
    const genderText = gender === 'kadin' || gender === 'erkek' ? GENDER_LABEL[gender] : null;
    const bilgiler = [
        { etiket: 'MEVKİ', deger: position },
        { etiket: 'YAŞ', deger: ageText },
        { etiket: 'CİNSİYET', deger: genderText },
        { etiket: 'OYUN STİLİ', deger: styleMeta?.label },
    ].filter((b): b is { etiket: string; deger: string } => !!b.deger);
    // Avatar yüklenemezse (kırık URL / erişilemeyen host) baş harflere düşme
    // sorumluluğu artık UserAvatar'da — burada ayrı bir durum tutulmuyor.

    return (
        <div
            className="rounded-[28px] border border-white/10 p-5 text-[#F5F3EE] shadow-[0_24px_50px_rgba(0,0,0,0.5)]"
            style={{ background: 'radial-gradient(circle at 88% -12%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.05) 34%, transparent 62%), #0B0D11' }}
        >
            <div className="flex items-center gap-3.5">
                <div className="relative shrink-0">
                    {/* Yuvarlak TEK bileşenden (components/common/UserAvatar).
                        Burada eskiden ayrı bir kopya vardı ve İTALİK DEĞİLDİ —
                        aynı kişi profil kartında italik, panel aynasında düz
                        harflerle görünüyordu. */}
                    <UserAvatar
                        name={name}
                        avatarUrl={avatarUrl}
                        className="w-[62px] h-[62px] rounded-full"
                        textClassName="text-[1.375rem]"
                    />
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
                        <h1 className="text-[1.375rem] leading-[1.625rem] font-semibold tracking-[-0.02em] truncate">{name}</h1>
                        {verified && (
                            <svg width="17" height="17" viewBox="0 0 24 24" className="shrink-0" aria-label="Doğrulanmış">
                                <circle cx="12" cy="12" r="10" className="fill-primary" />
                                <path d="M8 12l2.5 2.5L16 9" stroke="#0B0D11" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Bilgi kutuları: ikişerli satırlar ──
                Tek satırlık künye yerine her bilgi kendi kutusunda. Tek sayıda
                bilgi varsa sonuncusu satırın TAMAMINI kaplar; böylece hiçbir
                durumda yarım/asılı kutu kalmaz. `break-words` var, `truncate`
                YOK — uzun değer kesilmez, alt satıra iner. */}
            {bilgiler.length > 0 && (
                <div className="grid grid-cols-2 gap-2 mt-4">
                    {bilgiler.map((b, i) => (
                        <div
                            key={b.etiket}
                            className={`rounded-2xl bg-white/[0.05] border border-white/[0.09] px-3.5 py-2.5 ${
                                bilgiler.length % 2 === 1 && i === bilgiler.length - 1 ? 'col-span-2' : ''
                            }`}
                        >
                            <p className="text-[0.625rem] leading-[0.75rem] font-semibold tracking-[0.14em] uppercase text-[#F5F3EE]/[0.55]">
                                {b.etiket}
                            </p>
                            <p className="mt-1 text-[0.9375rem] leading-[1.25rem] font-semibold break-words">{b.deger}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* ── İstatistik şeridi ── */}
            <div className="flex bg-black/[0.45] border border-white/10 rounded-2xl mt-2.5 py-3.5">
                <div className="flex-1 text-center">
                    <p className="text-[1.5rem] font-bold leading-none">{matches}</p>
                    <p className="mt-1.5 text-[0.6875rem] font-normal tracking-[0.16em] text-[#F5F3EE]/[0.55]">MAÇ</p>
                </div>
                <div className="w-px bg-white/[0.12]" />
                <div className="flex-1 text-center">
                    <p className="text-[1.5rem] font-bold leading-none">{winRate === null ? '—' : `%${winRate}`}</p>
                    <p className="mt-1.5 text-[0.6875rem] font-normal tracking-[0.16em] text-[#F5F3EE]/[0.55]">GALİBİYET</p>
                </div>
                {mvp != null && (
                    <>
                        <div className="w-px bg-white/[0.12]" />
                        <div className="flex-1 text-center">
                            <p className="text-[1.5rem] font-bold leading-none">{mvp}</p>
                            <p className="mt-1.5 text-[0.6875rem] font-normal tracking-[0.16em] text-[#F5F3EE]/[0.55]">EN İYİ</p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
