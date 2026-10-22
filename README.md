# Nuvio Custom Providers

**4KHDHub, HDHub4u and Joya9TV for Nuvio—with clear, release-specific stream labels.**

A community-maintained provider repository for finding movie and TV streams from supported third-party sources. Compare available releases by resolution, source, codec and colour range without adding labels the source never supplied.

[Install in Nuvio](#installation) · [Supported providers](#supported-providers) · [Stream labels](#understanding-stream-labels) · [Report an issue](https://github.com/RISHAD-HASAN/Nuvio-4khdhub-hdhub4u/issues)

## Installation

Copy this repository URL:

```text
https://raw.githubusercontent.com/RISHAD-HASAN/Nuvio-4khdhub-hdhub4u/main/manifest.json
```

1. Open **Nuvio → Settings → Plugins / Local Scrapers**. Menu names vary by client.
2. Add the URL above and install or refresh the repository.
3. Enable the providers you want to use.
4. Open a movie or episode and select an available stream.

Use a Nuvio build that supports JavaScript provider plugins. These are installed under **Plugins / Local Scrapers**, not the separate Stremio-style Addons section. You do not need to clone this repository or install Node.js to use the providers.

> Already using 4KHDHub or HDHub4u from another repository? Enable only one copy of each to avoid duplicate requests and results.

## Supported providers

| Provider | Content | Highlights |
|---|---|---|
| **4KHDHub** | Movies & TV | Multiple release choices, including 4K where offered by the source |
| **HDHub4u** | Movies & TV | Release-specific quality, source, codec and colour-range information |
| **Joya9TV** | Movies & TV | Bengali and other available titles, with higher-resolution releases processed first |

Available titles, languages, resolutions and hosts depend on each source. A provider may return no results for a particular movie or episode, and a listed link may expire or fail to play. This repository does not guarantee every title, host or Nuvio client will work.

## Features

- **Informative stream names:** resolution, WEB-DL/WEBRip/BluRay source, codec and explicit range tags where supplied.
- **Raw source abbreviations:** tags such as `NF`, `AMZN`, `MA` and `CRAVE` stay abbreviated rather than being expanded into guessed service names.
- **Release-specific metadata:** filenames and individual release headings take priority over mixed page-wide tags.
- **Explicit REMUX identification:** a BluRay release is labelled REMUX only when the source says so.
- **Quality sorting and duplicate handling:** compare available releases without collapsing different signed URLs into one result.
- **Direct plugin installation:** no additional self-hosted server is required by this package.

## Understanding stream labels

An available release may appear as:

```text
4KHDHub - FSL 2160p | BluRay REMUX | Dolby Vision / HDR | H.265
HDHub4u 1080p | AMZN WEB-DL | H.265
Joya9TV 1080p | WEB-DL | H.264
```

These examples illustrate the label format, not guaranteed results for a particular title. Display details vary by Nuvio client and host.

| Label | Meaning |
|---|---|
| `2160p`, `1080p`, `720p`, `480p` | Resolution advertised by the release or filename |
| `WEB-DL` / `WEBRip` | Distinct source types; one is not substituted for the other |
| `BluRay REMUX` | A BluRay release explicitly identified as REMUX |
| `HDR`, `Dolby Vision`, `SDR` | Colour-range information explicitly supplied by the release |
| `H.264`, `H.265`, `AV1` | Video codec identified in release metadata |

**Missing metadata stays missing.** Untagged releases are not assumed to be SDR, and 4K, HEVC or 10-bit alone does not establish HDR. Source abbreviations are read heuristically from release metadata; filenames are not standardized, so ambiguous tags may occasionally be misidentified.

## Keeping providers up to date

Refresh this repository from Nuvio’s plugin settings to retrieve published updates, then reopen the title’s stream list. Reopening a title also requests fresh links when a host’s signed URLs have expired.

If provider cards or labels appear outdated, restart Nuvio. If the problem persists, remove and re-add **this repository**; clearing all app data should not be necessary.

## Troubleshooting

**No streams for a title**
- Confirm the repository and the relevant provider are enabled.
- Check whether the source website is reachable on your network.
- Try another title to distinguish a title-specific issue from a provider-wide failure.

**A resolution is missing**
- Refresh the title’s stream list. A higher-quality release may exist on the website while its host is unavailable or cannot be resolved by the provider.
- Allow the search to finish. Results depend on the source, host response times and Nuvio’s request deadline.

**A listed stream will not play**
- Reopen the stream list to obtain a fresh link, or choose another release or host.
- A successful extraction does not guarantee that the remote file remains available or is compatible with your player.

For Joya9TV-specific details, see the [provider guide](docs/JOYA9TV.md).

## Reporting an issue

[Open an issue](https://github.com/RISHAD-HASAN/Nuvio-4khdhub-hdhub4u/issues) with:

- Provider name and the version shown in Nuvio.
- Movie title and year, or series title, season and episode.
- Nuvio version, operating system and a screenshot of the problem.
- Whether the source page is reachable in your browser.

**Do not post passwords, API keys, account cookies or full signed playback URLs.** For sensitive issues, review the [security notes](SECURITY.md) before sharing details.

## Contributing

Provider source lives in `src/`; Nuvio loads the generated standalone files in `providers/`. See the [development guide](docs/DEVELOPMENT.md) before submitting changes, and check the [changelog](CHANGELOG.md) for recent updates.

## Credits and licensing

Based on provider work from [NuvioPlugin / All-in-One-Nuvio](https://github.com/NuvioPlugin/All-in-One-Nuvio). Joya9TV adapts layouts reviewed in [StreamX Addons](https://github.com/AeonCoreX-Lab/streamx-addons), with domain references from [Phisher’s registry](https://github.com/phisher98/TVVVV).

This is an independent community project, not an official Nuvio release. Read [NOTICE.md](NOTICE.md) for source attribution and licensing limitations before redistributing.

## Disclaimer

This repository contains provider code, not hosted media. Providers request information and links from third-party services; availability and access conditions can change without notice. Use the software only to access content you are authorized to view and comply with applicable laws and service terms.
