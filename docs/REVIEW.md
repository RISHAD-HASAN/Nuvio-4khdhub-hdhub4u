# What was reviewed

Review date: **October 18, 2026**.

The starting point was [NuvioPlugin/All-in-One-Nuvio](https://github.com/NuvioPlugin/All-in-One-Nuvio), commit `3f09a6ff4360498895e622877af7a32212f75038`.

## Fork coverage

GitHub reported 83 forks, but its public forks endpoint returned 82. Each returned fork’s default branch was checked for the two provider files: 164 file requests in total.

- **4KHDHub:** 78 accessible files, containing 10 different versions.
- **HDHub4u:** 76 accessible files, containing 9 different versions.
- Of the 19 versions, **10 were obfuscated or single-line variants**. They were fingerprinted but weren’t reverse-engineered, executed or reused.
- The other nine versions were compared with the baseline for changes to parsing, metadata, search and host handling.

[The fork inventory](fork-inventory.csv) keeps the repository names, retrieval URLs, statuses and content hashes. Large API responses and duplicate JSON records have been left out of this cleaned-up package.

This was a default-branch review of the public forks GitHub returned. It doesn’t cover private or unlisted repositories, every historical revision, alternate branches or renamed provider paths.

## Related projects

| Project | What was useful—or why it wasn’t used |
|---|---|
| [yoruix/nuvio-providers](https://github.com/yoruix/nuvio-providers) | A local-provider reference. The matching files on `main` were checked separately because the default branch was `template`. |
| [SA7ANI/cb-providers](https://github.com/SA7ANI/cb-providers) | Richer metadata displays were worth considering. Default languages, unproven audio channels and fallback 1080p labels weren’t carried over. |
| [Trixjustbetter/nuvio-4khub](https://github.com/Trixjustbetter/nuvio-4khub) | Quality ranking and metadata handling were useful references. Keeping only one release per resolution wasn’t suitable for separate SDR/HDR choices. |
| [tapframe/NuvioStreamsAddon](https://github.com/tapframe/NuvioStreamsAddon) | Timeout and cache ideas were reviewed. Its server-side dependencies and TLS-verification bypass weren’t appropriate for this local plugin. |
| [rayleighd3-crypto/lovepeacekarma](https://github.com/rayleighd3-crypto/lovepeacekarma) | A server-side extraction reference. Its Axios, filesystem and cache setup wasn’t imported. |
| [phisher98/phisher-nuvio-providers](https://github.com/phisher98/phisher-nuvio-providers) | No matching provider paths were found in the default tree. The separate domain registry already used by the baseline was retained. |
| [michat88/nuvio-providers](https://github.com/michat88/nuvio-providers) | Local parsing and host routing were reviewed. The package keeps the baseline extractors and makes targeted fixes rather than replacing everything. |
| [SaugatXthaa/PhoeniX](https://github.com/SaugatXthaa/PhoeniX) | The repository tree was unavailable during the review, so its implementation couldn’t be assessed. |
| [sakinator/hostreamio](https://github.com/sakinator/hostreamio) | The HDHub4u Dart scraper offered a site-search reference, but wasn’t code that could be dropped into Nuvio’s JavaScript runtime. |

These were design references, not files blindly merged into the project. Other projects may carry different licensing obligations; see [NOTICE.md](../NOTICE.md).

## What made it into this build

The changes focus on clear release labels, optional audio/language details, exact-URL duplicate removal, quality sorting, request limits and better failure handling. The baseline’s host extractors and domain registry remain in place.

The build deliberately avoids guessed SDR labels, one-result-per-resolution pruning, fabricated metadata, TLS-verification bypasses, unrelated-provider fallbacks, guessed search keys and long-lived caches of signed video URLs.

## What was actually checked

The code has **64 passing automated tests**. They cover metadata precedence, the seven East of Eden release groups, omitted missing labels, duplicate handling, signed URLs, request limits, stalled bodies, retries, redirect loops, fallback search, domain caching and movie/episode formatting.

The live checks were read-only:

- The domain registry returned HTTP 200.
- The East of Eden page returned HTTP 200 and exposed seven release groups. The display examples matched H.264, H.265, AV1, SDR, Dolby Vision/HDR and the explicitly marked HQ release.
- The HDHub4u homepage returned HTTP 200.

These checks didn’t play videos or run inside Nuvio. They don’t prove that every host extractor works, that a file’s tags are correct or that the app will render every field. You can rerun the automated tests with `npm test` and the page checks with `npm run smoke`.
