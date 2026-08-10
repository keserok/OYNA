import React, { Component, ErrorInfo, ReactNode } from 'react';
import { captureException } from '../utils/observability';

interface Props {
  children?: ReactNode;
  /** "Geri Dön" tıklanınca çalışır. Verilmezse: geçmişe dön / sayfayı tazele. */
  onBack?: () => void;
  /** Başlık (varsayılan: "Bir sorun var."). */
  title?: string;
  /** Açıklama (varsayılan: "Sorun Oyna tarafına iletildi."). */
  message?: string;
  /** Buton etiketi (varsayılan: "Geri Dön"). */
  backLabel?: string;
  /**
   * true (varsayılan): tam ekran kaplar (uygulama kökü için).
   * false: içine gömüldüğü alanı kaplar (bir sekme/bölüm için).
   */
  fullScreen?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Hata Oyna tarafına raporlanır ("Sorun Oyna tarafına iletildi").
    console.error('Uncaught error:', error, errorInfo);
    captureException(error, { where: 'ErrorBoundary', componentStack: errorInfo.componentStack });
  }

  private handleBack = () => {
    const { onBack } = this.props;
    // Önce güvenli bir yere git, sonra sınırı sıfırla ki çöken içerik yeniden
    // denenmesin (yeni görünüm zaten farklıdır).
    try {
      if (onBack) {
        onBack();
      } else if (typeof window !== 'undefined' && window.history.length > 1) {
        window.history.back();
      } else if (typeof window !== 'undefined') {
        window.location.reload();
        return;
      }
    } finally {
      this.setState({ hasError: false, error: null });
    }
  };

  public render() {
    if (this.state.hasError) {
      const {
        title = 'Bir sorun var.',
        message = 'Sorun Oyna tarafına iletildi.',
        backLabel = 'Geri Dön',
        fullScreen = true,
      } = this.props;

      return (
        <div
          className={`w-full ${fullScreen ? 'min-h-screen' : 'min-h-[70vh]'} bg-bg text-white flex flex-col items-center justify-center p-6`}
        >
          <div className="w-full max-w-sm text-center">
            {/* İkon */}
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div className="absolute inset-0 rounded-full bg-warning/10 blur-xl" />
              <div className="relative w-20 h-20 rounded-3xl bg-surface-1 border border-warning/25 flex items-center justify-center shadow-2xl">
                <svg className="w-9 h-9 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.007M10.34 3.94l-8.06 13.5A1.5 1.5 0 003.57 19.5h16.86a1.5 1.5 0 001.29-2.06l-8.06-13.5a1.5 1.5 0 00-2.58 0z" />
                </svg>
              </div>
            </div>

            <h1 className="text-2xl font-extrabold tracking-tight mb-2">{title}</h1>
            <p className="text-sm text-gray-400 leading-relaxed mb-1">{message}</p>
            <p className="text-xs text-ink-4 mb-8">
              En kısa sürede çözülecek. Bu ekrandan geri dönebilirsin.
            </p>

            <button
              type="button"
              onClick={this.handleBack}
              className="w-full h-14 rounded-2xl bg-warning text-black font-extrabold text-sm uppercase tracking-widest hover:bg-yellow-300 active:scale-95 transition-all outline-none inline-flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              {backLabel}
            </button>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mt-6 p-4 bg-black/50 rounded-xl text-left overflow-auto text-xs text-red-400 border border-red-500/20">
                <p className="font-mono break-words">{this.state.error.toString()}</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
