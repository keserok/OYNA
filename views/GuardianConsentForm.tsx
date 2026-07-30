import React, { useEffect, useState } from 'react';
import { ArrowLeft, ShieldCheck, Lock, Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import {
  lookupMinorByCode, createGuardianConsent, revokeGuardianConsent, getConsentsIGave,
  guardianErrorMessage, MinorLookupResult, ActiveConsentRow,
} from '../services/guardianService';
import { recordUserConsent } from '../services/consentService';

interface GuardianConsentFormProps {
  onBack: () => void;
}

const CONSENT_VERSION = '2026-07-14';

const MUVAFAKAT = `Aşağıda kimliği belirtilen veli/vasi olarak;

1. Beyan ettiğim kimlik bilgilerinin (ad-soyad, T.C. Kimlik No, doğum tarihi) ve çocuğuma ait bilgilerin doğru olduğunu,
2. 18 yaşından büyük olduğumu ve çocuğun velisi/yasal temsilcisi sıfatını taşıdığımı,
3. Çocuğumun OYNA uygulamasını kullanmasına, halı saha rezervasyonu yapmasına, maçlara katılmasına ve bunlara ilişkin ödemeleri gerçekleştirmesine muvafakat ettiğimi,
4. Bu muvafakatin, geri almadığım sürece çocuğumun olağan işlemlerini kapsadığını; her işlem için ayrıca onay istenmeyeceğini (Kullanım Şartları md. 4.4),
5. Muvafakati dilediğim zaman destek@oyna.app üzerinden veya bu ekrandan geri alabileceğimi; geri almanın 48 saat içinde etkili olacağını,
6. T.C. Kimlik numaralarının KVKK'ya uygun biçimde şifrelenerek (hash) yalnızca doğrulama amacıyla saklanacağını, açık biçimde tutulmayacağını

kabul, beyan ve taahhüt ederim.`;

const TC_RE = /^[1-9][0-9]{10}$/;
const isAdult = (birthdate: string): boolean => {
  if (!birthdate) return false;
  const d = new Date(birthdate);
  const c = new Date();
  c.setFullYear(c.getFullYear() - 18);
  return d <= c;
};

type Step = 'code' | 'form' | 'done' | 'manage';

const label = 'block text-[0.8125rem] font-semibold text-slate-700 mb-1.5';
const field = 'w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-[0.9375rem] outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition';

const GuardianConsentForm: React.FC<GuardianConsentFormProps> = ({ onBack }) => {
  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [minor, setMinor] = useState<MinorLookupResult | null>(null);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [gName, setGName] = useState('');
  const [gTc, setGTc] = useState('');
  const [gBirth, setGBirth] = useState('');
  const [mName, setMName] = useState('');
  const [mTc, setMTc] = useState('');
  const [mBirth, setMBirth] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [consents, setConsents] = useState<ActiveConsentRow[]>([]);

  const doLookup = async () => {
    setError(null);
    if (!code.trim()) { setError('Lütfen çocuğunuzun size verdiği kodu girin.'); return; }
    setLooking(true);
    try {
      const res = await lookupMinorByCode(code);
      if (!res.found) {
        setError('Kod geçersiz veya bu hesap için onay verilemiyor. Kodu kontrol edin.');
        return;
      }
      setMinor(res);
      setStep('form');
    } catch (e) {
      setError(guardianErrorMessage(e));
    } finally {
      setLooking(false);
    }
  };

  const validate = (): string | null => {
    if (!gName.trim() || !mName.trim()) return 'Ad-soyad alanları boş bırakılamaz.';
    if (!TC_RE.test(gTc.trim()) || !TC_RE.test(mTc.trim())) return 'T.C. Kimlik No 11 haneli ve geçerli olmalı.';
    if (!gBirth) return 'Kendi doğum tarihinizi girin.';
    if (!isAdult(gBirth)) return 'Onay veren veli 18 yaşından büyük olmalı.';
    if (!mBirth) return 'Çocuğun doğum tarihini girin.';
    if (isAdult(mBirth)) return 'Girdiğiniz doğum tarihine göre çocuk reşit görünüyor; veli onayı gerekmez.';
    if (!agreed) return 'Devam etmek için muvafakatnameyi onaylamalısınız.';
    return null;
  };

  const submit = async () => {
    const v = validate();
    if (v) { setError(v); return; }
    setError(null);
    setSubmitting(true);
    try {
      await createGuardianConsent({
        code, guardianFullName: gName, guardianTc: gTc, guardianBirthdate: gBirth,
        minorFullName: mName, minorTc: mTc, minorBirthdate: mBirth, consentTextVersion: CONSENT_VERSION,
      });
      // Denetim kaydı (best-effort)
      recordUserConsent('VELI', CONSENT_VERSION).catch(() => {});
      setStep('done');
    } catch (e) {
      setError(guardianErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const openManage = async () => {
    setError(null);
    setStep('manage');
    try { setConsents(await getConsentsIGave()); } catch { /* yoksay */ }
  };

  const revoke = async (minorId: string) => {
    try {
      await revokeGuardianConsent(minorId);
      setConsents((c) => c.filter((x) => x.minor_user_id !== minorId));
    } catch (e) {
      setError(guardianErrorMessage(e));
    }
  };

  return (
    <div className="fixed inset-0 bg-white text-slate-900 overflow-y-auto" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Resmi başlık şeridi */}
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-slate-200 px-5 py-4 flex items-center gap-3">
        <button onClick={onBack} aria-label="Geri" className="w-11 h-11 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95 transition">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-[1.0625rem] font-bold text-slate-900 leading-tight">Veli Onayı</h1>
          <p className="text-[0.6875rem] text-slate-500">OYNA · Reşit olmayan kullanıcı muvafakati</p>
        </div>
        <div className="flex items-center gap-1 text-emerald-600" title="Güvenli"><Lock size={14} /><span className="text-[0.6875rem] font-semibold">Güvenli</span></div>
      </header>

      <main className="max-w-lg mx-auto px-5 py-6 pb-24">
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-[0.8125rem] text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" /><span>{error}</span>
          </div>
        )}

        {/* ─── Adım: KOD ─── */}
        {step === 'code' && (
          <>
            <p className="text-[0.9375rem] leading-relaxed text-slate-600 mb-6">
              Çocuğunuzun OYNA uygulamasında gördüğü <b className="text-slate-900">Veli Bağlantı Kodunu</b> girin.
              Kimliğinizi doğruladıktan sonra çocuğunuzun ödeme yapmasına ve maçlara katılmasına onay verebilirsiniz.
            </p>
            <label className={label}>Veli Bağlantı Kodu</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ÖRN: K7M2P9QX"
              maxLength={12}
              autoCapitalize="characters"
              className={`${field} tracking-[0.2em] font-bold text-center text-lg`}
            />
            <button onClick={doLookup} disabled={looking} className="w-full mt-5 h-13 py-3.5 rounded-xl bg-emerald-600 text-white font-bold text-[0.9375rem] flex items-center justify-center gap-2 hover:bg-emerald-700 active:scale-[0.99] transition disabled:opacity-60">
              {looking ? <Loader2 size={18} className="animate-spin" /> : <>Devam Et <ChevronRight size={18} /></>}
            </button>
            <button onClick={openManage} className="w-full mt-3 text-center text-[0.8125rem] text-slate-500 hover:text-slate-800 py-2 transition">
              Daha önce verdiğim onayları görüntüle
            </button>
          </>
        )}

        {/* ─── Adım: FORM ─── */}
        {step === 'form' && minor && (
          <>
            <div className="mb-5 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3.5 flex items-center gap-3">
              <ShieldCheck size={22} className="text-emerald-600 shrink-0" />
              <div className="text-[0.8125rem] text-slate-700">
                Onaylanacak çocuk: <b className="text-slate-900">{minor.masked_name}</b>
                {minor.age_range ? ` · ${minor.age_range} yaş aralığı` : ''}
              </div>
            </div>

            <h2 className="text-[0.8125rem] font-bold uppercase tracking-wider text-slate-600 mb-3">Veli Bilgileri (siz)</h2>
            <div className="space-y-3 mb-6">
              <div><label className={label}>Ad Soyad</label><input value={gName} onChange={(e) => setGName(e.target.value)} className={field} placeholder="Adınız Soyadınız" /></div>
              <div><label className={label}>T.C. Kimlik No</label><input value={gTc} onChange={(e) => setGTc(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={11} className={field} placeholder="11 haneli" /></div>
              <div><label className={label}>Doğum Tarihiniz</label><input value={gBirth} onChange={(e) => setGBirth(e.target.value)} type="date" className={field} /></div>
            </div>

            <h2 className="text-[0.8125rem] font-bold uppercase tracking-wider text-slate-600 mb-3">Çocuğun Bilgileri</h2>
            <div className="space-y-3 mb-6">
              <div><label className={label}>Ad Soyad</label><input value={mName} onChange={(e) => setMName(e.target.value)} className={field} placeholder="Çocuğun adı soyadı" /></div>
              <div><label className={label}>T.C. Kimlik No</label><input value={mTc} onChange={(e) => setMTc(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={11} className={field} placeholder="11 haneli" /></div>
              <div><label className={label}>Doğum Tarihi</label><input value={mBirth} onChange={(e) => setMBirth(e.target.value)} type="date" className={field} /></div>
            </div>

            <h2 className="text-[0.8125rem] font-bold uppercase tracking-wider text-slate-600 mb-2">Muvafakatname</h2>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 mb-4 max-h-56 overflow-y-auto">
              <pre className="whitespace-pre-wrap font-sans text-[0.8125rem] leading-relaxed text-slate-700">{MUVAFAKAT}</pre>
            </div>

            <label className="flex items-start gap-3 mb-5 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 w-5 h-5 accent-emerald-600" />
              <span className="text-[0.8125rem] text-slate-700 leading-relaxed">Yukarıdaki muvafakatnameyi okudum; veli/vasi sıfatıyla beyan ve taahhütleri kabul ediyorum.</span>
            </label>

            <div className="flex items-center gap-2 mb-5 text-[0.75rem] text-slate-500">
              <Lock size={13} className="shrink-0" />
              <span>T.C. Kimlik numaraları şifrelenerek (hash) saklanır; açık biçimde tutulmaz.</span>
            </div>

            <button onClick={submit} disabled={submitting} className="w-full py-3.5 rounded-xl bg-emerald-600 text-white font-bold text-[0.9375rem] flex items-center justify-center gap-2 hover:bg-emerald-700 active:scale-[0.99] transition disabled:opacity-60">
              {submitting ? <Loader2 size={18} className="animate-spin" /> : 'Onayı Tamamla'}
            </button>
          </>
        )}

        {/* ─── Adım: TAMAMLANDI ─── */}
        {step === 'done' && (
          <div className="text-center pt-10">
            <div className="w-20 h-20 mx-auto rounded-full bg-emerald-100 flex items-center justify-center mb-5">
              <ShieldCheck size={40} className="text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Onay tamamlandı</h2>
            <p className="text-[0.9375rem] text-slate-600 leading-relaxed max-w-sm mx-auto">
              Çocuğunuzun hesabı açıldı; artık ödeme yapabilir ve maçlara katılabilir.
              Bu onayı dilediğiniz zaman geri alabilirsiniz.
            </p>
            <button onClick={onBack} className="mt-8 px-8 py-3 rounded-xl bg-slate-900 text-white font-bold text-[0.9375rem] hover:bg-slate-800 active:scale-[0.99] transition">
              Bitir
            </button>
          </div>
        )}

        {/* ─── Adım: YÖNETİM (geri alma) ─── */}
        {step === 'manage' && (
          <>
            <button onClick={() => { setStep('code'); setError(null); }} className="text-[0.8125rem] text-emerald-600 font-semibold mb-4">← Yeni onay ver</button>
            <h2 className="text-[0.9375rem] font-bold text-slate-900 mb-4">Verdiğim Aktif Onaylar</h2>
            {consents.length === 0 ? (
              <p className="text-[0.875rem] text-slate-500">Henüz aktif bir onayınız yok.</p>
            ) : (
              <div className="space-y-3">
                {consents.map((c) => (
                  <div key={c.minor_user_id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3.5">
                    <div>
                      <div className="text-[0.9375rem] font-semibold text-slate-900">{c.minor_full_name}</div>
                      <div className="text-[0.75rem] text-slate-500">Onay: {new Date(c.consented_at).toLocaleDateString('tr-TR')}</div>
                    </div>
                    <button onClick={() => revoke(c.minor_user_id)} className="text-[0.8125rem] font-semibold text-red-600 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition">
                      Geri Al
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default GuardianConsentForm;
