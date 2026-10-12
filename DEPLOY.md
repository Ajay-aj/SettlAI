# Run and deploy Reimburse

This project is two programs:

- **API** (`backend/`): Node server. It stores claims in a SQLite file, stores bill photos and PDFs on disk, checks Firebase sign-in, and reads bills with Gemini.
- **App** (`mobile/`): Expo app. It runs in a browser, Expo Go, or a simulator, and talks to the API.

Copy the repository to the other machine. Do not copy `node_modules/`, `mobile/.expo/`, or either `.env` file. Those are created on the machine that runs the app.

## What you need

- Node.js 22 or newer, and npm
- Git, if you are cloning the repository
- A Firebase project with Email/Password sign-in, if people will create accounts
- A Gemini API key, if uploaded bills should be read automatically

Without Firebase, the app can still open with **Explore with demo data**. Without Gemini, a bill is saved and the person types the details.

## Run it on another computer

From the repository root:

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Leave that running. In a second terminal:

```bash
cd mobile
cp .env.example .env
npm install
npx expo start
```

Then press `w` for the browser, or scan the QR code with Expo Go. The API is ready when this address returns JSON:

```bash
curl http://localhost:8787/api/health
```

A healthy response looks like `{"ok":true,"demoMode":true,"extraction":false}`. `extraction` is `true` only after `GEMINI_API_KEY` is set.

`npm run dev` in `backend/` restarts the API when the code changes. `npm start` in `backend/` runs it once, which is what a server should use. The app reads `mobile/.env` only when Expo starts, so restart Expo after changing that file.

The API port in `backend/.env` and `EXPO_PUBLIC_API_URL` in `mobile/.env` must be the same port. The examples use `8787`.

### Phone or emulator

The phone must reach the computer running the API.

| Where the app runs | `EXPO_PUBLIC_API_URL` |
| --- | --- |
| Browser or iOS simulator on the same computer | `http://localhost:8787` |
| Android emulator | `http://10.0.2.2:8787` |
| A phone on the same Wi-Fi | `http://<this-computer-lan-ip>:8787` |

Find the computer’s LAN address with `ipconfig getifaddr en0` on macOS, or `hostname -I` on Linux. Restart Expo after changing the URL.

## Fill in the environment files

`backend/.env`:

| Variable | Purpose |
| --- | --- |
| `PORT` | API port. Default in the example is `8787`. |
| `DEMO_MODE` | `true` allows **Explore with demo data**. Set `false` when real accounts are in use. |
| `ADMIN_EMAIL` | The one account that can approve claims and log payments. |
| `ADMIN_PASSWORD` | Password for that account. Change it before the first start on a shared machine. |
| `FIREBASE_API_KEY` | The Firebase **Web API key** from the web app config. This is the API key, not the App ID. |
| `GEMINI_API_KEY` | Gemini key used to read bills. Leave empty to enter bills by hand. |
| `GEMINI_MODEL` | Defaults to `gemini-3.8-flash`. |
| `DATA_DIR` | Optional. Folder for `reimburse.db`. Defaults to `backend/data`. |
| `UPLOADS_DIR` | Optional. Folder for bill files. Defaults to `backend/uploads`. |

`mobile/.env`:

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | Address of the API, with no trailing slash. |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Same Web API key as `FIREBASE_API_KEY`. |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | From the Firebase web app config. |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | From the Firebase web app config. |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | From the Firebase web app config. |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | From the Firebase web app config. |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | From the Firebase web app config. |

Keep both `.env` files on the machine. They are gitignored.

### Firebase

1. Create a project in the Firebase console.
2. Enable **Authentication → Sign-in method → Email/Password**.
3. Add a web app and copy its config into `mobile/.env`.
4. Copy that config’s API key into `backend/.env` as `FIREBASE_API_KEY`.

The API checks each sign-in token with that key. No service account is required.

On the first start with `FIREBASE_API_KEY` set, the API creates the admin user in Firebase. The log line is `Admin account ready for <email>`. The display name is **Admin**. Sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

Choose the admin password before that first start. Changing `ADMIN_PASSWORD` later does not change the Firebase password. Reset it in the Firebase console if it needs to change.

If the log says the admin account could not be prepared, the usual cause is a password Firebase rejected, or an API key from a different project than the app.

### Gemini

Create a key in Google AI Studio and set `GEMINI_API_KEY` in `backend/.env`. Restart the API. The next upload sends the photo or PDF to Gemini and fills the confirmation screen.

### Who can do what

Employees attach bills, confirm them, and submit claims. The admin account does not attach bills. On Home, the admin sees claims waiting for approval, then claims waiting for a payment. Only that account sees **Mark approved**, **Reject claim**, and **Log payment received**.

## Deploy it

Run the API as a long-lived Node process, and publish the web app as static files. Both must be reachable over HTTPS once anyone uses them outside your own computer. The browser blocks camera access on a phone unless the page is HTTPS.

### API

On the server, from `backend/`:

```bash
npm install
npm start
```

`npm start` uses `tsx`, which is installed with the dev dependencies, so do not omit those dependencies.

Set the environment on the server rather than committing `.env`:

- `PORT` to the port the process should listen on
- `DEMO_MODE=false`
- `ADMIN_EMAIL` and `ADMIN_PASSWORD`
- `FIREBASE_API_KEY`
- `GEMINI_API_KEY` and `GEMINI_MODEL`
- `DATA_DIR` and `UPLOADS_DIR` on a disk that survives restarts

Put a reverse proxy in front of the process and give it a public HTTPS address, for example `https://api.example.com`. The process listens on all interfaces. Confirm it with:

```bash
curl https://api.example.com/api/health
```

Back up `DATA_DIR` and `UPLOADS_DIR` together. The database points at files in the uploads folder. Copying one without the other loses either the claim records or the bill images.

### Web app

`EXPO_PUBLIC_*` values are baked in at build time. Set `mobile/.env` on the build machine first. `EXPO_PUBLIC_API_URL` must be the public API address, such as `https://api.example.com`.

```bash
cd mobile
npm install
npx expo export --platform web
```

This writes a static site in `mobile/dist`. Serve that folder over HTTPS, for example `https://reimburse.example.com`. In the Firebase console, add that site under **Authentication → Settings → Authorized domains**.

Rebuild and republish `dist/` after any change to `mobile/.env` or the app code.

### Phones after deployment

A public HTTPS site can be opened in the phone browser. To keep using Expo Go against a deployed API, set `EXPO_PUBLIC_API_URL` to that API and restart Expo.

## Move an existing database

To keep claims and bill files from the current machine, copy these two folders to the same paths on the new machine before starting the API:

- `backend/data/`
- `backend/uploads/`

Use the same Firebase project. Accounts live in Firebase, and the database stores each person’s Firebase user id. A new Firebase project will not match those ids, so old claims will not belong to the new sign-ins.

## Checks

```bash
npm test
```

From the repository root, that runs the API tests.

Then sign in as an employee, attach a bill, and submit a claim. Sign in as the admin and confirm Home shows that claim under **To approve**. Open it and confirm the bill image or PDF is visible, along with **Mark approved** and **Log payment received**.
