/**
 * SAĞLAYICI GİRİŞİ İÇİN AÇILIR PENCERE — TEK SÖZLEŞME
 *
 * İki taraf da buradaki sabitleri kullanır:
 *   · supabaseAuth · webOAuthAc  → pencereyi açar, dönüş adresini işaretler,
 *   · index.tsx                  → işaretli dönüşte uygulamayı ÇİZMEZ.
 * Sözleşme ayrı yerlerde yazılsaydı biri değişince öteki sessizce bozulur ve
 * kullanıcı açılır pencerede ikinci bir OYNA kopyası görürdü.
 *
 * Neden ayrı dosya: `index.tsx` uygulamanın en dış giriş noktasıdır; oradan
 * `supabaseAuth`ı içe aktarmak, dönüş penceresinde supabase istemcisini
 * gereksiz yere ve ERKEN yükletirdi.
 */

/**
 * Pencerenin adı. YALNIZ `window.open` hedefi olarak kullanılır — aynı adla
 * ikinci bir giriş denemesi yeni sekme açmak yerine mevcut olanı yeniden
 * kullansın diye. TANIMA ÖLÇÜTÜ DEĞİLDİR (aşağıya bakınız).
 */
export const OAUTH_PENCERE_ADI = 'oyna-oauth';

/**
 * DÖNÜŞ İŞARETİ ADRESTE TAŞINIR — `window.name`/`window.opener` DEĞİL
 * (23 Ağustos 2026, kurucunun "sekme değiştirdiğimde uygulama yeniden
 * başlıyor" bildirimi).
 *
 * Önceki sürüm dönüş penceresini şöyle tanıyordu:
 *     window.name === OAUTH_PENCERE_ADI && !!window.opener
 * İkisi de sağlayıcıya gidip gelen bir bağlamda GÜVENİLMEZ:
 *
 *   · `window.name`: Chrome 88'den beri ÇAPRAZ KAYNAK gezinmede temizlenir
 *     (parmak izi/izleme önlemi). Pencere accounts.google.com'a gittiği anda
 *     ad silinir; bizim kaynağımıza döndüğünde `window.name` boş string olur.
 *   · `window.opener`: COOP başlıkları, `noopener` davranışı ve mobil
 *     tarayıcıların "açılır pencereyi SEKME olarak aç" tercihi bağı koparır.
 *
 * Sonuç: koşul dönüşte HER ZAMAN false'a düşüyordu, dönen bağlam TÜM
 * UYGULAMAYI çiziyordu ve kullanıcı bunu "uygulama beni attı, baştan
 * başlattı" diye okuyordu. Şikâyetin ikinci mekanizması tam olarak buydu.
 *
 * Adres sorgusu bu tuzakların hiçbirine yakalanmaz: Supabase `redirect_to`yu
 * harfi harfine geri verir, tarayıcı sorgu dizisini temizlemez, okuma
 * senkrondur (uygulama çizilmeden önce karar verilir).
 */
export const OAUTH_DONUS_ANAHTARI = 'oyna_donus';

/**
 * Dönüş adresi. Sondaki eğik çizgi Supabase izinli-liste eşleşmesi için şart
 * (bkz. supabaseAuth · webDonusAdresi); işaret onun ardına eklenir.
 */
export const donusAdresiniIsaretle = (kokAdres: string): string =>
  `${kokAdres}${kokAdres.includes('?') ? '&' : '?'}${OAUTH_DONUS_ANAHTARI}=1`;

/**
 * Bu açılış, açılır pencerede tamamlanan bir sağlayıcı dönüşü mü?
 *
 * İşaret YALNIZ pencere gerçekten açılabildiğinde adrese eklenir. Açılır
 * pencere engellenip tam sayfa yoluna düşüldüğünde adres işaretsizdir; ana
 * sekme dönüşte uygulamayı normal şekilde çizer. Yani bu bayrak "beni çizme"
 * demez, "ben ana sekme değilim" der.
 */
export const oauthDonusPenceresiMi = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get(OAUTH_DONUS_ANAHTARI) === '1';
  } catch {
    return false;
  }
};

/**
 * İşareti adres çubuğundan düşür. Dönüş penceresi kapanamazsa (mobil
 * tarayıcılarda `window.close()` çoğu zaman çalışmaz) uygulama O SEKMEDE
 * çizilir; adreste `?oyna_donus=1` asılı kalmasın, kullanıcı sayfayı
 * yenilediğinde tekrar "dönüş" sanılmasın.
 */
export const oauthDonusIsaretiniSil = (): void => {
  if (typeof window === 'undefined') return;
  try {
    const adres = new URL(window.location.href);
    if (!adres.searchParams.has(OAUTH_DONUS_ANAHTARI)) return;
    adres.searchParams.delete(OAUTH_DONUS_ANAHTARI);
    const sorgu = adres.searchParams.toString();
    window.history.replaceState(
      {},
      document.title,
      `${adres.pathname}${sorgu ? `?${sorgu}` : ''}${adres.hash}`,
    );
  } catch {
    /* replaceState yoksa sorun değil — bayrak zararsız asılı kalır */
  }
};
