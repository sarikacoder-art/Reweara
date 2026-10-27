# Reweara — MERN clothing rental MVP

A campus-first clothing rental web app starter built with React + Vite, Express, MongoDB/Mongoose, JWT, Socket.IO, Cloudinary-ready image fields, and an optional Razorpay test-mode integration scaffold.

## Included
- Register/login with bcrypt + JWT
- Clothing listing create, browse, search/filter, view and deactivate
- Nearby listing search (2 km) when item coordinates are saved
- Booking request, lender accept/reject, pickup, return request, completion
- Agreement/rules snapshot stored on each booking
- Booking-specific message history + Socket.IO live chat with participant checks
- Payment endpoints scaffolded for Razorpay (server-side order creation/verification)
- Responsive UI with demo seed listings for visual testing when API/database isn't configured

## Requirements
- Node.js 20+ recommended
- MongoDB Atlas URI or local MongoDB
- Razorpay account only if testing payments (use test keys; never production keys during development)

## Setup
1. Extract this zip.
2. Open the extracted `Reweara` folder in VS Code.
3. In a terminal:
   ```powershell
   cd server
   npm install
   Copy-Item .env.example .env
   ```
4. Edit `server/.env` and set `MONGO_URI` and a long random `JWT_SECRET`.
5. Start backend:
   ```powershell
   npm run dev
   ```
6. In a second terminal:
   ```powershell
   cd client
   npm install
   Copy-Item .env.example .env
   npm run dev
   ```
7. Open the Vite URL shown in the terminal, usually http://localhost:5173.

## Payments
- If `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are configured, the API can create an order and verify a payment signature.
- The app does not claim to implement escrow. Deposit handling/refunds need to be designed against the payment provider's supported features and account approval.
- Use only test keys until webhook verification, refunds, failures, and reconciliation have been tested.
- Do not store card details.

## Important MVP limitations
- This is a functional starter, not production-hardened. Before real public launch, add rate limiting, email verification/password reset, robust validation, payment webhooks/idempotency, booking concurrency protection, moderation, audit logs, legal review of rental terms, and deployment configuration.
- Location-based search requires `location` coordinates on clothing documents. The UI supports an approximate area label; never expose a precise pickup address publicly.
- Chat history is persisted, but chat authorization is checked server-side by booking participants.
