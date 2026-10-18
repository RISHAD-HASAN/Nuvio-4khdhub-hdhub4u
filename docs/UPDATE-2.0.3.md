# Source labels in 2.0.3

Stream names now include the release source, not just resolution and HDR tags.

```text
4KHDHub - FSL 2160p | BluRay REMUX | Dolby Vision / HDR | H.265
4KHDHub - FSL 2160p | BluRay | Dolby Vision / HDR | H.265
4KHDHub - FSL 2160p | Netflix WEB-DL | SDR | H.265
4KHDHub - FSL 1080p | Prime Video WEB-DL | H.265
4KHDHub - FSL 1080p | WEB-DL | AV1
```

The same rules apply to HDHub4u, whose resolution remains in the usual quality field.

- **BluRay REMUX** requires an explicit REMUX tag. Other BluRay releases simply say **BluRay**; their encoding history isn't guessed.
- **WEB-DL / WEBRip** gets a service name only when recognized source metadata identifies it. Supported tags include Netflix, Prime Video, Disney+, Apple TV+, HBO Max, Hulu, Paramount+, Peacock, JioHotstar, ZEE5 and SonyLIV.
- **Movies Anywhere** is recognized as a digital distribution source; it isn't described as an OTT subscription service.
- **GB** and other unrecognized abbreviations aren't expanded into a guessed service name.
- Filenames take precedence over local release headings. For example, a file tagged AMZN is labeled Prime Video WEB-DL even if the shorter heading uses another abbreviation.
- Missing range or service labels remain omitted.

All 100 automated tests passed. The Obsession movie page was also checked with the restricted-parser adapter and produced the expected BluRay/REMUX/web-source distinctions. This was a metadata check, not a new playback test.

## Update your repository

Copy the ZIP's project contents over your existing local repository, allowing file replacement. Keep your `.git` folder. Then run:

```powershell
git add .
git commit -m "Add release sources, streaming services and REMUX labels"
git push
```

Refresh the repository in Nuvio. Both providers should show version **2.0.3**. If old labels remain, restart the app or remove and re-add the same manifest URL.

The ZIP doesn't include GitHub workflow files, so it won't reintroduce the workflow-token permission error. No force-push is needed.
