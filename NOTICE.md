# Source attribution and licensing

## 4KHDHub and HDHub4u

Derived from `providers/4khdhub.js` and `providers/hdhub4u.js` in [NuvioPlugin/All-in-One-Nuvio](https://github.com/NuvioPlugin/All-in-One-Nuvio), starting from commit `3f09a6ff4360498895e622877af7a32212f75038`.

Upstream authorship and relevant source comments are retained. This project adds release-label handling, runtime compatibility helpers and request controls. Domain references also draw on [Phisher's public registry](https://github.com/phisher98/TVVVV/blob/main/domains.json).

## Joya9TV

A readable Nuvio adaptation of Joya9TV layouts reviewed in [AeonCoreX-Lab/streamx-addons](https://github.com/AeonCoreX-Lab/streamx-addons), files `dist/Joya9tv/{posts,meta,episodes,stream}.js`, with additional handling for current supported public download routes. It is not a verbatim StreamX bundle. Upstream saved session and clearance cookies are excluded.

The reviewed commit and file hashes are recorded in `docs/joya9tv-provenance.json`.

## Redistribution

The original All-in-One repository did not declare a license when reviewed. Public availability is not a grant of unrestricted reuse. This notice provides attribution; it does not grant additional rights or resolve upstream licensing. Verify the applicable terms or obtain permission before redistributing a derivative. No blanket license is asserted for inherited code.

## Dependencies and services

Nuvio supplies the runtime parser and cryptography modules used by these providers. Development dependencies are listed in `package.json` and `package-lock.json`; their own terms apply. Dependency code is not bundled into the distributed standalone files by this project's build.

The implementation retains public metadata API configuration inherited from upstream. Never embed private credentials in publicly distributed provider files. Third-party services and content remain subject to their respective terms and rights.
