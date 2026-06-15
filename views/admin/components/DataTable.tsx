import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState } from './EmptyState';

interface Column<T> {
    header: string;
    key?: keyof T | string;
    render?: (item: T) => React.ReactNode;
    className?: string;
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
}: DataTableProps<T>) {
    return (
        <div className="w-full bg-[#161B22]/40 border border-white/[0.06] rounded-xl overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                            {columns.map((col, idx) => (
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
                            <TableSkeleton cols={columns.length} />
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length}>
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
                                    {columns.map((col, colIdx) => (
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
