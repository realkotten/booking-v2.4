import crypto from 'crypto';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const createdBookings = [];

function toEnglishDigits(str) {
  return String(str)
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

function getDatePayload(daysAhead = 1) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dayNumber = Number(
    new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { day: 'numeric' }).format(d)
  );
  return { date, dayNumber };
}

async function createTestBooking(overrides = {}, extraHeaders = {}) {
  const { date, dayNumber } = getDatePayload(1);
  const id = `sec-test-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const res = await fetch(`${BASE_URL}/api/atelier/appointment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify({
      id,
      serviceId: 'svc-1',
      barberId: 'barber-1',
      chairId: 'chair-1',
      date,
      dayNumber,
      startTime: '11:00',
      endTime: '11:45',
      durationMinutes: 45,
      customerName: 'Security Test Guest',
      customerPhone: '09121112233',
      ...overrides,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data?.appointment?.id && data?.guestToken) {
    createdBookings.push({ id: data.appointment.id, guestToken: data.guestToken });
  }
  return { res, data };
}

async function deleteTestBooking(id, guestToken) {
  if (!id || !guestToken) return;
  try {
    await fetch(`${BASE_URL}/api/atelier/appointment/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        'X-Guest-Token': guestToken,
      },
    });
  } catch {
    // ignore cleanup error
  }
  const idx = createdBookings.findIndex((b) => b.id === id);
  if (idx >= 0) createdBookings.splice(idx, 1);
}

function report(passed, name) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  if (!passed) {
    process.exitCode = 1;
  }
}

async function run() {
  try {
    // (a) /api/auth/quick-phone-login gives 404
    {
      const resPost = await fetch(`${BASE_URL}/api/auth/quick-phone-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '09120000000' }),
      });
      const resGet = await fetch(`${BASE_URL}/api/auth/quick-phone-login`);
      report(
        resPost.status === 404 && resGet.status === 404,
        '(a) /api/auth/quick-phone-login gives 404'
      );
    }

    // (b) GET /api/atelier/state without login contains no phone-like numbers
    {
      const { data: tempData } = await createTestBooking({ customerPhone: '09129876543' });
      const res = await fetch(`${BASE_URL}/api/atelier/state`);
      const rawText = await res.text();
      const normalized = toEnglishDigits(rawText);
      const phoneRegex = /(?:\+98|0098|0)9\d{9}\b|\b0\d{2,3}-\d{7,8}\b/;
      const hasPhone = phoneRegex.test(normalized);
      if (tempData?.appointment?.id && tempData?.guestToken) {
        await deleteTestBooking(tempData.appointment.id, tempData.guestToken);
      }
      report(
        res.status === 200 && !hasPhone,
        '(b) GET /api/atelier/state without login contains no phone-like numbers'
      );
    }

    // (c) POST /api/atelier/restore, GET /api/atelier/backup, POST /api/atelier/settings and POST /api/atelier/state without admin login give 401 or 403
    {
      const r1 = await fetch(`${BASE_URL}/api/atelier/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const r2 = await fetch(`${BASE_URL}/api/atelier/backup`);
      const r3 = await fetch(`${BASE_URL}/api/atelier/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const r4 = await fetch(`${BASE_URL}/api/atelier/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const isAuthRejected = (s) => s === 401 || s === 403;
      report(
        isAuthRejected(r1.status) &&
          isAuthRejected(r2.status) &&
          isAuthRejected(r3.status) &&
          isAuthRejected(r4.status),
        '(c) admin endpoints without admin login give 401 or 403'
      );
    }

    // (d) guest A cannot cancel guest B's booking
    {
      const guestAToken = crypto.randomBytes(32).toString('hex');
      const { res: createRes, data: guestBData } = await createTestBooking();
      const bookingBId = guestBData?.appointment?.id;
      const guestBToken = guestBData?.guestToken;

      let cancelStatus = 0;
      if (createRes.ok && bookingBId) {
        const cancelRes = await fetch(
          `${BASE_URL}/api/atelier/appointment/${encodeURIComponent(bookingBId)}/status`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'X-Guest-Token': guestAToken,
            },
            body: JSON.stringify({ status: 'cancelled' }),
          }
        );
        cancelStatus = cancelRes.status;
      }

      if (bookingBId && guestBToken) {
        await deleteTestBooking(bookingBId, guestBToken);
      }

      report(
        createRes.ok && cancelStatus === 403,
        "(d) guest A cannot cancel guest B's booking"
      );
    }

    // (e) a booking dated 12 days ahead gives 400
    {
      const future12 = getDatePayload(12);
      const { res, data } = await createTestBooking({
        date: future12.date,
        dayNumber: future12.dayNumber,
      });
      if (data?.appointment?.id && data?.guestToken) {
        await deleteTestBooking(data.appointment.id, data.guestToken);
      }
      report(res.status === 400, '(e) booking dated 12 days ahead gives 400');
    }

    // (f) a third pending_payment booking from the same guest token gives 429
    {
      const sharedGuestToken = crypto.randomBytes(32).toString('hex');
      const b1 = await createTestBooking(
        { startTime: '12:00', endTime: '12:45' },
        { 'X-Guest-Token': sharedGuestToken }
      );
      const b2 = await createTestBooking(
        { startTime: '13:00', endTime: '13:45' },
        { 'X-Guest-Token': sharedGuestToken }
      );
      const b3 = await createTestBooking(
        { startTime: '14:00', endTime: '14:45' },
        { 'X-Guest-Token': sharedGuestToken }
      );

      if (b1.data?.appointment?.id && b1.data?.guestToken) {
        await deleteTestBooking(b1.data.appointment.id, b1.data.guestToken);
      }
      if (b2.data?.appointment?.id && b2.data?.guestToken) {
        await deleteTestBooking(b2.data.appointment.id, b2.data.guestToken);
      }
      if (b3.data?.appointment?.id && b3.data?.guestToken) {
        await deleteTestBooking(b3.data.appointment.id, b3.data.guestToken);
      }

      report(
        b1.res.ok && b2.res.ok && b3.res.status === 429,
        '(f) third pending_payment booking from same guest token gives 429'
      );
    }

    // (g) a booking sent with status "confirmed" and paid true is saved as pending_payment
    {
      const { res, data } = await createTestBooking({
        status: 'confirmed',
        paid: true,
        isPaid: true,
        paymentStatus: 'paid',
      });
      const apt = data?.appointment;
      const savedAsPending =
        res.ok &&
        apt &&
        apt.status === 'pending_payment' &&
        apt.paid === false &&
        apt.paymentStatus !== 'paid';

      if (apt?.id && data?.guestToken) {
        await deleteTestBooking(apt.id, data.guestToken);
      }

      report(
        Boolean(savedAsPending),
        '(g) booking sent with status confirmed and paid true is saved as pending_payment'
      );
    }

    // (h) a payment request without a valid guest token gives 403
    {
      const { res: createRes, data } = await createTestBooking();
      const bookingId = data?.appointment?.id;
      const guestToken = data?.guestToken;

      let noTokenStatus = 0;
      let wrongTokenStatus = 0;
      if (createRes.ok && bookingId) {
        const rNoToken = await fetch(`${BASE_URL}/api/payment/zarinpal/request`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId }),
        });
        noTokenStatus = rNoToken.status;

        const rWrongToken = await fetch(`${BASE_URL}/api/payment/zarinpal/request`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Guest-Token': crypto.randomBytes(32).toString('hex'),
          },
          body: JSON.stringify({ bookingId }),
        });
        wrongTokenStatus = rWrongToken.status;
      }

      if (bookingId && guestToken) {
        await deleteTestBooking(bookingId, guestToken);
      }

      report(
        createRes.ok && noTokenStatus === 403 && wrongTokenStatus === 403,
        '(h) payment request without valid guest token gives 403'
      );
    }

    // (i) /.env and /data/atelier_storage.json give 404
    {
      const rEnv = await fetch(`${BASE_URL}/.env`);
      const rData = await fetch(`${BASE_URL}/data/atelier_storage.json`);
      report(
        rEnv.status === 404 && rData.status === 404,
        '(i) /.env and /data/atelier_storage.json give 404'
      );
    }
  } finally {
    for (const item of [...createdBookings]) {
      await deleteTestBooking(item.id, item.guestToken);
    }
  }
}

run().catch((err) => {
  console.error('FAIL unexpected error:', err?.message || err);
  process.exit(1);
});
