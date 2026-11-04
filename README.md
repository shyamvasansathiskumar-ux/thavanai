# Thavanai (தவணை)

**A personal data retention register for college clubs.**
Record what you collect. Delete it on time. Keep the proof.

*Thavanai* means "due date" in Tamil.

This repository is the project website and the **live demo**: the Thavanai desktop app (Java 17, Swing, JDBC, MySQL 8)
rebuilt to run entirely in the browser, so it can be tried without installing anything.

- `index.html`: the project site (problem, law, design, database, OOP, security, tests, team)
- `app.html`: the live demo. Every screen: splash, first-run setup, login with lockout, home, clubs/events/coordinators,
  add/update/view collections, mark as deleted, deletion proof, overdue report, change password, and an admin database console
- `tests.html`: runs the same 61 loophole checks as `SelfTest.java`, live

## How the demo works
- **Database:** the same 7 tables, 5 CHECK constraints, foreign keys and 4 triggers as `sql/schema.sql`. They run on SQLite
  (sql.js), inside the page. The database is kept only in your browser (IndexedDB). "Reset the demo" wipes it.
- **Passwords:** PBKDF2-HMAC-SHA256 with 600,000 iterations and a 16-byte salt (Web Crypto), and a constant-time compare.
  Wrong usernames take as long as wrong passwords. After 5 wrong attempts, login locks for 30 seconds.
- **Queries:** every query is a prepared statement with bound values.
- **Roles:** coordinators see and change only their own club. This is checked in the data layer on every read and write.
- **No personal data:** text that looks like a phone number, email, register number or ID number is refused.
- **Plain text only:** every free-text field refuses HTML or script tags, `javascript:` links, event handlers and encoded markup, and drops invisible characters that can disguise text. Nothing is stripped silently; the user is told what was refused. SQL needs no stripping because every query binds its values.
- **Page security:**
  - A strict Content Security Policy: no inline or third-party scripts, and no network calls.
  - Subresource Integrity on every script and stylesheet.
  - The database engine's WebAssembly is hash-checked before it loads.
  - Frame protection, and `no-referrer`.

Demo logins (demo data only, published with the project): `admin / Admin@2026`, `coding_lead / Coding@2026`,
`robotics_lead / Robot@2026`, `arts_lead / Arts@2026`, `nss_lead / NssUnit@2026`.

## Run locally
Any static server works, for example `python3 -m http.server` in this folder, then open http://localhost:8000.
Opening the files directly (`file://`) will not work, because the browser blocks loading the database engine that way.

## Build
`assets/js/scene3d.js` (the 3D objects) is built from `src/scene3d.js` with `tools/build-scene.sh` (three.js 0.187 and esbuild). Everything else is plain files.

## Team
Shyam Sathiskumar · Krithika Sree V R · Skandesh Saran S G
Computer Science and Engineering, Rajalakshmi Engineering College. OOP (Java) + DBMS integrated project, November 2026.

Third-party licences are in [`licenses/`](licenses/). Thavanai is a record-keeping aid and does not certify legal compliance.
