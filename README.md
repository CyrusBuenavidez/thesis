# PECIT Thesis Archive

Local Next.js 16 application for the Philippine Electronics and Communication
Institute of Technology thesis archive.

## Local setup

1. Install the current Node.js LTS release and run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Fill `.env.local` using the sources below. Do not paste any value into source
   code, documentation, chat, or a committed file.
4. Run `npm run check:services`. Continue only when R2, Supabase, and Redis each
   print `PASS`.
5. Run `npm run dev`, then open `http://localhost:3000`.

## Environment value sources

| Variable | Value to use locally |
| --- | --- |
| `APP_URL` | `http://localhost:3000` |
| `APP_ENV` | `development` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → **Connect** → **Project URL** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase project → **Connect** → **Publishable key** |
| `SUPABASE_SECRET_KEY` | Supabase project → **Settings** → **API Keys** → **Secret key** |
| `R2_ACCOUNT_ID` | Cloudflare dashboard → **R2 Object Storage** → account ID |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 → **Manage API Tokens** → the bucket-scoped token’s access key ID |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 → **Manage API Tokens** → the same token’s secret access key |
| `R2_BUCKET_NAME` | The private development bucket name, expected to be `pecit-thesis-dev` |
| `UPSTASH_REDIS_REST_URL` | Upstash console → development database → **REST API** → URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash console → development database → **REST API** → read/write token |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare’s documented localhost always-pass test site key from the master build spec |
| `TURNSTILE_SECRET_KEY` | The matching documented localhost always-pass test secret from the master build spec |
| `JOBS_MODE` | `inline` |
| `EMAIL_MODE` | `console` |
| `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `RESEND_API_KEY` | Leave blank until Stage 6 |

The application stops at boot when a required variable is missing. A production
configuration also refuses Cloudflare’s dummy Turnstile secrets.

## Checks

```powershell
npm run lint
npm run typecheck
npm test
npm run check:services
```

`check:services` creates and deletes one small object in the private R2 bucket,
makes one authenticated Supabase Auth request, and pings Redis. It prints only a
PASS/FAIL result for each service and never prints keys.
