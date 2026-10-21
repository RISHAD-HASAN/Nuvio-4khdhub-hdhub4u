# Joya9TV — 2.2.0

## What this adds

A standalone Nuvio provider at `providers/joya9tv.js`, with editable source at `src/joya9tv.js`. It adapts the search-card, download-table and episode layouts from the StreamX/Vega Joya9TV implementation and extends them for the current Joya9Links → MultiCloud public-button route.

The provider is enabled at repository level so Nuvio permits its toggle. It is still experimental: one movie has been extracted live, not a general playback certification. MLSBD and CineDoze were not added.

## Actual live check — October 21, 2026

Title: **Pressure Cooker (2026)**, TMDB **1610181**.

The built provider ran in a Node VM with the restricted Nuvio parser fixture, without native URL, timers or parent/closest traversal. A Python urllib HTTP bridge supplied actual network responses; no search, detail or host responses were mocked in this live check. This is not an in-app Nuvio test, and its network behavior can differ from Nuvio's native fetch bridge.

Observed flow:

1. Live site search returned two catalog cards; title/year matching selected Pressure Cooker.
2. Its detail page returned three individual release rows.
3. Public Joya9Links pages supplied the corresponding MultiCloud links.
4. MultiCloud public download buttons led to signed media endpoints.
5. HEAD responses identified video and supplied filenames. The built provider returned:

| Name | Endpoint host |
|---|---|
| Joya9TV 1080p \| WEB-DL \| H.264 | dr1.multidownload.lol |
| Joya9TV 720p \| WEB-DL \| H.264 | dr1.multidownload.lol |
| Joya9TV 480p \| WEB-DL \| H.264 | dr1.multidownload.lol |

An additional 720p HEAD check returned `video/matroska`, `Accept-Ranges: bytes`, and a video filename. **Video playback, seeking, audio and in-app presentation were not tested.** No full media file was downloaded. Signed URLs are deliberately not published in these notes.

The site initially returned HTTP 403; later catalog/detail checks succeeded with ordinary browser-style request headers. Requests may still be blocked on another network or at another time. No clearance cookies or anti-bot bypasses were imported.

## Labels

- WEBRip and WEB-DL remain distinct, including `WEBRip`, `WEB-Rip` and `WEB Rip` spellings recognized by the shared parser.
- Raw uppercase OTT tags remain raw; no guessed platform names.
- A media response's filename has precedence over the individual release row.
- Unknown HDR/SDR stays omitted. SD/HD quality prefixes are not treated as OTT identities.
- No mixed page-wide range or service metadata is added to a release.

## Supported paths and limits

- WordPress movie/TV cards and result-item searches.
- Individual download-table rows.
- Exact numbered season/episode headings on intermediate pages. Episode packs/ranges are excluded. TV extraction is fixture-tested only, not live-confirmed.
- Current public Joya9Links/MultiCloud links and download buttons; one successful route per release avoids chasing every slow mirror.
- Existing host resolvers are reused for supported HubCloud-family links and selected other hosts. Keeping those resolvers does not certify every host.
- Public FilePress two-step download-button API is implemented and fixture-tested only. Captcha/login requirements are not solved.
- Unknown signed files require video headers or an explicit media filename; arbitrary player HTML is not returned as video.
- The Joya-specific walker limits depth to five and its own request count to 36, with at most 12 release rows and eight outgoing candidates per page. HTTP retries and the reused host resolvers have their own behavior outside that walker counter. The host app's deadline still applies.
- First search page only; conservative title matching can miss alternate or translated titles.

## Logs and local diagnostics

Logs identify `metadata`, `search`, `match`, `detail`, `episode`, `host-head`, `host-page`, `host-resolve`, `filepress`, or `complete`. The adapter does not print signed URL tokens in its own stage logs. Nuvio may not expose console logs on every client.

For a local diagnostic with Node 20+:

```sh
npm ci
npm run diagnose:joya -- 1610181 movie
```

For TV:

```sh
npm run diagnose:joya -- TMDB_ID tv SEASON EPISODE
```

This uses your local Node fetch/network, which can differ from Nuvio. It tests extraction, not playback. Never share API keys, cookies or full signed URLs in public logs.

## Source provenance

Reviewed repository: https://github.com/AeonCoreX-Lab/streamx-addons

Reviewed files: `dist/Joya9tv/{posts,meta,episodes,stream}.js`. Exact reviewed commit and file hashes are in `joya9tv-provenance.json`.

This is a readable Nuvio adaptation, not a verbatim import or a drop-in use of StreamX's manifest. The upstream saved session/clearance cookies were deliberately excluded. See NOTICE.md for licensing cautions.
