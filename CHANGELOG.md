# 2.2.2

- Prioritize higher-resolution Joya9TV releases, use two release workers and isolate per-release request budgets.
- Skip redundant HEAD calls on known HTML intermediate routes.
- Rechecked Pressure Cooker: 1080p, 720p and 480p extracted; native-client discrepancy remains unconfirmed.
- 144 offline tests pass. Existing 4KHDHub and HDHub4u runtime bodies unchanged.

# 2.2.1

- Remove CineFreak, MovieDekhun and MovieLinkBD from the manifest, provider files, build configuration and upstream source copy.
- Keep 4KHDHub, HDHub4u and Joya9TV; extract Joya's required generic catalog helpers into a smaller module.
- Add an explicit retired-file cleanup command for users updating an existing checkout.
- Inspect CB Providers at commit 38fc741e9a8818bb9dd144cb08404cf5e7106528; document 29 entries/28 files, syntax checks and the maintainer's CineFreak removal. No CB providers imported.
- 141 tests pass; fewer tests reflect retired provider-specific coverage, not newly failing tests.

# 2.2.0

- Add a standalone Joya9TV Nuvio adaptation using reviewed StreamX/Vega layouts and current public Joya9Links/MultiCloud buttons.
- Live extraction returned Pressure Cooker (2026) at 1080p, 720p and 480p, with video HEAD responses. No playback or native-app testing claim.
- Add stage logs, request/depth bounds, exact episode selection, WEBRip fixtures, filename/header handling and a local diagnostic command.
- Preserve the existing five runtimes apart from version comments; CineFreak remains byte-for-byte upstream.
- All six manifest entries enabled. 147 offline tests pass.

# 2.1.3

- Replace CineFreak with byte-for-byte upstream code from NuvioPlugin/All-in-One-Nuvio.
- Restore baseline shared adapter and pin MovieLinkBD to the user-provided hostname.
- No end-to-end playback confirmation; see docs/UPDATE-2.1.3.md.

# 2.1.2

- Fix CineFreak current domain and source-row download-button selection.
- Enable all five manifest entries so Nuvio no longer blocks user toggles.
- Add domain and hidden-decoy regression tests. CineCloud downstream remains unverified.

# Changelog

## 2.1.0

- Added separate CineFreak, MovieDekhun and MovieLinkBD adapter files and manifest entries.
- Kept the three new entries off by default because live extraction could not be validated.
- Reused the existing host-resolution code in self-contained builds without changing the original two providers’ runtime logic.
- Applied raw source tags, HDR/SDR, codec, REMUX, deduplication and sandbox safeguards to the added adapters.
- Added source-provenance and live-check limitations; 126 offline tests pass.

## 2.0.4

- Kept web-source tags raw instead of expanding them into service names.
- Added open-ended uppercase release-tag parsing for MA, CRAVE, GB, APT, AN and unfamiliar tags in technical metadata.
- Filtered common language, codec, audio, size and release-group tokens.
- Added raw-tag regression tests; 112 tests pass.

## 2.0.3

- Added WEB-DL, WEBRip, BluRay and explicit BluRay REMUX labels to stream names.
- Expanded recognized web-release service tags, including Netflix, Prime Video, Disney+ and Apple TV+.
- Kept unspecified services and unrecognized abbreviations out of the labels.
- Used filename metadata first, with the local release heading as fallback.
- Applied the same source-label rules to both providers.
- Checked the live Obsession movie-page labels and added regression tests; 100 tests pass.

## 2.0.2

- Removed reliance on Cheerio `closest()`, which Nuvio’s lightweight parser doesn’t provide.
- Passed each release’s heading down to its episode links instead of looking up parents.
- Made timers optional and handled buffered response bodies and plain header objects.
- Added a small HTTP URL helper for runtimes with missing or partial URL support.
- Read HDHub4u’s current search endpoint from its public search-page config.
- Compared clean titles instead of rejecting matches because of long release descriptions.
- Stopped treating resolution numbers as release years.
- Limited episode extraction to the requested episode and fixed native-wrapper separator handling.
- Added restricted-runtime regression tests; 77 tests now pass.

## 2.0.1

- Shortened the documentation and made setup instructions easier to follow.
- Added a GitHub publishing guide and separate security notes.
- Cleaned up comments and shared helper names without changing provider behaviour.
- Kept a compact fork-review record instead of raw API dumps and old test logs.
- Tidied the project layout and checked that the generated files match the source.

## 2.0.0

- Split 4KHDHub and HDHub4u into a focused two-provider repository.
- Added release-specific range and codec labels, with missing labels left out.
- Kept the different SDR, HDR and codec releases rather than choosing one per resolution.
- Added duplicate removal, quality sorting, request limits, timeouts and bounded retries.
- Improved HDHub4u search fallback, redirect handling, metadata and subtitle forwarding.
- Added build tooling, automated tests and a GitHub Actions workflow.
