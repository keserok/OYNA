
# OYNA - Halı Saha Ekosistemi (MVP)

![Version](https://img.shields.io/badge/version-2.4.0-yellow)
![Status](https://img.shields.io/badge/status-production-blue)

**OYNA**, halı saha oyuncularını, kalecileri, hakemleri ve tesis sahiplerini tek bir dijital çatı altında toplayan yeni nesil bir futbol ekosistemidir.

## 📱 Proje Özellikleri

### 1. Yetenek Merkezi (Talent Hub)
*   **Segmented Control:** Kaleci ve Hakem listeleri arasında hızlı geçiş.
*   **Dinamik Filtreleme:** Puana, fiyata ve konuma göre sıralama.
*   **Etkileşim:** "Hemen Kirala" ve "Teklif Ver" modülleri.

### 2. Finans ve Rezervasyon
*   **Güvenli Ödeme:** Kapora sistemi ve havuz (bölüşümlü) ödeme altyapısı.
*   **Dijital Bilet:** Ödeme sonrası QR kodlu dinamik Maç Kartı oluşturma.
*   **Safety Net:** Kaptan garantörlüğü ile rezervasyon güvenliği.

### 3. İletişim ve Sosyal
*   **Canlı Sohbet:** Kaptan ve Tesis sahibi arasında anlık mesajlaşma.
*   **OYNA TV:** Maç kliplerinin paylaşıldığı sosyal akış.
*   **AI Koç:** Gemini tabanlı taktik ve analiz asistanı.

## 🛠 Teknoloji Yığını

Bu proje **React (TypeScript)** ile geliştirilmiş modern bir web uygulamasıdır.

*   **Core:** React 19, TypeScript
*   **Styling:** TailwindCSS (Deep Navy & Cyber Yellow Theme)
*   **Icons:** Lucide React
*   **State Management:** React Hooks
*   **Charts:** Recharts

## 📂 Proje Yapısı

```bash
/
├── index.html          # Entry Point & Global Styles
├── src/
│   ├── App.tsx         # Main Router & Navigation Logic
│   ├── types.ts        # TypeScript Interfaces & Enums
│   ├── constants.ts    # Mock Data & Configuration
│   ├── HocaWidget.tsx  # AI Assistant Component
│   └── views/          # Screen Components
│       ├── Dashboard.tsx       # Ana Oyuncu Ekranı
│       ├── Marketplace.tsx     # Yetenek Merkezi
│       ├── ChatScreen.tsx      # Mesajlaşma Modülü
│       ├── MatchTicket.tsx     # QR Maç Kartı
│       ├── OwnerPanel.tsx      # Tesis Yönetim Paneli
│       └── ...
```

## 🚀 Kurulum

1.  Repoyu klonlayın.
2.  Bağımlılıkları yükleyin: `npm install`
3.  Projeyi başlatın: `npm start`

---
*Developed with ❤️ by Gemini Core*
# OYNA
