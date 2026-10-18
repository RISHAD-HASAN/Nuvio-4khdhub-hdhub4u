# Source and licensing notice

## Where the providers came from

This project is based on [NuvioPlugin/All-in-One-Nuvio](https://github.com/NuvioPlugin/All-in-One-Nuvio), at commit:

```text
3f09a6ff4360498895e622877af7a32212f75038
```

The starting files were `providers/4khdhub.js`, `providers/hdhub4u.js` and their manifest entries. Upstream authorship and relevant source comments are retained. This is a modified community build, not an official release by the original authors or Nuvio.

The changes add release labels, metadata handling, request controls, tests and build tooling. Other implementations were reviewed for useful ideas; obfuscated variants weren’t executed or reused, and alternate provider files weren’t copied wholesale into this package. See [the review notes](docs/REVIEW.md).

## Before redistributing

The upstream repository had **no declared license** when checked. A public GitHub repository is not automatically licensed for unrestricted reuse. This notice gives credit; it does not grant permission to redistribute the inherited code.

Check the upstream terms or ask the authors before publishing a derivative. No blanket MIT or GPL license has been added here, and the earlier provenance of the upstream code hasn’t been legally cleared by this review.

## Dependencies and services

The providers use the same host-provided `cheerio-without-node-native` and `crypto-js` modules as the baseline. Local development dependencies are listed in `package.json` and `package-lock.json`; their own licenses and notices still apply. Dependency code is not included in the release ZIP.

Domain updates come from [phisher98/TVVVV](https://github.com/phisher98/TVVVV/blob/main/domains.json). The TMDB integration and public API key are inherited, not issued by this project.

Nuvio, TMDB, the source sites, hosting services and repository authors do not endorse this build. Use it only with services and content you’re authorized to access.
