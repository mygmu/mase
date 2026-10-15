# MASE — GitHub front end + Apps Script backend

This folder is the **front end** (static pages hosted on GitHub Pages). It talks to your Apps Script **backend** (the `AppsScript/` project) for all data, email, and Sheet writes. GitHub serves the pages, so your institution's policy on serving Apps Script pages no longer applies to the UI.

```
  Browser (GitHub Pages)  ──fetch JSON──▶  Apps Script Web App (doPost)  ──▶  Google Sheets
   admin / judge / dashboard                 (Execute as Me, Anyone)           + Gmail (codes)
```

## Files
| File | Purpose |
|---|---|
| `index.html` | Landing page with links to the three apps |
| `judge.html` | Judge app (access-code login) |
| `dashboard.html` | Live results dashboard (password) |
| `admin.html` | Admin console V2 (password) |
| `styles.css` | Shared styling |
| `config.js` | **You edit this** — the one line with your backend URL |

## Step 1 — Deploy the backend (one time)
1. In the Apps Script project (the `AppsScript/` files), make sure `Code.gs` includes the `doPost` function (it does in this build).
2. Run **MASE Platform → Set up database** and **Set admin password** (and a dashboard password if you want one) from the Sheet menu, as before.
3. **Deploy → New deployment → Web app**: **Execute as: Me**, **Who has access: Anyone**.
4. Copy the **`/exec` URL**.

## Step 2 — Point the front end at the backend
Open **`config.js`** and replace the placeholder with your `/exec` URL:
```js
window.API_URL = "https://script.google.com/macros/s/XXXXXXXX/exec";
```

## Step 3 — Publish on GitHub Pages
1. Create a public GitHub repo (e.g. `mase`).
2. Upload **all files in this `github/` folder** (index, judge, dashboard, admin, styles.css, config.js).
3. Repo **Settings → Pages → Deploy from branch → `main` / root → Save**.
4. After a minute your apps are live:
   - Landing: `https://<user>.github.io/mase/`
   - Judge: `.../judge.html` · Dashboard: `.../dashboard.html` · Admin: `.../admin.html`

## Step 4 — Set the judge link
In **Admin → Settings → Judge app URL**, paste your `.../judge.html` URL. It's included in the access-code emails judges receive.

## How it stays wired
- Every button calls the backend over `fetch` using a "simple" request (`text/plain`), so there is no CORS preflight to be blocked.
- The admin/dashboard passwords and judge codes are validated on the server on **every** call; nothing sensitive is trusted from the browser.
- Emails (access codes) are sent by Apps Script (`MailApp`) when the admin adds a judge or clicks **Send code** — triggered through this same API.

## Troubleshooting
| Symptom | Fix |
|---|---|
| "API URL is not set in config.js" | You didn't paste the `/exec` URL into `config.js`. |
| Buttons do nothing / network error | Backend deployment must be **Anyone**; use the `/exec` URL (not `/dev`). |
| Changed the backend code | Deploy a **new version** (Manage deployments → Edit → New version). |
| Judge email not received | Check the email in the Judges sheet, Gmail quota, and spam. |

> The `AppsScript/` project still also serves the built-in Google-Sites version through `doGet`. You can use either front end against the same backend and Sheet — they stay in sync because they share one database.
