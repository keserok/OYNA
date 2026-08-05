import React, { useState } from 'react';
import { Camera } from 'lucide-react';
import { PLAY_STYLE_META, GENDER_LABEL } from '../../views/onboarding/onboardingShared';
import { formatPosition } from '../../shared/profilePresentation';

// ════════════════════════════════════════════════════════════════════════════
// KİMLİK KARTI — onaylı profil tasarımı
// ════════════════════════════════════════════════════════════════════════════
//
// İKİ EKRANDA AYNI: Profil ekranının tepesi ve Ayarlar → Bilgilerim'in tepesi.
// Tek fark yerleşim: profilde avatar SOLDA (yatay), Bilgilerim'de ORTADA
// (dikey). Bilgiler ve boş hâller ikisinde de birebir aynı — iki yerde iki
// farklı künye yazmak, er geç iki farklı gerçek demektir.
//
// ── ÖZET İKİ SATIRDIR ──────────────────────────────────────────────────────
//     Orta Saha · Erkek · 27
//     Taktiksel · Seviye 6
// Eksik olan bilgi sessizce DÜŞER (boş "·" bırakmaz). Hiçbiri yoksa tek bir
// açıklama satırı kalır: "Mevki ve seviye eklenmedi".
//
// NOT — `ProfileHero` ile ilişkisi: o bileşen yönetim panelindeki Kullanıcı
// Profili Aynası'nın kimlik kartıdır ve kendi kilitli testleri vardır.
// Bu dosya UYGULAMANIN yeni tasarımıdır; ikisi bilerek ayrı duruyor.
// ════════════════════════════════════════════════════════════════════════════

const initialsOf = (name: string) =>
  name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toLocaleUpperCase('tr-TR') || '•';

export interface ProfileIdentityCardProps {
  name: string;
  avatarUrl?: string | null;
  verified?: boolean;
  position?: string | null;
  /** Doğum tarihinden hesaplanmış yaş. */
  age?: number | null;
  /** Doğum tarihi yoksa onboarding yaş aralığı ("24-30"). */
  ageRange?: string | null;
  gender?: string | null;
  playStyle?: string | null;
  /** Oyuncunun kendi beyanı (1–10). */
  selfSkill?: number | null;
  /** 'row' = Profil ekranı (avatar solda) · 'column' = Bilgilerim (ortalı). */
  layout?: 'row' | 'column';
  /**
   * Fotoğraf ekleme/değiştirme. Verilmezse kamera rozeti ÇİZİLMEZ —
   * salt-okunur bağlamlarda (misafir) sahte bir eylem görünmesin.
   */
  onEditAvatar?: () => void;
  /** Fotoğraf yokken kartın altında beliren "Fotoğrafını ekle" satırı. */
  showAddPhotoRow?: boolean;
}

export const ProfileIdentityCard: React.FC<ProfileIdentityCardProps> = ({
  name, avatarUrl, verified, position, age, ageRange, gender, playStyle,
  selfSkill, layout = 'row', onEditAvatar, showAddPhotoRow = true,
}) => {
  // Kırık/erişilemeyen fotoğraf adresi → baş harflere düş.
  const [broken, setBroken] = useState(false);
  const showImg = !!avatarUrl && !broken;

  const styleMeta = playStyle ? PLAY_STYLE_META[playStyle as keyof typeof PLAY_STYLE_META] : undefined;
  const ageText = age != null ? `${age}` : (ageRange ? ageRange.replace('-', '–') : null);
  const genderText = gender === 'kadin' || gender === 'erkek' ? GENDER_LABEL[gender] : null;

  // Satır 1: mevki · cinsiyet · yaş — Satır 2: oyun stili · seviye
  const line1 = [formatPosition(position), genderText, ageText].filter(Boolean).join(' · ');
  const line2 = [styleMeta?.label, selfSkill != null ? `Seviye ${selfSkill}` : null]
    .filter(Boolean).join(' · ');
  const bosKunye = !line1 && !line2;

  const column = layout === 'column';

  const avatar = (
    <div className="relative shrink-0">
      {showImg ? (
        <img
          src={avatarUrl!}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="w-[88px] h-[88px] rounded-full object-cover bg-white/[0.12]"
        />
      ) : (
        <div className="w-[88px] h-[88px] rounded-full bg-white/[0.12] flex items-center justify-center text-[1.75rem] font-extrabold italic text-white font-[Montserrat]">
          {initialsOf(name)}
        </div>
      )}
      {/* Kamera rozeti YALNIZ fotoğraf yokken: fotoğrafı olan kullanıcı için
          değiştirme yolu zaten "Fotoğrafını değiştir" satırıdır ve rozet
          yüzü kapatıyordu. */}
      {onEditAvatar && !showImg && (
        <button
          type="button"
          onClick={onEditAvatar}
          aria-label="Profil fotoğrafı ekle"
          className="absolute bottom-px right-px w-[26px] h-[26px] rounded-full bg-white border-2 border-[#161B22] flex items-center justify-center text-[#0A0E14] active:scale-95 transition-transform"
        >
          <Camera size={12} strokeWidth={2.6} />
        </button>
      )}
    </div>
  );

  const kunye = (
    <div className={`min-w-0 flex flex-col gap-2 ${column ? 'items-center text-center' : 'flex-1 items-center text-center'}`}>
      <div className="flex items-center gap-2 min-w-0 max-w-full">
        <h1
          className={`m-0 font-[Montserrat] font-extrabold italic tracking-[-0.02em] text-white truncate ${
            column ? 'text-[1.5rem] leading-[1.75rem]' : 'text-[1.375rem] leading-[1.625rem]'
          }`}
        >
          {name}
        </h1>
        {verified && (
          <svg width="17" height="17" viewBox="0 0 24 24" className="shrink-0" aria-label="Doğrulanmış">
            <circle cx="12" cy="12" r="10" className="fill-primary" />
            <path d="M8 12l2.5 2.5L16 9" stroke="#0A0E14" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {bosKunye ? (
        <p className="m-0 text-[0.8125rem] leading-[1.35] text-ink-4">Mevki ve seviye eklenmedi</p>
      ) : (
        <div className="flex flex-col gap-[3px] text-[0.8125rem] leading-[1.35] text-white">
          {line1 && <p className="m-0">{line1}</p>}
          {line2 && <p className="m-0">{line2}</p>}
        </div>
      )}
    </div>
  );

  return (
    <div className="rounded-[24px] border border-white/[0.08] bg-[#161B22]/[0.92] p-5 flex flex-col">
      <div className={column ? 'flex flex-col items-center gap-3' : 'flex items-center gap-[18px]'}>
        {avatar}
        {kunye}
      </div>

      {/* Fotoğraf yoksa kartın dibinde ayrı bir çağrı: rozet küçük, bu satır
          gözden kaçmaz. Fotoğraf varsa satır "değiştir"e döner. */}
      {onEditAvatar && showAddPhotoRow && (
        <button
          type="button"
          onClick={onEditAvatar}
          className="mt-4 pt-3.5 w-full min-h-[44px] flex items-center justify-center gap-2 border-t border-white/[0.08] text-[0.8125rem] text-white active:opacity-75 transition-opacity"
        >
          <Camera size={12} strokeWidth={2.6} />
          {showImg ? 'Fotoğrafını değiştir' : 'Fotoğrafını ekle'}
        </button>
      )}
    </div>
  );
};

export default ProfileIdentityCard;
