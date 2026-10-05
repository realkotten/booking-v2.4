import { toPersianDigits } from './dateUtils';

/**
 * Global Barbershop Demo Customization Config
 * Easily editable for different client barber pitches
 */
export const STUDIO_CONFIG = {
  name: 'آرایشگاه',
  city: '',
  neighborhood: '',
  address: '',
  phone: '',
  hoursWeekday: 'شنبه تا چهارشنبه: ۱۰:۰۰ تا ۲۰:۰۰',
  hoursWeekend: 'پنجشنبه و جمعه: ۱۰:۰۰ تا ۲۲:۰۰',
  fullHours: 'شنبه تا چهارشنبه: ۱۰:۰۰ تا ۲۰:۰۰ | پنجشنبه و جمعه: ۱۰:۰۰ تا ۲۲:۰۰',
  primaryBarber: {
    name: 'آرایشگر ارشد',
    title: 'سرآرایشگر و مدیر سالن',
    bio: 'سرآرایشگر و متخصص فرم‌دهی مو و اصلاح کلاسیک و مدرن.',
  },
  depositAmount: 20000,
  cancellationPolicyNotice: 'لغو نوبت تا ۲۴ ساعت قبل بدون جریمه امکان‌پذیر است.',
};

/**
 * Formats numbers into Persian Toman currency string, e.g. ۱۵۰,۰۰۰ تومان
 */
export function formatToman(amount: number | string | undefined | null): string {
  if (amount === undefined || amount === null || amount === '') return '۰ تومان';
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount)) || 0;
  const formatted = Math.round(num).toLocaleString('en-US');
  return `${toPersianDigits(formatted)} تومان`;
}

/**
 * Format deposit text
 */
export function formatDeposit(amount = STUDIO_CONFIG.depositAmount): string {
  return formatToman(amount);
}
