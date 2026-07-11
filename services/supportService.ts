import { supabase } from '../supabaseClient';

// Uygulama içi Destek Merkezi (Eksiklik #1/#2). Oyuncu ve tesis sahibi aynı
// backend'i kullanır; kanal ayrımı 'PLAYER' / 'OWNER'.
export type SupportChannel = 'PLAYER' | 'OWNER';
export type SupportStatus = 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';

export interface SupportMessage {
  id: string;
  sender_role: 'USER' | 'ADMIN';
  sender_name: string | null;
  body: string;
  created_at: string;
}

export interface SupportTicket {
  id: string;
  subject: string;
  category: string;
  status: SupportStatus;
  priority: string;
  channel: SupportChannel;
  created_at: string;
  last_message_at: string;
  unread_for_user: boolean;
  messages: SupportMessage[];
}

/** Yeni destek talebi açar (ilk mesajla). Talep id'sini döndürür. */
export async function createSupportTicket(input: {
  subject: string;
  body: string;
  category?: string;
  channel?: SupportChannel;
}): Promise<string> {
  const { data, error } = await supabase.rpc('support_ticket_create', {
    p_subject: input.subject,
    p_body: input.body,
    p_category: input.category ?? 'GENERAL',
    p_channel: input.channel ?? 'PLAYER',
  });
  if (error) throw new Error(error.message);
  return data as string;
}

/** Mevcut talebe ek mesaj gönderir. */
export async function addSupportMessage(ticketId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('support_ticket_add_message', {
    p_ticket_id: ticketId,
    p_body: body,
  });
  if (error) throw new Error(error.message);
}

/** Kullanıcının kendi taleplerini (mesajlarıyla) getirir; açılışta okundu işaretler. */
export async function listMySupportTickets(channel: SupportChannel = 'PLAYER'): Promise<SupportTicket[]> {
  const { data, error } = await supabase.rpc('support_ticket_list_mine', { p_channel: channel });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []) as SupportTicket[];
}
