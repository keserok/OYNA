import { loadAdminOperationalData, loadAdminExtendedData } from './adminService';

type LoadAdminDataFn = (data: Awaited<ReturnType<typeof loadAdminOperationalData>> & { texts?: Record<string, string> }) => void;

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

export async function refreshAdminPlatform(deps: {
  loadServices: () => Promise<void>;
  loadAdminData: LoadAdminDataFn;
}): Promise<void> {
  await loadAdminPlatformData(deps);
}
