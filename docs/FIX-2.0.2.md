# Fixing the empty stream lists

Version 2.0.1 passed the Node tests but could fail inside Nuvio. That was a compatibility mistake in the custom build, not evidence that the source pages had no links.

## What went wrong

The new metadata code used Cheerio’s `closest()`. Nuvio’s lightweight parser doesn’t implement it, so an exception could turn a valid extraction into an empty list. The request wrapper also assumed browser timers and a full URL implementation were available.

HDHub4u had additional search problems: its endpoint had moved, its long release titles were scored too harshly, and resolution numbers could be mistaken for years. Its episode loop also relied on DOM `tagName`, which native wrappers don’t expose.

## What changed

The extraction loop now passes the release heading directly into each episode. There are no parent-traversal calls. Timers are optional, response-body methods may return either a value or a promise, plain header objects are supported, and the generated providers include their own small HTTP URL helper.

HDHub4u reads its search endpoint from the public search page without executing scripts. Title matching ignores appended release details, and episode extraction stops at the correct separators and filters to the requested episode before resolving hosts.

The parser compatibility work was checked against Nuvio’s public runtime bindings:
https://github.com/NuvioMedia/NuvioMobile/blob/cmp-rewrite/composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/js/JsBindings.kt

## Validation

**77 automated tests pass**, including tests with:

- No `URL`, `setTimeout`, `clearTimeout` or `AbortController` globals.
- A lightweight parser adapter without `closest()` or raw DOM nodes.
- Synchronous buffered response bodies as well as promise-returning bodies.
- Plain headers, changing search endpoints and long release titles.
- Episode quality subheadings and native-wrapper separators.

A live extraction check for **East of Eden (2026), season 1, episode 2** on October 18, 2026 returned:

| Provider | Stream entries |
|---|---:|
| 4KHDHub | 15 |
| HDHub4u | 6 |

This ran with the restricted parser adapter and host-network fetch. It did not play the videos or run in the user’s Nuvio installation. Some mirrors still returned no links; results depend on the host and network.

## Install the fix

1. Extract the 2.0.2 update ZIP.
2. Copy the contents of its `nuvio-dual-providers` folder into your existing local repository. Allow replacement of matching files. Keep your existing `.git` folder.
3. In PowerShell, from that repository, run:

   ```powershell
   git add .
   git commit -m "Fix Nuvio sandbox compatibility and provider search"
   git push
   ```

4. Refresh this repository in Nuvio and reopen the same episode. Both provider versions in the uploaded manifest should be **2.0.2**.
5. If Nuvio still caches the old code, remove and re-add the same manifest URL, then restart the app.

The update ZIP leaves out `.github/workflows/` to avoid reintroducing the token-permission problem from the first push. No force-push is needed. Your manifest URL stays the same.
