# Görev Şablonu — Claude Code oturumuna iş verirken

Aşağıdaki bloğu kopyala, köşeli parantezleri doldur, oturumun ilk mesajı olarak yapıştır.
(Kuralların tamamı `CLAUDE.md` dosyasında — onu her oturum otomatik okur.
Bu şablonun tek amacı görevi net anlatmana yardım etmek.)

---

```
GÖREV: [Tek cümleyle ne istiyorsun? Ör: "Maç biletindeki QR kod bazen görünmüyor, düzelt."]

NEREDE: [Hangi ekran, hangi kullanıcı tipi? Ör: "Oyuncu tarafı → Maçlarım → Bilet ekranı"]

ŞU AN NE OLUYOR: [Gördüğün davranış/hata. Hata mesajı varsa aynen yaz; ekran görüntüsü varsa ekle.]

OLMASI GEREKEN: [Beklediğin doğru davranış.]

DOKUNULMASIN: [Bu görevde kesinlikle dokunulmamasını istediğin alan; yoksa "yok" yaz.
Ör: "Ödeme akışına dokunma."]
```

---

## İpuçları

- **Bir oturuma tek konu ver.** İki ayrı sorun = iki ayrı görev. Bu, karışıklığı ve
  "çalışan bir yeri bozma" riskini ciddi azaltır.
- Hata belirli bir anda oluyorsa **ne zaman** olduğunu yaz
  ("Maça Katıl butonuna basınca" gibi).
- Oturum bittiğinde Claude sana **📌 ÖZET** verecek. Özetteki
  "Nasıl kontrol edersin" adımlarını bizzat uygulamadan işi kapatma.
- Claude canlı veritabanında bir DEĞİŞİKLİK yapmak isterse önce sana sade dille
  soracak — ne olduğunu anlamadan onay verme, anlamadıysan "daha basit anlat" de.
