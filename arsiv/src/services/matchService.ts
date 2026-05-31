export interface Match {
  id?: string;
  pitchId: string;
  pitchName: string;
  captainId: string;
  captainName: string;
  date: string;
  time: string;
  status: 'OPEN' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  gkId?: string;
  refId?: string;
  applicants?: Array<{
    uid: string;
    displayName: string;
    role: 'GOALKEEPER' | 'REFEREE';
    photoURL?: string;
    status: 'PENDING' | 'REJECTED';
  }>;
  createdAt?: any;
}

// ============================================================================
// 1. OYUNCU (KAPTAN) UYGULAMASI FONKSİYONLARI
// ============================================================================

/**
 * Oyuncu uygulaması bir maç oluşturduğunda çalışır.
 * Mock implementation.
 */
export const createMatch = async (matchData: Omit<Match, 'id' | 'createdAt' | 'status' | 'applicants'>) => {
  console.log("Mock: Maç oluşturuldu", matchData);
  return `mock-match-${Date.now()}`;
};

/**
 * Kaptan, kendisine başvuran bir kaleciyi veya hakemi onayladığında çalışır.
 */
export const approveApplicant = async (matchId: string, applicantUid: string, role: 'GOALKEEPER' | 'REFEREE') => {
  console.log("Mock: Başvuru onaylandı", matchId, applicantUid, role);
};


// ============================================================================
// 2. KALECİ / HAKEM UYGULAMASI FONKSİYONLARI
// ============================================================================

/**
 * Kaleci veya Hakem bir maça başvurmak istediğinde çalışır.
 */
export const applyToMatch = async (matchId: string, user: { uid: string, displayName: string, role: 'GOALKEEPER' | 'REFEREE', photoURL?: string }) => {
  console.log("Mock: Maça başvuru yapıldı", matchId, user);
};

/**
 * Kaleci ve Hakemlerin "Açık Maçları" canlı olarak görmesini sağlar.
 */
export const subscribeToOpenMatches = (callback: (matches: Match[]) => void) => {
  console.log("Mock: Subscribed to open matches");
  
  // Return empty array for now
  callback([]);

  // Return a no-op unsubscribe function
  return () => {
    console.log("Mock: Unsubscribed from open matches");
  };
};
