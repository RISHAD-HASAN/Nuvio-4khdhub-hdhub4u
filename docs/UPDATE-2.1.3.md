> **Historical:** CineFreak, MovieDekhun and MovieLinkBD were removed in 2.2.1. They are no longer shipped.

# 2.1.3 — upstream CineFreak and MovieLinkBD domain correction

CineFreak is now the original obfuscated file from https://github.com/NuvioPlugin/All-in-One-Nuvio/blob/main/providers/cinefreak.js, copied without modification. Git blob: `d2a3074c9d02a62c5907728cdfcf15c8679d0d87`. Build preserves that file byte-for-byte. The custom CineFreak adapter is no longer shipped as its runtime. Its upstream extraction, labels, domains and sandbox compatibility have not been confirmed here; custom raw source/HDR/REMUX behavior is not guaranteed for this unmodified provider.

MovieLinkBD returns to the shared adapter implementation shipped in 2.1.0/2.1.1, with a domain override selecting `https://fpthzj.movielinkbd.at` instead of the old `.tv` base/registry. 2.1.1 was a manifest-only release; 2.1.2 did not intentionally alter MovieLinkBD extraction. Therefore this is not evidence that a code regression caused the lost results. The user-provided Pressure Cooker page and search endpoint both return HTTP 403 from this environment. They have not been verified end to end.

All five entries remain enabled. Replace all project files, not just the manifest. No live playback is claimed. See NOTICE.md for unresolved upstream licensing cautions.
