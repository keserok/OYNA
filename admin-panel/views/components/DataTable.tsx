import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, SlidersHorizontal } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { downloadCsv } from '../../utils/exportCsv';

interface Column<T> {
    header: string;
    key?: keyof T | string;
    render?: (item: T) => React.ReactNode;
    className?: string;
    /** CSV dışa aktarımda kullanılacak düz metin değer (Karar #65).
     *  Verilmezse key üzerinden düz değer; o da yoksa sütun CSV'de boş kalır. */
    csvValue?: (item: T) => string | number | null | undefined;
}

interface DataTableProps<T> {
    columns: Column<T>[];
    data: T[];
    loading?: boolean;
    emptyMessage?: string;
    emptyDescription?: string;
    emptyAction?: React.ReactNode;
    currentPage?: number;
    totalPages?: number;
    onPageChange?: (page: number) => void;
    itemsPerPage?: number;
    totalItems?: number;
    /** CSV dışa aktarım düğmesi göster (Karar #65). */
    exportable?: boolean;
    exportFilename?: string;
    /** Sütun göster/gizle menüsü (Karar #65). */
    columnToggle?: boolean;
    /** Sütun görünürlüğünü sekmeler arası hatırlamak için benzersiz anahtar. */
    storageKey?: string;
}

function TableSkeleton({ cols }: { cols: number }) {
    return (
        <>
            {Array.from({ length: 5 }).map((_, row) => (
                <tr key={row} className="animate-pulse">
                    {Array.from({ length: cols }).map((__, col) => (
                        <td key={col} className="px-6 py-4">
                            <div className="h-3 bg-white/5 rounded-md" style={{ width: `${55 + (col * 11) % 35}%` }} />
                        </td>
                    ))}
                </tr>
            ))}
        </>
    );
}

export function DataTable<T>({
    columns,
    data,
    loading = false,
    emptyMessage = 'Kayıt bulunamadı',
    emptyDescription,
    emptyAction,
    currentPage = 1,
    totalPages = 1,
    onPageChange,
    itemsPerPage = 10,
    totalItems,
    exportable = false,
    exportFilename = 'oyna-export.csv',
    columnToggle = false,
    storageKey,
}: DataTableProps<T>) {
    // Sütun görünürlüğü — başlığa göre; localStorage'da kalıcı (storageKey verilirse)
    const lsKey = storageKey ? `oyna_admin_cols_${storageKey}` : null;
    const [hidden, setHidden] = useState<Set<string>>(() => {
        if (!lsKey) return new Set();
        try {
            const raw = localStorage.getItem(lsKey);
            return raw ? new Set<string>(JSON.parse(raw)) : new Set();
        } catch { return new Set(); }
    });
    const [menuOpen, setMenuOpen] = useState(false);

    const persistHidden = (next: Set<string>) => {
        setHidden(new Set(next));
        if (lsKey) { try { localStorage.setItem(lsKey, JSON.stringify([...next])); } catch { /* opsiyonel */ } }
    };

    const visibleColumns = useMemo(
        () => columns.filter((c) => !hidden.has(c.header)),
        [columns, hidden],
    );

    const cellText = (col: Column<T>, item: T): string => {
        if (col.csvValue) return String(col.csvValue(item) ?? '');
        if (col.key) return String((item as Record<string, unknown>)[col.key as string] ?? '');
        return '';
    };

    const handleExport = () => {
        const cols = visibleColumns;
        downloadCsv(
            exportFilename,
            cols.map((c) => c.header),
            data.map((item) => cols.map((c) => cellText(c, item))),
        );
    };

    const hasToolbar = exportable || columnToggle;

    return (
        <div className="w-full bg-surface-1/40 border border-white/[0.06] rounded-xl overflow-hidden">
            {hasToolbar && (
                <div className="flex items-center justify-end gap-2 px-3 py-2 border-b border-white/[0.06] bg-white/[0.02]">
                    {columnToggle && (
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setMenuOpen((o) => !o)}
                                className="flex items-center gap-1.5 h-8 px-3 text-[11px] font-bold text-gray-400 hover:text-white rounded-lg bg-white/5 border border-white/10"
                            >
                                <SlidersHorizontal size={12} /> Sütunlar
                            </button>
                            {menuOpen && (
                                <>
                                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                                    <div className="absolute right-0 mt-1 z-20 w-48 bg-[#0D1117] border border-white/10 rounded-xl shadow-2xl p-2 space-y-0.5">
                                        {columns.map((c) => {
                                            const visible = !hidden.has(c.header);
                                            return (
                                                <button
                                                    key={c.header}
                                                    type="button"
                                                    onClick={() => {
                                                        const next = new Set(hidden);
                                                        if (visible) { if (visibleColumns.length <= 1) return; next.add(c.header); }
                                                        else next.delete(c.header);
                                                        persistHidden(next);
                                                    }}
                                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] text-left hover:bg-white/5"
                                                >
                                                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[8px] ${visible ? 'bg-red-500/30 border-red-500/50 text-white' : 'border-white/20 text-transparent'}`}>✓</span>
                                                    <span className={visible ? 'text-gray-200' : 'text-gray-500'}>{c.header}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                    {exportable && (
                        <button
                            type="button"
                            onClick={handleExport}
                            disabled={data.length === 0}
                            className="flex items-center gap-1.5 h-8 px-3 text-[11px] font-bold text-gray-400 hover:text-white rounded-lg bg-white/5 border border-white/10 disabled:opacity-40"
                        >
                            <Download size={12} /> CSV
                        </button>
                    )}
                </div>
            )}
            <div className="overflow-x-auto custom-scrollbar -mx-px">
                <table className="w-full text-left border-collapse min-w-[640px]">
                    <thead className="sticky top-0 z-10">
                        <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                            {visibleColumns.map((col, idx) => (
                                <th
                                    key={idx}
                                    className={`px-5 py-3.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap ${col.className || ''}`}
                                >
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                        {loading ? (
                            <TableSkeleton cols={visibleColumns.length} />
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={visibleColumns.length}>
                                    <EmptyState
                                        title={emptyMessage}
                                        description={emptyDescription}
                                        action={emptyAction}
                                    />
                                </td>
                            </tr>
                        ) : (
                            data.map((item, rowIdx) => (
                                <tr
                                    key={rowIdx}
                                    className="hover:bg-white/[0.025] transition-colors duration-100 group"
                                >
                                    {visibleColumns.map((col, colIdx) => (
                                        <td
                                            key={colIdx}
                                            className={`px-5 py-3.5 text-[13px] text-gray-300 align-middle ${col.className || ''}`}
                                        >
                                            {col.render
                                                ? col.render(item)
                                                : col.key
                                                ? String((item as Record<string, unknown>)[col.key as string] ?? '')
                                                : null}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {onPageChange && totalPages > 1 && (
                <div className="px-5 py-3 border-t border-white/[0.06] bg-white/[0.02] flex items-center justify-between flex-wrap gap-2 text-[11px] text-gray-500">
                    <div>
                        {totalItems ? (
                            <span>
                                {totalItems} kayıttan {(currentPage - 1) * itemsPerPage + 1}–
                                {Math.min(currentPage * itemsPerPage, totalItems)}
                            </span>
                        ) : (
                            <span>Sayfa {currentPage} / {totalPages}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => onPageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center disabled:opacity-30 hover:bg-white/5"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <span className="px-2 font-mono text-gray-400">{currentPage}/{totalPages}</span>
                        <button
                            onClick={() => onPageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center disabled:opacity-30 hover:bg-white/5"
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
