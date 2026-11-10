# Family wish lists

One family, separate username/password accounts, shared wish lists. The administrator adds and edits names, usernames, and assigned passwords under **Family**. Passwords have no length, complexity, or change-on-login requirements. Existing accounts also skip the former password-change step. When editing a person, select **Set password** to replace their password; leave it unchecked to preserve it.

Account rules and permissions are implemented in `app/api/[[...path]]/route.ts`. The account forms and dashboard text are in `app/page.tsx`. Fonts and layout are in `app/globals.css`; font files and licenses are under `public/fonts/`. The greeting uses the first word of the assigned name. The database's legacy `must_change` field is retained for compatibility but never enforces a prompt or access restriction.

## Gift privacy

- The server excludes all purchase fields when returning your own list, including when you are the administrator.
- Other family members see **Bought**, without the buyer's name or account ID. Only the buyer gets an **Undo** action.
- The database allows one purchase per wish. Concurrent attempts cannot both succeed.
- Members can create, edit, and remove only their own wishes. Removing an item also removes its purchase record. Changes to a wish are visible to everyone.
- Lists refresh every 15 seconds while visible and when returning to the window.

Passwords use salted PBKDF2-SHA256 hashes. Session tokens are random, hashed at rest, and stored in HttpOnly, SameSite=Strict cookies (Secure on HTTPS). Sessions last seven days. Password changes invalidate other sessions. Login attempts are rate limited. Mutations require a matching Origin header.

The account administrator and hosting/database owner are trusted roles; anyone with direct database access can inspect stored records. The app never grants the administrator an exception to recipient privacy.

## Local development

On this computer, run the parent folder's `Start-App.ps1` in PowerShell, then open the Local URL it prints. The prepared local administrator is `adrmic`; use the temporary password delivered in the chat. The local database has been cleared of QA accounts and sample items. Keep the terminal running while using the app, and press Ctrl+C to stop it. This local URL is accessible only on this computer.

Requires Node 22.13 or newer and npm. Install dependencies with `npm ci`. Set `SETUP_KEY` in an ignored `.dev.vars` file. Generate the build with `npm run build`, then apply the migration:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_futuristic_prowler.sql
npm run dev
```

Open `/setup` once to create the first administrator with the setup code. Setup refuses to create further administrators after the first member exists. Normal login is `/`; it contains only username, password, and Log in.

`node tests/accounts.mjs` runs the real API in an isolated Worker with a temporary database. It checks account assignments, unrestricted passwords, legacy accounts, session invalidation, authorization, and gift privacy without touching the family's records. `node node_modules/typescript/bin/tsc --noEmit` checks types. The older `tests/integration.mjs` is for a disposable local preview with `SETUP_KEY=local-test-setup-only`; it creates QA accounts and sample wishes.

## Hosting

Built with React/Vinext and a Cloudflare D1 database. `.openai/hosting.json` identifies the Sites project and DB binding. Production records persist across devices and deployments. The Sites publication pipeline applies tracked Drizzle migrations.

Sites adds a separate outer access gate while the site is owner-private. To let relatives reach the application's username/password screen without a ChatGPT account, the hosting audience must allow public access. The app's own authentication continues to protect every wish-list endpoint. Do not deploy QA accounts or local database files.

Configure `SETUP_KEY` as a secret runtime variable before initial setup. No runtime secret belongs in source or the hosting manifest. After setup the endpoint is disabled by the presence of the first account.
