import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  ShieldCheck, 
  Sparkles, 
  CalendarCheck, 
  Loader2, 
  AlertCircle,
  User, 
  KeyRound, 
  CheckCircle2, 
  Lock, 
  ArrowRight,
  UserCheck
} from 'lucide-react';
import { useAtelier } from '../../store/AtelierContext';
import { hapticSuccess, hapticError, hapticLight } from '../../utils/hapticUtils';
import { toEnglishDigits } from '../../utils/dateUtils';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'login' | 'register' | 'phone';
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  defaultMode = 'phone',
  onSuccess
}) => {
  const { loginClientGoogle, loginClientCredentials } = useAtelier();
  const [authMode, setAuthMode] = useState<'google' | 'admin'>(defaultMode === 'login' ? 'admin' : 'google');
  
  // Admin credentials state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [googleAvailable, setGoogleAvailable] = useState<boolean>(true);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  // Initialize Google Identity Services
  useEffect(() => {
    if (!isOpen || authMode !== 'google') return;

    let timer: any = null;
    const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
    if (!clientId) {
      setGoogleAvailable(false);
      return;
    }

    if (!document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const tryInitGoogle = () => {
      const g = (window as any).google;
      if (g?.accounts?.id && clientId) {
        try {
          g.accounts.id.initialize({
            client_id: clientId,
            callback: async (response: any) => {
              if (response?.credential) {
                setIsLoading(true);
                hapticLight();
                const res = await loginClientGoogle(response.credential);
                setIsLoading(false);
                if (res.success) {
                  hapticSuccess();
                  setSuccessMessage('ورود با حساب گوگل با موفقیت انجام شد!');
                  setTimeout(() => {
                    if (onSuccess) onSuccess();
                    onClose();
                  }, 600);
                } else {
                  hapticError();
                  setErrorMessage(res.error || 'خطا در اعتبارسنجی ورود با گوگل.');
                }
              }
            },
          });

          if (googleBtnRef.current) {
            googleBtnRef.current.innerHTML = '';
            g.accounts.id.renderButton(googleBtnRef.current, {
              theme: 'outline',
              size: 'large',
              width: 320,
              shape: 'pill',
              text: 'continue_with',
            });
            setGoogleAvailable(true);
          }
          return true;
        } catch {
          setGoogleAvailable(false);
          return false;
        }
      }
      return false;
    };

    if (!tryInitGoogle()) {
      // Retry once after 600ms in case the script is still downloading
      timer = setTimeout(() => {
        if (!tryInitGoogle()) {
          setGoogleAvailable(false);
        }
      }, 700);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isOpen, authMode, loginClientGoogle, onClose, onSuccess]);

  if (!isOpen) return null;

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanIdent = toEnglishDigits(identifier).trim();
    const cleanPass = toEnglishDigits(password).trim();

    if (!cleanIdent || !cleanPass) {
      setErrorMessage('نام کاربری/شماره همراه و رمز عبور را وارد نمایید.');
      hapticError();
      return;
    }

    setIsLoading(true);
    hapticLight();

    const res = await loginClientCredentials(cleanIdent, cleanPass);
    setIsLoading(false);

    if (res.success) {
      hapticSuccess();
      setSuccessMessage('ورود موفقیت‌آمیز به پنل مدیریت سالن!');
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 600);
    } else {
      hapticError();
      setErrorMessage(res.error || 'اطلاعات ورود نامعتبر است یا این حساب متعلق به مدیران نمی‌باشد.');
    }
  };

  const handleContinueAsGuest = () => {
    hapticLight();
    if (onSuccess) onSuccess();
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
      dir="rtl"
    >
      <div 
        className="relative w-full max-w-[420px] bg-white/95 backdrop-blur-2xl border border-white/90 rounded-[36px] p-6 sm:p-7 shadow-2xl text-stone-900 overflow-hidden"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 left-5 w-8 h-8 rounded-full bg-stone-100 text-stone-500 hover:text-stone-900 hover:bg-stone-200 flex items-center justify-center transition-colors cursor-pointer"
          title="بستن"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Brand Crest Header */}
        <div className="text-center pt-2 pb-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#3b333a] to-[#211c20] text-white mx-auto flex items-center justify-center mb-3 shadow-lg shadow-stone-900/15">
            <Sparkles className="w-7 h-7 text-[#e4ddf6]" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f4f2f9] border border-[#e4ddf6] text-[#453743] text-xs font-semibold mb-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>سامانه امن آتلیه رویال</span>
          </div>
          <h2 className="text-xl font-bold text-stone-900 tracking-tight">
            {authMode === 'google' ? 'ورود به حساب کاربری' : 'ورود مدیریت آرایشگاه'}
          </h2>
          <p className="text-xs text-stone-600 mt-1 max-w-[290px] mx-auto leading-relaxed">
            {authMode === 'google'
              ? 'ورود با حساب گوگل یا ادامه به عنوان مهمان بدون نیاز به ثبت‌نام'
              : 'صرفاً ویژه مدیریت و کادر پرسنلی سالن'}
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex bg-stone-100/90 p-1 rounded-2xl mb-5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => { setAuthMode('google'); setErrorMessage(null); }}
            className={`flex-1 py-2 rounded-xl transition-all cursor-pointer ${
              authMode === 'google' 
                ? 'bg-white text-stone-900 shadow-sm font-bold' 
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            مشتریان (گوگل و مهمان)
          </button>
          <button
            type="button"
            onClick={() => { setAuthMode('admin'); setErrorMessage(null); }}
            className={`flex-1 py-2 rounded-xl transition-all cursor-pointer ${
              authMode === 'admin' 
                ? 'bg-white text-stone-900 shadow-sm font-bold' 
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            ورود مدیریت
          </button>
        </div>

        {/* Messages */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <p className="leading-relaxed">{errorMessage}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="font-semibold">{successMessage}</p>
          </div>
        )}

        {/* ─── Mode 1: Customer Google & Guest ─────────────────────────────────── */}
        {authMode === 'google' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 text-center space-y-3">
              <p className="text-xs text-stone-600 leading-relaxed font-medium">
                برای رزرو نوبت نیازی به ایجاد حساب کاربری نیست؛ داده‌های شما با بلیت مهمان روی همین مرورگر محفوظ خواهد ماند. همچنین می‌توانید برای همگام‌سازی ابری با گوگل وارد شوید:
              </p>

              {/* Google Button Mount Point */}
              <div className="flex justify-center items-center min-h-[44px]">
                <div ref={googleBtnRef} className="flex justify-center" />
              </div>

              {!googleAvailable && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] leading-relaxed text-right">
                  سرویس ورود گوگل در این مرورگر در دسترس نیست یا مسدود شده است. شما می‌توانید به راحتی به عنوان مهمان نوبت خود را ثبت فرمایید.
                </div>
              )}
            </div>

            {/* Continue as Guest Button */}
            <button
              type="button"
              onClick={handleContinueAsGuest}
              className="w-full py-3.5 px-4 bg-gradient-to-b from-white to-[#f1f5f9] hover:from-white hover:to-[#e2e8f0] text-[#0f172a] border border-white ring-1 ring-white/80 rounded-2xl font-black text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <UserCheck className="w-4 h-4 text-emerald-600" />
              <span>ادامه به عنوان مهمان (بدون نیاز به ثبت‌نام)</span>
              <ArrowRight className="w-4 h-4 rotate-180 text-[#0f172a]" />
            </button>
          </div>
        )}

        {/* ─── Mode 2: Admin Password / Credentials ─────────────────────────────── */}
        {authMode === 'admin' && (
          <form onSubmit={handleAdminSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                نام کاربری یا شماره همراه مدیر
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="0912... یا نام کاربری مدیریت"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  dir="ltr"
                  className="w-full bg-stone-50 border border-stone-200 rounded-2xl py-3 px-3.5 text-left text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#5a4a58]/30 focus:border-[#5a4a58] transition-all"
                  required
                />
                <User className="w-4 h-4 text-stone-400 absolute right-3 top-3.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                رمز عبور مدیریت
              </label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  dir="ltr"
                  className="w-full bg-stone-50 border border-stone-200 rounded-2xl py-3 px-3.5 text-left text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#5a4a58]/30 focus:border-[#5a4a58] transition-all"
                  required
                />
                <Lock className="w-4 h-4 text-stone-400 absolute right-3 top-3.5" />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3.5 px-4 bg-gradient-to-b from-white to-[#f1f5f9] hover:from-white hover:to-[#e2e8f0] text-[#0f172a] border border-white ring-1 ring-white/80 rounded-2xl font-black text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#0f172a]" />
                  <span>در حال بررسی دسترسی...</span>
                </>
              ) : (
                <>
                  <span>ورود به پنل مدیریت</span>
                  <KeyRound className="w-4 h-4 text-[#0f172a]" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Feature badges footer */}
        <div className="mt-5 pt-4 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500 font-medium">
          <div className="flex items-center gap-1">
            <CalendarCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>نوبت‌دهی خودکار</span>
          </div>
          <div className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
            <span>بلیت امن مهمان</span>
          </div>
          <div className="flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>حفظ کامل حریم خصوصی</span>
          </div>
        </div>
      </div>
    </div>
  );
};
