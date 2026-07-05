import React from 'react';
import { PageLayout } from 'oyna-app';

// PageLayout is a full-screen app shell (min-h-screen, sticky glass header, dark
// brand background). To preview it we render it inside an inline-styled phone
// frame that clips it to a device viewport. `ds-preview` forces framer-motion's
// frozen enter animations to their final opaque state; the phone frame itself is
// the required dark surface.
const Phone: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="ds-preview"
    style={{
      width: 390,
      height: 720,
      overflow: 'hidden',
      borderRadius: 28,
      border: '1px solid rgba(255,255,255,0.1)',
      background: '#0A0E14',
    }}
  >
    {children}
  </div>
);

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 18,
  padding: 16,
};

const Bell = () => (
  <div
    style={{
      width: 40,
      height: 40,
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.05)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    }}
  >
    <span style={{ fontSize: 18 }}>🔔</span>
    <span
      style={{
        position: 'absolute',
        top: 8,
        right: 9,
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: '#39FF14',
        boxShadow: '0 0 8px rgba(57,255,20,0.8)',
      }}
    />
  </div>
);

const ProfileBody = () => (
  <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
    <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: 'linear-gradient(135deg,#39FF14,#0A0E14)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 900,
          fontSize: 22,
          color: '#0A0E14',
        }}
      >
        MC
      </div>
      <div>
        <div style={{ color: '#fff', fontWeight: 900, fontSize: 17 }}>Mirac Kerem</div>
        <div style={{ color: '#39FF14', fontWeight: 700, fontSize: 13 }}>Orta Saha • 8.4 Puan</div>
      </div>
    </div>
    <div style={{ display: 'flex', gap: 12 }}>
      {[
        { n: '47', l: 'Maç' },
        { n: '23', l: 'Gol' },
        { n: '12', l: 'Asist' },
      ].map((s) => (
        <div key={s.l} style={{ ...cardStyle, flex: 1, textAlign: 'center', padding: 14 }}>
          <div style={{ color: '#39FF14', fontWeight: 900, fontSize: 22 }}>{s.n}</div>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700 }}>{s.l}</div>
        </div>
      ))}
    </div>
    <div style={{ ...cardStyle }}>
      <div style={{ color: '#fff', fontWeight: 800, fontSize: 14, marginBottom: 10 }}>
        Yaklaşan Maç
      </div>
      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
        Kadıköy Halı Saha • Bugün 21:00
      </div>
      <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 4 }}>
        7v7 • 3 kişi eksik
      </div>
    </div>
  </div>
);

export const WithTitleAndBack = () => (
  <Phone>
    <PageLayout title="Profilim" onBack={() => {}} rightElement={<Bell />}>
      <ProfileBody />
    </PageLayout>
  </Phone>
);

export const TransparentHeader = () => (
  <Phone>
    <PageLayout title="Kadıköy Halı Saha" onBack={() => {}} transparentHeader>
      <div
        style={{
          height: 200,
          background: 'linear-gradient(160deg,rgba(57,255,20,0.25),rgba(10,14,20,0.9))',
          display: 'flex',
          alignItems: 'flex-end',
          padding: 16,
        }}
      >
        <div>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: 22 }}>7v7 Akşam Maçı</div>
          <div style={{ color: '#39FF14', fontWeight: 700, fontSize: 13 }}>
            Bugün 21:00 • 3 kişi aranıyor
          </div>
        </div>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ ...cardStyle }}>
          <div style={{ color: '#fff', fontWeight: 800, fontSize: 14, marginBottom: 6 }}>
            Saha Detayları
          </div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 1.5 }}>
            Kapalı saha, ışıklandırma mevcut. Soyunma odası ve duş imkanı var.
          </div>
        </div>
        <div style={{ ...cardStyle, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 700 }}>
            Kişi Başı
          </span>
          <span style={{ color: '#39FF14', fontSize: 15, fontWeight: 900 }}>₺120</span>
        </div>
      </div>
    </PageLayout>
  </Phone>
);
