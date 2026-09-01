# App Store Connect — form cevapları

> İki form var ve ikisi de **yanlış doldurulursa ret sebebidir**: yaş sınırı
> (Guideline 2.3.1 — yanıltıcı meta veri) ve veri toplama beyanı (5.1.1(ii) —
> beyanla gerçeğin uyuşmaması). Bu dosyadaki cevaplar **koddan ve canlı
> veritabanından çıkarıldı**, tahmin değil. Nereden geldiği her satırda yazılı.

**Uygulama:** OYNA · `com.oyna.app` · sürüm **1.0.0** · derleme **5**

---

## 1 · Age Rating (yaş sınırı anketi)

Uygulamanın içeriğinde şiddet, cinsellik, küfür, madde kullanımı, korku,
kumar ya da tıbbi bilgi **yok**. Anketteki içerik sorularının hepsine
**None / No** denir.

**Dikkat edilecek tek yer sohbet ve kullanıcı içeriğidir:**

| Soru | Cevap | Dayanağı |
| --- | --- | --- |
| Kullanıcılar birbirine mesaj atabiliyor mu? (chat) | **Evet** | `messages`, `team_messages`, `team_chat_reads` tabloları canlıda |
| Kullanıcı üretimi içerik var mı? (UGC) | **Evet** | profil, takım, topluluk, maç açıklamaları, fotoğraf yükleme |
| İçerik denetleniyor mu? (moderation) | **Evet** | `user_reports` (şikâyet) ve `user_blocks` (engelleme) tabloları canlıda |
| Sınırsız web erişimi | **Hayır** | tarayıcı yalnız kendi yasal sayfalarımızı açar, kullanıcı adres giremez |
| Kumar / bahis | **Hayır** | saha kiralama bir hizmet satın alımıdır, şans oyunu değil |
| Yarışma (contests) | **Hayır** | ödüllü turnuva yok |

Sohbet + kullanıcı içeriği olan uygulamalar Apple'ın anketinde genellikle
**12+** çıkar. Anket sonucu ne verirse **onu kabul et** — elle düşürmeye
çalışma, 2.3.1 tam olarak budur.

> **Neden bu önemli:** sohbeti olduğu hâlde "chat yok" diyen uygulama
> reddedilir. Şikâyet ve engelleme mekanizması olmayan sohbet ise Guideline
> 1.2'den reddedilir. İkisi de bizde var; formda doğru işaretlemek yeter.

---

## 2 · App Privacy (veri toplama beyanı)

Bu tablo `ios/App/App/PrivacyInfo.xcprivacy` ile **birebir aynı olmak
zorunda**. Apple yüklemede paketteki manifestoları birleştirip rapor üretir;
formla manifesto ayrışırsa çelişki görünür.

**Her satır için ortak cevaplar:**
- *Is this data used to track you?* → **No** (uygulamada reklam/izleme SDK'sı yok)
- *Is this data linked to the user's identity?* → **Yes** (tek istisna aşağıda işaretli)

| Apple kategorisi | Veri türü | Amaç | Neden topluyoruz |
| --- | --- | --- | --- |
| Contact Info | Name | App Functionality | hesap ve maç/rezervasyon sahipliği |
| Contact Info | Email Address | App Functionality | giriş ve bildirim |
| Contact Info | Phone Number | App Functionality | tesisin rezervasyon sahibine ulaşması |
| Financial Info | Payment Info | App Functionality | ödeme akışı kart bilgisini sunucuya iletir |
| Location | Precise Location | App Functionality | "yakınımdaki sahalar" |
| Location | Coarse Location | App Functionality | ilçe/bölge filtresi |
| Contacts | Contacts | App Functionality | rehberden arkadaş bulma (izin isteğe bağlı) |
| User Content | Photos or Videos | App Functionality | profil ve tesis fotoğrafı |
| User Content | Other User Content | App Functionality | mesajlar, maç açıklamaları, takım bilgileri |
| Identifiers | User ID | App Functionality | hesap kimliği |
| Identifiers | Device ID | App Functionality | push bildirim jetonu |
| Purchases | Purchase History | App Functionality | rezervasyon ve ödeme geçmişi |
| Usage Data | Product Interaction | Analytics | ürün kullanım ölçümü *(bkz. not)* |
| Diagnostics | Crash Data | App Functionality | çökme raporu *(bkz. not · **kimliğe bağlı DEĞİL**)* |

### Kart bilgisi neden "toplanıyor" sayılıyor

Ödeme bugün **simülasyon** modunda: hiçbir bankaya tahsilat gitmiyor ve ekranda
bunu söyleyen kırmızı uyarı var. Ama kart numarası ve CVV, `create-payment`
edge fonksiyonuna **cihazdan çıkarak** ulaşıyor. Apple'ın tanımı "veriyi
cihazdan dışarı iletmek"tir — yani toplanıyor sayılır. Veritabanına veya loga
yazılmıyor, o ayrı; beyan yine de gerekir.

### Analytics ve Crash Data — beyan var, bugün çalışmıyor

`utils/observability.ts`, Sentry ve PostHog'u **yalnız `VITE_SENTRY_DSN` ve
`VITE_POSTHOG_KEY` tanımlıysa** CDN'den yükler. Derlenmiş paketi kontrol ettim:
**ikisi de gömülü değil**, yani bugünkü iOS derlemesi ne çökme verisi ne
analitik topluyor.

Yine de **beyanı bırak.** Sebep basit: fazla beyan etmek sorun değil, eksik
beyan etmek ihlaldir. Bu anahtarları bir gün tanımlarsan uygulama toplamaya
başlar ve formu güncellemeyi hatırlaman gerekmez. Hiç kullanmayacağına karar
verirsen manifestodan ve formdan birlikte çıkar — birinden çıkarıp diğerinde
bırakmak, ikisini de bırakmaktan kötüdür.

---

## 3 · App Review Information

| Alan | Değer |
| --- | --- |
| Sign-In required | **Yes** |
| User Name | `oyuncu@oyna.app` |
| Password | `Oyna!Saha2026` |

Notes alanına yapıştırılacak İngilizce metin: **`APP_REVIEW_NOTLARI.md`**
içinde hazır duruyor. Ödemenin fiziksel bir hizmet olduğunu ve bu yüzden
uygulama içi satın alma zorunluluğuna girmediğini (3.1.3(e)) anlatan paragraf
oradadır; reddedilmemenin anahtarı odur.

Diğer roller de aynı şifreyle giriyor ve hepsi sıradan hesap — notta
belirtilmeli: `kaleci@oyna.app`, `hakem@oyna.app`, `saha1@oyna.app`.

> `npm run magaza:denetim` bu notu **canlı ödeme ayarıyla karşılaştırıyor.**
> Ödeme modunu değiştirip notu güncellemezsen denetim kırmızı yanar.
