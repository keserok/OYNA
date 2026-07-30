/** Supabase snake_case satırlarını UI camelCase'e çevirir */
export function mapDbRowToCamel<T extends Record<string, unknown>>(obj: Record<string, unknown>): T {
  const mapped: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    let newKey = key;
    if (key === 'working_hours') newKey = 'workingHours';
    else if (key === 'is_available') newKey = 'isAvailable';
    else if (key === 'match_count') newKey = 'matchCount';
    else if (key === 'recent_awards') newKey = 'recentAwards';
    else if (key === 'preferred_zones') newKey = 'preferredZones';
    else if (key === 'is_elite') newKey = 'isElite';
    else if (key === 'auth_uid') newKey = 'authUid';
    else if (key === 'price_per_person') newKey = 'pricePerPerson';
    else if (key === 'total_price') newKey = 'totalPrice';
    else if (key === 'google_rating') newKey = 'googleRating';
    else if (key === 'google_reviews') newKey = 'googleReviews';
    else if (key === 'owner_id') newKey = 'ownerId';
    mapped[newKey] = obj[key];
  }
  return mapped as T;
}
