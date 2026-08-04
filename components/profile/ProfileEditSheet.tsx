import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useImageUpload } from '../../hooks/useImageUpload';
import { POSITION_LABEL, POSITION_ABBR, PLAY_STYLE_META, GENDER_LABEL } from '../../views/onboarding/onboardingShared';
import { skillBand, SELF_SKILL_MAX } from '../../utils/skillBand';
import { BirthdatePicker, AYLAR, parseISODate } from './BirthdatePicker';

// ════════════════════════════════════════════════════════════════════════
// PROFİLİ DÜZENLE — TEK KAYNAK (tasarım 4c)
// ProfileScreen (kullanıcı kendi profili) ve admin panelin Kullanıcı Profili
// Aynası (admin, seçili kullanıcı adına) AYNI düzenleme yüzeyini kullanır.
// Yazma yolu bileşenin dışındadır: kullanıcı updateProfileBasics'e, admin
// audit'li admin_update_user_profile RPC'sine kaydeder (onSave ile).
//
// GÖRÜNÜM: tasarım 4c — alttan açılan yarım sayfa değil, TAM EKRAN. Kendi üst
// çubuğu (geri oku + başlık), numaralı bölümleri (01 Kimlik · 02 Oyun ·
// 03 Tanıtım) ve alta sabitlenmiş Kaydet çubuğu vardır. Yeni bir uygulama
// görünümü (route) AÇILMAZ: bileşen yine open/onClose ile sürülen bir katman —
// böylece admin panelinde de (uygulama gezintisi olmayan bir yerde) çalışır.
// `pf-serif` BURAYA AYRICA yazılır: katman portal ile <body>'ye çizilir, yani
// profil ekranının altında DEĞİLDİR ve yazı tipini ondan miras alamaz.
// Kalın ağırlık en fazla 700 (font-bold): Lora ekseni 400–700 taşır ve
// `font-synthesis: none` yüzünden 800 sahte kalın üretmez, sessizce düşerdi.
//
// KAYIT SÖZLEŞMESİ (kullanıcı kararı: "Kaydedildi göster, sonra kapat"):
// `onSave` HATA FIRLATIRSA kayıt başarısızdır — katman açık kalır, sebebi
// ebeveyn gösterir (uygulamada errorText, admin panelinde toast). Sorunsuz
// dönerse düğme kısaca "Kaydedildi" olur ve katman kendini kapatır. Bu yüzden
// ebeveynler artık başarıda kendileri kapatmaz; kapatmayı bu sözleşme sürer.
// ════════════════════════════════════════════════════════════════════════

const POSITION_ORDER = ['kaleci', 'defans', 'orta', 'forvet'] as const;
const GENDER_ORDER = ['kadin', 'erkek'] as const;
const PLAY_STYLE_ORDER = ['ciddi', 'taktiksel', 'rahat'] as const;
const GENDER_SYMBOL: Record<(typeof GENDER_ORDER)[number], string> = { kadin: '♀', erkek: '♂' };
/** "Kaydedildi" onayının ekranda kalma süresi (ms) — sonra katman kapanır. */
const KAYDEDILDI_MS = 900;

export interface ProfileEditValues {
    position: string;
    /**
     * Kısa tanıtım.
     *
     * BU KATMANDA ARTIK DÜZENLENMİYOR (onaylı tasarımda "03 — Tanıtım"
     * bölümü yok). Alan yine de arayüzde duruyor ve `initial.bio` OLDUĞU GİBİ
     * geri veriliyor — kaldırılsaydı `updateProfileBasics` alana `undefined`
     * yazar ve kayıtlı tanıtımlar SESSİZCE SİLİNİRDİ.
     *
     * Tanıtımı halen düzenleyen yer: kaleci/hakem profili (`ServiceProfile`),
     * pazaryeri kartında orası gösteriliyor.
     */
    bio: string;
    birthdate: string;
    gender: string;
    playStyle: string;
    avatarUrl: string;
    /** Beyan edilen seviye (1–10). null = henüz beyan yok. */
    selfSkill: number | null;
}

export interface ProfileEditSheetProps {
    open: boolean;
    initial: ProfileEditValues;
    saving: boolean;
    /** Hata FIRLATIRSA katman açık kalır; sorunsuz dönerse kendini kapatır. */
    onSave: (values: ProfileEditValues) => void | Promise<void>;
    onClose: () => void;
    /** Varsayılan "Profili Düzenle"; admin aynasında kullanıcı adıyla özelleştirilebilir. */
    title?: string;
    /** Kimlik bölümünde gösterilen ad (avatar baş harfleri buradan türetilir). */
    name?: string;
    /**
     * Seviye, oyuncunun KENDİ beyanıdır — admin aynasında salt-okunur gösterilir.
     * (Admin bir oyuncunun kendi beyanını değiştirmez; aldığı akran puanlarını
     * ALINAN AKRAN PUANLARI panelinden görür.) Varsayılan: düzenlenebilir.
     */
    selfSkillEditable?: boolean;
    /** Kaydetme hatası — katman açık kalır, sebep Kaydet'in üstünde görünür. */
    errorText?: string | null;
}

const initialsOf = (name: string) =>
    name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toLocaleUpperCase('tr-TR');

/** Numaralı bölüm başlığı: "01 — Kimlik" + sağa uzanan ince çizgi. */
const Bolum: React.FC<{ no: string; ad: string; ilk?: boolean }> = ({ no, ad, ilk }) => (
    <div className={`flex items-center gap-2.5 ${ilk ? 'mt-1.5' : 'mt-6'}`}>
        <span className="text-[0.6875rem] italic text-[#F5F3EE]/[0.5]">{no} — {ad}</span>
        <span className="flex-1 h-px bg-white/[0.12]" />
    </div>
);

/**
 * Seçilebilir kutu (pozisyon / cinsiyet) — seçiliyken BEYAZ dolgu.
 *
 * Neden yeşil değil: bu ekranda aynı anda üç ayrı seçim ızgarası var
 * (cinsiyet, mevki, oyun stili) ve oyun stili çipleri KENDİ kimlik
 * renklerini taşıyor (kırmızı/turuncu/yeşil). Seçim de yeşil olsaydı
 * "Rahat" stilinin yeşiliyle "seçili" yeşili aynı ekranda çakışır, hangisi
 * durum hangisi kimlik ayırt edilemezdi. Beyaz hiçbir kimliğe ait değil;
 * yalnız "bunu sen seçtin" der. Onaylı tasarımın kararı budur.
 */
const secimSinifi = (secili: boolean) =>
    `rounded-[14px] border transition-all active:scale-95 ${
        secili
            ? 'bg-white border-white text-[#0A0E14]'
            : 'bg-surface-1 border-white/[0.08] text-[#F5F3EE]/[0.6] hover:bg-white/[0.05]'
    }`;

/** 'YYYY-MM-DD' → "15 Kasım 1998"; boş/bozuksa null. */
const tarihMetni = (iso: string): string | null => {
    const p = parseISODate(iso);
    return p ? `${p.d} ${AYLAR[p.m1 - 1]} ${p.y}` : null;
};

export const ProfileEditSheet: React.FC<ProfileEditSheetProps> = ({
    open, initial, saving, onSave, onClose, title, name, selfSkillEditable = true, errorText,
}) => {
    const [photoError, setPhotoError] = useState<string | null>(null);
    const [pos, setPos] = useState(initial.position);
    const [avatar, setAvatar] = useState(initial.avatarUrl);
    const [tarihAcik, setTarihAcik] = useState(false);
    const [birthdate, setBirthdate] = useState(initial.birthdate);
    const [gender, setGender] = useState(initial.gender);
    const [style, setStyle] = useState(initial.playStyle);
    const [selfSkill, setSelfSkill] = useState<number | null>(initial.selfSkill);
    const [kaydedildi, setKaydedildi] = useState(false);
    const [avatarBroken, setAvatarBroken] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const kapatmaSayaci = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { uploadImage, uploading } = useImageUpload('avatars', { minWidth: 200 });

    // Sayfa her açılışta güncel profil değerleriyle tohumlanır.
    useEffect(() => {
        if (!open) return;
        setPhotoError(null);
        setKaydedildi(false);
        setAvatarBroken(false);
        setTarihAcik(false);
        setPos(initial.position);
        setAvatar(initial.avatarUrl);
        setBirthdate(initial.birthdate);
        setGender(initial.gender);
        setStyle(initial.playStyle);
        setSelfSkill(initial.selfSkill);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Katman kapanırken bekleyen kapatma sayacı kalmasın (kapalı bileşende
    // setState → React uyarısı ve ebeveynde beklenmedik ikinci kapatma).
    useEffect(() => () => { if (kapatmaSayaci.current) clearTimeout(kapatmaSayaci.current); }, []);

    const handlePickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPhotoError(null);
        try {
            const url = await uploadImage(file);
            setAvatar(url);
            setAvatarBroken(false);
        } catch (err: any) {
            // D5: eskiden yalnız console.error → kullanıcı neden yüklenmediğini
            // bilmiyordu. imageCompression açıklayıcı mesaj verir (HEIC/boyut/…).
            console.error('Fotoğraf yükleme hatası:', err);
            setPhotoError(err?.message || 'Fotoğraf yüklenemedi. Farklı bir görsel dene (JPG/PNG, en fazla 10MB).');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const kaydet = async () => {
        if (saving || uploading || kaydedildi) return;
        try {
            await onSave({
                position: pos.trim(),
                // Tanıtım bu katmanda düzenlenmiyor; gelen değer OLDUĞU GİBİ
                // geri gider. Atlanırsa kayıtlı tanıtım sessizce silinirdi.
                bio: initial.bio,
                birthdate,
                gender, playStyle: style, avatarUrl: avatar, selfSkill,
            });
        } catch {
            // Sebebi ebeveyn gösterir (errorText / toast); katman açık kalır.
            return;
        }
        setKaydedildi(true);
        kapatmaSayaci.current = setTimeout(onClose, KAYDEDILDI_MS);
    };

    if (!open) return null;

    const band = skillBand(selfSkill);
    const gosterilenAd = name?.trim() || '';
    const fotoVar = !!avatar && !avatarBroken;
    const kaydetKilitli = saving || uploading || kaydedildi;

    // z-[260]: uygulamada BottomNav'ın, admin panelde 360 drawer'ının (z-[240]) üstünde kalmalı.
    return createPortal(
        <div className="pf-serif pf-canvas fixed inset-0 z-[260] flex flex-col text-[#F5F3EE]">
            <div className="pf-ambient" />

            {/* ═══ ÜST ÇUBUK ═══ */}
            <div className="relative z-10 shrink-0 flex items-center gap-3 px-5 pb-3 pt-safe">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Geri"
                    className="w-11 h-11 rounded-full bg-surface-1/80 border border-white/[0.08] flex items-center justify-center text-[#F5F3EE]/[0.8] hover:text-[#F5F3EE] hover:bg-white/10 active:scale-95 transition-all shrink-0"
                >
                    <ChevronLeft size={18} />
                </button>
                {/* Başlık küçük ve harf aralıklı — tasarım kararı: ekranın
                    kendisi zaten "düzenleme" moduna girmiş durumda, büyük bir
                    başlık dikkati içerikten alıyordu. */}
                <span className="flex-1 min-w-0 text-[0.6875rem] tracking-[0.14em] text-[#F5F3EE]/[0.55] uppercase truncate">
                    {title || 'Profili Düzenle'}
                </span>
            </div>

            {/* ═══ GÖVDE ═══ */}
            <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar px-6 pt-2.5 pb-safe-nav">
                {/* ─── 01 — KİMLİK ─── */}
                <Bolum no="01" ad="Kimlik" ilk />
                <div className="mt-3.5 flex items-center gap-3.5">
                    {fotoVar ? (
                        <img
                            src={avatar}
                            alt={gosterilenAd || 'Profil'}
                            referrerPolicy="no-referrer"
                            onError={() => setAvatarBroken(true)}
                            className="w-16 h-16 rounded-full object-cover bg-white/[0.12] border border-white/[0.14] shrink-0"
                        />
                    ) : (
                        <div className="w-16 h-16 rounded-full bg-white/[0.12] border border-white/[0.14] flex items-center justify-center text-[1.375rem] font-bold shrink-0">
                            {gosterilenAd ? initialsOf(gosterilenAd) : '👤'}
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        {gosterilenAd && <span className="block text-base font-semibold truncate">{gosterilenAd}</span>}
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            /* Beyaz + alt çizgi (onaylı tasarım). Yeşil değil:
                               bu ekranda yeşil "birincil eylem" anlamı taşımıyor
                               ve seviye ızgarasındaki yeşil bantla karışıyordu. */
                            className="text-[0.6875rem] text-[#F5F3EE] border-b border-white/[0.35] disabled:opacity-60"
                        >
                            {uploading ? 'Yükleniyor…' : 'Fotoğrafı değiştir'}
                        </button>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePickPhoto} />
                </div>
                {photoError && (
                    <p className="mt-2.5 text-[0.6875rem] text-error bg-error/10 border border-error/25 rounded-xl px-3 py-2">
                        {photoError}
                    </p>
                )}

                {/* Doğum tarihi — yerleşik `<input type="date">` KALDIRILDI.
                    O girdi her platformda başka bir şey çiziyordu ve doğum
                    tarihi için en kötüsü takvimdi: kullanıcı 1998'e ulaşmak
                    için aylarca geri basıyordu. Yerine üç tekerlekli kendi
                    seçicimiz açılıyor (BirthdatePicker). */}
                <button
                    type="button"
                    onClick={() => setTarihAcik(true)}
                    className="mt-3.5 w-full bg-surface-1 border border-white/[0.08] rounded-[14px] px-4 py-2.5 min-h-12 flex items-center justify-between gap-3 hover:bg-white/[0.05] transition-colors active:scale-[0.99]"
                >
                    <span className="text-xs italic text-[#F5F3EE]/[0.6] shrink-0">Doğum tarihi</span>
                    <span className={`flex items-center gap-2.5 text-sm ${birthdate ? 'text-[#F5F3EE]' : 'text-[#F5F3EE]/[0.45]'}`}>
                        {tarihMetni(birthdate) ?? 'Ekle'}
                        <ChevronRight size={15} className="text-[#F5F3EE]/[0.5] shrink-0" />
                    </span>
                </button>

                <div className="mt-2.5 flex gap-2">
                    {GENDER_ORDER.map((g) => {
                        const sel = gender === g;
                        return (
                            <button
                                key={g}
                                type="button"
                                onClick={() => setGender(sel ? '' : g)}
                                aria-pressed={sel}
                                className={`flex-1 h-11 text-xs ${sel ? 'font-bold' : ''} ${secimSinifi(sel)}`}
                            >
                                {GENDER_SYMBOL[g]} {GENDER_LABEL[g]}
                            </button>
                        );
                    })}
                </div>

                {/* ─── 02 — OYUN ─── */}
                <Bolum no="02" ad="Oyun" />
                <div className="mt-3.5 grid grid-cols-4 gap-2">
                    {POSITION_ORDER.map((code) => {
                        const label = POSITION_LABEL[code];
                        const sel = pos === label;
                        return (
                            <button
                                key={code}
                                type="button"
                                onClick={() => setPos(sel ? '' : label)}
                                aria-pressed={sel}
                                className={`min-h-12 py-2.5 flex flex-col items-center gap-0.5 ${secimSinifi(sel)}`}
                            >
                                <span className="text-[0.8125rem] font-bold">{POSITION_ABBR[code]}</span>
                                <span className="text-[0.6875rem]">{label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* ── SEVİYEN — beyan edilen seviye (1–10), kadroda banda indirgenir ── */}
                <div className="mt-4">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs italic text-[#F5F3EE]/[0.75]">Seviyen</span>
                        {band && (
                            <span
                                lang="tr"
                                className="text-[0.625rem] font-bold uppercase tracking-[0.1em] px-2.5 py-[3px] rounded-full"
                                style={{ color: band.color, backgroundColor: `${band.color}17`, border: `1px solid ${band.color}45` }}
                            >
                                {band.label} · {selfSkill}/{SELF_SKILL_MAX}
                            </span>
                        )}
                    </div>
                    {/* KAYITLI beyan geri alınamaz (sunucu kapısı NULL'u reddeder) —
                        ama henüz beyan YOKKEN yanlışlıkla dokunulan sayı katman
                        içinde geri alınabilmeli: taslak seçim ikinci dokunuşla
                        temizlenir, kayıtlı beyan temizlenemez. */}
                    <div className="mt-2.5 grid grid-cols-10 gap-1">
                        {Array.from({ length: SELF_SKILL_MAX }).map((_, i) => {
                            const val = i + 1;
                            const dolu = selfSkill != null && val <= selfSkill;
                            const secili = selfSkill === val;
                            const renk = skillBand(val)?.color ?? '#FACC15';
                            return (
                                <button
                                    key={val}
                                    type="button"
                                    disabled={!selfSkillEditable}
                                    aria-label={`Seviye ${val}`}
                                    aria-pressed={secili}
                                    onClick={() => setSelfSkill(
                                        initial.selfSkill == null && selfSkill === val ? null : val,
                                    )}
                                    className={`h-10 rounded-[10px] text-xs transition-all active:scale-95 disabled:active:scale-100 disabled:cursor-default ${
                                        dolu ? 'font-bold text-on-primary' : 'text-[#F5F3EE]/[0.6]'
                                    }`}
                                    style={{
                                        backgroundColor: dolu ? renk : 'var(--color-surface-1)',
                                        border: secili
                                            ? '2px solid #F5F3EE'
                                            : `1px solid ${dolu ? renk : 'rgba(255,255,255,0.08)'}`,
                                        boxShadow: secili ? `0 0 14px ${renk}59` : undefined,
                                    }}
                                >
                                    {val}
                                </button>
                            );
                        })}
                    </div>
                    <p className="mt-1.5 ml-1 text-[0.6875rem] italic text-[#F5F3EE]/[0.55]">
                        {(['baslangic', 'orta', 'ileri'] as const).map((k, i) => {
                            const b = skillBand(k === 'baslangic' ? 1 : k === 'orta' ? 5 : 9)!;
                            const aralik = k === 'baslangic' ? '1–3' : k === 'orta' ? '4–7' : '8–10';
                            return (
                                <React.Fragment key={k}>
                                    {i > 0 && ' · '}
                                    {/* "BAŞLANGIÇ" → "Başlangıç", "İLERİ" → "İleri":
                                        ilk harf olduğu gibi kalır, gerisi Türkçe
                                        küçültmeden geçer (aksi halde "Ileri" olurdu). */}
                                    <span style={{ color: b.color }} lang="tr">
                                        {aralik} {b.label.charAt(0) + b.label.slice(1).toLocaleLowerCase('tr-TR')}
                                    </span>
                                </React.Fragment>
                            );
                        })}
                    </p>
                    {selfSkill == null && (
                        <p className="mt-1 ml-1 text-[0.6875rem] italic text-[#F5F3EE]/[0.55]">
                            Henüz seviye beyanın yok — kadroda seviye çipin görünmez.
                        </p>
                    )}
                    {!selfSkillEditable && (
                        <p className="mt-1 ml-1 text-[0.6875rem] italic text-[#F5F3EE]/[0.55]">
                            Oyuncunun kendi beyanı, değiştirilemez.
                        </p>
                    )}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                    {/* Kimlik renkleri (kanonik K/S/Y) seçim beklenmeden görünür:
                        seçili → dolu renk, değil → kendi renginde tonlu */}
                    {PLAY_STYLE_ORDER.map((s) => {
                        const sel = style === s;
                        const meta = PLAY_STYLE_META[s];
                        return (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setStyle(sel ? '' : s)}
                                aria-pressed={sel}
                                className={`py-3 rounded-[14px] border text-center text-xs transition-all active:scale-95 ${sel ? 'font-bold' : ''}`}
                                style={sel
                                    ? { color: '#0A0E14', backgroundColor: meta.color, borderColor: meta.color, boxShadow: `0 0 14px ${meta.color}40` }
                                    : { color: meta.color, backgroundColor: `${meta.color}12`, borderColor: `${meta.color}45` }}
                            >
                                {meta.label}
                            </button>
                        );
                    })}
                </div>

                {/* "03 — Tanıtım" bölümü onaylı tasarımla KALDIRILDI.
                    Oyuncu profilinde tanıtım artık hiçbir yerde gösterilmiyordu;
                    yalnız kaleci/hakem kartında görünüyor ve orası kendi
                    ekranından (ServiceProfile) düzenleniyor. Kayıtlı değerler
                    silinmiyor — `kaydet` içinde olduğu gibi geri gönderiliyor. */}
            </div>

            {/* ═══ SABİT KAYDET ÇUBUĞU ═══ */}
            <div className="absolute left-0 right-0 bottom-0 z-20 px-5 pt-8 pb-safe bg-gradient-to-t from-[#0A0E14] from-55% to-transparent">
                {errorText && (
                    <p className="mb-2.5 text-[0.6875rem] text-error text-center bg-error/10 border border-error/25 rounded-xl px-3 py-2">
                        {errorText}
                    </p>
                )}
                {/* Kaydet BEYAZ (onaylı tasarım) — seçim durumuyla aynı dil.
                    Başarı anında kısaca yeşile döner: "Kaydedildi" bir DURUM
                    bildirimidir, rengi de durum dilinden gelir. */}
                <button
                    type="button"
                    onClick={() => void kaydet()}
                    disabled={kaydetKilitli}
                    className={`w-full h-[50px] rounded-full text-[0.8125rem] font-semibold transition-all active:scale-95 disabled:active:scale-100 ${
                        kaydedildi
                            ? 'bg-[#10b981] text-[#0A0E14] shadow-[0_0_24px_rgba(16,185,129,0.3)]'
                            : 'bg-white text-[#0A0E14] disabled:opacity-60'
                    }`}
                >
                    {kaydedildi ? 'Kaydedildi' : saving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
            </div>

            {/* ═══ DOĞUM TARİHİ SEÇİCİ ═══
                Katmanın ÜSTÜNDE (z-270) açılır; seçilen tarih yalnız yerel
                duruma yazılır — asıl kayıt yine alttaki Kaydet düğmesinden
                geçer, yani kullanıcı vazgeçebilir. */}
            <BirthdatePicker
                open={tarihAcik}
                value={birthdate}
                onCancel={() => setTarihAcik(false)}
                onConfirm={(iso) => { setBirthdate(iso); setTarihAcik(false); }}
            />
        </div>,
        document.body
    );
};
