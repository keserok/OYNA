// ─── Destek Merkezi (kullanıcı tarafı) ───────────────────────────────────────
// Backend hazırdı (20260806000000 destek merkezi seti) ama uygulama arayüzü
// yoktu. Bu servis üç RPC'yi sarar; admin tarafı adminService'teki
// admin_support_* fonksiyonlarıyla aynı tablolara bağlanır:
//   support_ticket_create      → yeni talep (kanal: PLAYER oyuncu, OWNER tesis)
//   support_ticket_list_mine   → taleplerim + mesaj dizileri (unread_for_user'ı temizler)
//   support_ticket_add_message → mevcut talebe yanıt yaz
import { supabase } from '../supabaseClient';

export type SupportChannel = 'PLAYER' | 'OWNER';
export type SupportStatus = 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';

export interface SupportMessage {
  id: string;
  sender_role: 'USER' | 'ADMIN';
  sender_name: string | null;
  body: string;
  created_at: string;
}

export interface MySupportTicket {
  id: string;
  subject: string | null;
  category: string | null;
  status: SupportStatus;
  priority: string;
  channel: SupportChannel;
  created_at: string;
  last_message_at: string;
  unread_for_user: boolean;
  messages: SupportMessage[];
}

export const SUPPORT_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: 'GENERAL', label: 'Genel' },
  { key: 'PAYMENT', label: 'Ödeme & İade' },
  { key: 'MATCH', label: 'Maç & Kadro' },
  { key: 'ACCOUNT', label: 'Hesap & Profil' },
  { key: 'FACILITY', label: 'Saha & Tesis' },
  { key: 'OTHER', label: 'Diğer' },
];

export const SUPPORT_STATUS_LABEL: Record<SupportStatus, string> = {
  OPEN: 'Açık',
  PENDING: 'Yanıt Bekleniyor',
  RESOLVED: 'Çözüldü',
  CLOSED: 'Kapatıldı',
};

/** Taleplerim (mesaj dizileri gömülü gelir; okunmamış bayrağı sunucuda temizlenir). */
export const listMySupportTickets = async (channel: SupportChannel = 'PLAYER'): Promise<MySupportTicket[]> => {
  const { data, error } = await supabase.rpc('support_ticket_list_mine', { p_channel: channel });
  if (error) throw error;
  return (data || []) as MySupportTicket[];
};

/** Yeni destek talebi açar; talep id'sini döndürür. */
export const createSupportTicket = async (
  subject: string,
  body: string,
  category = 'GENERAL',
  channel: SupportChannel = 'PLAYER',
): Promise<string> => {
  const { data, error } = await supabase.rpc('support_ticket_create', {
    p_subject: subject.trim(),
    p_body: body.trim(),
    p_category: category,
    p_channel: channel,
  });
  if (error) throw error;
  return data as string;
};

/** Mevcut talebe kullanıcı yanıtı ekler. */
export const addSupportMessage = async (ticketId: string, body: string): Promise<string> => {
  const { data, error } = await supabase.rpc('support_ticket_add_message', {
    p_ticket_id: ticketId,
    p_body: body.trim(),
  });
  if (error) throw error;
  return data as string;
};
