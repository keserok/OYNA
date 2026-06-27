-- FAZ 8 (oyuncu): Sağlamlık — çoklu-slot RPC'lerini anon/public erişimine kapat.
-- Yalnız authenticated çağırabilir (her fonksiyon ayrıca auth.uid() kontrollü).
revoke execute on function public.player_buy_slots(uuid, text[]) from public, anon;
revoke execute on function public.player_assign_slot(uuid, text, uuid) from public, anon;
revoke execute on function public.player_make_slot_code(uuid, text) from public, anon;
revoke execute on function public.player_accept_slot(uuid, text) from public, anon;
revoke execute on function public.player_claim_slot_code(text) from public, anon;
