import React from 'react';
import { Camera } from 'lucide-react';
import { PLAY_STYLE_META, GENDER_LABEL } from '../../views/onboarding/onboardingShared';
import { formatPosition } from '../../shared/profilePresentation';
import { UserAvatar } from '../common/UserAvatar';

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

export interface ProfileIdentityCardProps {
  name: string;
  avatarUrl?: string | null;
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
  /**
   * Kartın GÖVDESİNE dokunulunca çalışır (kullanıcı kararı: profil ekranında
   * bilgi kutusuna basınca "Profili Düzenle" açılır). Verilmezse kart düz bir
   * kutu olarak kalır — salt-okunur bağlamlarda (misafir, yönetim aynası)
   * sahte bir eylem görünmesin.
   */
  onPress?: () => void;
}

export const ProfileIdentityCard: React.FC<ProfileIdentityCardProps> = ({
  name, avatarUrl, position, age, ageRange, gender, playStyle,
  selfSkill, layout = 'row', onEditAvatar, showAddPhotoRow = true, onPress,
}) => {
  // Kırık/erişilemeyen fotoğraf adresine düşmeyi UserAvatar üstlenir; burada
  // yalnız "fotoğraf var mı" sorusu var (kamera rozeti onunla çiziliyor).
  const showImg = !!avatarUrl;

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
      {/* Yuvarlak TEK bileşenden gelir (components/common/UserAvatar): zemin,
          harf rengi, italik ve yazı tipi orada kilitli. Burada yalnız BOYUT
          söyleniyor. `showImg` yine de gerekiyor — kamera rozeti fotoğraf
          yokken çizilir. */}
      <UserAvatar
        name={name}
        avatarUrl={avatarUrl}
        className="w-[88px] h-[88px] rounded-full"
        textClassName="text-[1.75rem]"
      />
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
      {/* DOĞRULAMA TİKİ YOK — kullanıcı kararı (2026-08):
          "Profil ekranındaki tik işaretini kaldır ve bir daha görünmemesini
          sağla." Onaylı tasarımın kimlik kartında da tik yoktur. Bileşen
          `verified` diye bir alan KABUL ETMEZ; geri gelmesin diye kilitli
          testi var (tests/unit/onboardingAndProfile). */}
      <h1
        className={`m-0 max-w-full font-[Montserrat] font-extrabold italic tracking-[-0.02em] text-white truncate ${
          column ? 'text-[1.5rem] leading-[1.75rem]' : 'text-[1.375rem] leading-[1.625rem]'
        }`}
      >
        {name}
      </h1>

      {bosKunye ? (
        <p className="m-0 text-[0.8125rem] leading-[1.35] text-[#F5F3EE]/[0.55]">Mevki ve seviye eklenmedi</p>
      ) : (
        <div className="flex flex-col gap-[3px] text-[0.8125rem] leading-[1.35] text-white">
          {line1 && <p className="m-0">{line1}</p>}
          {line2 && <p className="m-0">{line2}</p>}
        </div>
      )}
    </div>
  );

  // Kartın gövdesi: `onPress` verilirse basılabilir olur. Alt satır ("Fotoğrafını
  // ekle") ve avatar rozeti KENDİ düğmeleri olduğu için gövdenin DIŞINDA kalır —
  // iç içe düğme geçersiz HTML'dir ve dokunuşlar birbirini yerdi.
  const govde = (
    <div className={column ? 'flex flex-col items-center gap-3' : 'flex items-center gap-[18px]'}>
      {avatar}
      {kunye}
    </div>
  );

  return (
    <div className="rounded-[24px] border border-white/[0.08] bg-[#161B22]/[0.92] p-5 flex flex-col">
      {onPress ? (
        <div
          role="button"
          tabIndex={0}
          aria-label="Profili düzenle"
          onClick={onPress}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPress(); } }}
          className="text-left cursor-pointer active:opacity-90 transition-opacity"
        >
          {govde}
        </div>
      ) : govde}

      {/* Fotoğraf yoksa kartın dibinde ayrı bir çağrı: rozet küçük, bu satır
          gözden kaçmaz. Fotoğraf varsa satır "değiştir"e döner. */}
      {onEditAvatar && showAddPhotoRow && (
        <button
          type="button"
          onClick={onEditAvatar}
          className="mt-4 pt-3.5 w-full min-h-[44px] flex items-center justify-center gap-[9px] border-t border-white/[0.08] text-[0.8125rem] text-white active:opacity-75 transition-opacity"
        >
          <Camera size={12} strokeWidth={2.6} />
          {showImg ? 'Fotoğrafını değiştir' : 'Fotoğrafını ekle'}
        </button>
      )}
    </div>
  );
};

export default ProfileIdentityCard;
