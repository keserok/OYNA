import React from 'react';
import type { GodViewSubRoute } from '../GodViewPanel';
import { ACCENT_STYLES, getRouteMeta } from '../design/adminRoutes';

interface PageShellProps {
  route?: GodViewSubRoute | string;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  stats?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: 'full' | '6xl' | '4xl';
}

export const PageShell: React.FC<PageShellProps> = ({
  route,
  title,
  description,
  icon,
  actions,
  stats,
  children,
  maxWidth = 'full',
}) => {
  const meta = route ? getRouteMeta(route) : null;
  const resolvedTitle = title ?? meta?.title ?? 'Modül';
  const resolvedDesc = description ?? meta?.description ?? '';
  const accent = meta?.accent ?? 'red';
  const accentStyle = ACCENT_STYLES[accent];

  const widthClass = maxWidth === '6xl' ? 'max-w-6xl mx-auto' : maxWidth === '4xl' ? 'max-w-4xl mx-auto' : '';

  return (
    <div className={`p-4 md:p-6 lg:p-8 space-y-6 ${widthClass}`}>
      {/* Page header — Stripe / Linear style */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          {icon && (
            <div className={`shrink-0 w-11 h-11 rounded-2xl bg-[#161B22] border border-white/10 flex items-center justify-center ring-1 ${accentStyle.ring}`}>
              <span className={accentStyle.icon}>{icon}</span>
            </div>
          )}
          <div className="min-w-0">
            {meta?.group && (
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-1">{meta.group}</p>
            )}
            <h1 className="text-xl md:text-2xl font-extrabold text-white tracking-tight truncate">{resolvedTitle}</h1>
            {resolvedDesc && (
              <p className="text-sm text-gray-500 mt-1 max-w-2xl leading-relaxed">{resolvedDesc}</p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 shrink-0 lg:pt-1">
            {actions}
          </div>
        )}
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats}
        </div>
      )}

      <div className="space-y-6">
        {children}
      </div>
    </div>
  );
};
