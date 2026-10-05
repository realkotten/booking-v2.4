import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import helmet from 'helmet';
import { OAuth2Client } from 'google-auth-library';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.resolve(__dirname, (process.env.DATA_DIR || './data').trim());
const DATA_FILE = path.join(DATA_DIR, 'atelier_storage.json');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

// STEP 7: Configure trust proxy setting for Express
const trustProxyVal = parseInt(process.env.TRUST_PROXY || '0', 10);
if (!isNaN(trustProxyVal)) {
  app.set('trust proxy', trustProxyVal);
}

// STEP 3 & 7: Helmet security headers with tailored Content-Security-Policy
const isProdEnv = process.env.NODE_ENV === 'production';
const hasGoogleClientId = Boolean((process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim());
const isZarinpalSandboxEnabled = process.env.ZARINPAL_SANDBOX === 'true';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        ...(hasGoogleClientId ? ["https://accounts.google.com", "https://apis.google.com"] : []),
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        ...(hasGoogleClientId ? ["https://accounts.google.com"] : []),
      ],
      fontSrc: [
        "'self'",
        "data:",
      ],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https://trustseal.enamad.ir",
        ...(hasGoogleClientId ? ["https://lh3.googleusercontent.com", "https://*.googleusercontent.com"] : []),
      ],
      frameSrc: [
        "'self'",
        ...(hasGoogleClientId ? ["https://accounts.google.com"] : []),
      ],
      connectSrc: [
        "'self'",
        ...(hasGoogleClientId
          ? [
              "https://accounts.google.com",
              "https://oauth2.googleapis.com",
              "https://www.googleapis.com",
            ]
          : []),
        "https://api.zarinpal.com",
        "https://payment.zarinpal.com",
        "https://www.zarinpal.com",
        "https://sandbox.zarinpal.com",
      ],
      formAction: [
        "'self'",
        "https://api.zarinpal.com",
        "https://payment.zarinpal.com",
        "https://www.zarinpal.com",
        "https://sandbox.zarinpal.com",
        ...(hasGoogleClientId ? ["https://accounts.google.com"] : []),
      ],
      frameAncestors: isProdEnv
        ? ["'self'"]
        : ["'self'", "https://*.google.com", "https://*.run.app"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  frameguard: false,
}));

// STEP 7: Limit request body size to 100kb
app.use(express.json({ limit: '100kb' }));

// STEP 8: Strict sensitive file protection (MUST return 404)
app.use((req, res, next) => {
  const normalizedPath = req.path.toLowerCase();
  if (
    normalizedPath === '/data/atelier_storage.json' ||
    normalizedPath.startsWith('/data/') ||
    normalizedPath === '/.env' ||
    normalizedPath.startsWith('/.env') ||
    normalizedPath === '/server.ts' ||
    normalizedPath === '/package.json' ||
    normalizedPath === '/package-lock.json' ||
    normalizedPath === '/tsconfig.json'
  ) {
    return res.status(404).send('Not Found');
  }
  next();
});

// STEP 7: CORS & Preflight middleware with ALLOWED_ORIGINS and X-Guest-Token support
const allowedOriginsEnv = (process.env.ALLOWED_ORIGINS || '').trim();
const allowedOriginsList = allowedOriginsEnv
  ? allowedOriginsEnv.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOriginsList.length > 0) {
    if (origin && allowedOriginsList.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
  } else {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Guest-Token');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Ensure host data and backups directories exist for persistent local storage on the server
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// ─── Host Server Persistent Storage Layer (Self-Hosted JSON Database) ──────────
let memoryStore: any = null;
let isStoreHydrated = false;
let saveQueue: Promise<any> = Promise.resolve();
let lastBackupDateStr = '';

const DEFAULT_OPERATING_HOURS = [
  { dayOfWeek: 'شنبه', openTime: '10:00', closeTime: '21:00', isClosed: false },
  { dayOfWeek: 'یکشنبه', openTime: '10:00', closeTime: '21:00', isClosed: false },
  { dayOfWeek: 'دوشنبه', openTime: '10:00', closeTime: '21:00', isClosed: false },
  { dayOfWeek: 'سه‌شنبه', openTime: '10:00', closeTime: '21:00', isClosed: false },
  { dayOfWeek: 'چهارشنبه', openTime: '10:00', closeTime: '21:00', isClosed: false },
  { dayOfWeek: 'پنج‌شنبه', openTime: '09:00', closeTime: '22:00', isClosed: false },
  { dayOfWeek: 'جمعه', openTime: '14:00', closeTime: '20:00', isClosed: true },
];

function getFallbackSeedStore(): any {
  const initialShopName = (process.env.SHOP_NAME || '').trim() || 'آرایشگاه';
  const initialShopPhone = (process.env.SHOP_PHONE || '').trim();
  const initialShopAddress = (process.env.SHOP_ADDRESS || '').trim();

  return {
    studio: {
      id: 'shop-main',
      name: initialShopName,
      tagline: 'رزرو آنلاین نوبت آرایشگاه، بدون تماس تلفنی',
      address: initialShopAddress,
      neighborhood: '',
      city: '',
      phone: initialShopPhone,
      conciergePhone: initialShopPhone,
      email: '',
      openingHours: DEFAULT_OPERATING_HOURS,
      operationalStatus: 'open',
      valetServiceAvailable: false,
      amenities: ['رزرو آنلاین ۲۴ ساعته', 'یادآوری خودکار پیامکی'],
    },
    appointments: [],
    pastAppointments: [],
    customers: [],
    services: [
      { id: 'svc-1', categoryId: 'cat-hair',  name: 'اصلاح موی کلاسیک',      price: 220000, realPrice: 260000, discountedPrice: 220000, durationMinutes: 45,  isActive: true, sortOrder: 0 },
      { id: 'svc-2', categoryId: 'cat-hair',  name: 'کوتاهی فید / اسکین‌فید', price: 300000, realPrice: 300000, durationMinutes: 45,  isActive: true, sortOrder: 1 },
      { id: 'svc-3', categoryId: 'cat-beard', name: 'اصلاح ریش و خط ریش',    price: 130000, realPrice: 160000, discountedPrice: 130000, durationMinutes: 30,  isActive: true, sortOrder: 0 },
      { id: 'svc-4', categoryId: 'cat-beard', name: 'اصلاح صورت با تیغ داغ', price: 200000, realPrice: 200000, durationMinutes: 30,  isActive: true, sortOrder: 1 },
    ],
    categories: [
      { id: 'cat-hair',  name: 'اصلاح مو',   sortOrder: 0, isActive: true },
      { id: 'cat-beard', name: 'اصلاح صورت', sortOrder: 1, isActive: true },
    ],
    chairs: [
      { id: 'chair-1', chairNumber: '۰۱', name: 'صندلی اختصاصی ۱', floor: 'طبقه اصلی', assignedBarberId: 'barber-1', assignedBarberName: 'آرایشگر ارشد', status: 'available', isVip: true },
    ],
    barbers: [
      { id: 'barber-1', name: 'آرایشگر ارشد', title: 'سرآرایشگر و مدیر سالن', assignedChairId: 'chair-1', rating: 5.0, isAvailableToday: true },
    ],
    products: [],
    carts: {},
    orders: [],
    notifications: [],
    accoutrements: [
      { id: 'acc-1', name: 'شستشو و ماساژ سر با حوله گرم', price: 75000, durationMinutes: 15, isComplimentary: false, isActive: true, sortOrder: 0 },
      { id: 'acc-2', name: 'ماسک زغال فعال و پاکسازی بینی', price: 90000, durationMinutes: 15, isComplimentary: false, isActive: true, sortOrder: 1 },
    ],
    beverageOptions: [],
    settings: {
      profile: {
        name: initialShopName,
        tagline: 'رزرو آنلاین نوبت آرایشگاه، بدون تماس تلفنی',
        masterName: 'آرایشگر ارشد',
        masterTitle: 'سرآرایشگر و مدیر سالن',
        phone: initialShopPhone,
        conciergePhone: initialShopPhone,
        email: '',
        address: initialShopAddress,
        neighborhood: '',
        city: '',
        valetAvailable: false,
      },
      operatingHours: DEFAULT_OPERATING_HOURS,
    },
    users: [],
    payments: [],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Daily Backup Rotation:
 * Copies DATA_FILE into DATA_DIR/backups/atelier_storage-YYYY-MM-DD.json once per day
 * and retains only the newest 14 backup files.
 */
function runDailyBackup(): void {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const targetBackupPath = path.join(BACKUPS_DIR, `atelier_storage-${todayStr}.json`);

    if (lastBackupDateStr !== todayStr || !fs.existsSync(targetBackupPath)) {
      const tempBackupPath = `${targetBackupPath}.${Date.now()}.tmp`;
      fs.copyFileSync(DATA_FILE, tempBackupPath);
      fs.renameSync(tempBackupPath, targetBackupPath);
      lastBackupDateStr = todayStr;
    }

    const files = fs
      .readdirSync(BACKUPS_DIR)
      .filter((f) => /^atelier_storage-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .reverse();

    if (files.length > 14) {
      for (const oldFile of files.slice(14)) {
        try {
          fs.unlinkSync(path.join(BACKUPS_DIR, oldFile));
        } catch {}
      }
    }
  } catch (err: any) {
    console.warn('[Daily Backup] Warning:', err?.message || err);
  }
}

/**
 * Loads authoritative business state from the host server disk storage.
 */
function loadStore(): any {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const seed = getFallbackSeedStore();
        const mergedSettings = {
          ...seed.settings,
          ...(typeof parsed.settings === 'object' ? parsed.settings : {}),
          profile: {
            ...seed.settings.profile,
            ...(parsed.settings?.profile || {}),
          },
          operatingHours:
            Array.isArray(parsed.settings?.operatingHours) && parsed.settings.operatingHours.length > 0
              ? parsed.settings.operatingHours
              : seed.settings.operatingHours,
        };
        const mergedStudio = {
          ...seed.studio,
          ...(parsed.studio || {}),
          name: mergedSettings.profile.name || parsed.studio?.name || seed.studio.name,
          phone: mergedSettings.profile.phone ?? parsed.studio?.phone ?? seed.studio.phone,
          conciergePhone: mergedSettings.profile.conciergePhone ?? mergedSettings.profile.phone ?? parsed.studio?.conciergePhone ?? seed.studio.conciergePhone,
          address: mergedSettings.profile.address ?? parsed.studio?.address ?? seed.studio.address,
          neighborhood: mergedSettings.profile.neighborhood ?? parsed.studio?.neighborhood ?? '',
          city: mergedSettings.profile.city ?? parsed.studio?.city ?? '',
          openingHours: mergedSettings.operatingHours,
        };
        const merged = {
          ...seed,
          ...parsed,
          studio: mergedStudio,
          appointments: Array.isArray(parsed.appointments) ? parsed.appointments : [],
          pastAppointments: Array.isArray(parsed.pastAppointments) ? parsed.pastAppointments : [],
          customers: Array.isArray(parsed.customers) ? parsed.customers : [],
          services: Array.isArray(parsed.services) && parsed.services.length > 0 ? parsed.services : seed.services,
          categories: Array.isArray(parsed.categories) && parsed.categories.length > 0 ? parsed.categories : seed.categories,
          chairs: Array.isArray(parsed.chairs) && parsed.chairs.length > 0 ? parsed.chairs : seed.chairs,
          barbers: Array.isArray(parsed.barbers) && parsed.barbers.length > 0 ? parsed.barbers : seed.barbers,
          products: Array.isArray(parsed.products) ? parsed.products : (seed.products || []),
          carts: parsed.carts || {},
          orders: Array.isArray(parsed.orders) ? parsed.orders : [],
          notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
          accoutrements: Array.isArray(parsed.accoutrements) && parsed.accoutrements.length > 0 ? parsed.accoutrements : seed.accoutrements,
          beverageOptions: Array.isArray(parsed.beverageOptions) && parsed.beverageOptions.length > 0 ? parsed.beverageOptions : seed.beverageOptions,
          settings: mergedSettings,
          users: Array.isArray(parsed.users) ? parsed.users : [],
          payments: Array.isArray(parsed.payments) ? parsed.payments : [],
          lastUpdated: parsed.lastUpdated || new Date().toISOString(),
        };

        // STEP 5: Ensure all stored passwords are encrypted with bcrypt
        if (Array.isArray(merged.users)) {
          let upgradedPassword = false;
          for (const u of merged.users) {
            if (u.password && !u.password.startsWith('$2')) {
              u.password = bcrypt.hashSync(u.password, 10);
              upgradedPassword = true;
            }
          }
          if (upgradedPassword) {
            try {
              const tmp = `${DATA_FILE}.${Date.now()}.tmp`;
              fs.writeFileSync(tmp, JSON.stringify(merged, null, 2), 'utf-8');
              fs.renameSync(tmp, DATA_FILE);
            } catch {}
          }
        }

        memoryStore = merged;
        isStoreHydrated = true;
        runDailyBackup();
        return memoryStore;
      }
    }
  } catch (err: any) {
    console.error('[Host Server Storage] Error reading data file:', err?.message || err);
  }

  // If file does not exist on first start, initialize with empty bookings/customers and sample services
  const seed = getFallbackSeedStore();
  memoryStore = seed;
  isStoreHydrated = true;
  try {
    const tmp = `${DATA_FILE}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(seed, null, 2), 'utf-8');
    fs.renameSync(tmp, DATA_FILE);
    runDailyBackup();
  } catch {}
  return memoryStore;
}

/**
 * STEP 5: Safer saving.
 * Writes to a temporary file, then renames over the real file,
 * and queues requests in line so two saves can never write at the same time.
 */
async function saveStore(data: any): Promise<boolean> {
  if (!data || typeof data !== 'object') {
    throw new Error('داده‌های ارسالی نامعتبر است.');
  }

  data.lastUpdated = new Date().toISOString();
  const cleanData = JSON.parse(JSON.stringify(data));
  memoryStore = cleanData;
  isStoreHydrated = true;

  const writeOperation = saveQueue.catch(() => {}).then(async () => {
    const tempFile = `${DATA_FILE}.${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`;
    await fs.promises.writeFile(tempFile, JSON.stringify(cleanData, null, 2), 'utf-8');
    await fs.promises.rename(tempFile, DATA_FILE);
    const todayStr = new Date().toISOString().slice(0, 10);
    if (lastBackupDateStr !== todayStr) {
      runDailyBackup();
    }
    return true;
  });

  saveQueue = writeOperation;
  return writeOperation;
}

/**
 * Ensures store is loaded from host server disk.
 */
async function getInitializedStore(): Promise<any> {
  if (isStoreHydrated && memoryStore) {
    return memoryStore;
  }
  return loadStore();
}

// ─── Google Sheets Web App Backup & Synchronization Helper ───────────────────
async function sendToGoogleSheet(
  action: 'backup_appointment' | 'full_backup' | 'test',
  payload: any,
  overrideUrl?: string
): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    const store = await getInitializedStore();
    const targetUrl = (overrideUrl || store.settings?.googleSheetSettings?.webAppUrl || process.env.GOOGLE_SHEET_WEBAPP_URL || '').trim();

    if (!targetUrl || !targetUrl.startsWith('http')) {
      return { success: false, message: 'آدرس وب‌اپ گوگل شیت هنوز پیکربندی نشده است.' };
    }

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        timestamp: new Date().toISOString(),
        ...payload,
      }),
      redirect: 'follow',
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return { success: false, message: `پاسخ وب‌اپ گوگل شیت: کد ${response.status} ${errText.slice(0, 100)}` };
    }

    const responseData = await response.json().catch(async () => {
      return { success: true, text: await response.text().catch(() => '') };
    });

    // Update settings with successful backup status
    if (!store.settings) store.settings = {};
    if (!store.settings.googleSheetSettings) store.settings.googleSheetSettings = {};
    store.settings.googleSheetSettings.lastBackupTimestamp = new Date().toISOString();
    store.settings.googleSheetSettings.lastBackupStatus = 'success';
    store.settings.googleSheetSettings.lastBackupMessage = responseData.message || 'پشتیبان‌گیری در گوگل شیت موفقیت‌آمیز بود.';
    await saveStore(store).catch(() => {});

    return {
      success: true,
      message: responseData.message || 'عملیات در گوگل شیت با موفقیت انجام گردید.',
      data: responseData,
    };
  } catch (err: any) {
    console.warn('[Google Sheets Sync] Non-blocking communication warning:', err.message);
    try {
      const store = await getInitializedStore();
      if (!store.settings) store.settings = {};
      if (!store.settings.googleSheetSettings) store.settings.googleSheetSettings = {};
      store.settings.googleSheetSettings.lastBackupStatus = 'error';
      store.settings.googleSheetSettings.lastBackupMessage = err.message || 'خطا در برقراری ارتباط با وب‌اپ گوگل شیت';
      await saveStore(store).catch(() => {});
    } catch {}
    return { success: false, message: `خطا در ارتباط با وب‌اپ گوگل شیت: ${err.message}` };
  }
}

// ─── Cryptographically Signed JWT Token Generator & Verifier ─────────────────
const DEFAULT_JWT_SECRET = 'royal-atelier-jwt-secret-key-2026-secure';
const JWT_SECRET = (process.env.JWT_SECRET || '').trim() || DEFAULT_JWT_SECRET;
const isProd = process.env.NODE_ENV === 'production';

// STEP 5: Refuse to start if JWT_SECRET is missing or default in production mode
if (isProd && (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEFAULT_JWT_SECRET)) {
  console.error('[SECURITY FATAL] In production mode, JWT_SECRET must be explicitly set and cannot be the default value. Server startup aborted.');
  process.exit(1);
}

// STEP 3: Google OAuth client setup
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
const googleOAuthClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// STEP 2: Timing-safe guest token verification
function verifyGuestToken(providedToken?: string, storedHash?: string): boolean {
  if (!providedToken || !storedHash) return false;
  try {
    const cleanToken = providedToken.trim();
    if (!cleanToken || cleanToken.length < 16) return false;
    const providedHash = crypto.createHash('sha256').update(cleanToken).digest('hex');
    const bufA = Buffer.from(providedHash, 'hex');
    const bufB = Buffer.from(storedHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function extractGuestTokens(req: Request): string[] {
  const header = (req.headers['x-guest-token'] as string) || '';
  if (!header) return [];
  return header.split(',').map((t) => t.trim()).filter(Boolean);
}

function doesBookingMatchGuestTokens(apt: any, tokens: string[]): boolean {
  if (!apt || !Array.isArray(tokens) || tokens.length === 0) return false;
  if (apt.guestTokenHash && tokens.some((t) => verifyGuestToken(t, apt.guestTokenHash))) {
    return true;
  }
  if (Array.isArray(apt.creatorGuestTokenHashes)) {
    for (const h of apt.creatorGuestTokenHashes) {
      if (tokens.some((t) => verifyGuestToken(t, h))) return true;
    }
  }
  return false;
}

// STEP 4(a): A booking in pending_payment holds its slot for 10 minutes
const PENDING_PAYMENT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function isBookingPendingExpired(booking: any): boolean {
  if (booking.status !== 'pending_payment') return false;
  if (booking.paymentExpiresAt) {
    const expiresTime = typeof booking.paymentExpiresAt === 'number'
      ? booking.paymentExpiresAt
      : new Date(booking.paymentExpiresAt).getTime();
    if (!isNaN(expiresTime) && expiresTime > 0) {
      return Date.now() > expiresTime;
    }
  }
  const createdTime = booking.createdAt ? new Date(booking.createdAt).getTime() : 0;
  if (!createdTime) return false;
  return Date.now() - createdTime > PENDING_PAYMENT_TIMEOUT_MS;
}

function cancelExpiredPendingBookings(store: any): boolean {
  let modified = false;
  if (!Array.isArray(store.appointments)) return false;
  for (const apt of store.appointments) {
    if (apt.status === 'pending_payment' && isBookingPendingExpired(apt)) {
      apt.status = 'payment_failed';
      apt.paymentStatus = 'failed';
      apt.updatedAt = new Date().toISOString();
      modified = true;
    }
  }
  return modified;
}

function isSlotTaken(store: any, targetBooking: any): boolean {
  return (store.appointments || []).some((a: any) => {
    if (a.id === targetBooking.id) return false;
    if (a.status === 'cancelled' || a.status === 'completed' || a.status === 'payment_failed') return false;
    const isPendingActive = a.status === 'pending_payment' && !isBookingPendingExpired(a);
    if (a.status !== 'confirmed' && a.status !== 'in_progress' && !isPendingActive) return false;
    if (a.dayNumber !== targetBooking.dayNumber) return false;
    if (a.startTime !== targetBooking.startTime) return false;
    if (targetBooking.barberId && a.barberId && a.barberId !== targetBooking.barberId) return false;
    if (targetBooking.chairId && a.chairId && a.chairId !== targetBooking.chairId) return false;
    return true;
  });
}

// STEP 4(d): Valid booking days (today + up to 10 days ahead = 11 days total)
function getValidBookingDays(count = 11, referenceDate: Date = new Date()): { dayNumber: number; dateKey: string }[] {
  const dayFmt = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { day: 'numeric' });
  const pad = (n: number) => n.toString().padStart(2, '0');
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() + i);
    const dayNum = Number(dayFmt.format(d));
    const dateKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return { dayNumber: dayNum, dateKey };
  });
}

function isBookingDateValid(dayNumber?: number, dateString?: string): { valid: boolean; reason?: string } {
  const validDays = getValidBookingDays(11);
  const validDayNumbers = validDays.map((d) => d.dayNumber);
  const validDateKeys = validDays.map((d) => d.dateKey);

  if (dateString && typeof dateString === 'string') {
    const trimmed = dateString.trim();
    const isoPrefixMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoPrefixMatch) {
      if (!validDateKeys.includes(isoPrefixMatch[1])) {
        return {
          valid: false,
          reason: 'تاریخ انتخابی خارج از بازه مجاز (امروز تا ۱۰ روز آینده) است.',
        };
      }
    } else {
      const parsedMs = Date.parse(trimmed);
      if (!isNaN(parsedMs)) {
        const d = new Date(parsedMs);
        const pad = (n: number) => n.toString().padStart(2, '0');
        const dateKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        if (!validDateKeys.includes(dateKey)) {
          return {
            valid: false,
            reason: 'تاریخ انتخابی خارج از بازه مجاز (امروز تا ۱۰ روز آینده) است.',
          };
        }
      }
    }
  }

  if (typeof dayNumber === 'number') {
    if (!validDayNumbers.includes(dayNumber)) {
      return {
        valid: false,
        reason: 'تاریخ نوبت انتخابی معتبر نیست. رزرو نوبت فقط برای امروز تا حداکثر ۱۰ روز آینده مجاز است.',
      };
    }
  }

  return { valid: true };
}

// STEP 4(c): IP booking creations rate limiter (max 5 per IP per 10 mins)
const bookingCreationsPerIpMap = new Map<string, number[]>();
const BOOKING_CREATION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_BOOKING_CREATIONS_PER_WINDOW = 5;

function checkBookingCreationRateLimit(ip: string): boolean {
  const now = Date.now();
  const timestamps = (bookingCreationsPerIpMap.get(ip) || []).filter(
    (t) => now - t < BOOKING_CREATION_WINDOW_MS
  );
  if (timestamps.length >= MAX_BOOKING_CREATIONS_PER_WINDOW) {
    return false;
  }
  timestamps.push(now);
  bookingCreationsPerIpMap.set(ip, timestamps);
  return true;
}

function generateSessionToken(userId: string, role: string, extra?: { email?: string; phone?: string; googleSub?: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    userId,
    role,
    email: extra?.email || '',
    phone: extra?.phone || '',
    googleSub: extra?.googleSub || '',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days
  })).toString('base64url');
  
  const signature = crypto.createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
    
  return `${header}.${payload}.${signature}`;
}

function parseSessionToken(token: string): { userId: string; role: string; email?: string; phone?: string; googleSub?: string } | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.trim().split('.');
    if (parts.length === 3) {
      const [header, payload, signature] = parts;
      const expectedSig = crypto.createHmac('sha256', JWT_SECRET)
        .update(`${header}.${payload}`)
        .digest('base64url');
      if (signature === expectedSig) {
        const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
        if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
          return null; // Expired
        }
        return {
          userId: decoded.userId || decoded.sub,
          role: decoded.role,
          email: decoded.email,
          phone: decoded.phone,
          googleSub: decoded.googleSub,
        };
      }
    }
    // Fallback parser for legacy base64 format
    const raw = Buffer.from(token, 'base64').toString('utf-8');
    const [userId, role] = raw.split(':');
    if (userId && role) return { userId, role };
  } catch {
    return null;
  }
  return null;
}

function extractSession(req: Request): { userId: string; role: string; email?: string; phone?: string; googleSub?: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return parseSessionToken(authHeader.substring(7));
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = extractSession(req);
  if (!session) {
    return res.status(401).json({ success: false, error: 'احراز هویت انجام نشده است (۴۰۱).' });
  }
  if (session.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'دسترسی غیرمجاز: نیازمند دسترسی مدیریت است (۴۰۳).' });
  }
  (req as any).session = session;
  next();
}

// Rate Limiter: max 10 attempts per 15 minutes per IP
interface RateLimitEntry {
  count: number;
  firstAttempt: number;
}
const authRateLimitMap = new Map<string, RateLimitEntry>();
const AUTH_RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const AUTH_RATE_LIMIT_MAX = 10;

function checkAuthRateLimit(req: Request, res: Response, next: NextFunction) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const record = authRateLimitMap.get(ip);

  if (!record || now - record.firstAttempt > AUTH_RATE_LIMIT_WINDOW) {
    authRateLimitMap.set(ip, { count: 1, firstAttempt: now });
    return next();
  }

  if (record.count >= AUTH_RATE_LIMIT_MAX) {
    const remainingMs = record.firstAttempt + AUTH_RATE_LIMIT_WINDOW - now;
    const remainingMins = Math.max(1, Math.ceil(remainingMs / 60000));
    return res.status(429).json({
      success: false,
      error: `تعداد تلاش‌های ناموفق بیش از حد مجاز است. لطفاً ${remainingMins} دقیقه دیگر مجدداً امتحان کنید.`,
    });
  }

  record.count++;
  next();
}

// ─── AUTHENTICATION API (STEP 1: Only Admin password login & STEP 3: Google Login) ───

// STEP 3: Google Login Endpoint (verifies ID token on server)
app.post('/api/auth/google', async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body || {};
    if (!idToken || typeof idToken !== 'string') {
      return res.status(400).json({ success: false, error: 'شناسه احراز هویت گوگل (idToken) ارسال نشده است.' });
    }

    if (!GOOGLE_CLIENT_ID) {
      return res.status(500).json({ success: false, error: 'شناسه GOOGLE_CLIENT_ID روی سرور تنظیم نشده است.' });
    }

    const ticket = await googleOAuthClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.sub) {
      return res.status(401).json({ success: false, error: 'توکن گوگل نامعتبر است.' });
    }

    const googleSub = payload.sub;
    const email = payload.email || '';
    const displayName = payload.name || 'کاربر گوگل';
    const avatarUrl = payload.picture || '';

    const store = await getInitializedStore();
    store.users = Array.isArray(store.users) ? store.users : [];
    store.customers = Array.isArray(store.customers) ? store.customers : [];

    let user = store.users.find((u: any) => u.googleSub === googleSub || u.id === `google_${googleSub}`);
    if (!user) {
      user = {
        id: `google_${googleSub}`,
        googleSub,
        email,
        displayName,
        avatarUrl,
        role: 'client', // STRICTLY client
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
      store.users.push(user);
    } else {
      user.role = 'client';
      user.email = email;
      user.displayName = displayName;
      user.avatarUrl = avatarUrl;
      user.lastLoginAt = new Date().toISOString();
    }

    let customer = store.customers.find((c: any) => c.googleSub === googleSub || c.id === user.id);
    if (!customer) {
      customer = {
        id: user.id,
        googleSub,
        name: displayName,
        email,
        phone: '',
        avatarUrl,
        memberTier: 'عضو گوگل',
        roleOrTitle: 'مشتری رسمی',
        visitCount: 0,
        totalSpend: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.customers.push(customer);
    }

    await saveStore(store);

    const token = generateSessionToken(user.id, 'client', { email, googleSub });
    return res.json({
      success: true,
      user,
      customer,
      token,
    });
  } catch (err: any) {
    console.error('[Google Auth Error]', err?.message || err);
    return res.status(401).json({ success: false, error: 'اعتبارسنجی ورود با گوگل ناموفق بود.' });
  }
});

// STEP 1 & 5: Admin-only phone/username + password login
app.post('/api/auth/login', checkAuthRateLimit, async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ success: false, error: 'نام کاربری و رمز عبور الزامی است.' });
    }

    const cleanIdent = identifier.trim().toLowerCase();
    const cleanPass = String(password).trim();

    const store = await getInitializedStore();
    store.users = Array.isArray(store.users) ? store.users : [];

    const user = store.users.find((u: any) => {
      return (
        u.phone === cleanIdent ||
        u.email?.toLowerCase() === cleanIdent ||
        u.id === cleanIdent ||
        u.displayName?.toLowerCase() === cleanIdent
      );
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'کاربری با این مشخصات یافت نشد.' });
    }

    // STEP 1: Phone plus password login stays ONLY for admins! Customers can no longer use it.
    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'دسترسی غیرمجاز: ورود با نام کاربری و رمز عبور صرفاً مختص مدیران آرایشگاه است.',
      });
    }

    // STEP 5: Verify password with bcrypt; upgrade legacy plaintext password to bcrypt hash on login
    let passwordMatches = false;
    if (user.password && user.password.startsWith('$2')) {
      passwordMatches = await bcrypt.compare(cleanPass, user.password);
    } else if (user.password) {
      passwordMatches = user.password === cleanPass;
      if (passwordMatches) {
        user.password = await bcrypt.hash(cleanPass, 10);
      }
    }

    if (!passwordMatches) {
      return res.status(401).json({ success: false, error: 'رمز عبور وارد شده نادرست است.' });
    }

    user.lastLoginAt = new Date().toISOString();
    await saveStore(store);

    const token = generateSessionToken(user.id, 'admin', { phone: user.phone, email: user.email });

    return res.json({
      success: true,
      user: { id: user.id, phone: user.phone, email: user.email, displayName: user.displayName, role: 'admin' },
      token,
    });
  } catch (err: any) {
    console.error('[API] login error:', err);
    return res.status(500).json({ success: false, error: 'خطا در ورود به حساب' });
  }
});

app.get('/api/auth/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'احراز هویت انجام نشده است.' });
    }

    const token = authHeader.substring(7);
    const session = parseSessionToken(token);
    if (!session) {
      return res.status(401).json({ success: false, error: 'نشست منقضی شده یا نامعتبر است.' });
    }

    const store = await getInitializedStore();
    const user = store.users?.find((u: any) => u.id === session.userId);
    const customer = store.customers?.find((c: any) => c.id === session.userId);

    return res.json({
      success: true,
      user: user || { id: session.userId, role: session.role },
      customer,
    });
  } catch (err: any) {
    console.error('[API] /me error:', err);
    return res.status(500).json({ success: false, error: 'خطا در اعتبارسنجی نشست' });
  }
});

// ─── ATELIER STATE & ENTITIES API (Host Server Native Storage) ────────────────────
app.get('/api/atelier/health', (_req: Request, res: Response) => {
  return res.json({
    status: 'online',
    mode: 'host-server-native-storage',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    hydrated: isStoreHydrated,
  });
});

app.get('/api/atelier/state', async (req: Request, res: Response) => {
  try {
    const store = await getInitializedStore();
    const session = extractSession(req);

    // Cancel any pending_payment bookings older than 10 minutes to free slots
    const expiredModified = cancelExpiredPendingBookings(store);
    if (expiredModified) {
      await saveStore(store).catch(() => {});
    }

    // If logged in as admin, return the full state
    if (session && session.role === 'admin') {
      const sanitizedUsers = (store.users || []).map((u: any) => {
        const { password, ...rest } = u;
        return rest;
      });
      return res.json({
        ...store,
        users: sanitizedUsers,
      });
    }

    // STEP 2 & 3: Visitors, Guests, and Google Customers:
    const guestTokens = extractGuestTokens(req);
    const googleSub = session?.googleSub;
    const callerUserId = session?.userId || '';

    // Sanitize appointments:
    // A booking belongs to the caller ONLY if they provide the matching guest ticket token
    // or if they are signed in with Google matching googleSub or customerId.
    // A phone number is NEVER used to identify anybody!
    const sanitizedAppointments = (store.appointments || []).map((apt: any) => {
      const isOwnBooking = Boolean(
        (guestTokens.length > 0 && doesBookingMatchGuestTokens(apt, guestTokens)) ||
        (googleSub && apt.googleSub === googleSub) ||
        (callerUserId && apt.customerId === callerUserId)
      );

      if (isOwnBooking) {
        // Strip sensitive internal secrets before returning to user
        const { guestTokenHash: _, creatorGuestTokenHashes: ___, creationIp: __, ...safeOwnApt } = apt;
        return safeOwnApt;
      }

      // Other visitors' bookings: purely busy slot markers!
      return {
        id: apt.id,
        dayNumber: apt.dayNumber,
        date: apt.date,
        startTime: apt.startTime,
        endTime: apt.endTime,
        durationMinutes: apt.durationMinutes || 45,
        barberId: apt.barberId,
        chairId: apt.chairId,
        status: apt.status,
        isBusy: true,
      };
    });

    // Customers: visitors see ZERO customers; Google customer sees only their own profile
    let sanitizedCustomers: any[] = [];
    if (googleSub || callerUserId) {
      sanitizedCustomers = (store.customers || []).filter((c: any) => 
        (googleSub && c.googleSub === googleSub) ||
        (callerUserId && c.id === callerUserId)
      );
    }

    // Past appointments: visitors see ZERO; guests/Google customer see only their own
    let sanitizedPastAppointments: any[] = [];
    if (guestTokens.length > 0 || googleSub || callerUserId) {
      sanitizedPastAppointments = (store.pastAppointments || []).filter((a: any) =>
        (guestTokens.length > 0 && doesBookingMatchGuestTokens(a, guestTokens)) ||
        (googleSub && a.googleSub === googleSub) ||
        (callerUserId && a.customerId === callerUserId)
      ).map((a: any) => {
        const { guestTokenHash: _, creatorGuestTokenHashes: ___, creationIp: __, ...rest } = a;
        return rest;
      });
    }

    // Public settings (strip sensitive integration keys, webhooks, and merchant secrets)
    const publicSettings = { ...(store.settings || {}) };
    delete (publicSettings as any).googleSheetSettings;
    delete (publicSettings as any).zarinpalMerchantId;
    delete (publicSettings as any).apiKeys;
    delete (publicSettings as any).adminPhone;

    const publicStudio = store.studio
      ? {
          ...store.studio,
          name: store.settings?.profile?.name ?? store.studio.name,
          phone: store.settings?.profile?.phone ?? store.studio.phone ?? '',
          conciergePhone:
            store.settings?.profile?.conciergePhone ??
            store.settings?.profile?.phone ??
            store.studio.conciergePhone ??
            '',
          address: store.settings?.profile?.address ?? store.studio.address ?? '',
          openingHours: store.settings?.operatingHours || store.studio.openingHours || DEFAULT_OPERATING_HOURS,
        }
      : {};
    const publicBarbers = (store.barbers || []).map((b: any) => {
      const { phone: _, ...rest } = b;
      return rest;
    });

    return res.json({
      studio: publicStudio,
      services: store.services || [],
      categories: store.categories || [],
      chairs: store.chairs || [],
      barbers: publicBarbers,
      products: store.products || [],
      accoutrements: store.accoutrements || [],
      beverageOptions: store.beverageOptions || [],
      appointments: sanitizedAppointments,
      pastAppointments: sanitizedPastAppointments,
      customers: sanitizedCustomers,
      notifications: [],
      settings: publicSettings,
      users: [],
      lastUpdated: store.lastUpdated,
    });
  } catch (err: any) {
    console.error('[API] /api/atelier/state GET error:', err);
    return res.status(500).json({ success: false, error: 'خطا در واکشی اطلاعات از سرور میزبان' });
  }
});

// STEP 1 & 4: POST /api/atelier/state (replace whole database) must be admin-only
app.post('/api/atelier/state', requireAdmin, async (req: Request, res: Response) => {
  try {
    const incoming = req.body;
    if (!incoming || typeof incoming !== 'object') {
      return res.status(400).json({ success: false, error: 'داده‌های ارسالی نامعتبر است.' });
    }
    const current = await getInitializedStore();
    const merged = {
      ...current,
      ...incoming,
      lastUpdated: new Date().toISOString(),
    };
    await saveStore(merged);
    return res.json({ success: true, lastUpdated: merged.lastUpdated });
  } catch (err: any) {
    console.error('[API] /api/atelier/state POST error:', err);
    return res.status(500).json({ success: false, error: 'خطا در ذخیره‌سازی اطلاعات' });
  }
});

// ─── APPOINTMENTS API ─────────────────────────────────────────────────────────
const handlePostAppointment = async (req: Request, res: Response) => {
  try {
    const raw = req.body;
    if (!raw || typeof raw !== 'object') {
      return res.status(400).json({ success: false, error: 'اطلاعات نوبت نامعتبر است.' });
    }

    const callerIp = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();

    // STEP 4(d): Reject any booking date in the past or more than 10 days from today (before rate limit)
    const dateCheck = isBookingDateValid(raw.dayNumber, raw.date || raw.appointmentDate);
    if (!dateCheck.valid) {
      return res.status(400).json({ success: false, error: dateCheck.reason });
    }

    const store = await getInitializedStore();
    store.appointments = Array.isArray(store.appointments) ? store.appointments : [];
    store.customers = Array.isArray(store.customers) ? store.customers : [];
    store.services = Array.isArray(store.services) ? store.services : [];
    store.accoutrements = Array.isArray(store.accoutrements) ? store.accoutrements : [];

    // Free any expired pending bookings (STEP 4a)
    cancelExpiredPendingBookings(store);

    const session = extractSession(req);
    const googleSub = session?.googleSub;
    const incomingGuestTokens = extractGuestTokens(req);

    // STEP 4(b): At the same time, one guest token, one Google user, and one IP may each have at most 2 bookings in pending_payment
    // 1. Guest token check
    if (incomingGuestTokens.length > 0) {
      const activePendingForGuest = store.appointments.filter(
        (a: any) =>
          a.status === 'pending_payment' &&
          doesBookingMatchGuestTokens(a, incomingGuestTokens)
      ).length;
      if (activePendingForGuest >= 2) {
        return res.status(429).json({
          success: false,
          error: 'این دستگاه در حال حاضر ۲ نوبت در انتظار پرداخت دارد. لطفاً ابتدا نوبت قبلی را پرداخت نمایید.',
        });
      }
    }

    // 2. Google user check
    if (googleSub) {
      const activePendingForGoogle = store.appointments.filter(
        (a: any) => a.status === 'pending_payment' && a.googleSub === googleSub
      ).length;
      if (activePendingForGoogle >= 2) {
        return res.status(429).json({
          success: false,
          error: 'حساب گوگل شما در حال حاضر ۲ نوبت در انتظار پرداخت دارد. لطفاً ابتدا پرداخت آن‌ها را تکمیل فرمایید.',
        });
      }
    }

    // 3. IP check
    const activePendingForIp = store.appointments.filter(
      (a: any) => a.status === 'pending_payment' && a.creationIp === callerIp
    ).length;
    if (activePendingForIp >= 2) {
      return res.status(429).json({
        success: false,
        error: 'شما در حال حاضر ۲ نوبت در انتظار پرداخت دارید. لطفاً ابتدا پرداخت نوبت‌های قبلی را نهایی فرمایید یا ۱۰ دقیقه صبر کنید.',
      });
    }

    // STEP 4(c): Max 5 booking creations per IP per 10 minutes
    if (!checkBookingCreationRateLimit(callerIp)) {
      return res.status(429).json({
        success: false,
        error: 'تعداد درخواست‌های ایجاد نوبت از این آی‌پی بیش از حد مجاز است. لطفاً ۱۰ دقیقه دیگر مجدداً تلاش فرمایید.',
      });
    }

    const serviceId = raw.serviceId || raw.service?.id || 'svc-1';

    // STEP 2: Work out the amount on the server from the genuine service in the database
    const realService =
      store.services.find((s: any) => s.id === serviceId) ||
      store.services[0] || {
        id: 'svc-1',
        name: 'اصلاح موی کلاسیک',
        price: 220000,
        durationMinutes: 45,
      };

    const serverServicePrice = Number(realService.price || realService.discountedPrice || realService.realPrice || 0);

    // Calculate accoutrements from server store
    let serverAccsTotal = 0;
    const selectedAccs: any[] = [];
    const incomingAccs = Array.isArray(raw.additionalAccoutrements)
      ? raw.additionalAccoutrements
      : Array.isArray(raw.accoutrements)
      ? raw.accoutrements
      : [];

    for (const acc of incomingAccs) {
      const realAcc = store.accoutrements.find((a: any) => a.id === (acc.id || acc));
      if (realAcc) {
        serverAccsTotal += Number(realAcc.price || 0);
        selectedAccs.push(realAcc);
      }
    }

    const serverTotalAmount = serverServicePrice + serverAccsTotal;
    const configuredDeposit = store.settings?.depositAmount ? Number(store.settings.depositAmount) : 0;
    const serverDepositAmount = configuredDeposit > 0 ? Math.min(configuredDeposit, serverTotalAmount) : serverTotalAmount;

    // STEP 2: Generate random secret (32 random bytes, hex)
    const guestToken = crypto.randomBytes(32).toString('hex');
    const guestTokenHash = crypto.createHash('sha256').update(guestToken).digest('hex');
    const creatorGuestTokenHashes = incomingGuestTokens
      .filter((t) => t.length >= 16)
      .map((t) => crypto.createHash('sha256').update(t).digest('hex'));

    const appointmentId = raw.id || `apt-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Verify slot is available and not locked by another active booking
    if (isSlotTaken(store, { id: appointmentId, dayNumber: raw.dayNumber, startTime: raw.startTime, barberId: raw.barberId, chairId: raw.chairId })) {
      return res.status(409).json({ success: false, error: 'این ساعت نوبت قبلاً رزرو شده است یا در حال حاضر در انتظار پرداخت مشتری دیگری است.' });
    }

    const paymentExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // STEP 2: IGNORE everything the browser sends about status, payment status, paid, price, total, or deposit!
    // A new booking is ALWAYS created as pending_payment with 10-minute lock
    const safeAppointment: any = {
      ...raw,
      id: appointmentId,
      appointmentNumber: raw.appointmentNumber || `AV-${Math.floor(8000 + Math.random() * 1999)}`,
      serviceId: realService.id,
      service: {
        id: realService.id,
        name: realService.name,
        price: serverServicePrice,
        durationMinutes: realService.durationMinutes || 45,
      },
      servicePrice: serverServicePrice,
      accoutrementsPrice: serverAccsTotal,
      price: serverTotalAmount,
      totalAmount: serverTotalAmount,
      depositAmount: serverDepositAmount,
      additionalAccoutrements: selectedAccs,
      status: 'pending_payment',
      paymentStatus: 'pending',
      paymentExpiresAt,
      paid: false,
      isPaid: false,
      guestTokenHash, // Only hash saved on booking
      creatorGuestTokenHashes: creatorGuestTokenHashes.length > 0 ? creatorGuestTokenHashes : undefined,
      creationIp: callerIp,
      googleSub: googleSub || undefined,
      customerId: session?.userId || raw.customerId || undefined,
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Strip any payment tokens/credentials/details sent by the browser
    delete safeAppointment.paymentDetails;
    delete safeAppointment.paymentAuthority;
    delete safeAppointment.paymentRefId;
    delete safeAppointment.refId;
    delete safeAppointment.ref_id;
    delete safeAppointment.authority;
    delete safeAppointment.cardPan;
    delete safeAppointment.verifiedAt;
    delete safeAppointment.paymentDate;

    // If an existing appointment exists with this id, do not allow overriding confirmed/paid
    const existingIdx = store.appointments.findIndex((a: any) => a.id === safeAppointment.id);
    if (existingIdx >= 0) {
      const existing = store.appointments[existingIdx];
      if (existing.status === 'confirmed' || existing.paymentStatus === 'paid') {
        return res.status(403).json({ success: false, error: 'نوبت تایید شده یا پرداخت‌شده قابل بازنویسی توسط کلاینت نمی‌باشد.' });
      }
      store.appointments[existingIdx] = {
        ...existing,
        ...safeAppointment,
        status: 'pending_payment',
        paymentStatus: 'unpaid',
        paid: false,
        isPaid: false,
      };
    } else {
      store.appointments.unshift(safeAppointment);
    }

    // Customer record creation if new
    if (safeAppointment.customerName) {
      const custId = safeAppointment.customerId || (googleSub ? `google_${googleSub}` : undefined);
      const cust = store.customers.find((c: any) => (custId && c.id === custId) || (googleSub && c.googleSub === googleSub));
      if (!cust) {
        store.customers.push({
          id: custId || `client-${Date.now()}`,
          name: safeAppointment.customerName,
          phone: safeAppointment.customerPhone || '',
          avatarUrl: safeAppointment.customerAvatar || '',
          googleSub: googleSub || undefined,
          memberTier: googleSub ? 'عضو رسمی گوگل' : 'مهمان رویال',
          roleOrTitle: 'مشتری جدید',
          visitCount: 0,
          totalSpend: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    await saveStore(store);

    // Non-blocking Google Sheet Web App backup
    sendToGoogleSheet('backup_appointment', { appointment: safeAppointment }).catch(() => {});

    // Strip internal hashes before returning
    const { guestTokenHash: _, creatorGuestTokenHashes: ___, creationIp: __, ...clientAppointment } = safeAppointment;

    // Send the real token back ONCE in response
    return res.json({
      success: true,
      appointment: clientAppointment,
      guestToken,
    });
  } catch (err: any) {
    console.error('[API] /api/atelier/appointment error:', err);
    return res.status(500).json({ success: false, error: 'خطا در ثبت نوبت' });
  }
};

app.post('/api/atelier/appointment', handlePostAppointment);
app.post('/api/atelier/appointments', handlePostAppointment);

const handlePatchAppointmentStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, paymentStatus } = req.body;
    const session = extractSession(req);
    const store = await getInitializedStore();
    store.appointments = Array.isArray(store.appointments) ? store.appointments : [];

    const apt = store.appointments.find((a: any) => a.id === id);
    if (!apt) {
      return res.status(404).json({ success: false, error: 'نوبت یافت نشد.' });
    }

    // STEP 2: Nobody but the bank can say "paid". Only Zarinpal callback may change a booking to confirmed or paid.
    if (status === 'confirmed' || status === 'paid' || paymentStatus === 'paid') {
      if (!session || session.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'دسترسی غیرمجاز: تغییر وضعیت به پرداخت‌شده یا تایید شده تنها از طریق درگاه رسمی بانک امکان‌پذیر است (۴۰۳).',
        });
      }
    }

    // STEP 2: Cancelling after payment.
    // A customer (guest or Google) may cancel ONLY a booking in pending_payment.
    // Only an admin can cancel a confirmed booking, and when they do, set its payment status to "refund_due".
    if (status === 'cancelled') {
      const isAdmin = session?.role === 'admin';
      const guestTokens = extractGuestTokens(req);
      const googleSub = session?.googleSub;

      const isOwner = Boolean(
        (guestTokens.length > 0 && doesBookingMatchGuestTokens(apt, guestTokens)) ||
        (googleSub && apt.googleSub && apt.googleSub === googleSub)
      );

      if (!isAdmin && !isOwner) {
        return res.status(403).json({
          success: false,
          error: 'دسترسی غیرمجاز: شما تنها مجاز به لغو نوبت اختصاصی خود می‌باشید (۴۰۳).',
        });
      }

      if (!isAdmin) {
        if (apt.status !== 'pending_payment') {
          return res.status(403).json({
            success: false,
            error: 'To cancel a paid booking, please contact the salon',
            message: 'To cancel a paid booking, please contact the salon',
          });
        }
        apt.status = 'cancelled';
        apt.updatedAt = new Date().toISOString();
        await saveStore(store);
        return res.json({ success: true, appointment: apt, message: 'نوبت با موفقیت لغو گردید.' });
      }

      if (apt.status === 'confirmed' || apt.paymentStatus === 'paid') {
        apt.paymentStatus = 'refund_due';
      }
      apt.status = 'cancelled';
      apt.updatedAt = new Date().toISOString();
      await saveStore(store);
      return res.json({ success: true, appointment: apt, message: 'نوبت با موفقیت لغو گردید.' });
    }

    // Any other status change ('in_progress', 'completed', 'no_show', etc.) requires admin
    if (!session || session.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'دسترسی غیرمجاز: تغییر وضعیت نوبت نیازمند دسترسی مدیریت است (۴۰۳).',
      });
    }

    apt.status = status;
    if (paymentStatus) apt.paymentStatus = paymentStatus;
    apt.updatedAt = new Date().toISOString();

    if (status === 'completed') {
      store.pastAppointments = Array.isArray(store.pastAppointments) ? store.pastAppointments : [];
      if (!store.pastAppointments.some((p: any) => p.id === apt.id)) {
        store.pastAppointments.unshift({ ...apt });
      }
    }

    await saveStore(store);
    return res.json({ success: true, appointment: apt });
  } catch (err: any) {
    console.error('[API] appointment status error:', err);
    return res.status(500).json({ success: false, error: 'خطا در به‌روزرسانی نوبت' });
  }
};

app.patch('/api/atelier/appointment/:id/status', handlePatchAppointmentStatus);
app.patch('/api/atelier/appointments/:id/status', handlePatchAppointmentStatus);

const handleDeleteAppointment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const session = extractSession(req);
    const store = await getInitializedStore();
    store.appointments = Array.isArray(store.appointments) ? store.appointments : [];
    store.pastAppointments = Array.isArray(store.pastAppointments) ? store.pastAppointments : [];

    const apt = store.appointments.find((a: any) => a.id === id);
    if (!apt) {
      return res.status(404).json({ success: false, error: 'نوبت یافت نشد.' });
    }

    // STEP 2: A customer may cancel/delete only their own booking, and never a confirmed/paid booking.
    const isAdmin = session?.role === 'admin';
    const guestTokens = extractGuestTokens(req);
    const googleSub = session?.googleSub;

    const isOwner = Boolean(
      (guestTokens.length > 0 && doesBookingMatchGuestTokens(apt, guestTokens)) ||
      (googleSub && apt.googleSub && apt.googleSub === googleSub)
    );

    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        error: 'دسترسی غیرمجاز: شما تنها مجاز به لغو یا حذف نوبت اختصاصی خود می‌باشید (۴۰۳).',
      });
    }

    if (!isAdmin && (apt.status === 'confirmed' || apt.paymentStatus === 'paid')) {
      return res.status(403).json({
        success: false,
        error: 'To cancel a paid booking, please contact the salon',
        message: 'To cancel a paid booking, please contact the salon',
      });
    }

    if (apt.creationIp && bookingCreationsPerIpMap.has(apt.creationIp)) {
      const list = bookingCreationsPerIpMap.get(apt.creationIp) || [];
      if (list.length > 0) {
        list.pop();
        bookingCreationsPerIpMap.set(apt.creationIp, list);
      }
    }

    store.appointments = store.appointments.filter((a: any) => a.id !== id);
    store.pastAppointments = store.pastAppointments.filter((a: any) => a.id !== id);

    if (apt.status === 'pending_payment' && apt.customerPhone && Array.isArray(store.customers)) {
      const stillHasBooking =
        store.appointments.some((a: any) => a.customerPhone === apt.customerPhone) ||
        store.pastAppointments.some((a: any) => a.customerPhone === apt.customerPhone);
      if (!stillHasBooking) {
        store.customers = store.customers.filter(
          (c: any) => !(c.phone === apt.customerPhone && (!c.visitCount || c.visitCount === 0) && !c.googleSub)
        );
      }
    }

    await saveStore(store);
    return res.json({ success: true, message: 'نوبت با موفقیت لغو/حذف گردید.' });
  } catch (err: any) {
    console.error('[API] appointment delete error:', err);
    return res.status(500).json({ success: false, error: 'خطا در حذف نوبت' });
  }
};

app.delete('/api/atelier/appointment/:id', handleDeleteAppointment);
app.delete('/api/atelier/appointments/:id', handleDeleteAppointment);

// ─── CUSTOMER DOSSIERS API (STAFF / ADMIN ONLY) ──────────────────────────────
app.get('/api/atelier/customers', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const store = await getInitializedStore();
    return res.json({ success: true, customers: store.customers || [] });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'خطا در واکشی پرونده‌های مشتریان' });
  }
});

app.post('/api/atelier/customer', requireAdmin, async (req: Request, res: Response) => {
  try {
    const customerData = req.body;
    if (!customerData || (!customerData.id && !customerData.phone)) {
      return res.status(400).json({ success: false, error: 'اطلاعات مشتری نامعتبر است.' });
    }

    const store = await getInitializedStore();
    store.customers = Array.isArray(store.customers) ? store.customers : [];

    const existingIdx = store.customers.findIndex(
      (c: any) => (customerData.id && c.id === customerData.id) || (customerData.phone && c.phone === customerData.phone)
    );

    let resultCustomer;
    if (existingIdx >= 0) {
      store.customers[existingIdx] = {
        ...store.customers[existingIdx],
        ...customerData,
        updatedAt: new Date().toISOString(),
      };
      resultCustomer = store.customers[existingIdx];
    } else {
      resultCustomer = {
        id: customerData.id || `client-${Date.now()}`,
        visitCount: 0,
        totalSpend: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...customerData,
      };
      store.customers.push(resultCustomer);
    }

    await saveStore(store);
    return res.json({ success: true, customer: resultCustomer });
  } catch (err: any) {
    console.error('[API] customer save error:', err);
    return res.status(500).json({ success: false, error: 'خطا در ذخیره مشتری' });
  }
});

app.patch('/api/atelier/customer/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const patchData = req.body;
    const store = await getInitializedStore();
    store.customers = Array.isArray(store.customers) ? store.customers : [];

    const cust = store.customers.find((c: any) => c.id === id);
    if (cust) {
      Object.assign(cust, patchData, { updatedAt: new Date().toISOString() });
      await saveStore(store);
      return res.json({ success: true, customer: cust });
    }
    return res.status(404).json({ success: false, error: 'پرونده مشتری یافت نشد.' });
  } catch (err: any) {
    console.error('[API] customer patch error:', err);
    return res.status(500).json({ success: false, error: 'خطا در به‌روزرسانی پرونده مشتری' });
  }
});

// ─── ZARINPAL REAL PAYMENT SETTINGS & API (SERVER ONLY) ──────────────────────
const ZARINPAL_MERCHANT_ID_ENV = (process.env.ZARINPAL_MERCHANT_ID || '').trim();
const PAY_CALLBACK_BASE = (process.env.PAY_CALLBACK_BASE || '').trim();

function getMerchantId(): string {
  return ZARINPAL_MERCHANT_ID_ENV;
}

const ZARINPAL_API_HOST = 'https://api.zarinpal.com';
const ZARINPAL_START_PAY_BASE = 'https://www.zarinpal.com/pg/StartPay';

function getZarinpalErrorExplanation(code: number | string | null | undefined): string {
  if (code === null || code === undefined) return 'خطای نامشخص در اتصال به زرین‌پال';
  const numCode = Number(code);
  switch (numCode) {
    case -9:
      return 'خطای اعتبارسنجی داده‌ها (Validation Error - پارامترهای ارسالی با استاندارد زرین‌پال همخوانی ندارد).';
    case -10:
      return 'آی‌پی سرور یا مرچنت کد در پنل زرین‌پال تأیید نشده است (Terminal / IP Restriction).';
    case -11:
      return 'مرچنت کد غیرفعال است یا درگاه پذیرنده در حالت تعلیق می‌باشد.';
    case -12:
      return 'تعداد درخواست‌ها بیش از حد مجاز در بازه زمانی کوتاه است (Too Many Requests).';
    case -15:
      return 'ترمینال پرداخت توسط پشتیبانی زرین‌پال مسدود یا غیرفعال شده است.';
    case -16:
      return 'سطح دسترسی پذیرنده یا سطح تأیید هویت کاربری زرین‌پال کافی نیست.';
    case -30:
      return 'دسترسی به تسویه حساب شناور برای این مرچنت فعال نشده است.';
    case -31:
      return 'اطلاعات حساب بانکی یا شبای متصل به درگاه تأیید نشده است.';
    case -33:
      return 'درصد یا مبالغ تسهیم با سقف کل تراکنش همخوانی ندارد.';
    case -40:
      return 'پارامترهای اضافی (Metadata) ارسالی نامعتبر هستند.';
    case -50:
      return 'مبلغ پرداخت شده با مبلغ اعتبارسنجی شده همخوانی ندارد.';
    case -51:
      return 'تراکنش در درگاه شاپرک ناموفق بود یا کاربر عملیات را لغو نمود.';
    case -52:
      return 'خطای غیرمنتظره در ارتباط با زیرساخت بانکی شاپرک.';
    case -53:
      return 'شناسه پرداخت (Authority) منقضی شده است.';
    case -54:
      return 'درخواست برای این شناسه پرداخت نامعتبر است.';
    case 100:
      return 'عملیات پرداخت با موفقیت در شبکه شاپرک تأیید گردید.';
    case 101:
      return 'تراکنش پیش‌تر با موفقیت تأیید و ثبت نهایی شده است.';
    default:
      return `کد پاسخ درگاه زرین‌پال: ${code}`;
  }
}

console.log(`[Zarinpal Gateway] Mode: REAL PRODUCTION, Host: ${ZARINPAL_API_HOST}`);

/**
 * STEP 3: Request Payment Authority
 * Receives ONLY bookingId. Ignores any amount from the browser.
 */
app.post('/api/payment/zarinpal/request', async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) {
      return res.status(400).json({ success: false, error: 'شناسه نوبت (bookingId) الزامی است.' });
    }

    const store = await getInitializedStore();
    const booking = (store.appointments || []).find((a: any) => a.id === bookingId);

    if (!booking) {
      return res.status(404).json({ success: false, error: 'نوبت مورد نظر در سامانه یافت نشد.' });
    }

    // STEP 1: Check ownership — allow only if (a) X-Guest-Token matches booking's saved hash,
    // (b) verified Google login whose sub matches the booking, or (c) admin. Anyone else gets 403.
    const session = extractSession(req);
    const isAdmin = session?.role === 'admin';
    const guestTokens = extractGuestTokens(req);
    const googleSub = session?.googleSub;

    const isGuestOwner = Boolean(
      guestTokens.length > 0 &&
      doesBookingMatchGuestTokens(booking, guestTokens)
    );
    const isGoogleOwner = Boolean(
      googleSub &&
      booking.googleSub &&
      booking.googleSub === googleSub
    );

    if (!isGuestOwner && !isGoogleOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'دسترسی غیرمجاز: شما مجاز به پرداخت این نوبت نیستید (۴۰۳).',
      });
    }

    if (booking.status !== 'pending_payment') {
      if (booking.status === 'confirmed' || booking.paymentStatus === 'paid') {
        return res.status(400).json({ success: false, error: 'این نوبت قبلاً با موفقیت پرداخت و تأیید شده است.' });
      }
      if (booking.status === 'cancelled') {
        return res.status(400).json({ success: false, error: 'این نوبت لغو شده است و امکان پرداخت ندارد.' });
      }
      return res.status(400).json({ success: false, error: `وضعیت نوبت (${booking.status}) برای پرداخت مجاز نیست.` });
    }

    // Check 10-minute expiration
    if (isBookingPendingExpired(booking)) {
      booking.status = 'payment_failed';
      booking.paymentStatus = 'failed';
      booking.updatedAt = new Date().toISOString();
      await saveStore(store);
      return res.status(400).json({ success: false, error: 'مهلت ۱۰ دقیقه‌ای پرداخت این نوبت منقضی شده است. لطفاً مجدداً نوبت بگیرید.' });
    }

    // Work out authoritative amount from booking (Tomans -> Rials)
    const amountTomans = Number(booking.depositAmount || booking.totalAmount || booking.servicePrice || 0);
    if (!amountTomans || amountTomans <= 0) {
      return res.status(400).json({ success: false, error: 'مبلغ نوبت در سیستم نامعتبر یا صفر است.' });
    }
    const amountRials = Math.round(amountTomans * 10);

    // Compute callback URL
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const callbackBase = PAY_CALLBACK_BASE ? PAY_CALLBACK_BASE.replace(/\/$/, '') : `${proto}://${host}`;
    const callbackUrl = `${callbackBase}/api/payment/zarinpal/callback`;

    const merchantId = getMerchantId();
    if (!merchantId) {
      return res.status(400).json({
        success: false,
        error: 'کد مرچنت زرین‌پال (ZARINPAL_MERCHANT_ID) در تنظیمات سرور ثبت نشده است. لطفاً مرچنت کد معتبر درگاه زرین‌پال را در متغیرهای محیطی سرور وارد فرمایید.',
      });
    }

    const zarinpalPayload = {
      merchant_id: merchantId,
      amount: amountRials,
      callback_url: callbackUrl,
      description: 'Barber booking',
      metadata: {
        booking_id: booking.id,
      },
    };

    let zarinpalResp: any = null;
    try {
      zarinpalResp = await fetch(`${ZARINPAL_API_HOST}/pg/v4/payment/request.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(zarinpalPayload),
      });
    } catch (e: any) {
      console.warn('[Zarinpal Network Error]', e?.message || e);
    }

    const zarinpalData: any = zarinpalResp ? await zarinpalResp.json().catch(() => null) : null;
    const responseCode = zarinpalData?.data?.code ?? zarinpalData?.errors?.code ?? zarinpalResp?.status;
    console.log(`[Zarinpal Request] Response Code: ${responseCode}`);

    if (zarinpalData && zarinpalData.data && zarinpalData.data.code === 100) {
      const authority = zarinpalData.data.authority;
      const paymentUrl = `${ZARINPAL_START_PAY_BASE}/${authority}`;

      // Save authority, amount and status on booking
      booking.paymentAuthority = authority;
      booking.paymentAmount = amountRials;
      booking.paymentAmountRials = amountRials;
      booking.paymentAmountTomans = amountTomans;
      booking.paymentStatus = 'pending';
      booking.updatedAt = new Date().toISOString();

      // Record in store.payments
      store.payments = (store.payments || []).filter((p: any) => p.authority !== authority);
      store.payments.unshift({
        authority,
        bookingId: booking.id,
        amountRials,
        amountTomans,
        customerName: booking.customerName || '',
        customerPhone: booking.customerPhone || '',
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await saveStore(store);

      return res.json({
        success: true,
        authority,
        paymentUrl,
        amount: amountTomans,
        currency: 'IRT',
      });
    }

    // Friendly error with code, do not crash
    const rawCode = zarinpalData?.errors?.code ?? zarinpalData?.data?.code ?? zarinpalResp?.status ?? -1;
    const rawMsg = zarinpalData?.errors?.message || 'خطا در برقراری ارتباط با درگاه پرداخت زرین‌پال';
    const explanation = getZarinpalErrorExplanation(rawCode);

    return res.status(400).json({
      success: false,
      error: `${rawMsg} (کد: ${rawCode}) - ${explanation}`,
      code: rawCode,
    });
  } catch (err: any) {
    console.error('[Zarinpal Request Error]', err?.message || err);
    return res.status(500).json({ success: false, error: 'خطای سرور در ارتباط با درگاه پرداخت' });
  }
});

/**
 * STEP 5: Payment Callback Verification Endpoint
 * Finds booking by saved authority.
 */
app.get('/api/payment/zarinpal/callback', async (req: Request, res: Response) => {
  try {
    const authority = String(req.query.Authority || req.query.authority || '');
    const status = String(req.query.Status || req.query.status || '');

    console.log(`[Zarinpal Callback] Authority: ${authority}, Status: ${status}`);

    const store = await getInitializedStore();
    store.payments = Array.isArray(store.payments) ? store.payments : [];

    const paymentRecord = store.payments.find((p: any) => p.authority === authority);
    const booking = (store.appointments || []).find((a: any) =>
      a.paymentAuthority === authority || (paymentRecord && a.id === paymentRecord.bookingId)
    );

    if (!booking) {
      console.warn(`[Zarinpal Callback] No booking found for authority: ${authority}`);
      return res.redirect('/?payment_status=failed&message=' + encodeURIComponent('اطلاعات تراکنش در سامانه یافت نشد.'));
    }

    // If customer cancelled or gateway returned NOK
    if (status !== 'OK') {
      if (paymentRecord) {
        paymentRecord.status = 'failed';
        paymentRecord.updatedAt = new Date().toISOString();
      }
      booking.paymentStatus = 'failed';
      booking.status = 'payment_failed'; // Releases the slot immediately
      booking.updatedAt = new Date().toISOString();
      await saveStore(store);

      return res.redirect(
        `/?payment_status=failed&authority=${encodeURIComponent(authority)}&message=${encodeURIComponent('پرداخت توسط کاربر لغو شد یا در درگاه بانکی ناموفق بود.')}`
      );
    }

    // If already verified/paid, redirect immediately without calling the bank again
    if (booking.paymentStatus === 'paid' && booking.status === 'confirmed') {
      return res.redirect(
        `/?payment_status=success&ref_id=${encodeURIComponent(booking.paymentRefId || '')}&authority=${encodeURIComponent(authority)}&target_id=${encodeURIComponent(booking.id)}&already_verified=true`
      );
    }

    // Make sure booking is still pending_payment
    if (booking.status !== 'pending_payment') {
      return res.redirect(
        `/?payment_status=failed&authority=${encodeURIComponent(authority)}&message=${encodeURIComponent(`وضعیت نوبت (${booking.status}) در انتظار پرداخت نمی‌باشد.`)}`
      );
    }

    // Make sure it has not expired
    if (isBookingPendingExpired(booking)) {
      booking.paymentStatus = 'failed';
      booking.status = 'payment_failed'; // Releases the slot immediately
      booking.updatedAt = new Date().toISOString();
      if (paymentRecord) {
        paymentRecord.status = 'failed';
        paymentRecord.updatedAt = new Date().toISOString();
      }
      await saveStore(store);

      return res.redirect(
        `/?payment_status=failed&authority=${encodeURIComponent(authority)}&message=${encodeURIComponent('مهلت ۱۰ دقیقه‌ای پرداخت این نوبت منقضی شده است و نوبت آزاد گردید.')}`
      );
    }

    // Call verify.json with amount saved on the booking
    const merchantId = getMerchantId();
    const amountRials = booking.paymentAmountRials || booking.paymentAmount || paymentRecord?.amountRials || Math.round(Number(booking.totalAmount || booking.servicePrice || 0) * 10);

    const verifyPayload = {
      merchant_id: merchantId,
      amount: amountRials,
      authority,
    };

    let verifyResp: any = null;
    try {
      verifyResp = await fetch(`${ZARINPAL_API_HOST}/pg/v4/payment/verify.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(verifyPayload),
      });
    } catch (e: any) {
      console.warn('[Zarinpal Verify Network Error]', e?.message || e);
    }

    const verifyData: any = verifyResp ? await verifyResp.json().catch(() => null) : null;
    const verifyCode = verifyData?.data?.code;

    console.log(`[Zarinpal Verify] Response Code: ${verifyCode ?? verifyData?.errors?.code ?? verifyResp?.status}`);

    if (verifyCode === 100 || verifyCode === 101) {
      const refId = String(verifyData?.data?.ref_id || paymentRecord?.refId || '');
      const cardPan = verifyData?.data?.card_pan || '';

      booking.status = 'confirmed';
      booking.paymentStatus = 'paid';
      booking.paymentRefId = refId;
      booking.cardPan = cardPan;
      booking.paymentDate = new Date().toISOString();
      booking.updatedAt = new Date().toISOString();

      if (paymentRecord) {
        paymentRecord.status = 'paid';
        paymentRecord.refId = refId;
        paymentRecord.updatedAt = new Date().toISOString();
      }

      await saveStore(store);

      return res.redirect(
        `/?payment_status=success&ref_id=${encodeURIComponent(refId)}&authority=${encodeURIComponent(authority)}&target_id=${encodeURIComponent(booking.id)}`
      );
    } else {
      const errCode = verifyData?.errors?.code || verifyData?.data?.code || 'VERIFY_FAILED';
      const errMsg = verifyData?.errors?.message || 'تأییدیه پرداخت از زرین‌پال دریافت نشد.';
      const explanation = getZarinpalErrorExplanation(errCode);

      if (paymentRecord) {
        paymentRecord.status = 'failed';
        paymentRecord.updatedAt = new Date().toISOString();
      }
      booking.paymentStatus = 'failed';
      booking.status = 'payment_failed'; // Releases the slot immediately
      booking.updatedAt = new Date().toISOString();
      await saveStore(store);

      return res.redirect(
        `/?payment_status=failed&authority=${encodeURIComponent(authority)}&error_code=${encodeURIComponent(String(errCode))}&explanation=${encodeURIComponent(explanation)}&message=${encodeURIComponent(errMsg)}`
      );
    }
  } catch (err: any) {
    console.error('[Zarinpal Callback Error]', err?.message || err);
    return res.redirect('/?payment_status=failed&message=' + encodeURIComponent('خطای فنی در بازگشت از درگاه پرداخت'));
  }
});

/**
 * POST /api/payment/zarinpal/verify
 * Programmatic verification endpoint for Zarinpal payment.
 * Verifies with ZarinPal verify.json using the original booking amount.
 */
app.post('/api/payment/zarinpal/verify', async (req: Request, res: Response) => {
  try {
    const { authority, bookingId } = req.body;
    if (!authority && !bookingId) {
      return res.status(400).json({ success: false, error: 'شناسه پرداخت (authority) یا شناسه نوبت (bookingId) الزامی است.' });
    }

    const store = await getInitializedStore();
    store.payments = Array.isArray(store.payments) ? store.payments : [];

    const paymentRecord = authority ? store.payments.find((p: any) => p.authority === authority) : null;
    const booking = (store.appointments || []).find((a: any) =>
      (authority && a.paymentAuthority === authority) ||
      (bookingId && a.id === bookingId) ||
      (paymentRecord && a.id === paymentRecord.bookingId)
    );

    if (!booking) {
      return res.status(404).json({ success: false, error: 'نوبت مورد نظر در سامانه یافت نشد.' });
    }

    const authCode = authority || booking.paymentAuthority;
    if (!authCode) {
      return res.status(400).json({ success: false, error: 'شناسه پرداخت (authority) برای این نوبت ثبت نشده است.' });
    }

    // If already verified and confirmed
    if (booking.paymentStatus === 'paid' && booking.status === 'confirmed') {
      return res.json({
        success: true,
        alreadyVerified: true,
        code: 101,
        refId: booking.paymentRefId,
        booking: {
          id: booking.id,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          paymentRefId: booking.paymentRefId,
        },
      });
    }

    // Make sure booking is still pending_payment
    if (booking.status !== 'pending_payment') {
      return res.status(400).json({
        success: false,
        error: `وضعیت نوبت (${booking.status}) در انتظار پرداخت نمی‌باشد.`,
      });
    }

    // Make sure it has not expired
    if (isBookingPendingExpired(booking)) {
      booking.status = 'payment_failed';
      booking.paymentStatus = 'failed';
      booking.updatedAt = new Date().toISOString();
      await saveStore(store);
      return res.status(400).json({
        success: false,
        error: 'مهلت ۱۰ دقیقه‌ای پرداخت نوبت منقضی شده است و نوبت آزاد گردید.',
        status: 'payment_failed',
      });
    }

    const merchantId = getMerchantId();
    if (!merchantId) {
      return res.status(400).json({
        success: false,
        error: 'کد مرچنت زرین‌پال (ZARINPAL_MERCHANT_ID) در تنظیمات سرور ثبت نشده است.',
      });
    }

    const amountRials = booking.paymentAmountRials || booking.paymentAmount || paymentRecord?.amountRials || Math.round(Number(booking.totalAmount || booking.servicePrice || 0) * 10);

    const verifyPayload = {
      merchant_id: merchantId,
      amount: amountRials,
      authority: authCode,
    };

    let verifyResp: any = null;
    try {
      verifyResp = await fetch(`${ZARINPAL_API_HOST}/pg/v4/payment/verify.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(verifyPayload),
      });
    } catch (e: any) {
      console.warn('[Zarinpal Verify Network Error]', e?.message || e);
    }

    const verifyData: any = verifyResp ? await verifyResp.json().catch(() => null) : null;
    const verifyCode = verifyData?.data?.code;

    if (verifyCode === 100 || verifyCode === 101) {
      const refId = String(verifyData?.data?.ref_id || paymentRecord?.refId || '');
      const cardPan = verifyData?.data?.card_pan || '';

      booking.status = 'confirmed';
      booking.paymentStatus = 'paid';
      booking.paymentRefId = refId;
      booking.cardPan = cardPan;
      booking.paymentDate = new Date().toISOString();
      booking.updatedAt = new Date().toISOString();

      if (paymentRecord) {
        paymentRecord.status = 'paid';
        paymentRecord.refId = refId;
        paymentRecord.updatedAt = new Date().toISOString();
      }

      await saveStore(store);

      return res.json({
        success: true,
        code: verifyCode,
        refId,
        booking: {
          id: booking.id,
          status: booking.status,
          paymentStatus: booking.paymentStatus,
          paymentRefId: booking.paymentRefId,
        },
      });
    } else {
      const errCode = verifyData?.errors?.code || verifyData?.data?.code || 'VERIFY_FAILED';
      const errMsg = verifyData?.errors?.message || 'تأییدیه پرداخت از زرین‌پال دریافت نشد.';

      booking.status = 'payment_failed';
      booking.paymentStatus = 'failed';
      booking.updatedAt = new Date().toISOString();

      if (paymentRecord) {
        paymentRecord.status = 'failed';
        paymentRecord.updatedAt = new Date().toISOString();
      }

      await saveStore(store);

      return res.status(400).json({
        success: false,
        code: errCode,
        error: errMsg,
        explanation: getZarinpalErrorExplanation(errCode),
        status: 'payment_failed',
      });
    }
  } catch (err: any) {
    console.error('[Zarinpal Verify Error]', err?.message || err);
    return res.status(500).json({ success: false, error: 'خطای سرور در اعتبارسنجی پرداخت' });
  }
});

/**
 * STEP 7: Status Check Endpoint
 * Returns ONLY paid, failed, or pending. Never returns secrets.
 */
app.get('/api/payment/zarinpal/status/:authority', async (req: Request, res: Response) => {
  try {
    const { authority } = req.params;
    const store = await getInitializedStore();
    const payment = (store.payments || []).find((p: any) => p.authority === authority);
    const booking = (store.appointments || []).find((a: any) => a.paymentAuthority === authority);

    let status: 'paid' | 'failed' | 'pending' = 'pending';
    if (payment?.status === 'paid' || booking?.paymentStatus === 'paid' || booking?.status === 'confirmed') {
      status = 'paid';
    } else if (payment?.status === 'failed' || booking?.paymentStatus === 'failed' || booking?.status === 'cancelled') {
      status = 'failed';
    }

    return res.json({ status });
  } catch {
    return res.status(500).json({ status: 'pending' });
  }
});

// ─── SERVICES & CATEGORIES API (Tariffs & Services - STAFF ONLY) ─────────────
app.post('/api/atelier/service', requireAdmin, async (req: Request, res: Response) => {
  try {
    const svc = req.body;
    if (!svc || !svc.id) {
      return res.status(400).json({ success: false, error: 'اطلاعات خدمت ناقص است.' });
    }
    const store = await getInitializedStore();
    store.services = Array.isArray(store.services) ? store.services : [];
    const idx = store.services.findIndex((s: any) => s.id === svc.id);
    if (idx >= 0) {
      store.services[idx] = { ...store.services[idx], ...svc };
    } else {
      store.services.push(svc);
    }
    await saveStore(store);
    return res.json({ success: true, service: svc });
  } catch (err: any) {
    console.error('[API] service post error:', err);
    return res.status(500).json({ success: false, error: 'خطا در ذخیره خدمت' });
  }
});

app.delete('/api/atelier/service/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const store = await getInitializedStore();
    store.services = Array.isArray(store.services) ? store.services : [];
    store.services = store.services.filter((s: any) => s.id !== id);
    await saveStore(store);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[API] service delete error:', err);
    return res.status(500).json({ success: false, error: 'خطا در حذف خدمت' });
  }
});

app.post('/api/atelier/category', requireAdmin, async (req: Request, res: Response) => {
  try {
    const cat = req.body;
    if (!cat || !cat.id) {
      return res.status(400).json({ success: false, error: 'اطلاعات دسته‌بندی ناقص است.' });
    }
    const store = await getInitializedStore();
    store.categories = Array.isArray(store.categories) ? store.categories : [];
    const idx = store.categories.findIndex((c: any) => c.id === cat.id);
    if (idx >= 0) {
      store.categories[idx] = { ...store.categories[idx], ...cat };
    } else {
      store.categories.push(cat);
    }
    await saveStore(store);
    return res.json({ success: true, category: cat });
  } catch (err: any) {
    console.error('[API] category post error:', err);
    return res.status(500).json({ success: false, error: 'خطا در ذخیره دسته‌بندی' });
  }
});

app.delete('/api/atelier/category/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const store = await getInitializedStore();
    store.categories = Array.isArray(store.categories) ? store.categories : [];
    store.categories = store.categories.filter((c: any) => c.id !== id);
    await saveStore(store);
    return res.json({ success: true });
  } catch (err: any) {
    console.error('[API] category delete error:', err);
    return res.status(500).json({ success: false, error: 'خطا در حذف دسته‌بندی' });
  }
});

// ─── SETTINGS API (STAFF ONLY) ───────────────────────────────────────────────
app.post('/api/atelier/settings', requireAdmin, async (req: Request, res: Response) => {
  try {
    const newSettings = req.body || {};
    const store = await getInitializedStore();
    store.settings = {
      ...store.settings,
      ...newSettings,
      profile: {
        ...(store.settings?.profile || {}),
        ...(newSettings.profile || {}),
      },
    };

    const p = store.settings.profile || {};
    store.studio = {
      ...(store.studio || {}),
      name: p.name ?? store.studio?.name,
      tagline: p.tagline ?? store.studio?.tagline,
      phone: p.phone ?? store.studio?.phone ?? '',
      conciergePhone: p.conciergePhone ?? p.phone ?? store.studio?.conciergePhone ?? '',
      address: p.address ?? store.studio?.address ?? '',
      neighborhood: p.neighborhood ?? store.studio?.neighborhood ?? '',
      city: p.city ?? store.studio?.city ?? '',
      email: p.email ?? store.studio?.email ?? '',
      openingHours: Array.isArray(store.settings.operatingHours)
        ? store.settings.operatingHours
        : store.studio?.openingHours || DEFAULT_OPERATING_HOURS,
    };

    if (p.masterName && Array.isArray(store.barbers) && store.barbers.length > 0) {
      store.barbers[0] = {
        ...store.barbers[0],
        name: p.masterName,
        ...(p.masterTitle ? { title: p.masterTitle } : {}),
      };
      if (Array.isArray(store.chairs) && store.chairs.length > 0) {
        store.chairs[0] = {
          ...store.chairs[0],
          assignedBarberName: p.masterName,
        };
      }
    }

    if (Array.isArray(store.settings.operatingHours) && Array.isArray(store.barbers) && store.barbers.length > 0) {
      store.barbers[0] = {
        ...store.barbers[0],
        workingHours: store.settings.operatingHours,
      };
    }

    await saveStore(store);
    return res.json({ success: true, settings: store.settings, studio: store.studio });
  } catch (err: any) {
    console.error('[API] settings post error:', err);
    return res.status(500).json({ success: false, error: 'خطا در ذخیره تنظیمات' });
  }
});

// ─── BACKUP & RESTORE API (STAFF ONLY) ───────────────────────────────────────
app.get('/api/atelier/backup', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const store = await getInitializedStore();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=shop-backup-${new Date().toISOString().slice(0, 10)}.json`);
    return res.send(JSON.stringify(store, null, 2));
  } catch (err: any) {
    console.error('[API] backup error:', err);
    return res.status(500).json({ success: false, error: 'خطا در تهیه نسخه پشتیبان' });
  }
});

app.post('/api/atelier/restore', requireAdmin, async (req: Request, res: Response) => {
  try {
    const backupData = req.body;
    if (!backupData || typeof backupData !== 'object') {
      return res.status(400).json({ success: false, error: 'فایل پشتیبان نامعتبر است.' });
    }
    await saveStore(backupData);
    return res.json({ success: true, message: 'اطلاعات با موفقیت بازگردانی شد.' });
  } catch (err: any) {
    console.error('[API] restore error:', err);
    return res.status(500).json({ success: false, error: 'خطا در بازگردانی اطلاعات' });
  }
});

// ─── GOOGLE SHEETS WEB APP BACKUP ENDPOINTS (STAFF ONLY) ─────────────────────
app.get('/api/atelier/google-sheet/status', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const store = await getInitializedStore();
    const settings = store.settings?.googleSheetSettings || {};
    const hasUrl = Boolean(settings.webAppUrl || process.env.GOOGLE_SHEET_WEBAPP_URL);
    return res.json({
      configured: hasUrl,
      webAppUrl: settings.webAppUrl || (process.env.GOOGLE_SHEET_WEBAPP_URL ? 'تنظیم‌شده در متغیر محیطی' : ''),
      lastBackupTimestamp: settings.lastBackupTimestamp || null,
      lastBackupStatus: settings.lastBackupStatus || 'idle',
      lastBackupMessage: settings.lastBackupMessage || (hasUrl ? 'آدرس وب‌اپ گوگل شیت ثبت شده است.' : 'آدرس وب‌اپ گوگل شیت هنوز ثبت نشده است.'),
    });
  } catch (err: any) {
    return res.status(500).json({ configured: false, lastBackupStatus: 'error', lastBackupMessage: err.message });
  }
});

app.post('/api/atelier/google-sheet/test', requireAdmin, async (req: Request, res: Response) => {
  const { webAppUrl } = req.body || {};
  const result = await sendToGoogleSheet('test', { test: true }, webAppUrl);
  return res.json(result);
});

app.post('/api/atelier/google-sheet/backup', requireAdmin, async (req: Request, res: Response) => {
  const { webAppUrl } = req.body || {};
  const store = await getInitializedStore();
  const result = await sendToGoogleSheet('full_backup', { data: store }, webAppUrl);
  return res.json(result);
});

app.post('/api/atelier/google-sheet/restore', requireAdmin, async (req: Request, res: Response) => {
  const { webAppUrl } = req.body || {};
  const store = await getInitializedStore();
  const targetUrl = (webAppUrl || store.settings?.googleSheetSettings?.webAppUrl || process.env.GOOGLE_SHEET_WEBAPP_URL || '').trim();

  if (!targetUrl || !targetUrl.startsWith('http')) {
    return res.status(400).json({ success: false, message: 'آدرس وب‌اپ گوگل شیت جهت بازیابی یافت نشد.' });
  }

  try {
    const url = new URL(targetUrl);
    url.searchParams.set('action', 'read_backup');
    const resp = await fetch(url.toString(), { redirect: 'follow' });
    if (!resp.ok) {
      return res.status(500).json({ success: false, message: `پاسخ وب‌اپ گوگل شیت با خطا مواجه شد (${resp.status})` });
    }
    const data = await resp.json();
    if (data && typeof data === 'object') {
      const backupStore = data.data || data;
      if (backupStore && (backupStore.appointments || backupStore.customers || backupStore.services)) {
        const merged = {
          ...store,
          ...backupStore,
          lastUpdated: new Date().toISOString(),
        };
        await saveStore(merged);
        return res.json({ 
          success: true, 
          message: `اطلاعات با موفقیت از گوگل شیت بازگردانی شد (${merged.appointments?.length || 0} نوبت، ${merged.customers?.length || 0} مشتری).`,
          restoredData: merged 
        });
      }
    }
    return res.status(400).json({ success: false, message: 'داده‌های پشتیبان گوگل شیت فاقد ساختار استاندارد است.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: `خطا در بازیابی از گوگل شیت: ${err.message}` });
  }
});

// 404 catch-all for any unmatched /api/* routes (e.g., /api/auth/quick-phone-login)
app.use('/api', (_req: Request, res: Response) => {
  return res.status(404).json({ success: false, error: 'Not Found' });
});

// Dynamic PWA manifest served from shop settings in the data file
app.get('/manifest.json', async (_req: Request, res: Response) => {
  try {
    const store = await getInitializedStore();
    const shopName =
      store.settings?.profile?.name ||
      store.studio?.name ||
      (process.env.SHOP_NAME || '').trim() ||
      'آرایشگاه';
    const shopTagline =
      store.settings?.profile?.tagline ||
      store.studio?.tagline ||
      'سامانه هوشمند رزرو آنلاین نوبت آرایشگاه';
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    return res.json({
      id: '/',
      name: `${shopName} — رزرو آنلاین نوبت`,
      short_name: shopName,
      description: `${shopTagline} — ${shopName}`,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait-primary',
      background_color: '#121110',
      theme_color: '#1c1917',
      dir: 'rtl',
      lang: 'fa',
      icons: [
        {
          src: '/icon.svg',
          sizes: '192x192 512x512',
          type: 'image/svg+xml',
          purpose: 'any',
        },
        {
          src: '/icon.svg',
          sizes: '512x512',
          type: 'image/svg+xml',
          purpose: 'maskable',
        },
      ],
    });
  } catch {
    return res.status(500).json({});
  }
});

// ─── Vite Middleware integration ─────────────────────────────────────────────
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  // STEP 5: Admin safety check & bootstrap from environment
  const store = await getInitializedStore();
  runDailyBackup();
  setInterval(runDailyBackup, 60 * 60 * 1000);
  const hasAdmin = (store.users || []).some((u: any) => u.role === 'admin');
  if (!hasAdmin) {
    const initialPhone = (process.env.ADMIN_INITIAL_PHONE || '').trim();
    const initialPass = (process.env.ADMIN_INITIAL_PASSWORD || '').trim();
    if (initialPhone && initialPass) {
      store.users = store.users || [];
      store.users.push({
        id: `admin_${Date.now()}`,
        phone: initialPhone,
        displayName: 'مدیریت کل آرایشگاه',
        password: bcrypt.hashSync(initialPass, 10),
        role: 'admin',
        createdAt: new Date().toISOString(),
      });
      await saveStore(store);
      console.log(`[Admin Security] First admin created with phone ${initialPhone}`);
    } else {
      console.warn('[Admin Notice] No admin exists. Set ADMIN_INITIAL_PHONE and ADMIN_INITIAL_PASSWORD in .env to initialize the admin account.');
    }
  }

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[Royal Atelier Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
