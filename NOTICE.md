> **Current package (2.2.1):** only 4KHDHub, HDHub4u and Joya9TV are shipped. References below to the removed CineFreak/MovieDekhun/MovieLinkBD integrations are historical. CB Providers was reviewed, not imported.

# Source and licensing notice

## Where the providers came from

This project is based on [NuvioPlugin/All-in-One-Nuvio](https://github.com/NuvioPlugin/All-in-One-Nuvio), at commit:

```text
3f09a6ff4360498895e622877af7a32212f75038
```

The starting files were `providers/4khdhub.js`, `providers/hdhub4u.js` and their manifest entries. Upstream authorship and relevant source comments are retained. This is a modified community build, not an official release by the original authors or Nuvio.

The changes add release labels, metadata handling, request controls, tests and build tooling. In the original two-provider review, other implementations were reviewed for useful ideas and alternate provider files were not copied wholesale. Later CineFreak replacement and Joya9TV adaptation are documented below. See [the review notes](docs/REVIEW.md).

## Before redistributing

The upstream repository had **no declared license** when checked. A public GitHub repository is not automatically licensed for unrestricted reuse. This notice gives credit; it does not grant permission to redistribute the inherited code.

Check the upstream terms or ask the authors before publishing a derivative. No blanket MIT or GPL license has been added here, and the earlier provenance of the upstream code hasn’t been legally cleared by this review.

## Dependencies and services

The providers use the same host-provided `cheerio-without-node-native` and `crypto-js` modules as the baseline. Local development dependencies are listed in `package.json` and `package-lock.json`; their own licenses and notices still apply. Dependency code is not included in the release ZIP.

Domain updates come from [phisher98/TVVVV](https://github.com/phisher98/TVVVV/blob/main/domains.json). The TMDB integration and public API key are inherited, not issued by this project.

Nuvio, TMDB, the source sites, hosting services and repository authors do not endorse this build. Use it only with services and content you’re authorized to access.


## Additional adapters in 2.1.0

The CineFreak file in the requested Mobiflix repository was obfuscated. The new adapter is a readable reimplementation of its site-facing flow, not that blob copied into this project. The historical manifest credits CineFreak to `piratezoro9`. A readable Phisher implementation was consulted for the search API and page selectors; its provider file was not transplanted.

MovieDekhun and MovieLinkBD were not found in the inspected Mobiflix default tree or the 60 manifest revisions checked. After permission to look elsewhere, MovieLinkBD's Vega/CloudStream implementations were inspected as format references. MovieDekhun uses a new adapter based on the public site's WordPress search, download buttons and public NeoXcloud button request.

The catalog adapters are original additions here, while the host resolver bundle continues to include the inherited HDHub4u code and its unresolved upstream licensing considerations. The MovieLinkBD data-link decoder implements the site's simple LCG/XOR link format; it is not a DRM or account-access mechanism. No site scripts are evaluated.

References and the limits of the integration are listed in `docs/ADDITIONAL-PROVIDERS.md`. Inclusion is not endorsement or licensing clearance for the referenced projects.

## CineFreak 2.1.3 upstream replacement

Unmodified obfuscated provider from NuvioPlugin/All-in-One-Nuvio, Git blob `d2a3074c9d02a62c5907728cdfcf15c8679d0d87`. Retained at `src/upstream/cinefreak.js`; build copies it verbatim. This supersedes earlier descriptions of CineFreak as a custom readable reimplementation. No additional licensing rights are implied.

## Joya9TV 2.2.0

Reviewed the StreamX/Vega Joya9TV implementation at https://github.com/AeonCoreX-Lab/streamx-addons, files `dist/Joya9tv/{posts,meta,episodes,stream}.js`. See `docs/joya9tv-provenance.json` for the reviewed commit and SHA-256 hashes. The new source is a readable Nuvio adaptation of those layouts plus current public Joya9Links/MultiCloud handling, not the StreamX manifest or a verbatim bundle. Saved upstream session and clearance cookies were excluded. No new permission or licensing rights are asserted; verify upstream licensing before public redistribution.
