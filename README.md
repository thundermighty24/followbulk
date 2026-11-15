# Followbulk — connected free starter

This is a static frontend starter connected to the Supabase project details supplied in the chat.

## Included now
- Responsive Followbulk landing page
- Supabase email/password sign-up and login
- Reads active services from `public.services`
- Customer submits manual UPI top-up request with UTR/reference
- Customer can view their own top-up request history
- No Razorpay integration
- No automatic wallet crediting
- No live GCSMM order submission

## Important setup
1. The database SQL was run in the Supabase SQL Editor in this project.
2. In Supabase Authentication settings, configure the Site URL and allowed redirect URLs after choosing your hosting domain.
3. If email confirmation is enabled, users must confirm their email before logging in.
4. Use only the Supabase publishable key (or legacy anon key) in browser code. Never expose the `service_role` or secret key.
5. In Supabase Authentication > Policies, keep RLS enabled.

## Run locally
Open `index.html` in a modern browser. For best results use a static local server or free static hosting. The Supabase JS library is loaded from jsDelivr, so an internet connection is needed.

## Current limitations — do not treat as production-ready
- Service catalogue stays empty until an admin-only server-side sync inserts provider services.
- No customer order submission is enabled yet. Before enabling it, implement server-side wallet balance checks/reservation, idempotency, provider order reconciliation and safe refunds.
- The SQL setup currently has no secure admin provisioning workflow or admin dashboard.
- UPI top-ups are only requests. Verify the actual bank/UPI receipt before approving or crediting any wallet.
- Do not put GCSMM API credentials in browser code. Add them only as Supabase Edge Function secrets.
- Configure Supabase Auth redirect URLs and test RLS before publishing publicly.

## Next build steps
1. Add secure admin provisioning and admin dashboard.
2. Add private UPI QR/ID settings and proof upload with storage policies.
3. Add GCSMM read-only catalogue/balance Edge Function, then controlled order processing only after wallet safeguards are implemented.
4. Add order history/status updates and support tools.
