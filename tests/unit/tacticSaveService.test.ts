import { describe, it, expect, vi, beforeEach } from 'vitest';

// supabaseClient'ı mock'la — rpc dönüşünü test başına ayarlarız
const rpc = vi.fn();
vi.mock('../../supabaseClient', () => ({ supabase: { rpc: (...a: any[]) => rpc(...a) } }));

import { saveTeamTactic, TacticConflictError } from '../../services/tacticSocialService';

const payload = {
  name: 'Test', size: '7v7', formation: '2-3-1',
  slots: [], subs: [], opponents: [], drawings: [],
  captainId: null, notes: '', mentality: 'Balanced', tempo: 5, identity: 'BALANCED',
};

// ─── saveTeamTactic — iyimser kilit + updated_at eşlemesi ─────────────────────

describe('saveTeamTactic', () => {
  beforeEach(() => rpc.mockReset());

  it('başarıda tacticId + status + updatedAt döndürür', async () => {
    rpc.mockResolvedValue({ data: { tactic_id: 't1', status: 'APPROVED', updated_at: '2026-07-21T10:00:00Z' }, error: null });
    const res = await saveTeamTactic(null, null, payload);
    expect(res).toEqual({ tacticId: 't1', status: 'APPROVED', updatedAt: '2026-07-21T10:00:00Z' });
  });

  it('expectedUpdatedAt payload ile RPC\'ye geçer', async () => {
    rpc.mockResolvedValue({ data: { tactic_id: 't1', status: 'APPROVED', updated_at: null }, error: null });
    await saveTeamTactic('team-1', 't1', { ...payload, expectedUpdatedAt: '2026-07-21T09:00:00Z' });
    expect(rpc).toHaveBeenCalledWith('save_team_tactic', expect.objectContaining({
      p_team_id: 'team-1', p_tactic_id: 't1',
      p_payload: expect.objectContaining({ expectedUpdatedAt: '2026-07-21T09:00:00Z' }),
    }));
  });

  it('CONFLICT hatasını TacticConflictError\'a çevirir', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'CONFLICT: Taktik sen açtıktan sonra değişti.' } });
    await expect(saveTeamTactic('team-1', 't1', payload)).rejects.toBeInstanceOf(TacticConflictError);
  });

  it('TOO_LARGE gibi diğer hataları dostça mesajla fırlatır', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'TOO_LARGE: Çizimler çok büyük — sadeleştir.' } });
    await expect(saveTeamTactic(null, 't1', payload)).rejects.toThrow('Çizimler çok büyük — sadeleştir.');
  });

  it('updated_at yoksa null döndürür', async () => {
    rpc.mockResolvedValue({ data: { tactic_id: 't1', status: 'APPROVED' }, error: null });
    const res = await saveTeamTactic(null, null, payload);
    expect(res.updatedAt).toBeNull();
  });
});
