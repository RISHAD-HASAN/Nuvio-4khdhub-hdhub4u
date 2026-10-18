# Security notes

## The development parser is old

The tests use `cheerio-without-node-native` to match the original providers’ parser. With optional dependencies omitted, the last npm audit reported **three high-severity findings** in its selector dependency chain. That includes a regular-expression denial-of-service advisory in `nth-check`.

These are development dependencies, not code bundled into the provider files. Nuvio supplies the runtime parser, and this project doesn’t control or certify its version. Keep local test inputs trusted and don’t expose the development tools as a public parsing service.

Optional dependencies are disabled in `.npmrc` to avoid installing the old jsdom/request tree. This reduces unnecessary dependencies; it doesn’t fix the remaining selector advisories. `crypto-js`, retained for the existing HDHub4u extractor, is also no longer actively maintained.

To check the current dependency state:

```sh
npm ci --omit=optional --ignore-scripts
npm audit --omit=optional
```

Don’t force incompatible dependency upgrades just to make the report green. Any parser replacement needs compatibility tests against Nuvio’s runtime.

## Keys and third-party services

The provider files retain an upstream public TMDB key. Use your own appropriately scoped key if you distribute a separate build. Anything placed in a public provider file can be read by anyone; it is not a place for private credentials.

Requests go directly to third-party sites and hosts. This package doesn’t add a backend or disable TLS certificate checks. Request deadlines and URL checks reduce some failure cases, but they don’t establish that a host or its content is safe.

## Reporting a problem

Once you’ve hosted your own copy, use that repository’s issue tracker for ordinary bugs. Don’t post private keys, account cookies or signed playback URLs in public issues. Set up a private reporting route before asking people to send sensitive security reports.
