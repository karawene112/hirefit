# HireFit

AI CV-to-job matcher for job seekers in the Gulf. Upload a CV (PDF, Word or text), add a job description, and get a match score, missing ATS keywords, rewritten bullet points and a tailored cover letter in English, French or Arabic.

## How it fits together

| Part | Where | What it does |
|---|---|---|
| Website | GitHub Pages (`index.html`, legal pages) | UI, PDF/Word text extraction in the browser, email sign-in |
| Accounts + credits | Supabase project `hirefit` | `profiles`, `scans`, `payments` tables with row-level security |
| AI analysis | Supabase Edge Function `analyze` | Checks credits server-side, calls the Anthropic API, hides premium sections for free users |
| Payments | Lemon Squeezy → Edge Function `ls-webhook` | Verifies the webhook signature, adds 10 credits per pack or activates Unlimited |

## Configuration

Edit the `CONFIG` block near the bottom of `index.html` (checkout links, prices, support email).

Edge Function secrets (Supabase → Edge Functions → Secrets):

- `ANTHROPIC_API_KEY`: from console.anthropic.com
- `LS_WEBHOOK_SECRET`: the signing secret you typed when creating the Lemon Squeezy webhook
- `LS_VARIANT_PACK` / `LS_VARIANT_SUB`: the variant IDs of the two Lemon Squeezy products
- `LS_ACCEPT_TEST_MODE`: set to `false` at launch so test purchases stop granting credits
- optional `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), `PACK_CREDITS` (default 10)
