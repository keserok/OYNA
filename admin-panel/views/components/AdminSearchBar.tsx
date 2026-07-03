import React from 'react';
import { Search, X } from 'lucide-react';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  resultCount?: number;
  totalCount?: number;
  className?: string;
}

/**
 * Paylaşılan liste arama kutusu.
 * type="text" bilinçli: type="search" tarayıcının kendi temizle (✕) düğmesini
 * çizer ve bizim temizle butonumuz + sayaçla üst üste binerdi.
 */
export const AdminSearchBar: React.FC<Props> = ({
  value,
  onChange,
  placeholder = 'Ara...',
  resultCount,
  totalCount,
  className = '',
}) => (
  <div className={`flex flex-col sm:flex-row sm:items-center gap-2 ${className}`}>
    <div className="relative flex-1 max-w-md">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
      <input
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full h-10 pl-9 pr-9 bg-black/40 border border-white/10 rounded-xl text-sm leading-none text-white placeholder:text-gray-600 truncate focus:outline-none focus:border-red-500/40 focus:ring-1 focus:ring-red-500/20 transition-all"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10"
          aria-label="Aramayı temizle"
        >
          <X size={12} />
        </button>
      )}
    </div>
    {resultCount !== undefined && totalCount !== undefined && (
      <span className="text-[11px] font-mono text-gray-500 shrink-0 whitespace-nowrap tabular-nums">
        {resultCount === totalCount ? `${totalCount} kayıt` : `${resultCount} / ${totalCount}`}
      </span>
    )}
  </div>
);
