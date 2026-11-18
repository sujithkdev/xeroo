# Krishna Print Hub

Project navigation: [Structure](docs/STRUCTURE.md) · [Contributing](CONTRIBUTING.md) · [Desktop](electron/README.md) · [Deployment](deploy/README.md)

Automated test runners live in `tests/`; operational scripts live in `scripts/`. Run npm commands from the repository root.

A complete print shop management system — customer ordering website, staff dashboard, and automatic print agent — all in one.

## What it does

- **Customers** upload PDFs, configure print settings, get an instant price, pick a pickup slot, and place an order
- **Staff** see orders in a dashboard, accept/queue/mark ready/collect with one click
- **Print agent** runs silently in the background, picks up paid orders, and sends them to the printer automatically

## Quick start

### Requirements

- Windows 10 or 11 (64-bit)
- [Node.js 22+](https://nodejs.org) — download and install if you don't have it
- A printer connected to the PC

### Step 1 — Clone the repo

```bat
git clone https://github.com/sujithkdev/xeroo-desk.git
cd xeroo-desk
```

### Step 2 — Run setup (one time only)

Double-click **`setup.bat`** or run in terminal:

```bat
setup.bat
```

This will:
- Install all dependencies (`npm install`)
- Create `.env.local` from the template
- Build the web app

### Step 3 — Configure

Open `.env.local` and set your `AGENT_TOKEN`:

```bat
# Generate a token by running this in terminal:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and paste it as your `AGENT_TOKEN` in `.env.local`.

### Step 4 — Start the app

Double-click **`START.bat`** or run:

```bat
START.bat
```

Then open your browser and go to:

| URL | What it is |
|-----|------------|
| `http://localhost:3000` | Customer ordering site |
| `http://localhost:3000/shop` | Staff dashboard |
| `http://localhost:3000/upload` | Upload & order page |

---

## Daily use

Every day when you start the shop PC:

1. Double-click **`START.bat`**
2. Open Chrome → `http://localhost:3000/shop`
3. That's it — orders come in automatically

To stop: press `Ctrl+C` in the terminal window.

---

## First time shop setup

After starting the app, go to **`http://localhost:3000/shop/settings`** and configure:

- **Shop profile** — name, address, phone, timezone
- **Services & prices** — A4 B&W price, colour price, etc.
- **Hours & capacity** — opening/closing time, slot duration
- **Payments** — Razorpay keys (optional, for online payments)

---

## Folder structure

```
├── src/                  — Next.js app (pages, API routes, components)
│   ├── app/              — All pages and API routes
│   ├── components/       — Shared UI components
│   └── lib/              — Business logic, DB, auth
├── electron/             — Electron desktop wrapper
├── agent/                — Print agent runner
├── migrations/           — PostgreSQL migrations (multi-shop mode)
├── scripts/              — Setup and utility scripts
├── public/               — Static assets
├── print-agent.js        — Print agent entry point
├── SumatraPDF.exe        — PDF renderer for silent printing
├── setup.bat             — First-time setup script
└── START.bat             — Daily start script
```

---

## How printing works

```
Customer places order on website
        ↓
Order saved to database
        ↓
Print agent polls every 5 seconds
        ↓
Finds a paid order → claims it
        ↓
Downloads the PDF
        ↓
Sends to printer via SumatraPDF silently
        ↓
Order status → "Submitted" → "Ready"
        ↓
Staff marks "Collected" after customer picks up
```

---

## Running as Electron desktop app

The app includes an Electron wrapper so it runs as a proper desktop app with a system tray icon.

```bat
# Dev mode (requires npm run build first)
node_modules\.bin\electron .

# The tray icon appears — right-click to open dashboard or quit
```

---

## Environment variables

See `.env.example` for all available options with descriptions.

Key variables:

| Variable | Required | Description |
|---|---|---|
| `LOCAL_OPERATOR_MODE` | Yes | Set to `true` for single-shop mode |
| `AGENT_TOKEN` | Yes | 64-char hex token for print agent auth |
| `BACKEND_URL` | Yes | Web server URL (default: `http://127.0.0.1:3000`) |
| `RAZORPAY_KEY_ID` | No | For online payments |
| `DATABASE_URL` | No | PostgreSQL URL for multi-shop mode |

---

## Tech stack

- **Next.js 16** — web framework
- **SQLite** (local) / **PostgreSQL** (multi-shop) — database
- **Tailwind CSS** — styling
- **Electron** — desktop wrapper
- **SumatraPDF** — silent PDF printing on Windows
- **Razorpay** — payment gateway (optional)

---

## License

Private — Krishna Print Hub
