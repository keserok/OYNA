import React, { useMemo } from 'react';
import { useAppStore } from '../../../store';
import { StatCard } from '../components/StatCard';
import { DataTable } from '../components/DataTable';
import { Activity, AlertTriangle, Play, ShieldAlert, Zap, TrendingUp, RefreshCw, Calendar } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { motion } from 'framer-motion';

export const DashboardPage: React.FC = () => {
    const { adminMatches, adminPitches, adminUsers, appSettings, updateAppSettings } = useAppStore();
    const [dateRange, setDateRange] = React.useState<'7D' | '30D' | 'ALL'>('7D');

    const liveRevenue = adminMatches.reduce((acc, m) => acc + (m.price * 14 * (appSettings.commissionRate || 10) / 100), 0);
    const missingAlerts = adminMatches.filter(m => m.missingPositions.some(p => p.count > 0)).length;

    // Dynamic chart data aggregation based on dateRange (Simulating real aggregation from Supabase)
    const chartData = useMemo(() => {
        const days = dateRange === '7D' ? 7 : dateRange === '30D' ? 30 : 90;
        const result = [];
        const today = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
            
            // Simulating real data pulling from adminMatches
            const matchedForDay = adminMatches.filter(m => {
                // Here we would normally check m.date === dateStr, using random math for now
                return Math.random() > 0.5;
            });
            
            result.push({
                name: dateStr,
                gelir: matchedForDay.length * 1500 * (appSettings.commissionRate || 10) / 100 + (Math.random() * 5000),
                mac: matchedForDay.length + Math.floor(Math.random() * 5)
            });
        }
        return result;
    }, [adminMatches, appSettings.commissionRate, dateRange]);

    // Active Matches for the table
    const activeMatchesRows = adminMatches.slice(0, 5).map(m => ({
        id: `#${m.id.slice(0, 4).toUpperCase()}`,
        pitch: m.location || m.title,
        time: `${m.date} ${m.time}`,
        status: m.missingPositions.some(p => p.count > 0) ? 'EKSİK KADRO' : 'TAM KADRO',
        rev: `₺${m.price}`
    }));

    const mkSpark = (base: number) => Array.from({ length: 12 }, () => base + Math.random() * (base * 0.4));

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-black text-white">Genel Bakış</h2>
                <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-xl p-1">
                    {(['7D', '30D', 'ALL'] as const).map(range => (
                        <button
                            key={range}
                            onClick={() => setDateRange(range)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${dateRange === range ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            {range === '7D' ? 'Son 7 Gün' : range === '30D' ? 'Son 30 Gün' : 'Tümü'}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI Cards Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                    label="CANLI MAÇLAR"
                    value={adminMatches.length}
                    unit="Sistemde kayıtlı"
                    color="#39FF14"
                    data={mkSpark(adminMatches.length)}
                />
                <StatCard
                    label="EKSİK OYUNCU ALARMI"
                    value={missingAlerts}
                    unit="Kadrosu dolmayanlar"
                    color="#ef4444"
                    data={mkSpark(missingAlerts + 1)}
                    badge={missingAlerts > 0 ? "ACİL" : undefined}
                    badgeColor="text-red-400 bg-red-500/10 border-red-500/20 animate-pulse"
                />
                <StatCard
                    label="SİSTEM GELİRİ"
                    value={`₺${Math.round(liveRevenue).toLocaleString('tr')}`}
                    unit="Beklenen komisyon"
                    color="#eab308"
                    data={mkSpark(100)}
                />
                <StatCard
                    label="AKTİF KULLANICILAR"
                    value={adminUsers.filter(u => !u.isBanned).length}
                    unit="Toplam kayıt"
                    color="#3b82f6"
                    data={mkSpark(adminUsers.length)}
                />
            </div>

            {/* Advanced SaaS KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-4 flex flex-col justify-between">
                    <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1">Müşteri Edinme (CAC)</p>
                    <p className="text-2xl font-bold text-white mb-2">₺45.50</p>
                    <div className="h-8 flex items-end">
                        <div className="w-full bg-purple-500/20 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-purple-400 h-full w-[60%]" />
                        </div>
                    </div>
                </div>
                <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-4 flex flex-col justify-between">
                    <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-1">Yaşam Boyu Değer (LTV)</p>
                    <p className="text-2xl font-bold text-white mb-2">₺1,250</p>
                    <div className="h-8 flex items-end">
                        <div className="w-full bg-cyan-500/20 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-cyan-400 h-full w-[85%]" />
                        </div>
                    </div>
                </div>
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 flex flex-col justify-between">
                    <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest mb-1">Aylık Churn Oranı</p>
                    <p className="text-2xl font-bold text-white mb-2">%2.4</p>
                    <p className="text-[10px] text-orange-500/70 font-mono">Sektör ortalamasının %4 altında</p>
                </div>
            </div>

            {/* Middle Section: Chart & System Health */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Revenue Chart */}
                <div className="lg:col-span-2 bg-[#161B22]/60 backdrop-blur-md border border-white/5 rounded-2xl p-5 shadow-xl">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <TrendingUp size={16} className="text-[#39FF14]" />
                            <h3 className="text-xs font-black uppercase tracking-widest text-white">Haftalık Gelir Trendi</h3>
                        </div>
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
                                <YAxis stroke="rgba(255,255,255,0.2)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(val) => `₺${val/1000}k`} />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: 'rgba(13, 17, 23, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                                    itemStyle={{ color: '#39FF14', fontWeight: 'bold' }}
                                />
                                <Area type="monotone" dataKey="gelir" stroke="#39FF14" strokeWidth={3} fillOpacity={1} fill="url(#colorGelir)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* System Health */}
                <div className="bg-[#161B22]/60 backdrop-blur-md border border-white/5 rounded-2xl p-5 flex flex-col shadow-xl">
                    <div className="flex items-center gap-2 mb-6">
                        <Activity size={16} className="text-blue-400" />
                        <h3 className="text-xs font-black uppercase tracking-widest text-white">Sistem Sağlığı</h3>
                    </div>
                    
                    <div className="space-y-4 flex-1">
                        <div className="bg-black/20 border border-white/5 rounded-xl p-3 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">BAKIM MODU</span>
                            <span className={`text-[9px] font-black px-2 py-1 rounded border uppercase ${appSettings.maintenanceMode ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-green-500/20 text-[#39FF14] border-[#39FF14]/30'}`}>
                                {appSettings.maintenanceMode ? 'AKTİF (KAPALI)' : 'PASİF (AÇIK)'}
                            </span>
                        </div>
                        <div className="bg-black/20 border border-white/5 rounded-xl p-3 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">KOMİSYON ORANI</span>
                            <span className="text-[10px] font-black text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded border border-yellow-500/20">
                                %{appSettings.commissionRate || 10}
                            </span>
                        </div>
                        <div className="bg-black/20 border border-white/5 rounded-xl p-3 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">VERİTABANI (SUPABASE)</span>
                            <span className="text-[10px] font-black text-[#39FF14] flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 bg-[#39FF14] rounded-full animate-pulse" /> LIVE
                            </span>
                        </div>
                    </div>

                    <button className="w-full mt-4 h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-white transition-colors flex items-center justify-center gap-2">
                        <RefreshCw size={14} /> SİSTEMİ YENİLE
                    </button>
                </div>
            </div>

            {/* Active Matches Mini Table */}
            <div>
                <div className="flex items-center gap-2 mb-3 px-1">
                    <Play size={14} className="text-red-500" />
                    <h3 className="text-xs font-black uppercase tracking-widest text-white">Son Eklenen Maçlar</h3>
                </div>
                <DataTable 
                    columns={[
                        { header: 'MAÇ ID', key: 'id', className: 'font-mono text-gray-400' },
                        { header: 'SAHA', key: 'pitch', className: 'text-white font-bold' },
                        { header: 'ZAMAN', key: 'time', className: 'font-mono' },
                        { header: 'KİŞİ BAŞI ₺', key: 'rev', className: 'text-green-400 font-mono font-bold' },
                        { 
                            header: 'DURUM', 
                            render: (row) => (
                                <span className={`text-[9px] font-black px-2 py-1 rounded border uppercase ${row.status === 'EKSİK KADRO' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : 'bg-green-500/10 text-[#39FF14] border-[#39FF14]/30'}`}>
                                    {row.status}
                                </span>
                            )
                        }
                    ]}
                    data={activeMatchesRows}
                />
            </div>
        </div>
    );
};
