# CB Providers review — October 21, 2026

User's release post: https://www.reddit.com/r/NuvioPlugins/comments/1x1pmkk/release_cb_providers_for_nuvio_33_highperformance/

Reddit returned HTTP 403 here. Search indexing identified the linked project as https://github.com/SA7ANI/cb-providers; its actual manifest, README, Git history and provider files were inspected directly.

## Current state checked

- Branch: `main`.
- Commit: `38fc741e9a8818bb9dd144cb08404cf5e7106528`.
- Latest commit timestamp: October 17, 2026, 21:17:59 UTC.
- Latest commit message: `fix(moviesdrive): update to new3 domain, filter live hubcloud links, parallelize extractor, and fix timeout`.
- Manifest name: `CB Provider Repo`; version `2.5.0`.
- **29 enabled manifest entries, referencing 28 unique JavaScript files.** `einthustan` and `einthusan` both reference `providers/einthusan.js`.
- The fetched README describes 28 providers. The linked post advertises 33. Current manifest contents, not the promotional count, are the basis of this review.
- All 28 referenced files were fetched from the pinned commit and passed `node --check`.
- No CineFreak, MovieDekhun, MovieLinkBD, Joya9TV, MLSBD or CineDoze entry is present in the current manifest/tree.

## CineFreak removal is explicitly documented

Commit `9ee5cf8f894d92dafe964e1d99518168a0d60072`, October 15, 2026, 13:13:07 UTC:

> fix(providers): optimize vegamovies response time to 2s, enrich cholecard, and remove dead cinefreak (cloudflare turnstile)

https://github.com/SA7ANI/cb-providers/commit/9ee5cf8f894d92dafe964e1d99518168a0d60072

This is the maintainer's explanation, not independent proof of every user's current network behavior. Older indexed announcements still mentioning CineFreak do not describe the current manifest.

## Installation, if testing CB separately

Nuvio Plugins repository URL:

```text
https://raw.githubusercontent.com/SA7ANI/cb-providers/main/manifest.json
```

This is a real Nuvio scraper manifest, not a StreamX registry. Consider testing providers individually rather than enabling everything at once. CB also offers 4KHDHub and HDHub4u; disable CB's copies if retaining this project's customized versions to avoid duplicate requests/results.

MovieBox, MoviesDrive, VegaMovies and other providers are present, but their availability for a specific Bengali title has not been verified here. A successful manifest fetch and syntax check do not establish runtime compatibility, stream validity or playback.

## Why it was not merged into this project

The user requested removal of unreliable additions and inspection of CB, not wholesale replacement of the custom providers. The custom raw OTT tags, per-release range/source handling and existing sandbox fixes should not be overwritten without evaluating differences.

Static observations also warrant testing on the actual client: the inspected CB HDHub4u file contains native `new URL` calls, and CB 4KHDHub contains a timer call. Those are not proof of failure, but the user's historical runtime has lacked some such globals. No claim of universal Hermes or native-client compatibility is made.

**No CB provider code was imported or executed for extraction/playback in this review.** Syntax checks parse the code only. The project's live-tested Joya9TV path remains independent.
