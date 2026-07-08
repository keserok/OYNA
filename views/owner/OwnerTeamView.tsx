import React, { useCallback, useEffect, useState } from 'react';
import {
  ClipboardList, Plus, Users, X, CheckCircle2, Circle, AlertTriangle,
} from 'lucide-react';
import { LoadingState } from '../../components/common/StatusState';
import {
  getStaffMembers,
  getStaffTasks,
  upsertStaffMember,
  upsertStaffTask,
  toggleStaffTaskStatus,
  deleteStaffMember,
  toTurkishError,
} from '../../services/pitchOwnerService';
import type { PitchStaffMember, PitchStaffTask } from '../../types';
import { useOwnerToast } from './components/useOwnerToast';
import { OwnerDemoDataBar } from './components/OwnerDemoDataBar';

interface OwnerTeamViewProps {
  pitchId: string;
  isDemoMode?: boolean;
  readOnly?: boolean;
  maxStaff?: number;
}

const PRIORITY_LABEL: Record<PitchStaffTask['priority'], string> = {
  LOW: 'Düşük',
  MEDIUM: 'Orta',
  HIGH: 'Yüksek',
};

const PRIORITY_COLOR: Record<PitchStaffTask['priority'], string> = {
  LOW: 'text-gray-400 border-gray-500/30',
  MEDIUM: 'text-amber-400 border-amber-500/30',
  HIGH: 'text-red-400 border-red-500/30',
};

export const OwnerTeamView: React.FC<OwnerTeamViewProps> = ({
  pitchId,
  isDemoMode,
  readOnly = false,
  maxStaff = 10,
}) => {
  const notify = useOwnerToast();
  const [teamTab, setTeamTab] = useState<'TASKS' | 'STAFF'>('TASKS');
  const [staff, setStaff] = useState<PitchStaffMember[]>([]);
  const [tasks, setTasks] = useState<PitchStaffTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', assignedTo: '', priority: 'MEDIUM' as PitchStaffTask['priority'], dueTime: '' });
  const [newStaff, setNewStaff] = useState({ name: '', role: 'Personel', phone: '' });
  const [isSaving, setIsSaving] = useState(false);

  const canUseDb = !!pitchId && !pitchId.startsWith('mock-');

  const load = useCallback(async () => {
    if (!canUseDb) {
      setStaff([]);
      setTasks([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const [members, taskRows] = await Promise.all([
        getStaffMembers(pitchId),
        getStaffTasks(pitchId),
      ]);
      setStaff(members);
      setTasks(taskRows);
    } catch (err) {
      setLoadError(toTurkishError(err));
    } finally {
      setIsLoading(false);
    }
  }, [pitchId, canUseDb]);

  useEffect(() => { load(); }, [load]);

  const onDutyStaff = staff.filter((s) => s.status === 'ON_DUTY');
  const hasDemoData = staff.some((s) => s.is_demo) || tasks.some((t) => t.is_demo);

  const handleToggleTask = async (task: PitchStaffTask) => {
    if (!canUseDb || readOnly) return;
    const nextCompleted = task.status !== 'COMPLETED';
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextCompleted ? 'COMPLETED' : 'PENDING' } : t)),
    );
    try {
      await toggleStaffTaskStatus(task.id, nextCompleted);
    } catch (err) {
      await load();
      notify(toTurkishError(err), 'error');
    }
  };

  const handleCreateTask = async () => {
    if (!canUseDb || readOnly || !newTask.title.trim()) return;
    setIsSaving(true);
    try {
      const member = staff.find((s) => s.id === newTask.assignedTo);
      await upsertStaffTask(pitchId, {
        title: newTask.title,
        assigned_to: member?.id ?? null,
        assigned_name: member?.name ?? null,
        priority: newTask.priority,
        due_time: newTask.dueTime || null,
      });
      setNewTask({ title: '', assignedTo: '', priority: 'MEDIUM', dueTime: '' });
      setIsAddTaskOpen(false);
      await load();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateStaff = async () => {
    if (!canUseDb || readOnly || !newStaff.name.trim()) return;
    if (staff.length >= maxStaff) {
      notify(`Mevcut planınız en fazla ${maxStaff} personel destekliyor.`, 'warning');
      return;
    }
    setIsSaving(true);
    try {
      await upsertStaffMember(pitchId, {
        name: newStaff.name,
        role_title: newStaff.role,
        phone: newStaff.phone || null,
        status: 'OFF_DUTY',
      });
      setNewStaff({ name: '', role: 'Personel', phone: '' });
      setIsAddStaffOpen(false);
      await load();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleDuty = async (member: PitchStaffMember) => {
    if (!canUseDb || readOnly) return;
    const next = member.status === 'ON_DUTY' ? 'OFF_DUTY' : 'ON_DUTY';
    setStaff((prev) => prev.map((s) => (s.id === member.id ? { ...s, status: next } : s)));
    try {
      await upsertStaffMember(pitchId, { id: member.id, name: member.name, status: next });
    } catch (err) {
      await load();
      notify(toTurkishError(err), 'error');
    }
  };

  const handleRemoveStaff = async (memberId: string) => {
    if (!canUseDb || readOnly || !confirm('Personeli listeden kaldırmak istiyor musunuz?')) return;
    try {
      await deleteStaffMember(memberId);
      await load();
    } catch (err) {
      notify(toTurkishError(err), 'error');
    }
  };

  if (isLoading) {
    return <div className="p-6 pb-32"><LoadingState message="Ekip yükleniyor…" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 pb-32 overflow-y-auto custom-scrollbar bg-[#0A0E14]">
      <div className="max-w-5xl mx-auto w-full">
      <OwnerDemoDataBar pitchId={pitchId} onChanged={load} hasDemo={hasDemoData} />
      {isDemoMode && (
        <div className="mb-4 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] font-bold text-amber-300 uppercase tracking-wide">
          Demo tesis — ekip verileri örnek kayıtlardır
        </div>
      )}
      {readOnly && (
        <div className="mb-4 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-[10px] font-bold text-red-300 uppercase tracking-wide text-center">
          Salt okunur mod — ekip kayıtları düzenlenemez
        </div>
      )}

      {loadError && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-300 flex items-center gap-2">
          <AlertTriangle size={14} /> {loadError}
        </div>
      )}

      {!canUseDb && (
        <div className="mb-6 p-4 rounded-2xl bg-[#161B22] border border-white/5 text-center text-sm text-gray-500">
          Ekip yönetimi için önce tesisinizi oluşturun veya demo modunu açın.
        </div>
      )}

      <div className="relative group mb-8">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-[32px] opacity-20 blur" />
        <div className="relative bg-[#161B22] border border-white/10 rounded-[32px] p-6 shadow-2xl overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
            <Users size={120} className="text-indigo-500" />
          </div>
          <div className="relative z-10">
            <div className="flex justify-between items-center mb-6">
              <div>
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">OPERASYON MERKEZİ</p>
                <h2 className="text-3xl font-black text-white italic tracking-tight">EKİP DURUMU</h2>
              </div>
              <div className="flex items-center gap-2 bg-green-500/10 px-3 py-1.5 rounded-xl border border-green-500/20">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-black text-green-400 uppercase">{onDutyStaff.length} GÖREVDE</span>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex -space-x-4">
                {onDutyStaff.slice(0, 4).map((s) => (
                  <div key={s.id} className="relative">
                    <img
                      src={s.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(s.name)}&background=6366f1&color=fff`}
                      className="w-14 h-14 rounded-2xl border-4 border-[#161B22] object-cover"
                      alt={s.name}
                    />
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-[#161B22]" />
                  </div>
                ))}
                {canUseDb && (
                  <button
                    type="button"
                    onClick={() => {
                      if (readOnly) return;
                      if (staff.length >= maxStaff) {
                        notify(`Mevcut planınız en fazla ${maxStaff} personel destekliyor.`, 'warning');
                        return;
                      }
                      setIsAddStaffOpen(true);
                    }}
                    className="w-14 h-14 rounded-2xl border-4 border-[#161B22] bg-white/5 flex items-center justify-center text-gray-400 hover:bg-white/10"
                  >
                    <Plus size={20} />
                  </button>
                )}
              </div>
              <div className="h-10 w-px bg-white/10" />
              <div>
                <p className="text-xl font-black text-white">{staff.length} Personel</p>
                <p className="text-[10px] text-gray-500 font-bold uppercase">Kayıtlı ekip üyesi</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex bg-[#161B22] p-1.5 rounded-2xl mb-8 border border-white/5">
        <button
          type="button"
          onClick={() => setTeamTab('TASKS')}
          className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 ${
            teamTab === 'TASKS' ? 'bg-indigo-500/10 text-indigo-400' : 'text-gray-500'
          }`}
        >
          <ClipboardList size={16} /> Görevler
        </button>
        <button
          type="button"
          onClick={() => setTeamTab('STAFF')}
          className={`flex-1 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 ${
            teamTab === 'STAFF' ? 'bg-purple-500/10 text-purple-400' : 'text-gray-500'
          }`}
        >
          <Users size={16} /> Personel
        </button>
      </div>

      {teamTab === 'TASKS' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">GÜNLÜK OPERASYON</h3>
            {canUseDb && (
              <button
                type="button"
                onClick={() => { if (!readOnly) setIsAddTaskOpen(true); }}
                className="text-[10px] bg-indigo-500 text-white font-black px-4 py-2 rounded-xl flex items-center gap-2"
              >
                <Plus size={14} /> YENİ GÖREV
              </button>
            )}
          </div>
          {tasks.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Henüz görev yok.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
            {tasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => handleToggleTask(task)}
                disabled={!canUseDb}
                className="w-full text-left bg-[#161B22] p-4 rounded-2xl border border-white/5 flex items-start gap-4 hover:border-indigo-500/30 transition-all"
              >
                {task.status === 'COMPLETED' ? (
                  <CheckCircle2 size={22} className="text-green-500 shrink-0 mt-0.5" />
                ) : (
                  <Circle size={22} className="text-gray-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold ${task.status === 'COMPLETED' ? 'text-gray-500 line-through' : 'text-white'}`}>
                    {task.title}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {task.assigned_name && (
                      <span className="text-[10px] font-bold text-gray-500 uppercase">{task.assigned_name}</span>
                    )}
                    {task.due_time && (
                      <span className="text-[10px] font-bold text-indigo-400">{task.due_time}</span>
                    )}
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${PRIORITY_COLOR[task.priority]}`}>
                      {PRIORITY_LABEL[task.priority]}
                    </span>
                    {task.is_demo && (
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25">DEMO</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
            </div>
          )}
        </div>
      )}

      {teamTab === 'STAFF' && (
        <div className="space-y-3">
          {staff.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Personel ekleyin.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
            {staff.map((member) => (
              <div key={member.id} className="bg-[#161B22] p-4 rounded-2xl border border-white/5 flex items-center gap-4">
                <img
                  src={member.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=8b5cf6&color=fff`}
                  className="w-12 h-12 rounded-xl object-cover"
                  alt={member.name}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-white flex items-center gap-2">
                    {member.name}
                    {member.is_demo && (
                      <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25">DEMO</span>
                    )}
                  </p>
                  <p className="text-[10px] text-gray-500 font-bold uppercase">{member.role_title}</p>
                </div>
                {canUseDb && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleDuty(member)}
                      className={`text-[10px] font-black px-3 py-1.5 rounded-lg uppercase ${
                        member.status === 'ON_DUTY'
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-white/5 text-gray-500'
                      }`}
                    >
                      {member.status === 'ON_DUTY' ? 'Görevde' : 'İzinli'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveStaff(member.id)}
                      className="p-2 text-gray-600 hover:text-red-400"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>
            ))}
            </div>
          )}
        </div>
      )}

      </div>{/* /max-w wrapper */}

      {isAddTaskOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-end sm:items-center justify-center p-4">
          <div className="bg-[#161B22] w-full max-w-md rounded-3xl border border-white/10 p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-white italic">YENİ GÖREV</h3>
              <button type="button" onClick={() => setIsAddTaskOpen(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <input
              className="w-full bg-[#0A0E14] border border-white/5 rounded-xl p-3 text-white text-sm"
              placeholder="Görev başlığı"
              value={newTask.title}
              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
            />
            <select
              className="w-full bg-[#0A0E14] border border-white/5 rounded-xl p-3 text-white text-sm"
              value={newTask.assignedTo}
              onChange={(e) => setNewTask({ ...newTask, assignedTo: e.target.value })}
            >
              <option value="">Personel seç (opsiyonel)</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <input
              className="w-full bg-[#0A0E14] border border-white/5 rounded-xl p-3 text-white text-sm"
              placeholder="Saat (örn. 18:00)"
              value={newTask.dueTime}
              onChange={(e) => setNewTask({ ...newTask, dueTime: e.target.value })}
            />
            <button
              type="button"
              disabled={isSaving}
              onClick={handleCreateTask}
              className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl disabled:opacity-50"
            >
              {isSaving ? 'Kaydediliyor…' : 'GÖREVİ OLUŞTUR'}
            </button>
          </div>
        </div>
      )}

      {isAddStaffOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-end sm:items-center justify-center p-4">
          <div className="bg-[#161B22] w-full max-w-md rounded-3xl border border-white/10 p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-white italic">YENİ PERSONEL</h3>
              <button type="button" onClick={() => setIsAddStaffOpen(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <input
              className="w-full bg-[#0A0E14] border border-white/5 rounded-xl p-3 text-white text-sm"
              placeholder="Ad Soyad"
              value={newStaff.name}
              onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
            />
            <input
              className="w-full bg-[#0A0E14] border border-white/5 rounded-xl p-3 text-white text-sm"
              placeholder="Görev (örn. Saha Sorumlusu)"
              value={newStaff.role}
              onChange={(e) => setNewStaff({ ...newStaff, role: e.target.value })}
            />
            <input
              className="w-full bg-[#0A0E14] border border-white/5 rounded-xl p-3 text-white text-sm"
              placeholder="Telefon (opsiyonel)"
              value={newStaff.phone}
              onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
            />
            <button
              type="button"
              disabled={isSaving}
              onClick={handleCreateStaff}
              className="w-full py-4 bg-purple-600 text-white font-black rounded-2xl disabled:opacity-50"
            >
              {isSaving ? 'Kaydediliyor…' : 'PERSONEL EKLE'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
