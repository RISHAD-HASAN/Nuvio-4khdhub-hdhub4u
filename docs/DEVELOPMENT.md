# Development

Use Node.js 22 or later. Install local dependencies and rebuild the standalone providers:

```sh
npm ci --omit=optional --ignore-scripts
npm run build
npm run check
```

## Project layout

- `manifest.json` — repository metadata and provider registration.
- `src/4khdhub.js`, `src/hdhub4u.js`, `src/joya9tv.js` — provider source.
- `src/common.js`, `src/url.js`, `src/catalog-helpers.js` — shared runtime helpers.
- `providers/` — generated files downloaded by Nuvio.
- `tools/` — build and maintenance commands.
- `tests/` — automated regression coverage for maintainers.

Edit source files rather than generated bundles. Run the build and review the resulting changes in `providers/` before submitting a pull request. Keep manifest versions aligned with released code changes; documentation-only changes do not need a provider version bump.

Nuvio supplies its runtime parser and cryptography modules. Installing npm dependencies locally does not change the modules supplied by a user's Nuvio client. Avoid assuming browser APIs, timers or full DOM traversal are available in every runtime.

Preserve individual-release metadata, exact URL query parameters and source labels. Do not infer SDR/HDR or platform identities from resolution, codec or unrelated page-wide tags. Never commit private credentials or account cookies. See [security notes](../SECURITY.md) and [source attribution](../NOTICE.md).
