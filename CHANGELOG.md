# Changelog

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
