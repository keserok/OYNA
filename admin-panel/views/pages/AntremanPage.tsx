import React, { useState, useEffect } from 'react';
import { PageShell } from '../components/PageShell';
import { supabase } from '../../../supabaseClient';
import { useAppStore } from '../../../store';
import { Loader2, Plus, Calendar, Clock, MapPin, Users, Coins } from 'lucide-react';
import { DataTable } from '../components/DataTable';
import { createMatchAdmin, buildMatchPayloadFromListing } from '../../services/adminService';

export const AntremanPage: React.FC = () => {
  const { adminPitches } = useAppStore();
  const [trainings, setTrainings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [pitchId, setPitchId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [capacity, setCapacity] = useState('14');
  const [price, setPrice] = useState('150');

  const fetchTrainings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('matches')
      .select('*, pitches(name)')
      .eq('difficulty', 'Antreman')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setTrainings(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTrainings();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pitchId || !date || !time || !capacity || !price) return;
    setIsSubmitting(true);

    try {
      const cap = parseInt(capacity, 10);
      const fee = parseInt(price, 10);
      
      // Generate slots for training
      const slots = Array.from({ length: cap }, (_, i) => ({
        id: crypto.randomUUID(),
        role: 'OYUNCU',
        status: 'OPEN',
        side: 'HOME'
      }));

      const newMatch = {
        title: 'Antreman',
        pitch_id: pitchId,
        date,
        time,
        price: fee,
        difficulty: 'Antreman',
        status: 'OPEN',
        visibility: 'OPEN',
        format: `${cap} Kişi`,
        slots,
        created_at: new Date().toISOString(),
        starts_at: new Date(`${date}T${time.split(' - ')[0] || time}:00`).toISOString()
      };

      const payload = buildMatchPayloadFromListing(newMatch as any);
      await createMatchAdmin(payload);
      
      
      setShowModal(false);
      setPitchId('');
      setDate('');
      setTime('');
      fetchTrainings();
    } catch (error) {
      console.error('Antreman eklenirken hata:', error);
      alert('Antreman eklenemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = [
    { key: 'pitch', header: 'SAHA', render: (row: any) => row.pitches?.name || 'Bilinmiyor' },
    { key: 'date', header: 'TARİH / SAAT', render: (row: any) => `${row.date} ${row.time}` },
    { key: 'price', header: 'KİŞİ BAŞI', render: (row: any) => `${row.price} ₺` },
    { key: 'capacity', header: 'KAPASİTE', render: (row: any) => row.format },
    { 
      key: 'status', 
      header: 'DURUM', 
      render: (row: any) => {
        const open = (row.slots || []).filter((s: any) => s.status === 'OPEN').length;
        return (
          <span className="px-2 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full text-[10px] font-bold">
            {open} YER BOŞ
          </span>
        );
      } 
    }
  ];

  return (
    <PageShell title="Antreman Yönetimi">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Aktif Antremanlar</h2>
          <p className="text-sm text-gray-400">Tesisler için planlanan antreman etkinlikleri.</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-black font-bold rounded-xl transition-colors"
        >
          <Plus size={18} />
          Yeni Antreman Aç
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="animate-spin text-cyan-500" size={32} />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={trainings}
          emptyMessage="Henüz açılmış antreman yok."
        />
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#161B22] border border-cyan-500/20 rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-white mb-4">Yeni Antreman Oluştur</h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Saha Seçimi</label>
                <select 
                  value={pitchId} onChange={(e) => setPitchId(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm"
                  required
                >
                  <option value="">Tesis Seçin</option>
                  {adminPitches.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Tarih</label>
                  <input 
                    type="date" value={date} onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm"
                    required
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Saat</label>
                  <input 
                    type="time" value={time} onChange={(e) => setTime(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Maksimum Kişi</label>
                  <input 
                    type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm"
                    required min="1"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-400 mb-1 uppercase">Kişi Başı Ücret (₺)</label>
                  <input 
                    type="number" value={price} onChange={(e) => setPrice(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-white text-sm"
                    required min="0"
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button 
                  type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white font-medium text-sm transition-colors"
                >
                  İptal
                </button>
                <button 
                  type="submit" disabled={isSubmitting}
                  className="px-6 py-2 bg-cyan-500 hover:bg-cyan-600 text-black font-bold rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : null}
                  Oluştur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageShell>
  );
};
