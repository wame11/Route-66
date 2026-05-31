# Route 66 Family Challenge

Interactive static website for the America 2026 Barstow-to-Vegas family activity challenge.

## Included

- Login for Jacob, Lily, Hannah and Ethan.
- `test` login opens everything with no password and no locks.
- Date-locked route sections for the August 2026 itinerary.
- Sequential unlocks: complete one stop before the next opens.
- Wrong quiz answer in normal mode resets progress from the beginning.
- Browser-only photo proof inputs. Files are not uploaded anywhere.
- Scavenger hunts, true/false questions, mini challenges, sketch boxes and a Grand Canyon dot-to-dot.
- Final Amazon-style reward screen after all stops are completed.

## Publish on GitHub Pages

1. Open **Settings** in this repository.
2. Go to **Pages**.
3. Select **Deploy from a branch**.
4. Choose branch **main** and folder **/root**.
5. Save.

The site is fully static and needs no server.

## Files

- `index.html` — page structure
- `styles.css` — design, animations and print layout
- `app.js` — login, locks, progress, quizzes and activities
- `.nojekyll` — keeps GitHub Pages simple

## Security note

This is a family game login, not real security. Passwords are checked in the browser. Do not reuse these passwords for anything important.
