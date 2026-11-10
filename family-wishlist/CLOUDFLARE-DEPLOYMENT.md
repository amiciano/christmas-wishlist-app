# Cloudflare deployment

Production URL: https://miciano.net

- Worker: `miciano-wishlist`
- D1 database: `miciano-wishlist`
- Production configuration: `wrangler.production.json`
- Initial deployment version: `9c994430-2a3b-4b8e-aa17-87d91b8e196c`

Production uses the family's existing accounts, password hashes, wishes, and purchase markers copied at initial launch. Browser sessions were not copied; sign in on miciano.net. Local previews use a separate database and do not synchronize with production. Use the live site for all family updates from now on.

The login page is public. All family-data APIs enforce application authentication and authorization. Cloudflare handles HTTPS for the custom domain. There is no Sites/ChatGPT sign-in gate on this direct deployment.

## Updating the app

Build using the existing project build script, then from the parent folder run:

```powershell
.\Cloudflare.cmd deploy --config wrangler.production.json
```

This uploads the built Worker and assets without replacing family records. When new schema migrations exist, apply them before deployment:

```powershell
.\Cloudflare.cmd d1 migrations apply miciano-wishlist --remote --config wrangler.production.json
```

Do not rerun the initial family-data import: it was a one-time copy. Do not replace the production database ID with the placeholder in the generated local-preview configuration. Production uses the tracked `wrangler.production.json`; `.openai/hosting.json` and the unused Sites registration are separate from this Cloudflare deployment.
