import React from 'react';
import { ChevronLeft, ChevronRight, FolderOpen } from 'lucide-react';

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
    // Pagination (Optional)
    currentPage?: number;
    totalPages?: number;
    onPageChange?: (page: number) => void;
    itemsPerPage?: number;
    totalItems?: number;
}

export function DataTable<T>({
    columns,
    data,
    loading = false,
    emptyMessage = 'Kayıt bulunamadı.',
    currentPage = 1,
    totalPages = 1,
    onPageChange,
    itemsPerPage = 10,
    totalItems
}: DataTableProps<T>) {
    return (
        <div className="w-full bg-[#161B22]/60 backdrop-blur-md border border-white/5 rounded-2xl overflow-hidden shadow-2xl transition-all duration-300">
            <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-white/5 bg-black/10">
                            {columns.map((col, idx) => (
                                <th
                                    key={idx}
                                    className={`px-6 py-4 text-[9px] font-black text-gray-500 uppercase tracking-widest whitespace-nowrap ${col.className || ''}`}
                                >
                                    {col.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {loading ? (
                            <tr>
                                <td colSpan={columns.length} className="px-6 py-8 text-center text-xs text-gray-500 font-mono">
                                    Veriler Yükleniyor...
                                </td>
                            </tr>
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="px-6 py-12 text-center text-xs text-gray-500">
                                    <div className="flex flex-col items-center justify-center">
                                        <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-3 border border-white/5 shadow-inner">
                                            <FolderOpen size={24} className="text-gray-600" />
                                        </div>
                                        <p className="font-bold text-gray-400">{emptyMessage}</p>
                                        <p className="text-[10px] text-gray-600 mt-1 max-w-xs mx-auto">Filtreleri temizleyerek veya yeni bir arama yaparak tekrar deneyebilirsiniz.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            data.map((item, rowIdx) => (
                                <tr
                                    key={rowIdx}
                                    className="hover:bg-white/[0.02] active:bg-white/[0.01] transition-colors duration-150 group"
                                >
                                    {columns.map((col, colIdx) => (
                                        <td
                                            key={colIdx}
                                            className={`px-6 py-4 text-xs text-gray-300 align-middle ${col.className || ''}`}
                                        >
                                            {col.render
                                                ? col.render(item)
                                                : col.key
                                                ? String((item as any)[col.key] ?? '')
                                                : null}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination footer */}
            {onPageChange && totalPages > 1 && (
                <div className="px-6 py-3.5 border-t border-white/5 bg-black/10 flex items-center justify-between flex-wrap gap-2 text-[10px] text-gray-500 font-mono">
                    <div>
                        {totalItems ? (
                            <span>
                                Toplam {totalItems} kayıttan {(currentPage - 1) * itemsPerPage + 1}-
                                {Math.min(currentPage * itemsPerPage, totalItems)} arası gösteriliyor
                            </span>
                        ) : (
                            <span>Sayfa {currentPage} / {totalPages}</span>
                        )}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => onPageChange(currentPage - 1)}
                            disabled={currentPage === 1}
                            className={`w-7 h-7 rounded-lg border border-white/5 flex items-center justify-center transition-all ${
                                currentPage === 1
                                    ? 'opacity-40 cursor-not-allowed text-gray-600'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5 active:scale-95'
                            }`}
                        >
                            <ChevronLeft size={13} />
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                            .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                            .map((p, index, arr) => {
                                const showDots = index > 0 && p - arr[index - 1] > 1;
                                return (
                                    <React.Fragment key={p}>
                                        {showDots && <span className="px-1 text-gray-600">...</span>}
                                        <button
                                            onClick={() => onPageChange(p)}
                                            className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                                                currentPage === p
                                                    ? 'bg-red-600 text-white shadow-md shadow-red-600/20'
                                                    : 'text-gray-400 hover:text-white hover:bg-white/5 active:scale-95'
                                            }`}
                                        >
                                            {p}
                                        </button>
                                    </React.Fragment>
                                );
                            })}
                        <button
                            onClick={() => onPageChange(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className={`w-7 h-7 rounded-lg border border-white/5 flex items-center justify-center transition-all ${
                                currentPage === totalPages
                                    ? 'opacity-40 cursor-not-allowed text-gray-600'
                                    : 'text-gray-400 hover:text-white hover:bg-white/5 active:scale-95'
                            }`}
                        >
                            <ChevronRight size={13} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
