import React from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, MapPin, Check, Users } from 'lucide-react';
import type { DiscoveryFilterOptions } from '../../utils/discoveryFilterOptions';
import { ROLE_LABEL_MAP } from '../../utils/discoveryFilterOptions';
import type { OynaLocation } from '../../types';

// Top Oyna filtre paneli — TEK ev: listenin üstündeki üç dropdown'da olan
// (format/mentalite/pozisyon) filtreler burada da tam liste olarak durur ve
// aynı state'i paylaşır; birinden seçmek diğerini de günceller.
//
// Yerleşim kuralı: her filtre KENDİ SATIRINDA, başlığı üstünde, seçenekleri
// sarmalayan bir ızgarada. Dokunma hedefi en az 44px (WCAG 2.5.5).

const ACCENT = '#39FF14';   // seçim / birincil
const GOLD = '#FACC15';     // ücret

export interface DiscoveryFilters {
  format: string;
  budget: string;      // BUDGET_BUCKETS[].id
  duration: number | null;  // gerçek dakika (matches.duration_minutes)
  age: string;
  gender: string;
  role: string;        // 'KL' | 'SAV' | 'ORT' | 'HÜC'
  mentality: string;
  onlyOpen: boolean;   // yalnız boş kontenjanı olan maçlar
}

export const EMPTY_FILTERS: DiscoveryFilters = {
  format: '', budget: '', duration: null, age: '', gender: '', role: '', mentality: '', onlyOpen: false,
};

export function countActiveFilters(f: DiscoveryFilters): number {
  return [
    f.format, f.budget, f.duration !== null, f.age, f.gender, f.role, f.mentality, f.onlyOpen,
  ].filter(Boolean).length;
}

// ── Ortak parçalar ──────────────────────────────────────────────────────────

const Section: React.FC<{
  title: string;
  hint?: string;
  /** Seçenek yoksa bölüm hiç çizilmez — boş başlık kullanıcıyı yanıltır. */
  empty?: boolean;
  children: React.ReactNode;
}> = ({ title, hint, empty, children }) => {
  if (empty) return null;
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[0.625rem] font-extrabold uppercase tracking-[0.16em] text-white/55">{title}</h3>
        {hint && <span className="text-[0.625rem] font-bold text-white/50 truncate">{hint}</span>}
      </div>
      {children}
    </section>
  );
};

const Chip: React.FC<{
  active: boolean;
  onClick: () => void;
  color?: string;
  children: React.ReactNode;
}> = ({ active, onClick, color = ACCENT, children }) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className="min-h-[44px] px-4 rounded-xl border text-[0.6875rem] font-extrabold tracking-wide transition-all active:scale-[0.97] flex items-center justify-center gap-1.5"
    style={
      active
        ? { background: `${color}1A`, borderColor: `${color}80`, color, boxShadow: `0 0 18px ${color}26` }
        : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.82)' }
    }
  >
    {active && <Check size={13} className="shrink-0" />}
    {children}
  </button>
);

/** Sarmalayan seçenek ızgarası — çipler sıkışmaz, satır satır akar. */
const ChipRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex flex-wrap gap-2.5">{children}</div>
);

// ── Panel ───────────────────────────────────────────────────────────────────

interface Props {
  filters: DiscoveryFilters;
  setFilters: (next: DiscoveryFilters) => void;
  options: DiscoveryFilterOptions;
  onClose: () => void;
  onClear: () => void;
  /** Şu anki filtrelerle eşleşen maç sayısı (canlı). */
  resultCount: number;
  activeCount: number;
  searchRadius: number;
  setSearchRadius: (km: number) => void;
  selectedRegions: OynaLocation[];
  hasGps: boolean;
}

export const DiscoveryFilterSheet: React.FC<Props> = ({
  filters, setFilters, options, onClose, onClear, resultCount, activeCount,
  searchRadius, setSearchRadius, selectedRegions, hasGps,
}) => {
  const set = <K extends keyof DiscoveryFilters>(key: K, value: DiscoveryFilters[K]) =>
    setFilters({ ...filters, [key]: value });

  // Aynı değere tekrar basmak seçimi kaldırır ("Tümü"ne döner).
  const toggle = <K extends keyof DiscoveryFilters>(key: K, value: DiscoveryFilters[K], empty: DiscoveryFilters[K]) =>
    set(key, filters[key] === value ? empty : value);

  const merkez = selectedRegions.length > 0
    ? selectedRegions.map((r) => r.label).join(' · ')
    : hasGps ? 'Bulunduğun konum' : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -50, filter: 'blur(10px)' }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="absolute inset-0 z-50 flex flex-col h-full bg-[#0A0E14]"
    >
      {/* ÜST BAR */}
      <div className="px-5 pt-safe pb-4 flex items-center justify-between gap-3 shrink-0 border-b border-white/5 bg-black/20 backdrop-blur-lg">
        <button
          onClick={onClose}
          aria-label="Kapat"
          className="w-11 h-11 shrink-0 rounded-full bg-white/[0.03] backdrop-blur-md border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all"
        >
          <ArrowLeft size={18} className="text-white" />
        </button>
        <h1 className="flex-1 text-center text-[0.9375rem] font-extrabold italic uppercase tracking-tight text-white truncate">
          Filtreler
        </h1>
        <button
          onClick={onClear}
          disabled={activeCount === 0}
          className="min-w-[64px] h-11 px-3 rounded-full text-[0.625rem] font-extrabold uppercase tracking-widest transition-all disabled:opacity-30"
          style={activeCount > 0
            ? { background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#F87171' }
            : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
        >
          Temizle
        </button>
      </div>

      {/* İÇERİK */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-5 space-y-7">

        {/* ── ARAMA YARIÇAPI (Ayarlar'daki sistemin aynısı) ── */}
        <section className="rounded-2xl bg-[#161B22] border border-white/8 p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[0.625rem] font-extrabold uppercase tracking-[0.16em] text-white/55">Arama Yarıçapı</span>
            <span className="font-numeric text-sm font-extrabold" style={{ color: ACCENT }}>{searchRadius} KM</span>
          </div>
          <input
            type="range"
            min={5}
            max={50}
            step={5}
            value={searchRadius}
            aria-label="Arama yarıçapı (kilometre)"
            onChange={(e) => setSearchRadius(Number(e.target.value))}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-[#39FF14]"
            style={{
              background: `linear-gradient(to right, ${ACCENT} 0%, ${ACCENT} ${((searchRadius - 5) / 45) * 100}%, #0A0E14 ${((searchRadius - 5) / 45) * 100}%, #0A0E14 100%)`,
            }}
          />
          {merkez ? (
            <p className="flex items-start gap-1.5 text-[0.6875rem] text-white/60 leading-relaxed">
              <MapPin size={12} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
              <span>
                <span className="text-white/70 font-bold">{merkez}</span> merkezli{' '}
                <span className="text-white font-bold font-numeric">{searchRadius} KM</span> içindeki maçlar listelenir.
                Bu ayar Ayarlar ekranıyla ortaktır.
              </span>
            </p>
          ) : (
            <p className="text-[0.6875rem] text-white/60 leading-relaxed">
              Henüz bölge seçilmedi. Ayarlar → Konum bölümünden bölge seçince bu yarıçap devreye girer.
            </p>
          )}
        </section>

        {/* ── KONTENJAN ── */}
        <Section title="Kontenjan">
          <button
            type="button"
            aria-pressed={filters.onlyOpen}
            onClick={() => set('onlyOpen', !filters.onlyOpen)}
            className="w-full min-h-[52px] px-4 rounded-2xl border flex items-center justify-between gap-3 transition-all active:scale-[0.99]"
            style={filters.onlyOpen
              ? { background: `${ACCENT}14`, borderColor: `${ACCENT}66`, boxShadow: `0 0 18px ${ACCENT}1f` }
              : { background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.10)' }}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              <Users size={16} className="shrink-0" style={{ color: filters.onlyOpen ? ACCENT : 'rgba(255,255,255,0.45)' }} />
              <span className="text-[0.75rem] font-extrabold text-white truncate">Sadece yeri boş maçlar</span>
            </span>
            <span
              className="w-11 h-6 rounded-full shrink-0 relative transition-colors"
              style={{ background: filters.onlyOpen ? ACCENT : 'rgba(255,255,255,0.12)' }}
            >
              <span
                className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                style={{ left: filters.onlyOpen ? 'calc(100% - 22px)' : '2px' }}
              />
            </span>
          </button>
        </Section>

        {/* ── FORMAT ── */}
        <Section title="Takım Formatı" empty={options.formats.length === 0}>
          <ChipRow>
            {options.formats.map((f) => (
              <Chip key={f} active={filters.format === f} onClick={() => toggle('format', f, '')}>{f}</Chip>
            ))}
          </ChipRow>
        </Section>

        {/* ── MENTALİTE ── */}
        <Section title="Mentalite" empty={options.mentalities.length === 0}>
          <ChipRow>
            {options.mentalities.map((m) => (
              <Chip key={m} active={filters.mentality === m} onClick={() => toggle('mentality', m, '')}>
                {m.toLocaleUpperCase('tr-TR')}
              </Chip>
            ))}
          </ChipRow>
        </Section>

        {/* ── POZİSYON ── (Rahat maç pozisyonsuzdur) */}
        <Section
          title="Aranan Pozisyon"
          hint={filters.mentality === 'Rahat' ? 'Rahat maçta pozisyon yok' : undefined}
          empty={options.roles.length === 0}
        >
          <ChipRow>
            {options.roles.map((r) => (
              <Chip
                key={r}
                active={filters.role === r}
                onClick={() => filters.mentality !== 'Rahat' && toggle('role', r, '')}
              >
                <span style={filters.mentality === 'Rahat' ? { opacity: 0.35 } : undefined}>
                  {ROLE_LABEL_MAP[r] ?? r}
                </span>
              </Chip>
            ))}
          </ChipRow>
        </Section>

        {/* ── ÜCRET ── */}
        <Section title="Kişi Başı Ücret" empty={options.budgets.length === 0}>
          <ChipRow>
            {options.budgets.map((b) => (
              <Chip key={b.id} color={GOLD} active={filters.budget === b.id} onClick={() => toggle('budget', b.id, '')}>
                {b.label}
              </Chip>
            ))}
          </ChipRow>
        </Section>

        {/* ── SÜRE ── (gerçek dakika: matches.duration_minutes) */}
        <Section title="Maç Süresi" empty={options.durations.length === 0}>
          <ChipRow>
            {options.durations.map((d) => (
              <Chip key={d} active={filters.duration === d} onClick={() => toggle('duration', d, null)}>
                {/* Boşluk `gap-1.5`ten gelir — metne ikinci bir boşluk konmaz. */}
                <span className="font-numeric">{d}</span>dakika
              </Chip>
            ))}
          </ChipRow>
        </Section>

        {/* ── CİNSİYET ── */}
        <Section title="Cinsiyet" empty={options.genders.length === 0}>
          <ChipRow>
            {options.genders.map((g) => (
              <Chip key={g} active={filters.gender === g} onClick={() => toggle('gender', g, '')}>
                {g.toLocaleUpperCase('tr-TR')}
              </Chip>
            ))}
          </ChipRow>
        </Section>

        {/* ── YAŞ ── */}
        <Section title="Yaş Aralığı" empty={options.ageGroups.length === 0}>
          <ChipRow>
            {options.ageGroups.map((a) => (
              <Chip key={a} color={GOLD} active={filters.age === a} onClick={() => toggle('age', a, '')}>
                <span className="font-numeric">{a}</span>
              </Chip>
            ))}
          </ChipRow>
        </Section>

        {/* Hiç seçenek yoksa: filtreler listelenen maçlardan türetilir */}
        {options.formats.length === 0 && options.mentalities.length === 0 && options.budgets.length === 0 && (
          <p className="text-center text-[0.6875rem] font-bold text-white/55 leading-relaxed py-6">
            Bu yarıçapta listelenecek maç yok, bu yüzden seçilebilecek filtre de yok.
            Yarıçapı genişletmeyi dene.
          </p>
        )}
      </div>

      {/* ALT BUTON — alt menü barın altında kalmasın diye bar payı ayrılır
          (pb-safe-nav: index.css, cihazın güvenli alanı + bar yüksekliği). */}
      <div className="px-5 pb-safe-nav pt-3 shrink-0 bg-gradient-to-t from-black via-black/85 to-transparent">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onClose}
          className="w-full py-4 rounded-2xl text-on-primary font-extrabold uppercase tracking-[0.16em] text-xs"
          style={{ background: ACCENT, boxShadow: `0 0 28px ${ACCENT}4d` }}
        >
          {resultCount > 0 ? `${resultCount} MAÇI GÖSTER` : 'EŞLEŞEN MAÇ YOK'}
        </motion.button>
      </div>
    </motion.div>
  );
};

export default DiscoveryFilterSheet;
