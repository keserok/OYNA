import type { Goalkeeper, MatchListing, Pitch, Referee, Team } from '../types';
import {
  loadAdminExtendedData,
  loadAdminInventoryFromRpc,
  loadAdminOperationalData,
  signOutAdmin,
  toTurkishAdminError,
  type AdminSession,
  checkPlatformAdmin,
} from './adminService';

export const ADMIN_FETCH_TIMEOUT_MS = 12_000;
/** Boot-time session probe — must finish well under AdminApp boot ceiling */
export const ADMIN_SESSION_CHECK_MS = 4_000;

export async function withAdminTimeout<T>(
  label: string,
  fn: () => Promise<T>,
  ms = ADMIN_FETCH_TIMEOUT_MS,
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} zaman aşımına uğradı (${ms / 1000}s)`)), ms),
  );
  return Promise.race([fn(), timeout]);
}

export interface AdminInventoryData {
  pitches: Pitch[];
  matches: MatchListing[];
  teams: Team[];
  goalkeepers: Goalkeeper[];
  referees: Referee[];
  texts: Record<string, string>;
}

export interface AdminBootstrapResult {
  warnings: string[];
}

type LoadAdminDataFn = (data: Awaited<ReturnType<typeof loadAdminOperationalData>> & {
  texts?: Record<string, string>;
}) => void;

export interface AdminBootstrapDeps {
  clearAdminMockState: () => void;
  setAdminInventoryData: (data: AdminInventoryData) => void;
  loadAdminData: LoadAdminDataFn;
}

export async function loadAdminInventoryData(): Promise<AdminInventoryData & { warnings: string[] }> {
  const result = await withAdminTimeout('Platform envanteri', () => loadAdminInventoryFromRpc());
  const { warnings, ...inventory } = result;
  return { ...inventory, warnings };
}

export async function bootstrapAdminPlatform(deps: AdminBootstrapDeps): Promise<AdminBootstrapResult> {
  const warnings: string[] = [];
  deps.clearAdminMockState();

  let inventoryTexts: Record<string, string> = {};

  try {
    const inventory = await loadAdminInventoryData();
    warnings.push(...inventory.warnings);
    const { warnings: _w, ...data } = inventory;
    inventoryTexts = data.texts ?? {};
    deps.setAdminInventoryData(data);
  } catch (err) {
    const msg = toTurkishAdminError(err);
    warnings.push(`Envanter yüklenemedi: ${msg}`);
    inventoryTexts = {};
    deps.setAdminInventoryData({
      pitches: [],
      matches: [],
      teams: [],
      goalkeepers: [],
      referees: [],
      texts: {},
    });
  }

  try {
    const [operational, extended] = await Promise.all([
      withAdminTimeout('Operasyonel veriler', () => loadAdminOperationalData()),
      withAdminTimeout('CMS metinleri', () => loadAdminExtendedData()),
    ]);

    deps.loadAdminData({
      ...operational,
      texts: { ...inventoryTexts, ...extended.texts },
    });
  } catch (err) {
    const msg = toTurkishAdminError(err);
    warnings.push(`Operasyonel veriler kısmen yüklendi: ${msg}`);
    deps.loadAdminData({
      users: [],
      settings: null,
      auditLogs: [],
      stats: null,
      texts: { ...inventoryTexts },
    });
  }

  return { warnings };
}

export async function refreshAdminPlatform(deps: AdminBootstrapDeps): Promise<AdminBootstrapResult> {
  return bootstrapAdminPlatform(deps);
}

/** Hafif yenileme — sadece KPI/operasyonel veri; envanter RPC'si yok */
export async function refreshAdminStatsOnly(deps: AdminBootstrapDeps): Promise<AdminBootstrapResult> {
  const warnings: string[] = [];
  try {
    const operational = await withAdminTimeout('Operasyonel veriler', () => loadAdminOperationalData());
    deps.loadAdminData(operational);
  } catch (err) {
    warnings.push(toTurkishAdminError(err));
  }
  return { warnings };
}

/** Fast local session check via getSession + admin profile probe (never getUser). */
export async function resolveAdminSession(): Promise<AdminSession | null> {
  try {
    return await withAdminTimeout(
      'Oturum kontrolü',
      () => checkPlatformAdmin(),
      ADMIN_SESSION_CHECK_MS,
    );
  } catch (err) {
    console.warn('[Admin] Oturum zaman aşımı:', err);
    void signOutAdmin();
    return null;
  }
}

/** @deprecated bootstrapAdminPlatform kullanın */
export async function loadAdminPlatformData(deps: {
  loadServices: () => Promise<void>;
  loadAdminData: LoadAdminDataFn;
}): Promise<void> {
  await deps.loadServices();
  const [data, extended] = await Promise.all([
    loadAdminOperationalData(),
    loadAdminExtendedData(),
  ]);
  deps.loadAdminData({ ...data, texts: extended.texts });
}
