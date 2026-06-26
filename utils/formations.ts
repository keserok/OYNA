// Tek kanonik formasyon kaynağı (SSOT).
// Harita, maç, stüdyo ve taktik tahtası hepsi buradan içe aktarır.

export type SquadSize = '2v2' | '3v3' | '4v4' | '5v5' | '6v6' | '7v7' | '8v8' | '9v9' | '10v10' | '11v11';

export interface FormationSlot {
  id: string;
  x: number; // Saha genişliği yüzdesi (0–100)
  y: number; // Saha derinliği yüzdesi (0–100)
  role: 'GK' | 'DEF' | 'MID' | 'FWD';
}

export const SQUAD_SIZES: SquadSize[] = ['2v2', '3v3', '4v4', '5v5', '6v6', '7v7', '8v8', '9v9', '10v10', '11v11'];

export const FORMATIONS: Record<SquadSize, Record<string, FormationSlot[]>> = {
  '2v2': {
    '1-0-1': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 50, y: 25, role: 'FWD' },
    ],
  },
  '3v3': {
    '1-1-1': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 50, y: 60, role: 'MID' },
      { id: 's3', x: 50, y: 25, role: 'FWD' },
    ],
    '2-0-1': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 30, y: 55, role: 'DEF' },
      { id: 's3', x: 70, y: 55, role: 'DEF' },
    ],
  },
  '4v4': {
    '1-1-1': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 50, y: 70, role: 'DEF' },
      { id: 's3', x: 50, y: 45, role: 'MID' },
      { id: 's4', x: 50, y: 20, role: 'FWD' },
    ],
    '2-1-0': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 30, y: 70, role: 'DEF' },
      { id: 's3', x: 70, y: 70, role: 'DEF' },
      { id: 's4', x: 50, y: 35, role: 'MID' },
    ],
  },
  '5v5': {
    '1-2-1': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 50, y: 75, role: 'DEF' },
      { id: 's3', x: 25, y: 50, role: 'MID' },
      { id: 's4', x: 75, y: 50, role: 'MID' },
      { id: 's5', x: 50, y: 25, role: 'FWD' },
    ],
    '2-1-1': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 30, y: 75, role: 'DEF' },
      { id: 's3', x: 70, y: 75, role: 'DEF' },
      { id: 's4', x: 50, y: 50, role: 'MID' },
      { id: 's5', x: 50, y: 25, role: 'FWD' },
    ],
  },
  '6v6': {
    '2-2-1': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 30, y: 75, role: 'DEF' },
      { id: 's3', x: 70, y: 75, role: 'DEF' },
      { id: 's4', x: 30, y: 50, role: 'MID' },
      { id: 's5', x: 70, y: 50, role: 'MID' },
      { id: 's6', x: 50, y: 25, role: 'FWD' },
    ],
    '3-1-1': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 20, y: 75, role: 'DEF' },
      { id: 's3', x: 50, y: 75, role: 'DEF' },
      { id: 's4', x: 80, y: 75, role: 'DEF' },
      { id: 's5', x: 50, y: 50, role: 'MID' },
      { id: 's6', x: 50, y: 25, role: 'FWD' },
    ],
  },
  '7v7': {
    '2-3-1': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 25, y: 75, role: 'DEF' },
      { id: 's3', x: 75, y: 75, role: 'DEF' },
      { id: 's4', x: 20, y: 50, role: 'MID' },
      { id: 's5', x: 50, y: 50, role: 'MID' },
      { id: 's6', x: 80, y: 50, role: 'MID' },
      { id: 's7', x: 50, y: 25, role: 'FWD' },
    ],
    '3-2-1': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 20, y: 75, role: 'DEF' },
      { id: 's3', x: 50, y: 75, role: 'DEF' },
      { id: 's4', x: 80, y: 75, role: 'DEF' },
      { id: 's5', x: 35, y: 50, role: 'MID' },
      { id: 's6', x: 65, y: 50, role: 'MID' },
      { id: 's7', x: 50, y: 25, role: 'FWD' },
    ],
    '2-2-2': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 30, y: 75, role: 'DEF' },
      { id: 's3', x: 70, y: 75, role: 'DEF' },
      { id: 's4', x: 30, y: 50, role: 'MID' },
      { id: 's5', x: 70, y: 50, role: 'MID' },
      { id: 's6', x: 35, y: 25, role: 'FWD' },
      { id: 's7', x: 65, y: 25, role: 'FWD' },
    ],
    '1-3-2': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 50, y: 72, role: 'DEF' },
      { id: 's3', x: 20, y: 48, role: 'MID' },
      { id: 's4', x: 50, y: 48, role: 'MID' },
      { id: 's5', x: 80, y: 48, role: 'MID' },
      { id: 's6', x: 35, y: 25, role: 'FWD' },
      { id: 's7', x: 65, y: 25, role: 'FWD' },
    ],
  },
  '8v8': {
    '3-3-1': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 20, y: 75, role: 'DEF' },
      { id: 's3', x: 50, y: 75, role: 'DEF' },
      { id: 's4', x: 80, y: 75, role: 'DEF' },
      { id: 's5', x: 20, y: 50, role: 'MID' },
      { id: 's6', x: 50, y: 50, role: 'MID' },
      { id: 's7', x: 80, y: 50, role: 'MID' },
      { id: 's8', x: 50, y: 25, role: 'FWD' },
    ],
    '4-2-1': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 20, y: 75, role: 'DEF' },
      { id: 's3', x: 40, y: 75, role: 'DEF' },
      { id: 's4', x: 60, y: 75, role: 'DEF' },
      { id: 's5', x: 80, y: 75, role: 'DEF' },
      { id: 's6', x: 35, y: 50, role: 'MID' },
      { id: 's7', x: 65, y: 50, role: 'MID' },
      { id: 's8', x: 50, y: 25, role: 'FWD' },
    ],
  },
  '9v9': {
    '3-3-2': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 20, y: 75, role: 'DEF' },
      { id: 's3', x: 50, y: 75, role: 'DEF' },
      { id: 's4', x: 80, y: 75, role: 'DEF' },
      { id: 's5', x: 20, y: 50, role: 'MID' },
      { id: 's6', x: 50, y: 50, role: 'MID' },
      { id: 's7', x: 80, y: 50, role: 'MID' },
      { id: 's8', x: 35, y: 25, role: 'FWD' },
      { id: 's9', x: 65, y: 25, role: 'FWD' },
    ],
    '4-3-1': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 20, y: 75, role: 'DEF' },
      { id: 's3', x: 40, y: 75, role: 'DEF' },
      { id: 's4', x: 60, y: 75, role: 'DEF' },
      { id: 's5', x: 80, y: 75, role: 'DEF' },
      { id: 's6', x: 20, y: 50, role: 'MID' },
      { id: 's7', x: 50, y: 50, role: 'MID' },
      { id: 's8', x: 80, y: 50, role: 'MID' },
      { id: 's9', x: 50, y: 25, role: 'FWD' },
    ],
  },
  '10v10': {
    '4-3-2': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 20, y: 75, role: 'DEF' },
      { id: 's3', x: 40, y: 75, role: 'DEF' },
      { id: 's4', x: 60, y: 75, role: 'DEF' },
      { id: 's5', x: 80, y: 75, role: 'DEF' },
      { id: 's6', x: 20, y: 50, role: 'MID' },
      { id: 's7', x: 50, y: 50, role: 'MID' },
      { id: 's8', x: 80, y: 50, role: 'MID' },
      { id: 's9', x: 35, y: 25, role: 'FWD' },
      { id: 's10', x: 65, y: 25, role: 'FWD' },
    ],
    '4-4-1': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 20, y: 75, role: 'DEF' },
      { id: 's3', x: 40, y: 75, role: 'DEF' },
      { id: 's4', x: 60, y: 75, role: 'DEF' },
      { id: 's5', x: 80, y: 75, role: 'DEF' },
      { id: 's6', x: 20, y: 50, role: 'MID' },
      { id: 's7', x: 40, y: 50, role: 'MID' },
      { id: 's8', x: 60, y: 50, role: 'MID' },
      { id: 's9', x: 80, y: 50, role: 'MID' },
      { id: 's10', x: 50, y: 25, role: 'FWD' },
    ],
  },
  '11v11': {
    '4-4-2': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 20, y: 75, role: 'DEF' },
      { id: 's3', x: 40, y: 75, role: 'DEF' },
      { id: 's4', x: 60, y: 75, role: 'DEF' },
      { id: 's5', x: 80, y: 75, role: 'DEF' },
      { id: 's6', x: 20, y: 50, role: 'MID' },
      { id: 's7', x: 40, y: 50, role: 'MID' },
      { id: 's8', x: 60, y: 50, role: 'MID' },
      { id: 's9', x: 80, y: 50, role: 'MID' },
      { id: 's10', x: 35, y: 25, role: 'FWD' },
      { id: 's11', x: 65, y: 25, role: 'FWD' },
    ],
    '4-3-3': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 20, y: 75, role: 'DEF' },
      { id: 's3', x: 40, y: 75, role: 'DEF' },
      { id: 's4', x: 60, y: 75, role: 'DEF' },
      { id: 's5', x: 80, y: 75, role: 'DEF' },
      { id: 's6', x: 20, y: 50, role: 'MID' },
      { id: 's7', x: 50, y: 50, role: 'MID' },
      { id: 's8', x: 80, y: 50, role: 'MID' },
      { id: 's9', x: 20, y: 25, role: 'FWD' },
      { id: 's10', x: 50, y: 25, role: 'FWD' },
      { id: 's11', x: 80, y: 25, role: 'FWD' },
    ],
    '3-5-2': [
      { id: 's1', x: 50, y: 90, role: 'GK' },
      { id: 's2', x: 20, y: 75, role: 'DEF' },
      { id: 's3', x: 50, y: 75, role: 'DEF' },
      { id: 's4', x: 80, y: 75, role: 'DEF' },
      { id: 's5', x: 16, y: 50, role: 'MID' },
      { id: 's6', x: 33, y: 50, role: 'MID' },
      { id: 's7', x: 50, y: 50, role: 'MID' },
      { id: 's8', x: 67, y: 50, role: 'MID' },
      { id: 's9', x: 84, y: 50, role: 'MID' },
      { id: 's10', x: 35, y: 25, role: 'FWD' },
      { id: 's11', x: 65, y: 25, role: 'FWD' },
    ],
  },
};

/** Squad size'dan oyuncu sayısını döndürür (GK dahil). */
export function squadSizeToCount(size: SquadSize): number {
  return parseInt(size.split('v')[0], 10);
}

/** Verilen boyut için ilk (varsayılan) formasyon adını döndürür. */
export function defaultFormation(size: SquadSize): string {
  return Object.keys(FORMATIONS[size])[0];
}

/** Slot listesinin derin kopyasını döndürür (immutable kullanım için). */
export function cloneSlots(size: SquadSize, formation: string): FormationSlot[] {
  return JSON.parse(JSON.stringify(FORMATIONS[size][formation]));
}
