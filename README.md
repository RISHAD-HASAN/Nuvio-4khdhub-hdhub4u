# Nuvio Dual Providers

A small Nuvio plugin repository for **4KHDHub** and **HDHub4u**. It keeps the different releases easy to tell apart without filling the stream list with missing information.

This is a community fork, not an official Nuvio release.

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
3. Enable **4KHDHub** and **HDHub4u** from this repository.
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

**112 automated tests passed** for this build. They cover release tags, movies and episodes, missing labels, sorting, duplicates, request handling and a mocked extraction flow.

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
