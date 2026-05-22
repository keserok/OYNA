import { ITeam } from '../types';

export function calculateMatchSuitability(teamA: ITeam, teamB: ITeam): { suitable: boolean; score: number; reason?: string } {
  const winRateA = teamA.stats.wins / (teamA.stats.wins + teamA.stats.losses || 1);
  const winRateB = teamB.stats.wins / (teamB.stats.wins + teamB.stats.losses || 1);
  const winRateDiff = Math.abs(winRateA - winRateB);
  const fairPlayDiff = Math.abs(teamA.stats.fairPlayScore - teamB.stats.fairPlayScore);
  
  let score = 100;
  
  // Win rate difference penalty (max 50 points if diff is 1.0)
  score -= Math.min(50, winRateDiff * 50);
  
  // FairPlay difference penalty (max 50 points if diff is 100)
  score -= Math.min(50, (fairPlayDiff / 2));
  
  if (score < 40) {
    return { suitable: false, score, reason: 'Kazanma oranı veya FairPlay dengesizliği çok yüksek.' };
  }
  
  if (teamA.stats.fairPlayScore < 50 || teamB.stats.fairPlayScore < 50) {
    return { suitable: false, score, reason: 'Takımlardan birinin FairPlay puanı çok düşük.' };
  }
  
  return { suitable: true, score };
}
