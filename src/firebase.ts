import { DEFAULT_CLIENT_AVATAR } from './data/avatars';
import type { Appointment, Reservation } from './types';

/**
 * Host Server Native Client Services
 * All persistence is hosted locally on the server disk (no external cloud dependency).
 */

export interface AppUser {
  id: string;
  uid?: string;
  email?: string;
  displayName?: string;
  photoURL?: string;
  phoneNumber?: string;
  formulaNotes?: string;
  role: 'admin' | 'client';
  createdAt?: string;
  updatedAt?: string;
}

export type FirebaseUser = AppUser;

// Dummy compatibility stubs for UI components if needed
export const auth: any = {
  currentUser: null,
};
export const db: any = {};
export const app: any = {};
export const googleProvider: any = {};
export const appleProvider: any = {};

export class RecaptchaVerifier {
  constructor(_auth?: any, _container?: any, _params?: any) {}
  render() { return Promise.resolve(0); }
  clear() {}
  verify() { return Promise.resolve('simulated-recaptcha-token'); }
}

export function clearPhoneRecaptcha(_containerId = 'phone-recaptcha-container'): void {}

export function getOrCreatePhoneRecaptcha(_containerId = 'phone-recaptcha-container', _isInvisible = true): any {
  return new RecaptchaVerifier();
}

export interface ConfirmationResult {
  verificationId: string;
  confirm: (code: string) => Promise<{ user: AppUser }>;
}

export const signInWithPhoneNumber = async (_auth: any, phoneNumber: string): Promise<ConfirmationResult> => {
  return {
    verificationId: `sim_${Date.now()}`,
    confirm: async (_code: string) => {
      const user: AppUser = {
        id: `usr_${phoneNumber.replace(/\D/g, '')}`,
        uid: `usr_${phoneNumber.replace(/\D/g, '')}`,
        phoneNumber,
        displayName: 'مشتری گرامی',
        role: 'client',
        photoURL: DEFAULT_CLIENT_AVATAR,
        createdAt: new Date().toISOString(),
      };
      auth.currentUser = user;
      return { user };
    }
  };
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export function handleFirestoreError(error: unknown, _operationType: OperationType, _path: string | null): never {
  throw error instanceof Error ? error : new Error(String(error));
}

/**
 * Health check on app boot to ensure host server storage is responsive
 */
export async function testConnection(): Promise<boolean> {
  try {
    const res = await fetch('/api/atelier/health');
    return res.ok;
  } catch {
    return false;
  }
}

if (typeof window !== 'undefined') {
  testConnection();
}

/**
 * User profile helper to save/sync host server profile
 */
export async function syncUserProfile(user: AppUser, extraData?: { phoneNumber?: string; formulaNotes?: string; displayName?: string }) {
  if (!user || (!user.id && !user.uid)) return null;
  const userId = user.id || user.uid || '';

  const profileData: AppUser = {
    id: userId,
    uid: userId,
    email: user.email || '',
    displayName: extraData?.displayName || user.displayName || 'کاربر گرامی',
    photoURL: user.photoURL || DEFAULT_CLIENT_AVATAR,
    phoneNumber: extraData?.phoneNumber || user.phoneNumber || '',
    formulaNotes: extraData?.formulaNotes || user.formulaNotes || '',
    role: user.role || 'client',
    updatedAt: new Date().toISOString(),
  };

  try {
    await fetch('/api/auth/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profileData),
    });
  } catch {}

  return profileData;
}

/**
 * Sync appointment to host server database
 */
export async function syncAppointmentToFirestore(appointment: Appointment): Promise<boolean> {
  if (!appointment || !appointment.id) return false;
  try {
    const res = await fetch('/api/atelier/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appointment),
    });
    return res.ok;
  } catch (err) {
    console.warn('Could not sync appointment to host server:', err);
    return false;
  }
}

/**
 * Sync reservation to host server database
 */
export async function syncBookingToFirestore(reservation: Reservation): Promise<boolean> {
  if (!reservation || !reservation.id) return false;
  try {
    const res = await fetch('/api/atelier/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reservation),
    });
    return res.ok;
  } catch (err) {
    console.warn('Could not sync reservation to host server:', err);
    return false;
  }
}

/**
 * Fetch a specific booking from host server database
 */
export async function fetchBookingFromFirestore(bookingId: string): Promise<Reservation | null> {
  if (!bookingId) return null;
  try {
    const res = await fetch(`/api/atelier/reservations/${encodeURIComponent(bookingId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.reservation || data;
  } catch (err) {
    console.warn('Could not fetch booking from host server:', err);
    return null;
  }
}

/**
 * Subscribe to real-time updates for an active booking
 */
export function subscribeToBookingInFirestore(
  bookingId: string,
  onUpdate: (booking: Reservation) => void,
  _onError?: (err: any) => void
): () => void {
  if (!bookingId) return () => {};

  let isMounted = true;
  const poll = async () => {
    try {
      const data = await fetchBookingFromFirestore(bookingId);
      if (isMounted && data && data.id) {
        onUpdate(data);
      }
    } catch {}
  };

  poll();
  const timer = setInterval(poll, 10000);
  return () => {
    isMounted = false;
    clearInterval(timer);
  };
}

/**
 * Update booking status on host server database
 */
export async function updateBookingStatusInFirestore(
  bookingId: string,
  status: Reservation['status']
): Promise<boolean> {
  if (!bookingId) return false;
  try {
    const res = await fetch(`/api/atelier/appointments/${encodeURIComponent(bookingId)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    return res.ok;
  } catch (err) {
    console.warn('Could not update booking status on host server:', err);
    return false;
  }
}

/**
 * Subscribe to appointments on host server
 */
export function subscribeToFirestoreAppointments(
  onUpdate: (appointments: Appointment[]) => void
): () => void {
  let isMounted = true;
  const poll = async () => {
    try {
      const res = await fetch('/api/atelier/state');
      if (res.ok) {
        const store = await res.json();
        if (isMounted && Array.isArray(store.appointments)) {
          onUpdate(store.appointments);
        }
      }
    } catch {}
  };

  poll();
  const timer = setInterval(poll, 15000);
  return () => {
    isMounted = false;
    clearInterval(timer);
  };
}

/**
 * Update appointment status on host server
 */
export async function updateAppointmentStatusInFirestore(
  appointmentId: string,
  status: Appointment['status']
): Promise<boolean> {
  return updateBookingStatusInFirestore(appointmentId, status);
}

/**
 * Delete appointment from host server
 */
export async function deleteAppointmentFromFirestore(appointmentId: string): Promise<boolean> {
  if (!appointmentId) return false;
  try {
    const res = await fetch(`/api/atelier/appointments/${encodeURIComponent(appointmentId)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.warn('Could not delete appointment from host server:', err);
    return false;
  }
}

// Authentication stubs for seamless UI compatibility
export const signInWithPopup = async () => {
  throw new Error('لطفاً از ورود مستقیم با شماره همراه یا نام کاربری استفاده نمایید.');
};
export const signInWithEmailAndPassword = async () => {
  throw new Error('لطفاً از سیستم ورود بومی سامانه استفاده نمایید.');
};
export const createUserWithEmailAndPassword = async () => {
  throw new Error('لطفاً از سیستم ثبت‌نام بومی سامانه استفاده نمایید.');
};
export const signOut = async () => {
  auth.currentUser = null;
  return Promise.resolve();
};
export const onAuthStateChanged = (_auth: any, callback: (user: AppUser | null) => void) => {
  callback(auth.currentUser);
  return () => {};
};
export const updateProfile = async (_user: any, _profile: any) => Promise.resolve();
export const sendPasswordResetEmail = async () => Promise.resolve();
