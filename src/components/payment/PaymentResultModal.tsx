import React, { useState } from 'react';
import { CheckCircle2, XCircle, ArrowRight, ShieldCheck, Receipt, Sparkles, AlertTriangle, Bug, Copy, Check } from 'lucide-react';
import { formatPrice } from '../../utils/formatUtils';
import { toPersianDigits } from '../../utils/dateUtils';
import { Button } from '@/components/ui/button';
import { ZarinpalDiagnosticInfo } from '../../services/paymentService';

export interface PaymentResultData {
  status: 'success' | 'failed';
  refId?: string;
  authority?: string;
  targetId?: string;
  targetType?: string;
  amount?: number;
  message?: string;
  errorCode?: string | number;
  explanation?: string;
  alreadyVerified?: boolean;
  diagnosticLog?: ZarinpalDiagnosticInfo;
}

interface PaymentResultModalProps {
  data: PaymentResultData;
  onClose: () => void;
  onViewAppointment?: (id: string) => void;
}

export const PaymentResultModal: React.FC<PaymentResultModalProps> = ({
  data,
  onClose,
  onViewAppointment,
}) => {
  const isSuccess = data.status === 'success';
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyDiagnostics = () => {
    const report = {
      status: data.status,
      authority: data.authority || 'N/A',
      refId: data.refId || 'N/A',
      errorCode: data.errorCode || 'N/A',
      explanation: data.explanation || 'N/A',
      message: data.message || 'N/A',
      amount: data.amount,
      targetId: data.targetId,
      targetType: data.targetType,
      timestamp: new Date().toISOString(),
      diagnosticLog: data.diagnosticLog || null,
    };

    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-fade-in" dir="rtl">
      <div className="w-full max-w-sm overflow-hidden rounded-[28px] bg-white shadow-2xl border border-stone-200/80 p-5 space-y-4 text-center">
        {/* Luminous Header Icon */}
        <div className="flex justify-center pt-2">
          {isSuccess ? (
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-inner">
                <CheckCircle2 className="w-10 h-10 stroke-[2.2]" />
              </div>
              <div className="absolute -top-1 -right-1 bg-emerald-500 text-white rounded-full p-1 shadow-xs">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shadow-inner">
              <XCircle className="w-10 h-10 stroke-[2.2]" />
            </div>
          )}
        </div>

        {/* Title and Subtitle */}
        <div className="space-y-1">
          <h2 className="text-base font-serif font-black text-stone-900">
            {isSuccess ? 'تأییدیه پرداخت اینترنتی زرین‌پال' : 'پرداخت ناموفق بود'}
          </h2>
          <p className="text-xs text-stone-500 leading-relaxed">
            {isSuccess
              ? (data.alreadyVerified
                  ? 'این تراکنش پیش‌تر اعتبارسنجی و در سامانه نوبت‌دهی ثبت شده است.'
                  : 'تراکنش شما با موفقیت در شبکه شاپرک تأیید و نوبت قطعی گردید.')
              : (data.explanation || data.message || 'عملیات پرداخت توسط کاربر لغو گردید یا با خطا مواجه شد.')}
          </p>
        </div>

        {/* Transaction Receipt Box */}
        <div className="rounded-2xl bg-stone-50 border border-stone-200/80 p-3.5 space-y-2 text-xs text-right">
          <div className="flex items-center justify-between pb-2 border-b border-stone-200/60 text-stone-600 font-bold">
            <span className="flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-[#bf5938]" />
              رسید دیجیتال زرین‌پال
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${isSuccess ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
              {isSuccess ? 'پرداخت موفق' : 'لغوشده / ناموفق'}
            </span>
          </div>

          {data.amount && data.amount > 0 ? (
            <div className="flex items-center justify-between">
              <span className="text-stone-500">مبلغ تراکنش:</span>
              <span className="font-black text-stone-900 tabular-nums">
                {formatPrice(data.amount)}
              </span>
            </div>
          ) : null}

          {data.refId && (
            <div className="flex items-center justify-between">
              <span className="text-stone-500">کد رهگیری / ارجاع شاپرک:</span>
              <span className="font-mono font-bold text-emerald-800 tracking-wider" dir="ltr">
                {toPersianDigits(data.refId)}
              </span>
            </div>
          )}

          {data.authority && (
            <div className="flex items-center justify-between">
              <span className="text-stone-500">شناسه پیگیری زرین‌پال:</span>
              <span className="font-mono text-[10px] text-stone-600 truncate max-w-[160px]" dir="ltr">
                {data.authority}
              </span>
            </div>
          )}

          {data.errorCode && (
            <div className="flex items-center justify-between pt-1 border-t border-dashed border-stone-200">
              <span className="text-stone-500 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                کد خطای زرین‌پال:
              </span>
              <span className="font-mono font-bold text-rose-600 px-1.5 py-0.5 bg-rose-50 rounded text-[11px]" dir="ltr">
                {data.errorCode}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 text-[11px] text-stone-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-stone-400" />
              درگاه رسمی زرین‌پال
            </span>
            <span>{toPersianDigits(new Date().toLocaleDateString('fa-IR'))}</span>
          </div>
        </div>

        {/* Expandable Diagnostic Technical Log */}
        {(!isSuccess || data.errorCode || data.diagnosticLog) && (
          <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-3 text-right">
            <button
              type="button"
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="flex w-full items-center justify-between text-xs font-bold text-stone-700 cursor-pointer"
            >
              <span className="flex items-center gap-1.5 text-stone-600">
                <Bug className="w-3.5 h-3.5 text-[#bf5938]" />
                گزارش فنی و لاگ عیب‌یابی زرین‌پال
              </span>
              <span className="text-[10px] text-stone-400">
                {showDiagnostics ? 'بستن' : 'مشاهده جزئیات'}
              </span>
            </button>

            {showDiagnostics && (
              <div className="mt-2.5 space-y-2 pt-2 border-t border-stone-200/60 text-[11px] text-stone-600">
                {data.explanation && (
                  <div className="p-2 rounded-xl bg-amber-50/80 border border-amber-200/60 text-amber-900 leading-relaxed">
                    <span className="font-bold">تشخیص: </span>
                    {data.explanation}
                  </div>
                )}

                <div className="p-2 rounded-xl bg-stone-900 text-stone-300 font-mono text-[10px] overflow-x-auto text-left" dir="ltr">
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(
                      {
                        stage: data.diagnosticLog?.stage || 'redirection_callback',
                        zarinpalCode: data.errorCode || data.diagnosticLog?.zarinpalCode || 'N/A',
                        zarinpalMessage: data.message || data.diagnosticLog?.zarinpalMessage || 'N/A',
                        authority: data.authority,
                        timestamp: data.diagnosticLog?.timestamp || new Date().toISOString(),
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>

                <button
                  type="button"
                  onClick={handleCopyDiagnostics}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 font-bold transition-colors cursor-pointer text-[10px]"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-700">کپی شد</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>کپی گزارش فنی برای پشتیبانی</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          {isSuccess && data.targetId && onViewAppointment ? (
            <Button
              variant="accent"
              className="w-full py-3 rounded-2xl text-xs font-bold shadow-md cursor-pointer flex items-center justify-center gap-1.5"
              onClick={() => onViewAppointment(data.targetId!)}
            >
              <span>مشاهده کارت دیجیتال ورود</span>
              <ArrowRight className="w-4 h-4 rotate-180" />
            </Button>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-2xl border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 text-xs font-bold transition-colors cursor-pointer"
          >
            {isSuccess ? 'بستن و بازگشت به سالن' : 'تلاش مجدد و بازگشت'}
          </button>
        </div>
      </div>
    </div>
  );
};

