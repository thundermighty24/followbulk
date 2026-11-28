FOLLOWBULK - SEPARATE CUSTOMER AND ADMIN PAGES

FILES
- index.html: public landing page with links to both panels
- customer.html: customer service catalogue, order form and wallet dashboard
- admin.html: administrator login and control centre
- app.js: shared, page-aware Supabase application logic
- styles.css: shared styling

UPLOAD
1. Extract this ZIP.
2. In GitHub, open the existing thundermighty24/followbulk repository.
3. Select the main branch and upload these six files to the repository root.
4. Replace files with the same names when GitHub asks.
5. Commit the upload with the message: Separate customer and admin panels.

IMPORTANT
- Keep all six files together in the repository root; do not create a new folder.
- Do not delete or change Supabase tables, policies, Edge Functions or secrets.
- Use the existing administrator account at admin.html. Do not create a new admin account from the customer page.
- Customer registration and login are available from customer.html.
- Do not place a real order or make a payment until the deployed backend and payment process have been checked.
- This ZIP changes frontend files only. It does not deploy or modify Supabase Edge Functions.
