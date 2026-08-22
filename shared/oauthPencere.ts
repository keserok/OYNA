/**
 * SAĞLAYICI GİRİŞİ İÇİN AÇILIR PENCERE — TEK SÖZLEŞME
 *
 * Pencerenin adı iki tarafta da aynı olmalı:
 *   · supabaseAuth · webOAuthAc  → pencereyi bu adla açar,
 *   · index.tsx                  → bu adla açılmış pencerede uygulamayı ÇİZMEZ.
 * Ad ayrı yerlerde tanımlansaydı biri değişince öteki sessizce bozulur ve
 * kullanıcı açılır pencerede ikinci bir OYNA kopyası görürdü.
 *
 * Neden ayrı dosya: `index.tsx` uygulamanın en dış giriş noktasıdır; oradan
 * `supabaseAuth`ı içe aktarmak, açılır pencerede supabase istemcisini
 * gereksiz yere ve ERKEN yükletirdi.
 */
export const OAUTH_PENCERE_ADI = 'oyna-oauth';
