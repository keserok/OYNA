/**
 * ⚡ OYNA Geolocation & Proximity Search Utilities
 * 
 * Provides mathematically precise Geohash encoding, neighbor calculation,
 * and Haversine distance tracking to support offline/online proximity search in Firestore.
 */

// Base32 Alphabet for Geohashing (excluding 'a', 'i', 'l', 'o' to prevent confusion)
const BASE32_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';
const BASE32_MAP: { [key: string]: number } = {};
for (let i = 0; i < BASE32_ALPHABET.length; i++) {
  BASE32_MAP[BASE32_ALPHABET[i]] = i;
}

// Direction offsets for calculating neighbor geohashes
const NEIGHBORS: { [key: string]: { [key: string]: string } } = {
  right: { even: 'bc01fg452367nopq89destuvwxyrkmjw', odd: 'p0r21436x8zb9dcf5h7kjg98esutwvyq' },
  left: { even: '238967klmnpqrstuvwxy0145hjbcdeft', odd: '14365h7k9dcfesutwvyq0r21436x8zb9' },
  top: { even: 'p0r21436x8zb9dcf5h7kjg98esutwvyq', odd: 'bc01fg452367nopq89destuvwxyrkmjw' },
  bottom: { even: '14365h7k9dcfesutwvyq0r21436x8zb9', odd: '238967klmnpqrstuvwxy0145hjbcdeft' }
};

const BORDERS: { [key: string]: { [key: string]: string } } = {
  right: { even: 'bcfguvyz', odd: 'prxz' },
  left: { even: '0145hjnp', odd: '028b' },
  top: { even: 'prxz', odd: 'bcfguvyz' },
  bottom: { even: '028b', odd: '0145hjnp' }
};

/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the mathematically precise Haversine formula.
 * 
 * @param lat1 Latitude of point 1
 * @param lng1 Longitude of point 1
 * @param lat2 Latitude of point 2
 * @param lng2 Longitude of point 2
 * @returns Distance in kilometers
 */
export function getHaversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Encodes a latitude and longitude coordinate into a Geohash string.
 * 
 * @param lat Latitude (-90 to 90)
 * @param lng Longitude (-180 to 180)
 * @param precision Length of geohash string (default 9, approx 4.7m x 4.7m)
 * @returns Geohash string
 */
export function encodeGeohash(lat: number, lng: number, precision: number = 9): string {
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;

  let geohash = '';
  let bit = 0;
  let ch = 0;
  let isEven = true;

  while (geohash.length < precision) {
    if (isEven) {
      const mid = (minLng + maxLng) / 2;
      if (lng > mid) {
        ch |= 1 << (4 - bit);
        minLng = mid;
      } else {
        maxLng = mid;
      }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat > mid) {
        ch |= 1 << (4 - bit);
        minLat = mid;
      } else {
        maxLat = mid;
      }
    }

    isEven = !isEven;
    if (bit < 4) {
      bit++;
    } else {
      geohash += BASE32_ALPHABET[ch];
      bit = 0;
      ch = 0;
    }
  }

  return geohash;
}

/**
 * Computes the neighbor of a geohash in a specific cardinal direction.
 * Necessary for searching edge boundaries to prevent grid blindspots.
 */
export function getGeohashNeighbor(hash: string, direction: 'right' | 'left' | 'top' | 'bottom'): string {
  if (!hash) return '';
  const lastCh = hash[hash.length - 1];
  const type = hash.length % 2 === 0 ? 'even' : 'odd';
  let parent = hash.substring(0, hash.length - 1);

  if (BORDERS[direction][type].indexOf(lastCh) !== -1 && parent !== '') {
    parent = getGeohashNeighbor(parent, direction);
  }

  const index = NEIGHBORS[direction][type].indexOf(lastCh);
  return parent + BASE32_ALPHABET[index];
}

/**
 * Returns the geohash of the center plus all 8 surrounding grids (9 hashes in total)
 * at a given precision level. This ensures 100% boundary proof queries.
 * 
 * @param centerHash Center point geohash
 * @returns Array of 9 geohash grids
 */
export function getSurroundingGeohashes(centerHash: string): string[] {
  const n = getGeohashNeighbor(centerHash, 'top');
  const s = getGeohashNeighbor(centerHash, 'bottom');
  
  return [
    centerHash,
    n,
    getGeohashNeighbor(centerHash, 'right'),
    getGeohashNeighbor(centerHash, 'left'),
    s,
    getGeohashNeighbor(n, 'right'),
    getGeohashNeighbor(n, 'left'),
    getGeohashNeighbor(s, 'right'),
    getGeohashNeighbor(s, 'left')
  ];
}

/**
 * Calculates geohash search boundaries (start/end) for Firestore prefix matching.
 * E.g., for query: orderBy('geohash').startAt(hash).endAt(hash + '\uf8ff')
 * 
 * @param centerLat Latitude
 * @param centerLng Longitude
 * @param radiusInKm Radius in km (e.g. 5)
 * @returns Array of prefix query bounds [{ start, end }]
 */
export function getProximityQueryBounds(centerLat: number, centerLng: number, radiusInKm: number): { start: string; end: string }[] {
  // Determine geohash precision based on search radius
  // Radius < 1.2km -> Precision 6 (~1.22km grid)
  // Radius < 4.9km -> Precision 5 (~4.89km grid)
  // Radius >= 4.9km -> Precision 4 (~39.1km grid)
  let precision = 4;
  if (radiusInKm < 1.2) {
    precision = 6;
  } else if (radiusInKm < 4.9) {
    precision = 5;
  }

  const centerHash = encodeGeohash(centerLat, centerLng, precision);
  const surrounding = getSurroundingGeohashes(centerHash);

  // Map each surrounding grid to start and end bounds
  return surrounding.map(hash => ({
    start: hash,
    end: hash + '\uf8ff' // \uf8ff is a high private-use Unicode character acting as an upper-bound wildcard
  }));
}
