# Joya9TV

Joya9TV is a standalone Nuvio provider for movie and TV releases available from `joya9tv1.com` and supported linked hosts.

## Using the provider

Install this repository using the URL in the [README](../README.md), then enable **Joya9TV** in Nuvio. Open a title or individual episode to request available streams.

Higher-resolution releases are processed first, with up to two releases resolved concurrently. Each release has its own request allowance, alongside an overall limit. These controls reduce delays but do not guarantee that every advertised resolution will be returned.

## Labels

- Release filenames take precedence over short download-row labels.
- WEBRip and WEB-DL remain distinct.
- Raw uppercase source tags are preserved rather than expanded into service names.
- HDR/SDR labels are omitted when not explicitly supplied.
- SD/HD quality prefixes are not treated as streaming-service identities.

## Availability and limitations

- The provider reads supported search cards, individual download rows and numbered episode layouts.
- Conservative title matching can miss alternate or translated names.
- Episode packs and ambiguous episode ranges are not treated as individual episodes.
- Only supported public download routes are resolved. Login, CAPTCHA and access-control requirements are not bypassed.
- Hosts may block requests, change their page structure or issue expiring links.
- A resolution can appear on the website without producing a usable stream in Nuvio.
- Native-client behavior and playback depend on the Nuvio version, network, player and remote host.

Reopen the title to request fresh links. If a problem persists, follow the [issue-reporting checklist](../README.md#reporting-an-issue). Do not share full signed media URLs or account cookies.

## Attribution

The Nuvio implementation adapts Joya9TV layouts reviewed in [StreamX Addons](https://github.com/AeonCoreX-Lab/streamx-addons), with additional handling for supported Joya9Links/MultiCloud public download routes. Upstream session and clearance cookies are not included. See [NOTICE.md](../NOTICE.md) and `joya9tv-provenance.json` for source details.
