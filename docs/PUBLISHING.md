# Publishing a fork

Read [NOTICE.md](../NOTICE.md) before redistributing inherited provider code. Public source availability and attribution do not automatically grant redistribution rights.

1. Preserve the project layout, with `manifest.json` at the repository root.
2. Update the installation URL in `README.md` to your GitHub owner and repository.
3. If modifying runtime code, edit `src/` and run `npm run build` before publishing.
4. Commit the generated `providers/` files alongside the source changes.
5. Use the raw manifest URL to install your fork in a plugin-capable Nuvio client.

```text
https://raw.githubusercontent.com/OWNER/REPOSITORY/main/manifest.json
```

Never commit private credentials. Values embedded in public provider files are visible to everyone.
