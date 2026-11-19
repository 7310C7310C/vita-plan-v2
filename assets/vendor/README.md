# Vendored browser dependencies

These files are served from kcan.cc so the player does not depend on public
CDNs at runtime. Keep the upstream version in the filename/comment when
upgrading.

| File | Upstream | Version |
| --- | --- | --- |
| `smplr/index.js` | <https://www.npmjs.com/package/smplr> | 1.2.0 (`dist/index.mjs`) |
| `opencc/full.js` | <https://www.npmjs.com/package/opencc-js> | 1.4.2 (`dist/umd/full.js`) |

Both are used under their upstream licenses; see the npm packages for the
license text. The player keeps a CDN fallback if a local file is missing.
