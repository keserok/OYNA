import React, { useMemo } from 'react';
import { useAppStore } from '../../../store';
import { StatCard } from '../components/StatCard';
import { DataTable } from '../components/DataTable';
import { PageShell } from '../components/PageShell';
import { Activity, Play, TrendingUp, RefreshCw } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface DashboardPageProps {
  onRefresh?: () => Promise<void>;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onRefresh }) => {
    const { adminMatches, adminPitches, adminUsers, appSettings, adminDashboardStats } = useAppStore();
    const [dateRange, setDateRange] = React.useState<'7D' | '30D' | 'ALL'>('7D');
    const [refreshing, setRefreshing] = React.useState(false);

    const stats = adminDashboardStats;
    const commissionRate = Number(stats?.commission_rate ?? appSettings.commissionRate ?? 10);
    const missingAlerts = adminMatches.filter(m => m.missingPositions?.some(p => p.count > 0)).length;
    const liveRevenue = adminMatches.reduce(
      (acc, m) => acc + ((m.price || 0) * 14 * commissionRate / 100),
      0,
    );

    const chartData = useMemo(() => {
        const days = dateRange === '7D' ? 7 : dateRange === '30D' ? 30 : 90;
        const result = [];
        const today = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
            const dayMatches = adminMatches.filter((m) => m.date && m.date.includes(String(d.getDate())));
            result.push({
                name: dateStr,
                gelir: dayMatches.length * 1500 * commissionRate / 100,
                mac: dayMatches.length,
            });
        }
        return result;
    }, [adminMatches, commissionRate, dateRange]);

    const activeMatchesRows = adminMatches.slice(0, 5).map(m => ({
        id: `#${m.id.slice(0, 4).toUpperCase()}`,
        pitch: m.location || m.title,
        time: `${m.date} ${m.time}`,
        status: m.missingPositions?.some(p => p.count > 0) ? 'EKSİK KADRO' : 'TAM KADRO',
        rev: `₺${m.price}`,
    }));

    const mkSpark = (base: number) => Array.from({ length: 12 }, (_, i) => base + (i % 3));

    const handleRefresh = async () => {
      if (!onRefresh) return;
      setRefreshing(true);
      try { await onRefresh(); } finally { setRefreshing(false); }
    };

    return (
        <PageShell
            route="GENEL"
            actions={
                <div className="flex items-center gap-2">
                  {onRefresh && (
                    <button
                      onClick={() => void handleRefresh()}
                      disabled={refreshing}
                      className="flex items-center gap-2 h-9 px-4 text-xs font-bold rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white disabled:opacity-50"
                    >
                      <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Yenile
                    </button>
                  )}
                  <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-xl p-1">
                    {(['7D', '30D', 'ALL'] as const).map(range => (
                        <button
                            key={range}
                            onClick={() => setDateRange(range)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${dateRange === range ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            {range === '7D' ? '7 Gün' : range === '30D' ? '30 Gün' : 'Tümü'}
                        </button>
                    ))}
                  </div>
                </div>
            }
        >
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard label="TOPLAM KULLANICI" value={Number(stats?.total_users ?? adminUsers.length)} unit="Kayıtlı profil" color="#3b82f6" data={mkSpark(Number(stats?.total_users ?? adminUsers.length))} />
                <StatCard label="ONAY BEKLEYEN" value={Number(stats?.pending_verifications ?? 0) + Number(stats?.pending_pitches ?? 0)} unit="GK/Ref + Tesis" color="#ef4444" data={mkSpark(3)} badge={Number(stats?.pending_pitches ?? 0) > 0 ? 'AKİF' : undefined} badgeColor="text-red-400 bg-red-500/10 border-red-500/20" />
                <StatCard label="SİSTEM GELİRİ" value={`₺${Math.round(liveRevenue).toLocaleString('tr')}`} unit="Beklenen komisyon" color="#eab308" data={mkSpark(100)} />
                <StatCard label="CANLI MAÇLAR" value={stats?.total_matches ?? adminMatches.length} unit={`${adminPitches.length} saha`} color="#39FF14" data={mkSpark(adminMatches.length)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-4">
                    <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1">Para Çekme Kuyruğu</p>
                    <p className="text-2xl font-bold text-white">{Number(stats?.pending_withdrawals ?? 0)}</p>
                </div>
                <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-4">
                    <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-1">Aktif Hizmet Sağlayıcı</p>
                    <p className="text-2xl font-bold text-white">{Number(stats?.active_goalkeepers ?? 0) + Number(stats?.active_referees ?? 0)}</p>
                </div>
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4">
                    <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1">Banlı Kullanıcı</p>
                    <p className="text-2xl font-bold text-white">{Number(stats?.banned_users ?? 0)}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-[#161B22]/60 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-xl">
                    <div className="flex items-center gap-2 mb-6">
                        <TrendingUp size={16} className="text-[#39FF14]" />
                        <h3 className="text-xs font-black uppercase tracking-widest text-white">Gelir Trendi (DB Maçları)</h3>
                    </div>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorGelir" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#39FF14" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#39FF14" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis dataKey="name" stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} />
                                <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} />
                                <Tooltip contentStyle={{ backgroundColor: 'rgba(13, 17, 23, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }} />
                                <Area type="monotone" dataKey="gelir" stroke="#39FF14" strokeWidth={3} fillOpacity={1} fill="url(#colorGelir)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-[#161B22]/60 backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col shadow-xl">
                    <div className="flex items-center gap-2 mb-6">
                        <Activity size={16} className="text-blue-400" />
                        <h3 className="text-xs font-black uppercase tracking-widest text-white">Operasyon Kuyruğu</h3>
                    </div>
                    <div className="space-y-4 flex-1">
                        <div className="bg-black/20 border border-white/5 rounded-xl p-3 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">EKSİK KADRO</span>
                            <span className="text-[10px] font-black text-yellow-400">{missingAlerts}</span>
                        </div>
                        <div className="bg-black/20 border border-white/5 rounded-xl p-3 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">BAKIM MODU</span>
                            <span className={`text-[9px] font-black px-2 py-1 rounded border uppercase ${appSettings.maintenanceMode ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-green-500/20 text-[#39FF14] border-[#39FF14]/30'}`}>
                                {appSettings.maintenanceMode ? 'AKTİF' : 'PASİF'}
                            </span>
                        </div>
                        <div className="bg-black/20 border border-white/5 rounded-xl p-3 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">KOMİSYON</span>
                            <span className="text-[10px] font-black text-yellow-400">%{commissionRate}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div>
                <div className="flex items-center gap-2 mb-3 px-1">
                    <Play size={14} className="text-red-500" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-white">Son Maçlar</h3>
                </div>
                <DataTable
                    columns={[
                        { header: 'MAÇ ID', key: 'id', className: 'font-mono text-gray-400' },
                        { header: 'SAHA', key: 'pitch', className: 'text-white font-bold' },
                        { header: 'ZAMAN', key: 'time', className: 'font-mono' },
                        { header: 'KİŞİ BAŞI ₺', key: 'rev', className: 'text-green-400 font-mono font-bold' },
                        { header: 'DURUM', render: (row) => (
                            <span className={`text-[9px] font-black px-2 py-1 rounded border uppercase ${row.status === 'EKSİK KADRO' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : 'bg-green-500/10 text-[#39FF14] border-[#39FF14]/30'}`}>
                                {row.status}
                            </span>
                        )},
                    ]}
                    data={activeMatchesRows}
                />
            </div>
        </PageShell>
    );
};
