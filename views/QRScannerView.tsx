import React, { useEffect, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { ArrowLeft, Trophy, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface QRScannerViewProps {
  onBack: () => void;
  onResult: (result: any) => void;
}

const QRScannerView: React.FC<QRScannerViewProps> = ({ onBack, onResult }) => {
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scoreEntry, setScoreEntry] = useState({ teamA: 0, teamB: 0, teamAName: 'Takım A', teamBName: 'Takım B' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);

  useEffect(() => {
    if (showManualInput) return;

    const scanner = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );

    let isScanning = true;

    scanner.render(
      (decodedText) => {
        if (isScanning) {
          isScanning = false;
          setScanResult(decodedText);
          scanner.clear().catch(err => {
            // Ignore clear errors if they happen after success
          });
        }
      },
      (errorMessage) => {
        // Silently handle scan errors
      }
    );

    return () => {
      isScanning = false;
      // Use a small timeout to ensure scanner.clear() doesn't conflict with React's unmounting
      // and check if the element still exists
      const readerElement = document.getElementById("reader");
      if (readerElement) {
        scanner.clear().catch(err => {
          // Ignore cleanup errors on unmount
        });
      }
    };
  }, [showManualInput]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim().length >= 4) {
      setScanResult(manualCode);
      // Mock team names based on code
      setScoreEntry(prev => ({
        ...prev,
        teamAName: 'Kartallar FC',
        teamBName: 'Aslanlar SK'
      }));
    } else {
      setError('Lütfen geçerli bir kod girin (En az 4 karakter)');
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleSubmitScore = () => {
    setIsSubmitting(true);
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
      
      // Pass the result back to App.tsx
      onResult({
        id: scanResult || manualCode,
        teamA: scoreEntry.teamAName,
        teamB: scoreEntry.teamBName,
        scoreA: scoreEntry.teamA,
        scoreB: scoreEntry.teamB,
        date: new Date().toLocaleDateString('tr-TR'),
        time: new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        pitch: 'Saha 1'
      });

      setTimeout(() => {
        onBack();
      }, 2000);
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col">
      {/* Header */}
      <div className="p-6 flex items-center justify-between border-b border-white/5 bg-[#161B22]/50 backdrop-blur-xl sticky top-0 z-50">
        <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-full transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-lg font-bold italic tracking-tight uppercase">QR & KOD SİSTEMİ</h1>
        <div className="w-10"></div>
      </div>

      <div className="flex-1 p-6 flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {!scanResult ? (
            <motion.div 
              key="scanner"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="w-full max-w-sm"
            >
              <div className="text-center mb-8">
                <div className="inline-flex p-4 rounded-3xl bg-blue-500/10 text-blue-400 mb-4">
                  <RefreshCw size={32} className="animate-spin-slow" />
                </div>
                <h2 className="text-2xl font-black italic mb-2 uppercase">KART OKUT VEYA KOD GİR</h2>
                <p className="text-gray-400 text-sm">QR kodu okutun veya manuel olarak kodu girin.</p>
              </div>

              {!showManualInput ? (
                <>
                  <div id="reader" className="overflow-hidden rounded-[32px] border-2 border-dashed border-white/10 bg-black/40"></div>
                  <button 
                    onClick={() => setShowManualInput(true)}
                    className="w-full mt-6 h-14 bg-white/5 border border-white/10 rounded-2xl font-bold text-sm uppercase tracking-widest hover:bg-white/10 transition-all"
                  >
                    MANUEL KOD GİR
                  </button>
                </>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4"
                >
                  <form onSubmit={handleManualSubmit} className="space-y-4">
                    <div className="relative">
                      <input 
                        type="text"
                        value={manualCode}
                        onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                        placeholder="MAÇ KODUNU GİRİN"
                        className="w-full h-16 bg-white/5 border border-white/10 rounded-2xl px-6 font-black text-xl tracking-[0.2em] text-center focus:border-blue-500 focus:bg-white/10 transition-all outline-none"
                        autoFocus
                      />
                      {error && (
                        <p className="text-red-400 text-[10px] font-bold mt-2 text-center uppercase tracking-widest">{error}</p>
                      )}
                    </div>
                    <button 
                      type="submit"
                      className="w-full h-16 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-black text-lg shadow-xl shadow-blue-900/20 transition-all"
                    >
                      KODU DOĞRULA
                    </button>
                    <button 
                      type="button"
                      onClick={() => setShowManualInput(false)}
                      className="w-full text-gray-500 text-xs font-bold uppercase tracking-widest hover:text-white transition-colors"
                    >
                      QR OKUTMAYA DÖN
                    </button>
                  </form>
                </motion.div>
              )}
              
              <div className="mt-8 p-4 rounded-2xl bg-white/5 border border-white/10 flex items-start gap-3">
                <AlertCircle size={20} className="text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-gray-400 leading-relaxed italic">
                  Kod veya QR okutulduğunda ilgili maç otomatik olarak eşleşecek ve skor giriş ekranı açılacaktır.
                </p>
              </div>
            </motion.div>
          ) : !isSuccess ? (
            <motion.div 
              key="score-entry"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-md bg-[#161B22] rounded-[40px] border border-white/10 p-8 shadow-2xl"
            >
              <div className="text-center mb-8">
                <div className="inline-flex p-4 rounded-3xl bg-green-500/10 text-green-400 mb-4">
                  <Trophy size={32} />
                </div>
                <h2 className="text-2xl font-black italic mb-1 uppercase">MAÇ SONUCU</h2>
                <p className="text-gray-400 text-xs uppercase tracking-widest font-bold">Maç ID: {scanResult.slice(0, 8)}</p>
              </div>

              <div className="flex items-center justify-between gap-4 mb-10">
                <div className="flex-1 flex flex-col items-center gap-4">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest text-center h-8 flex items-center">{scoreEntry.teamAName}</span>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setScoreEntry(prev => ({ ...prev, teamA: Math.max(0, prev.teamA - 1) }))}
                      className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-bold hover:bg-white/10"
                    >
                      -
                    </button>
                    <span className="text-5xl font-black italic">{scoreEntry.teamA}</span>
                    <button 
                      onClick={() => setScoreEntry(prev => ({ ...prev, teamA: prev.teamA + 1 }))}
                      className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-bold hover:bg-white/10"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="text-2xl font-black text-gray-700 italic">VS</div>

                <div className="flex-1 flex flex-col items-center gap-4">
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest text-center h-8 flex items-center">{scoreEntry.teamBName}</span>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setScoreEntry(prev => ({ ...prev, teamB: Math.max(0, prev.teamB - 1) }))}
                      className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-bold hover:bg-white/10"
                    >
                      -
                    </button>
                    <span className="text-5xl font-black italic">{scoreEntry.teamB}</span>
                    <button 
                      onClick={() => setScoreEntry(prev => ({ ...prev, teamB: prev.teamB + 1 }))}
                      className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-bold hover:bg-white/10"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              <button 
                onClick={handleSubmitScore}
                disabled={isSubmitting}
                className="w-full h-16 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 text-white rounded-2xl font-black text-lg shadow-xl shadow-blue-900/20 transition-all flex items-center justify-center gap-3"
              >
                {isSubmitting ? (
                  <RefreshCw size={24} className="animate-spin" />
                ) : (
                  <>SKORU KAYDET <CheckCircle2 size={24} /></>
                )}
              </button>

              <button 
                onClick={() => {
                  setScanResult(null);
                  setShowManualInput(false);
                  setManualCode('');
                }}
                className="w-full mt-4 text-gray-500 text-sm font-bold uppercase tracking-widest hover:text-white transition-colors"
              >
                YENİDEN OKUT / KOD GİR
              </button>
            </motion.div>
          ) : (
            <motion.div 
              key="success"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <div className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-green-900/40">
                <CheckCircle2 size={48} className="text-white" />
              </div>
              <h2 className="text-3xl font-black italic mb-2 uppercase">BAŞARILI!</h2>
              <p className="text-gray-400">Maç sonucu sisteme işlendi ve Maçlar bölümüne eklendi.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        #reader__scan_region {
          background: transparent !important;
        }
        #reader__dashboard_section_csr button {
          background: #3b82f6 !important;
          color: white !important;
          border: none !important;
          padding: 8px 16px !important;
          border-radius: 12px !important;
          font-weight: bold !important;
          margin: 10px 0 !important;
        }
        #reader video {
          border-radius: 24px !important;
        }
        .animate-spin-slow {
          animation: spin 3s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default QRScannerView;
