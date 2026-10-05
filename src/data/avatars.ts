import classicGentleman from '../assets/images/classic_gentleman_avatar_1790231936094.jpg';
import modernFade from '../assets/images/modern_fade_avatar_1790231950418.jpg';
import royalCrest from '../assets/images/royal_barber_crest_1790231964386.jpg';
import executiveGrooming from '../assets/images/executive_grooming_1790231976966.jpg';
import leoZodiac from '../assets/images/leo_zodiac_avatar_1790231168137.jpg';
import scorpioZodiac from '../assets/images/scorpio_zodiac_avatar_1790231184590.jpg';
import ariesZodiac from '../assets/images/aries_zodiac_avatar_1790231199171.jpg';
import piscesZodiac from '../assets/images/pisces_zodiac_avatar_1790231211740.jpg';
import highElfMage from '../assets/images/high_elf_mage_1790232197310.jpg';
import solarPaladin from '../assets/images/solar_paladin_1790232219764.jpg';
import dragonLord from '../assets/images/dragon_lord_avatar_1790232233381.jpg';
import shadowSorcerer from '../assets/images/shadow_sorcerer_1790232247860.jpg';
import cyberKitsune from '../assets/images/cyber_kitsune_1790232260785.jpg';
import phoenixGuardian from '../assets/images/phoenix_guardian_1790232274445.jpg';
import rickAvatar from '../assets/images/rick_sanchez_avatar_1790227092262.jpg';
import mortyAvatar from '../assets/images/morty_smith_avatar_1790227109972.jpg';
import dipperAvatar from '../assets/images/dipper_pines_avatar_1790227125464.jpg';
import billCipherAvatar from '../assets/images/bill_cipher_avatar_1790227163568.jpg';
import mabelAvatar from '../assets/images/mabel_avatar_1790227179289.jpg';
import wendyAvatar from '../assets/images/wendy_avatar_1790227227735.jpg';

export interface ChromeAvatarItem {
  id: string;
  name: string;
  englishName: string;
  url: string;
  symbol: string;
  category: 'animals' | 'food' | 'objects' | 'nature' | string;
}

export const DEFAULT_CLIENT_AVATAR: string = classicGentleman;

export const CHROME_AVATARS: ChromeAvatarItem[] = [
  {
    id: 'avatar-classic-gentleman',
    name: 'جنتلمن کلاسیک',
    englishName: 'Classic Gentleman',
    url: classicGentleman,
    symbol: '🎩',
    category: 'objects',
  },
  {
    id: 'avatar-modern-fade',
    name: 'استایل فید مدرن',
    englishName: 'Modern Fade',
    url: modernFade,
    symbol: '✂️',
    category: 'objects',
  },
  {
    id: 'avatar-royal-crest',
    name: 'نشان سلطنتی رویال',
    englishName: 'Royal Crest',
    url: royalCrest,
    symbol: '👑',
    category: 'objects',
  },
  {
    id: 'avatar-executive',
    name: 'استایل دیپلمات',
    englishName: 'Executive',
    url: executiveGrooming,
    symbol: '💼',
    category: 'objects',
  },
  {
    id: 'avatar-leo',
    name: 'شیر طلایی',
    englishName: 'Golden Leo',
    url: leoZodiac,
    symbol: '🦁',
    category: 'animals',
  },
  {
    id: 'avatar-kitsune',
    name: 'روباه سایبری',
    englishName: 'Cyber Kitsune',
    url: cyberKitsune,
    symbol: '🦊',
    category: 'animals',
  },
  {
    id: 'avatar-phoenix',
    name: 'ققنوس نگهبان',
    englishName: 'Phoenix',
    url: phoenixGuardian,
    symbol: '🦅',
    category: 'animals',
  },
  {
    id: 'avatar-dragon',
    name: 'اژدهای سرخ',
    englishName: 'Dragon Lord',
    url: dragonLord,
    symbol: '🐉',
    category: 'animals',
  },
  {
    id: 'avatar-aries',
    name: 'قوچ کوهستان',
    englishName: 'Mountain Aries',
    url: ariesZodiac,
    symbol: '🐏',
    category: 'animals',
  },
  {
    id: 'avatar-scorpio',
    name: 'عقرب نقره‌ای',
    englishName: 'Silver Scorpio',
    url: scorpioZodiac,
    symbol: '🦂',
    category: 'animals',
  },
  {
    id: 'avatar-pisces',
    name: 'اقیانوس آرام',
    englishName: 'Deep Ocean',
    url: piscesZodiac,
    symbol: '🌊',
    category: 'nature',
  },
  {
    id: 'avatar-solar-paladin',
    name: 'شوالیه خورشید',
    englishName: 'Solar Flare',
    url: solarPaladin,
    symbol: '☀️',
    category: 'nature',
  },
  {
    id: 'avatar-high-elf',
    name: 'نگهبان جنگل',
    englishName: 'Forest Sage',
    url: highElfMage,
    symbol: '🌿',
    category: 'nature',
  },
  {
    id: 'avatar-shadow-sorcerer',
    name: 'شفق قطبی',
    englishName: 'Night Aurora',
    url: shadowSorcerer,
    symbol: '🌌',
    category: 'nature',
  },
  {
    id: 'avatar-dipper',
    name: 'کاج نقره‌ای',
    englishName: 'Pine Explorer',
    url: dipperAvatar,
    symbol: '🌲',
    category: 'nature',
  },
  {
    id: 'avatar-espresso',
    name: 'اسپرسو دبل',
    englishName: 'Double Espresso',
    url: rickAvatar,
    symbol: '☕',
    category: 'food',
  },
  {
    id: 'avatar-latte',
    name: 'لاته آرت',
    englishName: 'Cafe Latte',
    url: mortyAvatar,
    symbol: '🥐',
    category: 'food',
  },
  {
    id: 'avatar-matcha',
    name: 'چای ماچا',
    englishName: 'Matcha Tea',
    url: mabelAvatar,
    symbol: '🍵',
    category: 'food',
  },
  {
    id: 'avatar-citrus',
    name: 'نوشیدنی خنک',
    englishName: 'Cool Citrus',
    url: wendyAvatar,
    symbol: '🍋',
    category: 'food',
  },
  {
    id: 'avatar-mystery',
    name: 'منشور طلایی',
    englishName: 'Golden Prism',
    url: billCipherAvatar,
    symbol: '✨',
    category: 'objects',
  },
];

/**
 * Deterministically picks an avatar URL based on customer name or identifier.
 */
export function getDeterministicAvatar(seed: string): string {
  if (!seed || !seed.trim()) {
    return DEFAULT_CLIENT_AVATAR;
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % CHROME_AVATARS.length;
  return CHROME_AVATARS[index]?.url || DEFAULT_CLIENT_AVATAR;
}

/**
 * Reads, center-crops, and resizes an uploaded image file into a compressed Data URL.
 */
export async function processUploadedProfileImage(
  file: File,
  maxDimension = 480,
  quality = 0.88
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const result = reader.result as string;
      if (typeof document === 'undefined') {
        resolve(result);
        return;
      }
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format'));
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const size = Math.min(img.width, img.height);
          const targetSize = Math.min(size, maxDimension);
          canvas.width = targetSize;
          canvas.height = targetSize;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(result);
            return;
          }

          const sx = (img.width - size) / 2;
          const sy = (img.height - size) / 2;
          ctx.drawImage(img, sx, sy, size, size, 0, 0, targetSize, targetSize);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (err) {
          resolve(result);
        }
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}
