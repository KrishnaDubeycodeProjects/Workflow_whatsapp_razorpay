# Gorai Equestrian Centre — Booking Portal & Admin Desk

A Next.js web app where riders book sessions, sign the safety waiver and pay online, and staff manage bookings, riders and live WhatsApp chats from one admin desk.

> System design, flows and deployment: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Features

| Area | What it does |
|---|---|
| **Booking** | Pick a plan in a full-screen detail view, then choose from a list of upcoming dates and live time slots. The slot is held while the rider finishes, with a visible countdown. |
| **Rider waiver** | Three-step registration form. Every required field is checked as you type, with a red outline and a short message. The guardian section appears automatically when the rider is under 18. |
| **Payments** | Razorpay Standard Checkout (UPI, cards, net banking, wallets). The server sets the price and checks the signature. |
| **WhatsApp** | n8n sends every outgoing message (payment links, receipts). The portal sends directly only if n8n fails. |
| **Admin desk** | Password-protected dashboard: KPIs, bookings, registrations, payments, live chats with human takeover, knowledge base. |
| **Receipts** | PDF receipt download for paid orders. |

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, `proxy.ts`), React 19, TypeScript |
| Styling | Tailwind CSS 4, lucide-react icons |
| Database | PostgreSQL (Neon, serverless) via `pg` |
| Payments | Razorpay |
| Messaging | Meta WhatsApp Cloud API, orchestrated by n8n |
| AI (legacy routes) | AWS Bedrock |
| Hosting | Vercel |

## Project Structure

```
admin-portal/
├── docs/                  Architecture & flow documentation
├── public/assets/         Logo and brochure images
└── src/
    ├── app/
    │   ├── page.tsx       Public home page
    │   ├── checkout/      Plan → date & time → details → pay
    │   ├── register/      Rider registration & safety waiver
    │   ├── properties/    Property catalogue (secondary module)
    │   ├── login/         Admin sign-in
    │   ├── admin/         Admin desk (protected)
    │   └── api/           Route handlers (public + admin)
    ├── components/        Shared UI components
    ├── lib/               Domain logic: auth, booking, payments, validation, db, n8n, whatsapp
    └── proxy.ts           Admin route gate (Next.js 16 proxy)
```

## Quick Start

Requirements: Node.js 20+, a PostgreSQL database with the schema applied (see `../database/`).

```bash
npm install
cp .env.example .env.local     # then fill in your own values
npm run dev                    # http://localhost:3000
```

| Script | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm run start` | Serve the production build |

## Environment Variables

Copy `.env.example` to `.env.local`. **Never commit real values.**

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ADMIN_PASSWORD` | Yes | Admin desk password. If it is not set, the admin desk stays locked. |
| `AUTH_SECRET` | Recommended | Key that signs session cookies (32+ random characters). If not set, `ADMIN_PASSWORD` is used. |
| `NEXT_PUBLIC_APP_URL` | Yes | Public base URL used in links |
| `RAZORPAY_KEY_ID` | Yes | Razorpay public key |
| `RAZORPAY_KEY_SECRET` | Yes | Razorpay secret (server only) |
| `RAZORPAY_WEBHOOK_SECRET` | Yes | Verifies Razorpay webhooks |
| `WHATSAPP_ACCESS_TOKEN` | Yes | WhatsApp Cloud API token (fallback sends, admin replies) |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes | WhatsApp sender ID |
| `WEBHOOK_VERIFY_TOKEN` | If webhook enabled | Meta webhook verification |
| `WHATSAPP_WEBHOOK_MODE` | No | `disabled` (default) · `forward` · `standalone` |
| `N8N_PAYMENT_WEBHOOK_URL` | Yes | n8n payment-confirmation webhook |
| `N8N_REGISTRATION_WEBHOOK_URL` | Yes | n8n waiver-completed webhook |
| `N8N_WHATSAPP_INGRESS_URL` | If `forward` | n8n inbound WhatsApp relay |
| `GEC_INTERNAL_SECRET` | Yes | Shared secret header for portal → n8n calls |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` / `BEDROCK_MODEL_ID` / `BEDROCK_FALLBACK_MODEL_ID` | Legacy only | Bedrock AI routes |

## Routes

**Public pages**

| Path | Description |
|---|---|
| `/` | Home and plan catalogue |
| `/checkout` | Booking and payment (`?plan=`, `?order_id=&phone=` from WhatsApp) |
| `/register` | Rider waiver (`?orderId=&phone=` links it to a booking) |
| `/properties`, `/properties/[id]` | Property catalogue |
| `/login` | Admin sign-in |
| `/admin` | Admin desk (**protected**) |

**Public APIs** (rate-limited)

| Method & Path | Purpose |
|---|---|
| `GET /api/services` | Active plan catalogue |
| `GET /api/slots[?date=]` | Open time slots (30-day window) |
| `GET /api/order-summary` | Booking status (order ID and owning phone number both required) |
| `POST /api/create-order` | Hold slot + create Razorpay order (server-priced) |
| `POST /api/verify-payment` | Verify checkout signature, finalise booking |
| `POST /api/payments/webhook` | Razorpay server-to-server webhook |
| `POST /api/register` | Submit rider waiver |
| `GET /api/receipt/pdf` | Receipt PDF |
| `POST /api/auth/login` · `/api/auth/logout` | Admin session |
| `GET /api/auth/session` | Current admin session expiry |
| `/api/webhook/whatsapp` | Meta webhook (mode-controlled) |

**Admin APIs** (session required)

| Method & Path | Purpose |
|---|---|
| `GET /api/admin/data` | Dashboard data |
| `POST /api/admin/reply` | Send a WhatsApp reply as staff |
| `POST /api/admin/takeover` | Switch a chat between AI and human |
| `POST /api/admin/knowledge` | Add knowledge-base articles |

## Security

- **Admin sessions:** HMAC-SHA256 signed, `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production). Sessions end after **30 minutes of inactivity**, and always after **12 hours**. The desk warns before sign-out. Changing `AUTH_SECRET` signs everyone out.
- **Fail closed:** if `ADMIN_PASSWORD` is not set, no one can sign in.
- **Login protection:** constant-time password comparison, attempt throttling, safe `next` redirects (no open redirects).
- **Payments:** the price always comes from the database. Bookings are marked paid only after Razorpay signature verification and a server-side check of amount and capture status. Finalisation is idempotent, so a webhook racing the browser never pays twice.
- **Validation:** the same rules in `src/lib/validation.ts` run in the browser and on the server (names, Indian mobile numbers, email, date of birth and age, height and weight ranges, signature match).
- **Data exposure:** public APIs return no customer, health or waiver data. A booking lookup needs both the order ID and the phone number that owns it.
- **Rate limits:** every public endpoint is rate-limited by IP.
- **Secrets:** stored only in `.env.local` (ignored by git) and the host's environment settings.

## Deployment

The app is deployed on **Vercel**. A push to the connected GitHub branch triggers a build.

1. Import the repository in Vercel (framework preset: Next.js).
2. Add every variable from the table above under **Project → Settings → Environment Variables**.
3. Set the Razorpay webhook URL to `<NEXT_PUBLIC_APP_URL>/api/payments/webhook`.
4. Push to the main branch, or run `vercel --prod`.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#5-deployment-workflow) for the full deployment workflow.
