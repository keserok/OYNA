import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DashboardHome } from '../../../hooks/useDashboardHome';

// ════════════════════════════════════════════════════════════════════════════
// ANA SAYFA — YEDİ MODUN HER BİRİ AYRI AYRI
// ════════════════════════════════════════════════════════════════════════════
//
// Kaynak tasarım: "OYNA — Ana Sayfa · yedi mod" (390×844).
// Kullanıcı kararı: "Her durum için farklı ekranlar geçerli olmalı… zamanı
// geldiğinde her ekranın ve butonun geçerli olmasını sağla."
//
// NEDEN BU TEST: Yedi mod TEK bir kancadan (useDashboardHome) sürülüyor. Ekran
// hangi modu çizeceğine o kancadan dönen alanlara bakarak karar veriyor. Bu
// karar tablosu sessizce bozulabilir — ör. bir koşula `!loading` eklenince
// başka bir mod hiç görünmez olur (bu oturumda tam olarak bu oldu: aşağı çekme
// göstergesi `!loading` kapısının arkasında kalmıştı).
//
// Burada kancayı taklit edip YEDİ durumu tek tek kuruyoruz ve her modun kendi
// AYIRT EDİCİ işaretini arıyoruz. Gerçek veriyle değil, durumla ilgileniyoruz.

// ── Kanca taklidi: her test kendi durumunu yazar ────────────────────────────
const durum: { v: DashboardHome } = { v: null as unknown as DashboardHome };
vi.mock('../../../hooks/useDashboardHome', () => ({
  useDashboardHome: () => durum.v,
  STALE_AFTER_MS: 600000,
}));

// Aşağı çekme jesti gerçek dokunma ister; birim testinde kapalı tutulur
// (kendi görsel testi var: tests/visual/asagiCekYenile.visual.spec.ts).
vi.mock('../../../hooks/useAsagiCekYenile', () => ({
  useAsagiCekYenile: () => false,
}));

vi.mock('../../../assets/profile/profile-ambient.png', () => ({ default: 'ambient.png' }));

import Dashboard from '../../../views/Dashboard';
import { useAppStore } from '../../../store';

/** Kancanın varsayılan (normal · veri var) hâli. */
const TEMEL: DashboardHome = {
  profile: {
    id: 'u1', name: 'Emre Kaya', avatarUrl: null, position: 'Orta Saha',
    age: 24, teamName: 'Boztepe SK', teamId: 't1',
  } as unknown as DashboardHome['profile'],
  balance: 340,
  strip: [],
  matchTotal: 6,
  pitches: 12,
  goalkeepers: 4,
  referees: 3,
  banner: null,
  loading: false,
  refreshing: false,
  error: false,
  offline: false,
  updatedAt: Date.now(),
  hasScope: true,
  refresh: () => {},
};

/** Yalnız düğmenin kendisi — açıklama cümlesindeki "tekrar dene…" sayılmaz. */
const TEKRAR_DENE = /^TEKRAR DENE$/;

const kur = (over: Partial<DashboardHome> = {}) => {
  durum.v = { ...TEMEL, ...over };
  return render(
    <Dashboard
      onNavigate={() => {}}
      onSelectMatch={() => {}}
      onOpenNotifications={() => {}}
    />,
  );
};

beforeEach(() => {
  // Ana sayfa `useMyMatches` üzerinden store'daki maç listesini de okur;
  // tanımsız bırakılırsa bileşen render edilemez.
  useAppStore.setState({
    userLocation: { lat: 40.98, lng: 37.87 },
    selectedRegions: [],
    adminMatches: [],
    myMatches: [],
    adminUsers: [],
    unreadNotificationsCount: 0,
  } as never);
});

describe('Ana sayfa — yedi mod', () => {
  it('M1 · Normal: sayılar ve bakiye görünür', () => {
    kur();
    expect(screen.getByText(/ANA SAYFA/i)).toBeTruthy();
    // Kapı kartları (Maç Bul / Saha Kirala / Maç Kur) her modda durmalı.
    expect(screen.getByText(/TOP OYNA/i)).toBeTruthy();
  });

  it('M2 · Maçı yok: "maç yok" hâli çizilir, kapılar KAPANMAZ', () => {
    kur({ strip: [], matchTotal: 0 });
    // En kritik kural: maç olmaması kapıları kapatmaz — kullanıcı yine
    // maç kurabilmeli, saha kiralayabilmeli.
    expect(screen.getByText(/TOP OYNA/i)).toBeTruthy();
    expect(screen.getByText(/SAHA KİRALA/i)).toBeTruthy();
    // Kahraman kartın alt satırı sayılı kalır; "maç yok" cümlesi ŞERİT
    // başlığında bir kez söylenir — ekran kendini tekrar etmez.
    expect(screen.getByText('0 maç · bugün ve yarın')).toBeTruthy();
    expect(screen.getByText(/BUGÜN YAKININDA MAÇ YOK/)).toBeTruthy();
  });

  it('M2b · Bölge seçilmemiş: "BU HAFTA" yerine "KONUMU AYARLA" çıkar', () => {
    // Kullanıcı kararı: bölge yokken "BU HAFTA" kullanıcıyı boş bir listeye
    // götürüyordu. Yerine eksik olanı tamamlayan düğme konuldu.
    kur({ strip: [], matchTotal: null, hasScope: false });
    expect(screen.getByText(/ÖNCE BÖLGENİ SEÇ/)).toBeTruthy();
    expect(screen.getByLabelText('Konumu ayarla')).toBeTruthy();
    expect(screen.queryByLabelText('Bu haftanın maçları')).toBeNull();
    // Maç kurma yolu kapanmaz — boş hâlin düğmesi de, kapı kartı da durur.
    // ("MAÇ KUR" yazısı ekranda İKİ yerde geçer; erişilebilir ad ayırt eder.)
    expect(screen.getAllByLabelText(/Maç Kur/i).length).toBeGreaterThanOrEqual(2);
  });

  it('M2c · Bölge seçili ama maç yok: MAÇ KUR ve BU HAFTA birlikte çalışır', () => {
    kur({ strip: [], matchTotal: 0, hasScope: true });
    expect(screen.getAllByLabelText(/Maç Kur/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByLabelText('Bu haftanın maçları')).toBeTruthy();
    expect(screen.queryByLabelText('Konumu ayarla')).toBeNull();
  });

  it('M3 · Yeni kullanıcı: profil boşken ekran yine çizilir', () => {
    kur({
      profile: { id: 'u1', name: 'Arda', avatarUrl: null } as unknown as DashboardHome['profile'],
      balance: 0, strip: [], matchTotal: 6,
    });
    expect(screen.getByText(/ANA SAYFA/i)).toBeTruthy();
    expect(screen.getByText(/TOP OYNA/i)).toBeTruthy();
  });

  it('M4 · Yükleniyor: iskelet döner, HATA gösterilmez', () => {
    kur({ loading: true, balance: null, matchTotal: null, pitches: null });
    expect(screen.queryByText(/YÜKLENEMEDİ/i)).toBeNull();
    expect(screen.queryByText(/İnternet yok/i)).toBeNull();
  });

  it('M5 · Hata: uyarı + TEKRAR DENE çıkar, kapılar TIKLANABİLİR kalır', () => {
    kur({ error: true, matchTotal: null, pitches: null, balance: null });
    // TAM eşleşme aranıyor: açıklama cümlesi "…birazdan tekrar
    // deneyebilirsin" de içinde "tekrar dene" geçiriyor; gevşek arama iki
    // sonuç bulup testi yanlış yere düşürüyordu.
    expect(screen.getByText(TEKRAR_DENE)).toBeTruthy();
    // Tasarımda hata TEK düğmeyle konuşur — üstte ikinci bir uyarı kutusu yok.
    expect(screen.queryAllByText(TEKRAR_DENE)).toHaveLength(1);
    // Hata, kartların alt satırlarında da okunur.
    expect(screen.getByText(/Maçlar yüklenemedi/i)).toBeTruthy();
    expect(screen.getByText(/Sahalar yüklenemedi · haritada gör/i)).toBeTruthy();
    // Tasarım kararı: sayı gelmedi diye kapılar kapanmaz.
    expect(screen.getByText(/TOP OYNA/i)).toBeTruthy();
    expect(screen.getByText(/SAHA KİRALA/i)).toBeTruthy();
  });

  it('M6 · Çevrimdışı: HATA DEĞİL — önbellek içeriği durur', () => {
    kur({ offline: true });
    // Çevrimdışı bir hata değildir: "TEKRAR DENE" çıkmamalı, içerik kalmalı.
    expect(screen.queryByText(TEKRAR_DENE)).toBeNull();
    expect(screen.getByText(/TOP OYNA/i)).toBeTruthy();
  });

  it('M6b · Çevrimdışı + hata birlikteyse yalnız ÇEVRİMDIŞI konuşur', () => {
    // İkisi aynı anda çizilirse kullanıcı iki farklı şey okur ve hangisine
    // inanacağını bilemez. Çevrimdışı daha üst gerçektir.
    kur({ offline: true, error: true });
    expect(screen.queryByText(TEKRAR_DENE)).toBeNull();
  });

  it('M7 · Yenileniyor: şerit açılır, içerik YERİNDE kalır', () => {
    kur({ refreshing: true });
    expect(screen.getByText(/YENİLENİYOR/i)).toBeTruthy();
    // İçerik kaybolmamalı — yenileme sırasında ekran boşalmaz.
    expect(screen.getByText(/TOP OYNA/i)).toBeTruthy();
  });

  it('M7b · İlk yüklemede "yenileniyor" şeridi çizilmez (iskeletle çakışmasın)', () => {
    kur({ refreshing: true, loading: true });
    expect(screen.queryByText(/YENİLENİYOR/i)).toBeNull();
  });
});
