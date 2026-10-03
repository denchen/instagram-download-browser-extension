# Instagram Download Browser Extension

A personal fork of [TheKonka/instagram-download-browser-extension](https://github.com/TheKonka/instagram-download-browser-extension),
maintained for one person's use and **not published to either extension store**. It deliberately
changes behaviour the original intends to keep, so it is installed from source rather than
installed alongside the published add-on.

The most visible difference is file naming. Downloads are saved as
`@username/[type - ]YYYY.MM.DDTHH.mm.ss[ NN].ext` in UTC — a per-poster folder, the post's own
timestamp, a prefix for stories, reels, threads, covers and profile pictures, and a zero-padded
ordinal for carousel slides. Multi-image posts download as individual files; there is no zip.

## Install

Both browsers build from source. Install the toolchain first:

```bash
pnpm install
```

### Chrome

Chrome loads the built directory directly, so there is nothing to sign.

```bash
pnpm run build:chrome
```

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked**, and select `dist/chrome` — the subdirectory, not the repo root

Chrome stores the *path*, not a copy, so keep the repository where it is. Moving or deleting it
breaks the installed extension.

After a rebuild, click the ↻ icon on the extension's card, then reload any open Instagram tab —
content scripts are not re-injected into pages that are already open, which otherwise looks like
the reload did nothing.

### Firefox — temporary

Fine for development. Removed when Firefox restarts.

```bash
pnpm run build:ff
```

1. Open `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…**
3. Select `dist/firefox/manifest.json`

### Firefox — permanent

Firefox refuses unsigned add-ons on release builds, so a permanent install needs a signed `.xpi`.
Signing is automated but needs Mozilla API credentials once.

**Get the credentials.** Sign in at [addons.mozilla.org](https://addons.mozilla.org), then open
[Developer Hub → Manage API Keys](https://addons.mozilla.org/developers/addon/api/key/) and
generate new credentials. You get a **JWT issuer** (of the form `user:00000:00`) and a **JWT
secret**. The secret is shown once and cannot be retrieved later — if you lose it, revoke and
regenerate.

**Export them.** `web-ext` reads any option from a `WEB_EXT_`-prefixed variable, which keeps the
secret out of your shell history:

```bash
export WEB_EXT_API_KEY='user:00000:00'
export WEB_EXT_API_SECRET='...'
```

Keep these out of a dotfile that syncs anywhere — they grant publishing rights on your AMO account.

**Sign and install.**

```bash
pnpm run sign:ff
```

That rebuilds, uploads to AMO on the **unlisted** channel, waits for automated validation, and
writes a signed `.xpi` to `web-ext-artifacts/`. Unlisted means self-distribution: never listed
publicly, no human review, usually a minute or two.

Then open `about:addons` → the gear icon → **Install Add-on From File**, and pick the `.xpi`.

Three things worth knowing:

- **Versions are permanent.** AMO refuses a version number it has already accepted for a given
  add-on ID, with no expiry. Bump `version` in `package.json` before every re-sign.
- **The add-on ID must be yours.** `browser_specific_settings.gecko.id` in
  `src/manifest.firefox.json` is `instagram-downloader@denchen`. If you are not that account, change
  it before signing — AMO will not sign under an ID registered to somebody else. A distinct ID is
  also what lets this coexist with the published add-on; only enable one at a time, or both inject
  into Instagram and every button appears twice.
- **There are no auto-updates.** Self-distributed add-ons only update when you build, bump, sign and
  install again.

## Core Dependencies

- [Preact](https://github.com/preactjs/preact) (used via preact/compat,
  [MIT License](https://github.com/preactjs/preact/blob/master/LICENSE))

## Development

This project uses [pnpm](https://pnpm.io/) and [esbuild](https://esbuild.github.io/) for
development, and needs Node 24 or newer. `.nvmrc` pins the version used day to day.

Builds exit when they finish. For an auto-rebuilding watch, use `dev:chrome` / `dev:ff` instead —
note that watch mode does not re-run `tsc`, so type errors only surface on a plain build.

```bash
pnpm run build:chrome   # one-shot build
pnpm run dev:chrome     # rebuild on change
pnpm run lint           # oxlint
pnpm run fmt            # oxfmt
pnpm test               # vitest
```

CI runs lint, format check, typecheck and tests on every pull request.

## Thanks

To [TheKonka/instagram-download-browser-extension](https://github.com/TheKonka/instagram-download-browser-extension),
which this is forked from and which did all the hard work of finding Instagram's media in the first
place — the API interception, the page handlers and the button placement are all theirs. Everything
here is a modification of that.

In turn, the original credits
[Instagram_Download_Button](https://github.com/y252328/Instagram_Download_Button).

## Licensing

The source code is licensed under MIT. The license is available [here](/LICENSE).
