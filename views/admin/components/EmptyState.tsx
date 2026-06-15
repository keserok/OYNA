import React from 'react';
import { FolderOpen } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Kayıt bulunamadı',
  description = 'Henüz veri yok. Yeni kayıt ekleyebilir veya demo verileri yükleyebilirsiniz.',
  action,
}) => (
  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
    <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center mb-4">
      <FolderOpen size={22} className="text-gray-600" />
    </div>
    <p className="text-sm font-bold text-gray-300">{title}</p>
    <p className="text-xs text-gray-500 mt-1.5 max-w-sm leading-relaxed">{description}</p>
    {action && <div className="mt-5">{action}</div>}
  </div>
);
