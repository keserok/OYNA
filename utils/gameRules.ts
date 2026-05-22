/**
 * ⚽ OYNA Ecosphere - Core Game & Reliability Logic
 * Robust B2B SaaS calculations for cancellation penalties, auto-cancellation rules,
 * and player ban system.
 */

import { MatchListing } from '../types';

/**
 * Checks if a match should be automatically cancelled under the 90-minute auto-cancel rule.
 * Triggered if the match kickoff is within 90 minutes and there aren't enough players.
 *
 * @param match The MatchListing instance to evaluate
 * @returns boolean True if the match meets the criteria for automatic cancellation
 */
export function check90MinAutoCancel(match: MatchListing): boolean {
  if (match.status === 'CANCELLED') return false;

  const now = new Date();
  const [dayPart, monthPart] = match.date.split(' '); // e.g. "26 Mart" or "Bugün"
  let matchDate = new Date();

  if (dayPart === 'Bugün') {
    // Keep today's date
  } else if (dayPart === 'Yarın') {
    matchDate.setDate(matchDate.getDate() + 1);
  } else {
    // Parse standard date
    const months: Record<string, number> = {
      'Ocak': 0, 'Şubat': 1, 'Mart': 2, 'Nisan': 3, 'Mayıs': 4, 'Haziran': 5,
      'Temmuz': 6, 'Ağustos': 7, 'Eylül': 8, 'Ekim': 9, 'Kasım': 10, 'Aralık': 11
    };
    const day = parseInt(dayPart);
    const month = months[monthPart] ?? now.getMonth();
    matchDate.setMonth(month);
    matchDate.setDate(day);
  }

  // Parse time "20:00 - 21:00" -> "20:00"
  const startTimeStr = match.time.split('-')[0].trim();
  const [hours, minutes] = startTimeStr.split(':').map(Number);
  matchDate.setHours(hours, minutes, 0, 0);

  const diffMs = matchDate.getTime() - now.getTime();
  const diffMinutes = diffMs / (1000 * 60);

  // If match kickoff is in less than 90 minutes
  if (diffMinutes > 0 && diffMinutes <= 90) {
    // Calculate filled slots
    const totalSlots = match.slots?.length || 14;
    const filledSlots = match.slots?.filter(s => s.status === 'TAKEN').length || 0;
    
    // Auto-cancel if lobby is less than 70% full (e.g. less than 10 players for a 14 player match)
    if (filledSlots < Math.ceil(totalSlots * 0.7)) {
      return true;
    }
  }

  return false;
}

/**
 * Calculates penalty and determines if a ban is triggered when a user cancels their registration.
 * "Maçı son 3 saat içinde iptal eden kullanıcıların güvenilirlik skor yüzde 10 azalsın 
 * ve yüzde 70 e gelince bir hafta maçlara katılınamayacak."
 *
 * @param kickoffTime The scheduled match kickoff time
 * @param currentScore The user's current reliability score (out of 100)
 * @returns Object with penalty percentage, new score, and whether a ban is triggered
 */
export function processCancellationPenalty(
  kickoffTime: Date,
  currentScore: number = 100
): { penaltyAmount: number; newScore: number; isBanned: boolean; banUntil: Date | null } {
  const now = new Date();
  const diffMs = kickoffTime.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  let penaltyAmount = 0;

  // If match is cancelled in the final 3 hours prior to kickoff
  if (diffHours >= 0 && diffHours <= 3) {
    penaltyAmount = 10; // Decrease reliability score by 10 points (10%)
  }

  const newScore = Math.max(0, currentScore - penaltyAmount);
  const isBanned = newScore <= 70;
  
  let banUntil: Date | null = null;
  if (isBanned) {
    // Ban expires in exactly 1 week
    banUntil = new Date();
    banUntil.setDate(banUntil.getDate() + 7);
  }

  return {
    penaltyAmount,
    newScore,
    isBanned,
    banUntil
  };
}
