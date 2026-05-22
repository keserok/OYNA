/**
 * OYNA REPUTATION & GAMIFICATION ENGINE (MANTIK 2)
 * Bu motor, Opanel ve OYNA mobil uygulaması arasındaki "Çift Yönlü Gerçek Zamanlı Yayılım" 
 * stratejisinin merkezidir. Oyuncuların Elmas değerleri ve takımların Karat skorları bu matematiksel 
 * sınırlara tabidir.
 */

/**
 * Bireysel Oyuncu ELMAS (💎) değerini eksponansiyel büyüme formülüyle hesaplar.
 * Formül: ELMAS = (Wins)² * (Wins / Total Matches) * 1000
 * 
 * Doğrulama: 20 Maç, 10 Galibiyet = (10)² * (0.5) * 1000 = 50.000 ELMAS
 * 
 * @param wins - Oyuncunun kazandığı toplam maç sayısı
 * @param totalMatches - Oyuncunun oynadığı toplam maç sayısı
 * @param flatModifier - Opanel üzerinden adminlerin bastığı (override) manuel etki katsayısı
 * @returns Hesaplanmış net ELMAS değeri
 */
export const calculateElmas = (wins: number, totalMatches: number, flatModifier: number = 0): number => {
  if (totalMatches === 0 || wins === 0) return 0 + flatModifier;
  
  const winRate = wins / totalMatches;
  // Eksponansiyel büyüme formülü
  let elmas = Math.pow(wins, 2) * winRate * 1000;
  
  // Opanel'den gelen olası manuel artırma/azaltma işlemlerini ekle
  let finalElmas = Math.round(elmas) + flatModifier;
  
  // Değerin 0'ın altına inmesini engelle
  return Math.max(0, finalElmas);
};

/**
 * Makro Takım KARAT (KT) skorunu hesaplar.
 * Formül: KARAT = (Kadro Ortalaması ELMAS) * (Takımın Kazanma Oranı)
 * 
 * @param rosterElmasScores - Takımdaki aktif oyuncuların Elmas değerleri dizisi
 * @param teamWins - Takımın OYNA platformunda kazandığı maç sayısı
 * @param teamTotalMatches - Takımın OYNA platformunda oynadığı toplam maç sayısı
 * @returns Hesaplanmış net KARAT değeri
 */
export const calculateTeamKarat = (rosterElmasScores: number[], teamWins: number, teamTotalMatches: number): number => {
  if (teamTotalMatches === 0 || rosterElmasScores.length === 0) return 0;
  
  // Toplam elmasın kadro sayısına bölünmesi (Ortalama Elmas)
  const totalElmas = rosterElmasScores.reduce((sum, score) => sum + score, 0);
  const averageElmas = totalElmas / rosterElmasScores.length;
  
  // Takımın kazanma oranı (Win Rate)
  const teamWinRate = teamWins / teamTotalMatches;
  
  // Karat formülü
  const karat = averageElmas * teamWinRate;
  
  return Math.round(karat);
};
