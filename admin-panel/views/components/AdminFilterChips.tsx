import React from 'react';

export interface FilterChip {
  id: string;
  label: string;
  count?: number;
}

interface Props {
  chips: FilterChip[];
  active: string;
  onChange: (id: string) => void;
}

export const AdminFilterChips: React.FC<Props> = ({ chips, active, onChange }) => (
  <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtreler">
    {chips.map((chip) => {
      const isActive = chip.id === active;
      return (
        <button
          key={chip.id}
          type="button"
          role="tab"
          aria-selected={isActive}
          onClick={() => onChange(chip.id)}
          className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wide border transition-all ${
            isActive
              ? 'bg-red-500/15 text-red-300 border-red-500/35 shadow-[0_0_12px_rgba(239,68,68,0.12)]'
              : 'bg-white/[0.03] text-gray-500 border-white/10 hover:text-gray-300 hover:border-white/20'
          }`}
        >
          {chip.label}
          {chip.count !== undefined && (
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-md ${isActive ? 'bg-red-500/20' : 'bg-white/5'}`}>
              {chip.count}
            </span>
          )}
        </button>
      );
    })}
  </div>
);
