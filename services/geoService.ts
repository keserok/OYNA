/**
 * ⚡ OYNA Geolocation Query Service
 * 
 * Implements real-time proximity searches for Pitches, Goalkeepers, and Referees
 * using Geohash bounding boxes, parallel promise querying, deduplication,
 * and exact Haversine distance client-side filtering.
 */

import { collection, query, orderBy, startAt, endAt, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getProximityQueryBounds, getHaversineDistance } from '../utils/geo';
import { Pitch, Goalkeeper, Referee } from '../types';

/**
 * Helper to execute parallel queries for a collection across all 9 surrounding geohash grids
 */
async function queryProximityCollection(
  collectionName: string,
  centerLat: number,
  centerLng: number,
  radiusInKm: number
): Promise<any[]> {
  const bounds = getProximityQueryBounds(centerLat, centerLng, radiusInKm);
  const collRef = collection(db, collectionName);
  const promises = [];

  // 1. Fire parallel Firestore range queries for all 9 surrounding geohash blocks
  for (const b of bounds) {
    const q = query(
      collRef,
      orderBy('geohash'),
      startAt(b.start),
      endAt(b.end)
    );
    promises.push(getDocs(q));
  }

  // 2. Resolve all queries in parallel
  const snapshots = await Promise.all(promises);
  const resultsMap = new Map<string, any>();

  // 3. Deduplicate overlapping boundaries
  for (const snap of snapshots) {
    for (const d of snap.docs) {
      resultsMap.set(d.id, { id: d.id, ...d.data() });
    }
  }

  // 4. Filter exact distance using Haversine formula & Sort by closest distance
  const results = Array.from(resultsMap.values())
    .map(doc => {
      const distance = doc.coordinates
        ? getHaversineDistance(centerLat, centerLng, doc.coordinates.lat, doc.coordinates.lng)
        : null;
      return { ...doc, distanceKm: distance };
    })
    .filter(doc => doc.distanceKm !== null && doc.distanceKm <= radiusInKm);

  // Sort: closest first
  results.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  return results;
}

/**
 * Fetches all approved Pitches within a given radius of a coordinate
 */
export async function getPitchesWithinRadius(
  centerLat: number,
  centerLng: number,
  radiusInKm: number = 10
): Promise<Pitch[]> {
  try {
    const pitches = await queryProximityCollection('pitches', centerLat, centerLng, radiusInKm);
    // Return only approved pitches, map distance to descriptive text if needed
    return pitches
      .filter(p => p.isApproved !== false)
      .map(p => ({
        ...p,
        distance: p.distanceKm ? `${p.distanceKm.toFixed(1)} km` : p.distance
      })) as Pitch[];
  } catch (error) {
    console.error("Error fetching pitches by radius:", error);
    return [];
  }
}

/**
 * Fetches all Goalkeepers within a given radius of a coordinate
 */
export async function getGoalkeepersWithinRadius(
  centerLat: number,
  centerLng: number,
  radiusInKm: number = 15
): Promise<Goalkeeper[]> {
  try {
    const gks = await queryProximityCollection('goalkeepers', centerLat, centerLng, radiusInKm);
    return gks as Goalkeeper[];
  } catch (error) {
    console.error("Error fetching goalkeepers by radius:", error);
    return [];
  }
}

/**
 * Fetches all Referees within a given radius of a coordinate
 */
export async function getRefereesWithinRadius(
  centerLat: number,
  centerLng: number,
  radiusInKm: number = 15
): Promise<Referee[]> {
  try {
    const refs = await queryProximityCollection('referees', centerLat, centerLng, radiusInKm);
    return refs as Referee[];
  } catch (error) {
    console.error("Error fetching referees by radius:", error);
    return [];
  }
}
