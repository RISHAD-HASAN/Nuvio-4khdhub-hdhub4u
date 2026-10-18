# Raw web-source tags

Version 2.0.4 keeps abbreviations exactly as they appear in release metadata:

```text
2160p | MA WEB-DL | SDR | H.265
2160p | CRAVE WEB-DL | Dolby Vision / HDR | H.265
2160p | GB WEB-DL | SDR | H.265
1080p | APT WEB-DL | H.265
1080p | AN WEB-DL | H.264
1080p | NF WEB-DL | H.265
1080p | AMZN WEB-DL | H.265
```

These are format examples, not verified platform identities. Tags aren't expanded into guessed full names. The parser isn't restricted to a service allowlist: unfamiliar uppercase tags in the same technical positions are preserved too. Both providers use the same rules.

The parser looks around resolution and WEB-DL/WEBRip tokens, excludes common codec/audio/language/size markers and skips conventional release-group suffixes. Filenames take precedence, with local release headings as fallback. Arbitrary uppercase movie titles and nonstandard filenames can still be ambiguous; this is not a guarantee that every word in every filename can be correctly classified.

Missing source tags stay omitted. BluRay and explicit BluRay REMUX handling is unchanged. All 112 automated tests pass, including raw-tag checks for MA, CRAVE, GB, APT, AN and previously unlisted examples.

## Install

Copy the extracted project contents over your existing repository and run:

```powershell
git add .
git commit -m "Preserve raw web-source tags"
git push
```

Refresh the repository in Nuvio; both providers should show version **2.0.4**. The manifest URL is unchanged. Workflow files are left out of the ZIP to avoid the earlier token-permission error.
