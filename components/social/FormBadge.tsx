import React from 'react';

// Form şeridi — son N maçın G/B/M noktaları (Spec H44).
// Takım-rengi kimlik kuralı: dolu nokta rengi takımdan gelebilir.

export type FormResult = 'W' | 'D' | 'L';

interface FormBadgeProps {
  form: FormResult[];        // en yeni SONDA beklenir; en çok 5 gösterilir
  winColor?: string;         // varsayılan neon; takım kartında color1 verilebilir
  className?: string;
}

const FormBadge: React.FC<FormBadgeProps> = ({ form, winColor = '#39FF14', className = '' }) => {
  const shown = form.slice(-5);
  if (shown.length === 0) return null;
  return (
    <div className={`flex items-center gap-1 ${className}`} aria-label={`Form: ${shown.join(' ')}`}>
      {shown.map((r, i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor:
              r === 'W' ? winColor : r === 'D' ? 'rgba(255,255,255,0.35)' : '#FF4D4D',
          }}
        />
      ))}
    </div>
  );
};

export default FormBadge;
