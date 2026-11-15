# Version 2 — doctor-first hospital site with patient portal and care packages

Pages
- `index.html`   find a doctor, care packages
- `doctor.html`  doctor profile and booking (clinic or video)
- `portal.html`  patient portal (phone + 6-digit PIN)
- `staff.html`   staff dashboard (PIN)
- `api/app.js`   the whole backend, one Vercel function
- `data.js`      hospital details, doctors and packages — EDIT THIS (it is sample data)

Try it on a computer: `node dev-server.js`, open http://localhost:3000 (staff PIN in demo mode: 0000).

## Deploy on Vercel
1. Push this folder to a GitHub repo, import it in Vercel (preset "Other", no build step).
2. Add **Upstash for Redis** from the Vercel Marketplace (Storage). Without it the site runs in demo mode and saves nothing.
3. Environment variables, then redeploy:

| Variable | What it is |
|---|---|
| `STAFF_PIN` | PIN for staff.html. Required once the database is connected. |
| `SESSION_SECRET` | Any long random text; signs patient sign-ins. |
| `SITE_URL` | Your live address, used in message links. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Turns on text messages. |
| `PAYSTACK_SECRET_KEY` | Turns on mobile money / card payment of bills. |
| `VIDEO_BASE_URL` | Optional. Video rooms default to `https://meet.jit.si/`; point this at your own video service. |
| `CRON_SECRET` | Any random text; protects the daily reminder job. |

## Notes
- Doctors, fees, prices and packages in `data.js` are placeholders. Replace before launch.
- Video rooms use the public Jitsi service by default, where a signed-in moderator (the doctor) must start the room. Use your own video service for real consultations.
- Patient accounts are a phone number and PIN with no text-message verification. Get data-protection and clinical sign-off before putting real records through it.
