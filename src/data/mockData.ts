import {
  Studio,
  Chair,
  Barber,
  ClientProfile,
  Service,
  Accoutrement,
  BeverageOption,
  Appointment,
  Reservation,
  Product,
  Order,
  StudioNotification,
} from '../types';
import { DEFAULT_OPERATING_HOURS } from '../utils/settingsDefaults';
import { DEFAULT_BARBER_PRESET_MESSAGES } from '../utils/presetMessages';
import { DEFAULT_CLIENT_PROFILE } from './seedData';
import { DEFAULT_CLIENT_AVATAR, CHROME_AVATARS } from './avatars';

import barberStudio3d from '../assets/images/barber_studio_3d_1790560446245.jpg';
import vintageBarberBg from '../assets/images/vintage_barber_bg_1790560739801.jpg';
import floatingBarberBg from '../assets/images/floating_barber_bg_1790559847570.jpg';
import atelierBgArt from '../assets/images/atelier_bg_art_1790558903666.jpg';
import executiveGrooming from '../assets/images/executive_grooming_1790231976966.jpg';
import royalCrest from '../assets/images/royal_barber_crest_1790231964386.jpg';

export const ATELIER_IMAGES = {
  yourNextCut: barberStudio3d,
  barberSuite: vintageBarberBg,
  darkStudio: floatingBarberBg,
  suiteBooked: atelierBgArt,
  mapPreview: executiveGrooming,
  crest: royalCrest,
};

export const STUDIO_DATA: Studio = {
  id: 'shop-main',
  name: 'آرایشگاه',
  studioName: 'آرایشگاه',
  tagline: 'رزرو آنلاین نوبت آرایشگاه، بدون تماس تلفنی',
  address: '',
  neighborhood: '',
  city: '',
  phone: '',
  conciergePhone: '',
  email: '',
  operationalStatus: 'open',
  valetServiceAvailable: false,
  amenities: [
    'رزرو آنلاین ۲۴ ساعته',
    'یادآوری خودکار پیامکی',
    'ثبت سوابق و سلیقه مشتری',
    'نظافت و استریل کامل ابزارها',
    'پذیرایی چای و قهوه',
  ],
  operatingHours: DEFAULT_OPERATING_HOURS,
  openingHours: DEFAULT_OPERATING_HOURS,
};

export const CHAIRS_DATA: Chair[] = [
  {
    id: 'chair-1',
    chairNumber: '۰۱',
    name: 'صندلی اختصاصی ۱',
    floor: 'طبقه اصلی',
    assignedBarberId: 'barber-1',
    assignedBarberName: 'آرایشگر ارشد',
    status: 'available',
    isVip: true,
    mirrorType: 'آینه نورپردازی گرم استودیویی',
    notes: 'مجهز به صندلی چرمی کلاسیک و سیستم بخور گرم',
    amenities: ['حوله گرم معطر', 'شارژر بی‌سیم', 'پذیرایی اسپرسو'],
  },
];

export const BARBERS_DATA: Barber[] = [
  {
    id: 'barber-1',
    name: 'آرایشگر ارشد',
    title: 'سرآرایشگر و مدیر سالن',
    bio: 'متخصص استایل‌های کلاسیک، اسکین‌فید دقیق و طراحی آناتومیک ریش با بیش از ۱۲ سال سابقه حرفه‌ای.',
    experienceYears: 12,
    certifications: ['مدرک بین‌المللی پیرایش کلاسیک', 'تخصص گریم و متعادل‌سازی چهره داماد'],
    specialties: ['اسکین‌فید دقیق', 'کوپ کلاسیک با قیچی', 'آنکارد و فرم‌دهی ریش'],
    assignedChairId: 'chair-1',
    avatarUrl: DEFAULT_CLIENT_AVATAR,
    rating: 4.9,
    totalClientsServed: 0,
    phone: '',
    email: '',
    isAvailableToday: true,
    workingDays: ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'],
    workingHours: DEFAULT_OPERATING_HOURS,
    presetMessages: DEFAULT_BARBER_PRESET_MESSAGES,
  },
];

export const SERVICES_DATA: Service[] = [
  {
    id: 'svc-1',
    categoryId: 'cat-hair',
    name: 'اصلاح موی کلاسیک',
    price: 220000,
    realPrice: 260000,
    discountedPrice: 220000,
    durationMinutes: 45,
    description: 'کوتاهی دقیق با قیچی و ماشین، شستشو و استایلینگ حرفه‌ای متناسب با فرم صورت.',
    isActive: true,
    sortOrder: 0,
    category: 'haircut',
    tag: 'محبوب‌ترین',
    isSpecialty: true,
  },
  {
    id: 'svc-2',
    categoryId: 'cat-hair',
    name: 'کوتاهی فید / اسکین‌فید',
    price: 300000,
    realPrice: 300000,
    durationMinutes: 45,
    description: 'سایه‌زنی ظریف و بدون مرز از صفر به همراه فرم‌دهی مدرن بالای سر.',
    isActive: true,
    sortOrder: 1,
    category: 'haircut',
    tag: 'تخصصی',
    isSpecialty: true,
  },
  {
    id: 'svc-3',
    categoryId: 'cat-beard',
    name: 'اصلاح ریش و خط ریش',
    price: 130000,
    realPrice: 160000,
    discountedPrice: 130000,
    durationMinutes: 30,
    description: 'مرتب‌سازی حجم ریش، خط‌گیری دقیق گونه و گردن به همراه روغن آرگان.',
    isActive: true,
    sortOrder: 0,
    category: 'beard',
  },
  {
    id: 'svc-4',
    categoryId: 'cat-beard',
    name: 'اصلاح صورت با تیغ داغ',
    price: 200000,
    realPrice: 200000,
    durationMinutes: 30,
    description: 'اصلاح سنتی با حوله بخور معطر، فوم گرم و افترشیو التیام‌بخش.',
    isActive: true,
    sortOrder: 1,
    category: 'beard',
  },
  {
    id: 'svc-5',
    categoryId: 'cat-color',
    name: 'رنگ موی کامل',
    price: 1200000,
    realPrice: 1200000,
    durationMinutes: 120,
    description: 'پوشش کامل سفیدی یا تغییر رنگ با محصولات اورجینال بدون آمونیاک.',
    isActive: true,
    sortOrder: 0,
    category: 'coloring',
  },
  {
    id: 'svc-6',
    categoryId: 'cat-color',
    name: 'لایت و دکلره',
    price: 1800000,
    realPrice: 1800000,
    durationMinutes: 180,
    description: 'هایلایت و دکلره تخصصی با حفظ سلامت تار مو و خنثی‌سازی زردی.',
    isActive: true,
    sortOrder: 1,
    category: 'coloring',
  },
  {
    id: 'svc-7',
    categoryId: 'cat-skin',
    name: 'پاکسازی پوست صورت',
    price: 800000,
    realPrice: 800000,
    durationMinutes: 60,
    description: 'فیشیال چندمرحله‌ای، لایه‌برداری ملایم، بخور اوزون و ماسک آبرسان.',
    isActive: true,
    sortOrder: 0,
    category: 'treatment',
  },
  {
    id: 'svc-8',
    categoryId: 'cat-combo',
    name: 'پکیج VIP دامادی رویال',
    price: 3800000,
    realPrice: 4500000,
    discountedPrice: 3800000,
    durationMinutes: 240,
    description: 'پکیج کامل اصلاح، گریم تخصصی داماد، پاکسازی ویژه پوست و استایلینگ ماندگار.',
    isActive: true,
    sortOrder: 0,
    category: 'rituals',
    tag: 'VIP',
    isSpecialty: true,
  },
];

export const ACCOUTREMENTS_DATA: Accoutrement[] = [
  {
    id: 'acc-1',
    name: 'شستشو و ماساژ سر با حوله گرم',
    price: 75000,
    durationMinutes: 15,
    description: 'شستشوی عمیق مو با شامپوی تخصصی و ماساژ آرامش‌بخش شقیقه با حوله بخور.',
    isComplimentary: false,
    isActive: true,
    selected: false,
    tag: 'آرامش‌بخش',
    sortOrder: 0,
  },
  {
    id: 'acc-2',
    name: 'ماسک زغال فعال و پاکسازی بینی',
    price: 90000,
    durationMinutes: 15,
    description: 'پاکسازی منافذ باز و جوش‌های سرسیاه به همراه سرم شاداب‌کننده پوست.',
    isComplimentary: false,
    isActive: true,
    selected: false,
    tag: 'مراقبت پوست',
    sortOrder: 1,
  },
  {
    id: 'acc-3',
    name: 'تنظیم ابرو و اصلاح موهای گوش و بینی',
    price: 60000,
    durationMinutes: 10,
    description: 'مرتب‌سازی طبیعی ابروها و پاکسازی با وکس گیاهی بدون حساسیت.',
    isComplimentary: false,
    isActive: true,
    selected: false,
    tag: 'تمیزی کامل',
    sortOrder: 2,
  },
  {
    id: 'acc-4',
    name: 'ویتامینه و آبرسانی ساقه مو',
    price: 120000,
    durationMinutes: 15,
    description: 'تقویت و احیای موهای خشک با سرم کراتینه و روغن آرگان مراکشی.',
    isComplimentary: false,
    isActive: true,
    selected: false,
    tag: 'احیاکننده',
    sortOrder: 3,
  },
];

export const BEVERAGE_OPTIONS: BeverageOption[] = [
  {
    id: 'bev-espresso',
    name: 'اسپرسو دبل عربیکا',
    icon: 'coffee',
    price: 0,
    description: 'اسپرسوی تازه‌برشت ۱۰۰٪ عربیکا (پذیرایی رایگان سالن)',
    category: 'hot',
    isAvailable: true,
  },
  {
    id: 'bev-tea',
    name: 'چای سیاه ایرانی با هل',
    icon: 'cup-soda',
    price: 0,
    description: 'چای اصیل دم‌کشیده با عطر هل سبز (پذیرایی رایگان سالن)',
    category: 'hot',
    isAvailable: true,
  },
  {
    id: 'bev-herbal',
    name: 'دمنوش آرامش بهارنارنج و زعفران',
    icon: 'sparkles',
    price: 0,
    description: 'دمنوش گیاهی گرم و آرام‌بخش (پذیرایی رایگان سالن)',
    category: 'herbal',
    isAvailable: true,
  },
  {
    id: 'bev-water',
    name: 'آب معدنی خنک با برش لیمو',
    icon: 'droplets',
    price: 0,
    description: 'آب گوارا و خنک با لیموی تازه',
    category: 'cold',
    isAvailable: true,
  },
];

export const INITIAL_CLIENT_PROFILE: ClientProfile = DEFAULT_CLIENT_PROFILE;

export const CUSTOMERS_DATA: ClientProfile[] = [];

export const TODAY_APPOINTMENTS_DATA: Appointment[] = [];

export const PAST_APPOINTMENTS_DATA: Appointment[] = [];

export const INITIAL_RESERVATION: Reservation = {
  id: 'res-initial',
  appointmentNumber: 'RV-1000',
  reservationNumber: 'RV-1000',
  customerId: DEFAULT_CLIENT_PROFILE.id,
  customerName: DEFAULT_CLIENT_PROFILE.name || 'مراجع گرامی',
  customerPhone: DEFAULT_CLIENT_PROFILE.phone || '',
  serviceId: SERVICES_DATA[0].id,
  service: SERVICES_DATA[0],
  barberId: BARBERS_DATA[0].id,
  barberName: BARBERS_DATA[0].name,
  artisan: BARBERS_DATA[0].name,
  chairId: CHAIRS_DATA[0].id,
  chairName: CHAIRS_DATA[0].name,
  suite: CHAIRS_DATA[0].name,
  location: STUDIO_DATA.name,
  date: '۱۲ مهر',
  selectedDate: '۱۲ مهر',
  dayNumber: 12,
  startTime: '16:00',
  selectedTime: '16:00',
  endTime: '16:45',
  durationMinutes: 45,
  servicePrice: SERVICES_DATA[0].price,
  originalServicePrice: SERVICES_DATA[0].realPrice,
  discountAmount: 40000,
  accoutrementsPrice: 0,
  tipPercentage: 0,
  tipAmount: 0,
  totalAmount: SERVICES_DATA[0].price,
  depositAmount: 0,
  additionalAccoutrements: [],
  beverage: BEVERAGE_OPTIONS[0],
  status: 'confirmed',
  bookingSource: 'online',
  createdAt: '۱۴۰۳/۰۷/۱۲',
  bookingTimestamp: '۱۲ مهر · ساعت ۱۶:۰۰',
};

export const PRODUCTS_DATA: Product[] = [];

export const ORDERS_DATA: Order[] = [];

export const NOTIFICATIONS_DATA: StudioNotification[] = [];
