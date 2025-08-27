# Sales Agent Node Server (Express)

## Run locally

1. `cp .env.example .env` and fill values
2. `npm install`
3. `npm run dev`

## Endpoints

- `GET /api/health` → `ok`
- `GET /api/agent` / `PUT /api/agent`
- `GET /api/clients` / `POST /api/clients`
- `POST /api/clients/import` (form-data: `file` CSV with headers `name,email`)
- `GET /api/messages/:id` → message history for a client
- `POST /api/campaign/send` → send initial outreach to clients with status `NEW`
- `POST /api/email/send` → manual send (JSON: `{ clientId, subject, text, html?, inReplyTo? }`)
- `POST /api/email/inbound` → SendGrid Inbound Parse (multipart) webhook
- `POST /api/webhooks/cal` → Cal.com / Calendly webhook

## SendGrid Inbound Parse

Set your Inbound Parse to POST to: `https://YOUR_HOST/api/email/inbound` with *Spam Check disabled* and *POST URL* enabled.

## Notes

- Ready to sit behind any frontend (Next.js, React SPA, mobile, etc.).