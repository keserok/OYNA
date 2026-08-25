# Mağaza görselleri

Bu klasördeki **görseller depoya girmez** — iki komutla yeniden üretilirler.
Depoda duran tek şey bu açıklama ve üreten betikler.

```
npm run dev                # ayrı bir kabukta, 5199 portunda
npm run magaza:ekran       # 01…06 · 1290×2796 · App Store ölçüsü
npm run vitrin:gorseller   # canlıdaki her saha/kort fotoğrafı tek sayfada
```

## Çekmeden önce bilinmesi gereken

Saha fotoğrafları bugün **üçüncü taraf bir sunucuda** (`images.unsplash.com`)
duruyor. O sunucuya ulaşamayan bir makinede çekim yaparsan fotoğraflar yerine
uygulamanın kendi yer tutucusu çıkar — görüntüler teknik olarak doğru ölçüde
olur ama mağazaya konamaz.

Bu yüzden sıra şudur: önce `vitrin:gorseller` ile bak, fotoğraflar
görünüyorsa `magaza:ekran` ile çek.

## Neden bu klasör var

25 Ağustos 2026'da ilk kez mağaza için ekran görüntüsü çekildi ve çekilen
görüntülere bakıldığında vitrinde şunlar bulundu: bir sahanın fotoğrafı FIFA
Dünya Kupası'nın renderıydı, bir kortun fotoğrafları tanınabilir kişilerin ve
çocukların özel fotoğraflarıydı, üç profilin fotoğrafı uygulamanın kendi
logosuydu. Hepsi aylardır canlıdaydı.

Hiçbiri koddaydı değildi; hepsi veriydi. Ekran görüntüsü çekmek, o veriye
kullanıcının gördüğü gibi bakmanın ilk yoluydu — bu yüzden bir gönderim
adımı değil, bir **denetim adımı** olarak tutuluyor.
