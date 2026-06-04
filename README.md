# Route 66 Family Challenge

Static GitHub Pages site for the America 2026 Route 66 family activity challenge.

## What is included

- Existing player logins for Jacob, Lily, Hannah and Ethan.
- `test` login opens every stop for preview mode.
- Admin login: username `admin`, password `woodreach`.
- Phone, iPad and laptop friendly layout.
- Route stop images now use filter-friendly remote image URLs with a visible fallback if an image link fails.
- Proof photo upload with an on-page preview.
- 100 points per approved stop, plus optional admin bonus points from 0 to 25.
- Leaderboard table and CSV export.
- Admin approval queue. A player can move to the next stop only after approval.
- Optional Google Sheets / Apps Script backend in `sheet-worker.gs`.
- Local fallback mode when no Google Sheet endpoint is configured.

## Google Sheet setup

The site works immediately in local fallback mode, but different devices will only share scores after you connect a Google Sheet.

1. Create a Google Sheet.
2. Open **Extensions > Apps Script**.
3. Paste the contents of `sheet-worker.gs`.
4. Deploy it as a **Web app**.
5. Set access to **Anyone with the link**.
6. Copy the Web App URL.
7. In `app.js`, paste it into:

```js
const CONFIG={
  sheetEndpoint:'YOUR_WEB_APP_URL_HERE',
  sheetUrl:'YOUR_GOOGLE_SHEET_URL_HERE'
};
```

The Apps Script creates a `Submissions` sheet and a Drive folder called `Route 66 Proof Photos`.

## Publish on GitHub Pages

1. Open **Settings** in this repository.
2. Go to **Pages**.
3. Select **Deploy from a branch**.
4. Choose branch **main** and folder **/root**.
5. Save.

## Files

- `index.html` - page structure.
- `styles.css` - responsive design.
- `stops.js` - itinerary stop data.
- `app.js` - login, route progress, points, leaderboard and approvals.
- `sheet-worker.gs` - optional Google Sheets backend.
- `.nojekyll` - keeps GitHub Pages simple.

## Security note

This is a family game login, not real account security. Password checks happen in the browser, and the admin key is only suitable for this private family challenge.
