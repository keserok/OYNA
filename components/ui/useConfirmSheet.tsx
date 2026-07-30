import React, { useCallback, useState } from 'react';
import { ConfirmSheet } from './ConfirmSheet';

/**
 * FAZ0: `window.confirm` için promise-tabanlı, markalı drop-in.
 *
 *   const { confirm, confirmElement } = useConfirmSheet();
 *   if (await confirm({ title: 'Hesabı sil?', destructive: true })) { ... }
 *   return <>{…}{confirmElement}</>;
 *
 * Geri-alınamaz mutasyonlarda native confirm yerine bunu kullan.
 */
interface ConfirmOpts {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  icon?: React.ReactNode;
}

export function useConfirmSheet() {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(
    null
  );

  const confirm = useCallback(
    (opts: ConfirmOpts) =>
      new Promise<boolean>((resolve) => setState({ ...opts, resolve })),
    []
  );

  const settle = useCallback(
    (result: boolean) =>
      setState((s) => {
        s?.resolve(result);
        return null;
      }),
    []
  );

  const confirmElement = (
    <ConfirmSheet
      open={!!state}
      title={state?.title ?? ''}
      message={state?.message}
      confirmLabel={state?.confirmLabel}
      cancelLabel={state?.cancelLabel}
      destructive={state?.destructive}
      icon={state?.icon}
      onCancel={() => settle(false)}
      onConfirm={() => settle(true)}
    />
  );

  return { confirm, confirmElement };
}
