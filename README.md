# صفقة (Safqa)
Broker marketplace: cars, real estate, rentals. (c) 2026 Ziad Alaa. All rights reserved.
Run: `node --no-warnings server.js` (Node >= 22.5, no npm install needed), open http://localhost:3000
Env: PORT, DB (sqlite file path). Data in safqa.db.
Env: ADMIN_EMAIL (account that approves payment requests, shown in /#/plans), PAY_INFO (text shown to users: where to send money).
PWA: manifest + service worker + icons. Needs HTTPS when hosted to be installable (localhost works).
Default PAY_INFO: InstaPay 01212973759. Default admin: zozalaaziad426@gmail.com (sign up with this email FIRST; there is no email verification yet).
Photos: up to 6 per listing, JPEG only, compressed in browser to max 1280px (<=700KB), stored in uploads/ next to the DB (keep that folder when deploying).
