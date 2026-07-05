import React from 'react';
import { LocationBadge } from 'oyna-app';

// LocationBadge is the app-wide "active region" chip. Its accent colour is driven
// by `source`: gps=green (live), manual=orange, restored=blue; region=null shows
// the empty "KONUM SEÇ" state. It's a glass chip, so it sits on the dark surface;
// `ds-preview` forces framer-motion's frozen enter state to its final opaque render.
const Surface: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="ds-preview"
    style={{
      background: '#0A0E14',
      padding: 24,
      borderRadius: 20,
      display: 'flex',
      flexWrap: 'wrap',
      gap: 16,
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    {children}
  </div>
);

const kadikoy: any = {
  label: 'Kadıköy, İstanbul',
  city: 'İstanbul',
  district: 'Kadıköy',
  source: 'gps',
  isCovered: true,
  accuracy: 'district',
};

const cankaya: any = {
  label: 'Çankaya, Ankara',
  city: 'Ankara',
  district: 'Çankaya',
  source: 'manual',
  isCovered: true,
  accuracy: 'district',
};

const konak: any = {
  label: 'Konak, İzmir',
  city: 'İzmir',
  district: 'Konak',
  source: 'restored',
  isCovered: true,
  accuracy: 'city',
};

export const LiveGps = () => (
  <Surface>
    <LocationBadge region={kadikoy} onClick={() => {}} />
  </Surface>
);

export const ManualRegion = () => (
  <Surface>
    <LocationBadge region={cankaya} onClick={() => {}} />
  </Surface>
);

export const RestoredRegion = () => (
  <Surface>
    <LocationBadge region={konak} onClick={() => {}} />
  </Surface>
);

export const Empty = () => (
  <Surface>
    <LocationBadge region={null} onClick={() => {}} />
  </Surface>
);
