# Route 66 Quest

A phone-first Route 66 scavenger hunt game.

## What Changed

- Stops now appear as a game-style highway level map.
- Players unlock the next place only after the previous level is approved.
- Every stop has a scavenger hunt.
- Every scavenger clue needs its own uploaded photo.
- Leaderboard and score export are only visible to the leader/admin login.
- Existing player logins are kept.
- Leader login: `admin` / `woodreach`.
- Random photo URLs have been removed. Each stop now uses local Route 66 game art so the page does not depend on broken external images.

## Uploading To GitHub Pages

Upload these files and folders to your Route-66 repository:

- `index.html`
- `styles.css`
- `app.js`
- `stops.js`
- `sheet-worker.gs`
- `.nojekyll`

If GitHub Pages is already using the `main` branch, the site should update after the upload finishes.

## Shared Scores

The game works immediately in local browser storage. That is fine for testing, but shared scores across phones/laptops need a backend.

Options:

1. Google Sheets + Apps Script: easiest free option, spreadsheet view included.
2. Firebase: best for live leaderboard, real logins and photo storage.
3. Supabase: good dashboard, database and storage, more grown-up than Sheets.
4. Airtable: easy table view and approvals, less custom game logic.
5. Netlify/Vercel serverless functions: flexible, but needs more setup.

## Google Sheets Setup

1. Create a Google Sheet.
2. Go to Extensions -> Apps Script.
3. Paste the contents of `sheet-worker.gs`.
4. Deploy as a web app.
5. Set access to anyone with the link.
6. Copy the web app URL.
7. Paste that URL into `CONFIG.sheetEndpoint` in `app.js`.

The script creates a `Submissions` sheet and a Drive folder for evidence photos.

## Testing Login

Use username `test` with any password to preview the full route.

Use `admin` / `woodreach` to view approvals and the private leaderboard.
