# Reimburse

A mobile app and API for reading bills, confirming expenses, building reimbursement claims, and tracking payments.

## What you can do

1. Sign in with Firebase email and password, or explore with demo data.
2. Add up to 10 bills at once from the camera, photo library, or PDFs.
3. The API reads date, vendor, billed-to name, amount, and the kind of expense.
4. Confirm or edit the result. Cab rides always ask whether the trip was shared, and that answer starts as no. A food bill asks for the people who shared it when one meal is over ₹250.
5. Bundle confirmed bills into a claim and submit it. The admin account approves or rejects it and logs each payment.

## Run it

The API needs Node 22. The app is Expo and runs in Expo Go, a simulator, or the browser.

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

```bash
cd mobile
cp .env.example .env
npm install
npx expo start
```

On a phone, set `EXPO_PUBLIC_API_URL` in `mobile/.env` to your computer’s address, for example `http://192.168.1.20:8787`. The Android emulator uses `http://10.0.2.2:8787`. iOS simulator and web can use `http://localhost:8787`.

Open the app and choose **Explore with demo data** if Firebase is not set up yet. Without a Gemini key, the bill is saved and you type the details yourself.

## Firebase login

1. Create a Firebase project and turn on Email/Password sign-in.
2. Copy the web app config into `mobile/.env` (`EXPO_PUBLIC_FIREBASE_*`).
3. Put the same Web API key in `backend/.env` as `FIREBASE_API_KEY`.

The API checks the Firebase ID token with that key. No service account is required.

## Automatic reading

Create a Gemini API key and set it in `backend/.env`:

```bash
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-3.8-flash
```

Restart the API. The next upload sends the photo or PDF to Gemini and fills the confirmation screen.

## Claim and payment states

A claim moves from draft to submitted. Only the admin account can approve or reject it, and only that account can log a payment. The status becomes part paid, then paid, from those amounts. Share produces a plain-text claim you can send on.

The API creates that admin in Firebase on startup:

- Email: `admin@reimburse.app` (override with `ADMIN_EMAIL`)
- Password: `ReimburseAdmin1` (override with `ADMIN_PASSWORD`)

Sign in with those details. Everyone else can file claims and see the result, but the approve and payment buttons stay hidden.

Set `DEMO_MODE=false` once real sign-in is in use.
