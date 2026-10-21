> **Historical:** CineFreak, MovieDekhun and MovieLinkBD were removed in 2.2.1. They are no longer shipped.

> **Superseded for 2.1.3:** CineFreak is now unmodified upstream code, not the readable adapter described below. MovieLinkBD uses the user-provided hostname. See [current update notes](UPDATE-2.1.3.md). Historical test counts and live checks below describe earlier releases.

# Three additional providers: experimental integration

This is a **partial integration**, not a claim that all three sources are working live. The files and manifest entries are present, but **all five entries are now enabled at repository level so users can test them**.

Your existing 4KHDHub and HDHub4u runtime logic was compared with the 2.0.4 package and is unchanged apart from generated version headers.

## Where the code came from

### CineFreak

The requested repository contains `providers/cinefreak.js`, but it is obfuscated. Rather than run and redistribute an unreadable file, this package adds a readable adapter for the search API and movie/episode layouts. It is a reimplementation, not an exact import.

- Requested repository: https://github.com/mobiflix/All-in-One-Nuvio
- Inspected default commit: `5b921212d0dabced9e492aae7edcb83deddb213b`
- Historical manifest author credit: `piratezoro9`
- Readable API/selector reference: https://github.com/phisher98/phisher-nuvio-providers/blob/main/src/providers/cinefreak.js
- Domain registry currently points to `https://cinefreak.ch`; it is read dynamically by the adapter.

### MovieDekhun

No matching provider file was found in the requested default tree or the 60 manifest revisions checked. No reusable Nuvio implementation was found in the public search performed afterward.

This package therefore includes a new adapter based on the public site. `https://moviedekhun.com` linked to `https://moviedekhun.site` during inspection. The adapter searches the WordPress catalog, reads explicit download/watch anchors, and supports the public NeoXcloud button request and standard host resolvers. It doesn't execute advertising scripts, bypass challenges or guess private credentials.

### MovieLinkBD

No matching provider file was found in the requested repository. Public implementations for other runtimes were located; they aren't drop-in Nuvio modules.

Format references:

- https://github.com/Zenda-Cross/vega-providers/tree/main/providers/movielinkdb
- https://github.com/MyselfHumayunShariarHimu/MovieCloud/tree/main/MovieLinkBD

The readable adapter handles the catalog cards, episode attributes, `data-dl` link encoding and common FSL/Google Photos/HubCloud-style buttons. It uses `https://movielinkbd.tv` as its fallback, with registry lookup when an entry is available. That fallback isn't a guarantee that every client or network can reach it.

## What is shared with your existing fixes?

All three builds use the same raw source-tag parser, codec/range labeling, exact-URL duplicate removal, numeric quality ordering and sandbox-safe URL/request helpers. They omit unspecified source and range labels. Host resolution reuses the existing HDHub4u code inside a private closure; no runtime import of another local provider file is needed.

The source remains under `src/catalog-adapters.js` and `src/additional-providers.json`. `npm run build` creates all five standalone files.

## Actual validation

- **128 offline tests pass.** They include full mocked movie and TV flows for each new adapter, with no browser URL, timers or `closest()` support.
- CineFreak's registry domain returned HTTP 403 in the live environment. Its old `.nl` domain did not resolve there.
- MovieLinkBD's tested `.tv` and `.one` pages returned HTTP 403; the tested `.net` domain did not resolve.
- MovieDekhun's catalog and download page were reachable. The tested Jailer 2 host chain returned **zero playable links**. Its end-to-end resolution is not validated.
- No new provider has been tested inside the user's Nuvio installation or verified for playback.

The tests prove selected parsing/resolution behavior on controlled fixtures—not that these external hosts work. Unsupported encrypted players, CAPTCHA, login walls, host changes and expiring URLs may still produce no results. The adapters do not return an intermediate HTML page as a fake video URL when that happens.

## Updating and testing

Copy the package contents into your existing repository, keeping its `.git` folder, then run:

```powershell
git add .
git commit -m "Add experimental CineFreak, MovieDekhun and MovieLinkBD adapters"
git push
```

Refresh the same manifest URL in Nuvio. The three entries will be listed but off. Enable **one at a time** if you want to test from your network; keep the two existing providers on.

A failed test needs the provider name, exact title, movie year or season/episode, and a log or screenshot. Don't share private cookies, tokens or signed playback URLs. A working public title/download example helps distinguish a site-layout problem from a blocked host.

The ZIP excludes GitHub Actions workflows to avoid the earlier token-permission error. See `NOTICE.md` before public redistribution.

## 2.1.2 CineFreak follow-up

CineFreak now pins `https://cinefreak.net` instead of accepting the stale `.ch` registry entry. Its live search returned Pressure Cooker (2026). Current source-row download containers are parsed without the hidden decoy sibling. The tested CineCloud downstream URL returned HTTP 403 in this environment; successful end-to-end extraction and playback remain unverified. The user reports MovieLinkBD returning results in Nuvio, but playback was not established.
