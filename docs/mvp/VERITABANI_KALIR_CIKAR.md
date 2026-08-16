# Yeni Veritabanı — Kalır / Çıkar Listesi

> Bu liste, yeni Supabase projesinin **temel şemasını** belirler (K-01).
> Canlı veritabanındaki **120 tablo** tek tek değerlendirildi.
> Kural: MVP kararlarında (K-01…K-74) karşılığı olmayan hiçbir tablo yeni projeye taşınmaz.
>
> **Sonuç: 120 tablodan 58'i kalıyor, 62'si çıkıyor.** Ayrıca 3 yeni tablo yazılacak.

---

## KALIR — Kullanıcı, kimlik, yaş (11)

| Tablo | Neden |
|---|---|
| `profiles` | Çekirdek kullanıcı kaydı |
| `user_consents` | Sözleşme kabullerinin denetim kaydı — yasal |
| `user_blocks` | Kullanıcı engelleme (sosyal) |
| `user_reports` | Şikâyet |
| `password_reset_codes` | Şifre sıfırlama |
| `guardian_consents` | Veli muvafakati (K-33) |
| `guardian_lookup_attempts` | Veli kod denemesi hız sınırı — güvenlik |
| `profile_contact_hash` | Rehberden arkadaş bulma (hash'li) |
| `referral_codes` | Davet kodu |
| `referral_attributions` | Davet takibi |
| `user_saved_cards` | Kayıtlı kart (maskeli) |

## KALIR — Sosyal, takım, taktik (16)

`teams` · `team_members` · `team_messages` · `team_join_requests` · `team_invites` ·
`team_invite_links` · `team_chat_reads` · `friendships` · `friend_lists` · `friend_list_members` ·
`friend_prefs` · `conversations` · `messages` · `social_config` · `social_rate_usage` · `studio_events`

## KALIR — Taktik stüdyosu (5)

`tactics` · `tactic_votes` · `tactic_comments` · `tactic_favorites` · `match_tactics`

## KALIR — Maç (7)

| Tablo | Not |
|---|---|
| `matches` | Çekirdek. Yeni kolonlar gelecek: yaş politikası, kaleci/hakem ücret payı |
| `match_participants` | Kadro |
| `match_events` | Maç olay kaydı |
| `match_notes` | Maç notları |
| `match_private_codes` | Özel maç kodu |
| `match_list_invites` | Arkadaş listesini maça çağırma |
| `player_ratings` | Maç sonu oyuncu puanlama (K-46) |

## KALIR — Saha ve rezervasyon (12)

| Tablo | Not |
|---|---|
| `pitches` | Tesis. Yeni kolon: uygulamadan kiralamaya açık mı |
| `courts` | Kort |
| `pitch_bookings` | Rezervasyon — maç, bireysel ve antrenman hepsi burada |
| `pitch_slot_holds` | Ödeme sırasında slot kilidi |
| `pitch_tariffs` | Fiyat/süre politikası |
| `pitch_availability_exceptions` | Kapatma/istisna |
| `pitch_media` | Tesis fotoğrafları |
| `pitch_ratings` | Tesis puanı (K-46) |
| `pitch_favorites` | Favori saha |
| `pitch_views` | Görüntülenme (basit ölçüm) |
| `pitch_staff_members` | Ekip — müdür/personel (K-64) |
| `pitch_staff_tasks` | Nöbet/görev |

## KALIR — Para (4)

| Tablo | Not |
|---|---|
| `payment_intents` | Her kart işleminin tek kaydı — çekirdek |
| `booking_payments` | Rezervasyon tahsilat satırları |
| `commission_config` | Saha bazlı anlaşmalar (K-52, K-57) |
| `wallet_transactions` | **Yalnız iç muhasebe defteri** — kullanıcıya hiç görünmez (K-10) |

## KALIR — Kaleci / hakem (3)

`goalkeepers` · `referees` · `provider_applications` *(K-27: başvuru toplanacak)*

## KALIR — Sistem (11)

`app_config` · `feature_flags` · `notifications` · `notification_templates` · `push_log` ·
`region_coverage` · `image_variants` · `support_tickets` · `support_ticket_messages` ·
`admin_audit_log` · `admin_team_members`

## KALIR — Admin güvenlik (2)

`admin_mfa_recovery_codes` · `admin_ghost_sessions`

## KALIR — Hata kaydı (1)

`istemci_hatalari` — uygulama çökme kayıtları, kendi veritabanımızda

---

# ÇIKAR

## Cüzdan ve para çıkışı (5) — K-10, K-16
`payout_requests` · `payout_methods` · `owner_withdrawal_requests` · `owner_billing_events` · `minor_payment_consents`

> `minor_payment_consents` zaten ölü tablo — hiçbir kod çağırmıyor, üstelik veli telefonu düz metin
> tutuyor. Yeni projeye alınmaması KVKK açısından da doğru.

## Kaleci/hakem pazaryeri (5) — K-26
`service_requests` · `service_offers` · `service_ratings` · `match_service_offers` · `provider_identities`

> `provider_identities` TC kimlik verisi tutuyor ve yalnız para çıkışı için gerekliydi.
> Para çıkışı MVP'de olmadığına göre bu hassas veriyi hiç toplamıyoruz.

## Saha sahibi finans modülleri (7) — K-66
`pitch_expenses` · `pitch_expense_templates` · `pitch_debtors` · `pitch_debtor_entries` ·
`pitch_bank_accounts` · `pitch_customers` · `owner_weekly_summaries`

## Abonelik ve flash indirim (2) — K-66
`pitch_subscriptions` · `pitch_flash_deals`

## Kapsam dışı modüller (7) — K-74
`communities` · `community_members` · `community_join_requests` · `community_creation_requests` ·
`tournaments` · `promo_codes` · `promo_redemptions`

## Oyuncu skor önerisi (3) — K-45
`match_score_proposals` · `match_score_approvals` · `match_score_tokens`

> Skoru saha sahibi/müdür panelden girecek; oyuncu öneri-onay döngüsüne gerek yok.

## Ölçüm ve sistem sağlığı (7) — K-74 (v2'ye ertelendi)
`urun_olaylari` · `urun_olaylari_gunluk` · `olay_tanimlari` · `acilis_olcumu` ·
`sistem_saglik_kayitlari` · `kapi_kayitli_durum` · `silinen_ayarlar`

## Ölü / legacy tablolar (9)
`individual_matches` · `match_registrations` · `waitlist` · `match_disputes` · `audit_logs` ·
`settings` · `texts` · `pitch_change_requests` · `pitch_demand_signals`

> `settings` ve `texts`, `app_config` ile aynı işi iki farklı yerden yapıyor — tek kaynağa iniyoruz.
> `individual_matches`, `match_registrations`, `waitlist` canlıda **sıfır satır** — hiç kullanılmamış.

## Diğer (10)
`broadcast_campaigns` · `home_banners` · `owner_accounts` · `owner_client_ops` ·
`pitch_content_audit` · `match_tactic_proposals` · `pitch_change_requests` ·
`admin_ayna` yardımcıları · demo/seed nesneleri · `godview` demo fonksiyonları

---

# YENİ YAZILACAK TABLOLAR (3)

### 1. `antrenman_kurallari` — Antrenman slotu ayarları (K-59)
Saha sahibinin panelden gireceği kurallar; kort bazında.

| Alan | Açıklama |
|---|---|
| `pitch_id`, `court_id` | Hangi tesis/kort |
| `aktif` | Satış açık mı — **varsayılan kapalı** |
| `kac_saat_kala` | Slotun satışa açılma anı (varsayılan 2) |
| `kisi_basi_ucret` | Saha sahibinin belirlediği taban |
| `maksimum_kisi` | Kort kapasitesi |
| `gunler`, `baslangic_saati`, `bitis_saati` | Opsiyonel kısıt |
| `platform_pay_yuzdesi` | **Bu sahayla özel anlaşma** (K-57) |

### 2. `antrenman_katilimlari` — Kim hangi slotu aldı
Rezervasyon `pitch_bookings` içinde yaşar; bu tablo **kişi başı katılımı** tutar
(bir slotta 12 ayrı kişi olabilir).

### 3. `saha_hesap_hareketleri` — Saha sahibi mutabakat defteri (K-16, K-49)
Elden ödeme yaptığımız için uygulama içinde para çıkışı yok; ama **kime ne kadar
borçlu olduğumuzu** ve **iptal cezalarını** tutmamız gerekiyor.

| Hareket tipi | Örnek |
|---|---|
| `SAHA_BEDELI` | Maç kesinleşti → sahaya 2000₺ borçlandık |
| `IPTAL_CEZASI` | Saha sahibi maçı iptal etti → iade edilen komisyon ondan tahsil edilir (K-49) |
| `ELDEN_ODENDI` | Ödeme yapıldı, admin damgaladı |

---

# Bu listenin sonuçları

1. **Şema yaklaşık yarıya iniyor.** 120 → 58 tablo (+3 yeni) = 61.
   Bu, hem bakım yükünü hem de hata yüzeyini yarıya indiriyor.
2. **Hassas veri azalıyor.** TC kimlik (`provider_identities`), veli telefonu
   (`minor_payment_consents`), IBAN (`pitch_bank_accounts`, `payout_methods`) hiç toplanmıyor.
   KVKK açısından MVP çok daha savunulabilir bir konumda.
3. **Para yüzeyi daralıyor.** Kullanıcıdan para alma tek yoldan (kart), sahaya para verme
   uygulama dışından (elden). Uygulamada bakiye, çekim, IBAN yok.
4. **Ölçüm ertelendi.** Dönüşüm hunisi ve sistem sağlığı v2'ye kaldı; MVP'de temel hata kaydı
   (`istemci_hatalari`) ve admin denetim kaydı (`admin_audit_log`) yeterli.
