/**
 * Zarinpal Client Payment Service
 * All Zarinpal gateway API interactions are strictly executed on the server.
 */

import { getAuthHeaders } from '../api/atelierApi';

export interface ZarinpalRequestPayload {
  bookingId: string;
}

export interface ZarinpalDiagnosticInfo {
  timestamp: string;
  stage: 'initiation' | 'verification' | 'callback';
  zarinpalCode?: number | string | null;
  zarinpalMessage?: string | null;
  zarinpalErrors?: any;
  merchantConfigured?: boolean;
  tokenConfigured?: boolean;
  apiHost?: string;
  isSandbox?: boolean;
  httpStatus?: number;
  explanationFa?: string;
}

export interface ZarinpalRequestResponse {
  success: boolean;
  authority?: string;
  paymentUrl?: string;
  amount?: number;
  currency?: string;
  isSandbox?: boolean;
  error?: string;
  diagnosticLog?: ZarinpalDiagnosticInfo;
}

/**
 * Requests payment session from the server.
 * The server computes the authoritative price from the database and contacts Zarinpal.
 */
export async function requestZarinpalPayment(payload: ZarinpalRequestPayload): Promise<ZarinpalRequestResponse> {
  try {
    const res = await fetch('/api/payment/zarinpal/request', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        bookingId: payload.bookingId,
      }),
    });

    const text = await res.text();
    let data: ZarinpalRequestResponse;
    try {
      data = JSON.parse(text);
    } catch {
      return {
        success: false,
        error: `خطا در دریافت پاسخ از سرور پرداخت (کد وضعیت: ${res.status})`,
      };
    }

    return data;
  } catch (err: any) {
    console.error('[PaymentService] Error requesting Zarinpal payment:', err);
    return {
      success: false,
      error: err.message || 'خطا در برقراری ارتباط با سرور پرداخت',
    };
  }
}

/**
 * Checks transaction status from the server
 */
export async function getZarinpalPaymentStatus(authority: string) {
  try {
    const res = await fetch(`/api/payment/zarinpal/status/${encodeURIComponent(authority)}`);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return { success: false, error: 'پاسخ نامعتبر از سرور' };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Programmatically verifies a Zarinpal transaction on the server
 */
export async function verifyZarinpalPayment(payload: { authority?: string; bookingId?: string }): Promise<{
  success: boolean;
  code?: number | string;
  refId?: string;
  booking?: any;
  error?: string;
  explanation?: string;
  alreadyVerified?: boolean;
}> {
  try {
    const res = await fetch('/api/payment/zarinpal/verify', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'خطا در ارتباط با سرور جهت تأیید پرداخت',
    };
  }
}

