# Nuvio Custom Providers — 2.2.2

A cleaned-up Nuvio repository containing only:

| Provider | Repo-enabled | Current evidence |
|---|---|---|
| 4KHDHub | Yes | Existing custom runtime retained |
| HDHub4u | Yes | Existing custom runtime retained |
| Joya9TV | Yes | Pressure Cooker (2026): 1080p, 720p and 480p live extraction; playback untested |

**Removed:** CineFreak, MovieDekhun and MovieLinkBD. Their standalone files, upstream copy, build entries and provider-specific configuration/tests are removed, not merely switched off. Generic helpers needed by Joya9TV remain.

## 2.2.2: higher-quality Joya9TV scheduling

Joya9TV now starts higher-resolution releases first, resolves up to two releases concurrently, and gives each an independent walker allowance. Known catalog/intermediate HTML pages skip redundant HEAD calls. A fresh live check still returned all three Pressure Cooker resolutions; why the user's client returned only 480p has not been established. This addresses possible latency/budget starvation, not a confirmed client-side diagnosis.

## Updating an existing checkout

Copy this archive's project contents into your local repository, keeping `.git`, then run:

```sh
node tools/remove-retired.cjs
git add .
git commit -m "Remove unreliable providers and keep the three-provider package"
git pull --rebase origin main
git push origin main
```

Stop and resolve conflicts before pushing if the pull reports any. The cleanup command is important: extracting a ZIP over an old checkout does not delete retired files automatically. It removes only the known retired project paths, not `.git` or user settings. Refresh the repository in Nuvio afterward; if removed cards remain, remove/re-add this repository to clear stale entries.

## CB Providers review

CB's current manifest is version 2.5.0, with **29 entries referencing 28 files**, not the 33 advertised in the release post. All 28 files passed syntax checks; their runtime/playback behavior was not verified. Its maintainer removed CineFreak on October 15, citing Cloudflare Turnstile. No CB provider was merged into this project. Read [the full review and optional install URL](docs/CB-PROVIDERS-REVIEW.md).

Joya9TV's live extraction returned three signed video endpoints in a restricted-parser VM with an HTTP bridge. This is not an in-app or playback guarantee. Read [Joya9TV testing and limits](docs/JOYA9TV.md).

This is a community adaptation, not an official Nuvio release. Earlier release notes are historical and may describe providers no longer shipped.

## What changes in the stream list?

You’ll see the resolution, colour-range label and codec when the release provides them:

```text
4KHDHub - FSL 2160p | BluRay REMUX | Dolby Vision / HDR | H.265
4KHDHub - FSL 2160p | BluRay | Dolby Vision / HDR | H.265
4KHDHub - FSL 2160p | NF WEB-DL | SDR | H.265
4KHDHub - FSL 1080p | AMZN WEB-DL | H.265
4KHDHub - FSL 1080p | WEB-DL | AV1
```

**No tag? No extra label.** An untagged release won’t say “Range unknown”, and it won’t be called SDR just because HDR wasn’t mentioned. 4K, HEVC and 10-bit don’t automatically mean HDR either.

BluRay releases only say **REMUX** when explicitly tagged. Web releases keep their source abbreviations as written: `MA`, `CRAVE`, `GB`, `APT`, `AN`, `NF`, `AMZN`, and unfamiliar tags in the same release positions. No full service names are guessed. The parser reads uppercase tags around the resolution and WEB-DL/WEBRip metadata, ignoring common codec, audio and size tokens. Missing tags stay omitted. Filenames take precedence over short release headings when they differ. Because filenames aren't standardized, an arbitrary word outside that technical metadata can't always be identified as a service tag.

Each episode gets its tags from its own release heading or filename—not from the page’s general tags. That matters when the same page offers both SDR and HDR versions.

HDHub4u uses the same approach. Its resolution stays in Nuvio’s normal quality field. Source, audio, language and size details are included where available; how much you see depends on your Nuvio client.

## Install

You’ll need to host this repository on GitHub first. See [Publishing to GitHub](docs/PUBLISHING.md) if you haven’t done that yet.

1. Open your repository’s `manifest.json` on GitHub and copy its **Raw** URL.
2. Add that URL in Nuvio under **Settings → Local Scrapers / Plugins**. The exact wording varies by client.
3. Enable **4KHDHub** and **HDHub4u** from this repository. Enable **Joya9TV** to test the new source. All three entries permit user toggles at repository level.
4. Disable the same two providers from your old repository so you don’t get duplicate results.
5. Refresh the providers and reopen the stream list. Restart Nuvio if it still shows the old labels.

Your manifest URL will look like this—replace the example names with your own:

```text
https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPOSITORY/main/manifest.json
```

No extra server, proxy or paid service is added by this package.

## What’s included

- Separate SDR, HDR, Dolby Vision and codec choices. Releases aren’t reduced to one result per resolution.
- Duplicate removal that keeps signed URL parameters and different playback headers intact.
- Quality sorting, request limits, timeouts and limited retries.
- A fallback site search for HDHub4u when its usual search fails.
- Fixes for redirect loops, relative links, nested filenames, subtitle forwarding and HTTPS handling.
- Editable source, ready-to-load provider files, tests and a GitHub Actions workflow.

The providers still use the host extractors from the original project. Keeping an extractor doesn’t mean every host has been checked live.

## Testing and known limits

On October 21, 2026, Joya9TV live extraction returned three Pressure Cooker (2026) entries. Media HEAD responses identified video and filenames. Playback and Nuvio rendering remain untested; see [the detailed report](docs/JOYA9TV.md).

**144 automated tests passed** for this build. They cover release tags, movies and episodes, missing labels, sorting, duplicates, request handling and a mocked extraction flow.

A live extraction check on October 18, 2026 returned 15 entries from 4KHDHub and 6 from HDHub4u for East of Eden S1 E2. It used a lightweight parser adapter with no browser URL constructor or timers. **Playback and rendering inside Nuvio haven’t been tested.** Sites can change, block requests or return expired links. See [the compatibility fix](docs/FIX-2.0.2.md).

The labels describe what the source says; they aren’t the result of inspecting the video itself. When timers are available, the timeout applies to each request, not the whole search. Without timers, requests rely on the app’s native deadline. Without `AbortController`, a timed-out fetch may continue in the background.

The legacy development parser has known dependency advisories. See [Security notes](SECURITY.md). Before making a public derivative, also read the [source and licensing notice](NOTICE.md): the original repository didn’t declare a license when checked.

## Working on the providers

Use Node.js 22 or later:

```sh
npm ci --omit=optional --ignore-scripts
npm run build
npm run check
npm test
```

Edit `src/`, then run the build. Nuvio loads the generated files in `providers/`, so commit those alongside your source changes. No local helper imports are needed at runtime; the build puts the shared code into each provider.

The app needs the same `cheerio-without-node-native` and `crypto-js` modules used by the original providers. The npm dependencies here are for local development and aren’t bundled into the plugin.

For an optional page-only check:

```sh
npm run smoke
```

This checks public pages and metadata, not video playback. Its output goes into `.reports/`, which is ignored by Git.

## Credits and review

Based on [NuvioPlugin/All-in-One-Nuvio](https://github.com/NuvioPlugin/All-in-One-Nuvio), with the upstream provider credits retained. Domain updates use [phisher98’s registry](https://github.com/phisher98/TVVVV/blob/main/domains.json).

The fork review covered 82 public forks returned by GitHub and nine related repositories. It wasn’t a review of every branch or every similar project online. [Review notes](docs/REVIEW.md) explain what was kept, what was left out and why.
