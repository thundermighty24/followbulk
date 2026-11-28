FOLLOWBULK — PREMIUM CUSTOMER + ADMIN REFRESH

PACKAGE FILES
- index.html: refreshed public landing page with a compact menu
- customer.html: customer workspace with dashboard-first login experience
- admin.html: separate administrator control centre with menu navigation
- app.js: existing Supabase application logic plus customer overview and navigation
- styles.css: responsive premium styling for phone and desktop
- SETUP-PLATFORM-ORDER-COUNT.sql: one-time safe customer-scoped aggregate function for dashboard statistics

IMPORTANT BEFORE UPLOADING
1. Keep your current working website files as a backup. This package is separate from them.
2. In Supabase, open SQL Editor for your existing Followbulk project.
3. Open SETUP-PLATFORM-ORDER-COUNT.sql, copy all its contents, paste into SQL Editor and click Run once.
   This function returns only aggregate dashboard numbers. It uses your signed-in user ID automatically and does not expose other customers' order information.
4. Extract this ZIP on your Android phone.
5. Upload all seven files from the extracted folder to the ROOT of thundermighty24/followbulk on the main branch. Do not upload the folder itself.
6. Replace the files with matching names. Keep the SQL file in the repository if you want it for reference; GitHub Pages will not execute it.
7. Commit with: Followbulk premium dashboard makeover
8. Wait for GitHub Pages to finish publishing, then open customer.html and admin.html in Chrome.

CUSTOMER EXPERIENCE
- Before login: clean welcome page; the large service catalogue is not shown immediately.
- After login: customer dashboard is shown first with personal order totals, completed orders, total spend, wallet balance, pending top-ups and recent orders.
- Use the top-right menu to open Services, New order, Add funds, How it works and Help & support.
- Service prices and order placement continue to use the existing backend and database logic.

SAFETY
- This is a frontend refresh plus one read-only SQL function. It does not change your existing tables, RLS policies, wallet approval process, pricing rules, Edge Functions, API keys or secrets.
- Pending top-ups are not counted as wallet balance. Wallet balance still comes from the existing wallet_balance RPC.
- Do not place a live order or make a payment just to test the new design. First test login, dashboard, service browsing, pricing and wallet history.
- The dashboard statistics need the SQL function above. If SQL is not run, those statistic cards will show dashes; recent order history and other dashboard features may still work.
