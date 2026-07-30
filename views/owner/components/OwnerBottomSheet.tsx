// ─── IP-23 · YÖNLENDİRME (re-export) ────────────────────────────────────────
//
// Gerçek uygulama `components/ui/` altına taşındı: oyuncu tarafı da bu markalı
// onay/sheet altyapısını kullanacak, ama oyuncu ekranları `views/owner/`den
// import edemez (özellik klasörü, paylaşılan katman değil).
//
// Bu dosya SİLİNMEDİ ve tesis panelinin import satırlarına DOKUNULMADI:
// kullanıcı kuralı gereği tesis panelinin arayüzü değişmeyecek ve o ekranların
// görsel testi YOK (24 görsel testin 0'ı tesis panelini kapsıyor), yani orada
// yapılacak bir hatayı hiçbir test yakalayamazdı. Tek satırlık yönlendirme,
// on dosyada import düzenlemekten güvenli.

export { OwnerBottomSheet, ActionSheet, default } from '../../../components/ui/ActionSheet';
