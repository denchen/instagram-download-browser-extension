# Working in this repository

A personal fork of [TheKonka/instagram-download-browser-extension](https://github.com/TheKonka/instagram-download-browser-extension),
never published to a store, installed from source on Chrome and as a signed add-on on Firefox.

## Divergence is deliberate

**Never `git merge upstream/master`.** This fork changes behaviour the original intends to keep —
the filename scheme, individual-file downloads in place of the zip, refusing rather than guessing
on an ambiguous index. Measured 2026-10-02: ~21 commits ahead, 0 behind, with the overlap
concentrated in the files a merge would conflict in.

The risk is not the conflict. It is a merge that **succeeds**, quietly restoring the configurable
filename template, the zip path, or `candidates[0]` selection.

Keep the `upstream` remote for reading — `git log master..upstream/master`,
`git diff master...upstream/master -- <file>` — and re-implement anything worth having. The full
policy, and the per-area priorities, live in [issue #1](https://github.com/denchen/instagram-download-browser-extension/issues/1).

## Commands

```bash
pnpm install
pnpm run build:chrome   # one-shot, exits
pnpm run build:ff
pnpm run dev:chrome     # rebuilds on change
pnpm run lint           # oxlint
pnpm run fmt            # oxfmt
pnpm test               # vitest
```

`build:*` exits when done; `dev:*` watches. **Watch mode does not re-run `tsc`**, so type errors
only surface on a plain build or in CI.

CI is one job, `check`, running `fmt:check`, `lint`, `tsc --noEmit`, `test`, and both builds. It is
a required status check on `master`, so changes go through a branch and a PR — a direct push to
`master` is rejected.

## Releasing a new version to Firefox

Chrome needs none of this: rebuild, click ↻ on the card at `chrome://extensions`, then reload any
open Instagram tab, because content scripts are not re-injected into pages already open.

Firefox is different, and the order matters.

**1. Decide whether it is worth a release at all.** Every signing burns a version number
permanently (see step 2). A diagnostics-only change — a log line's wording, a comment — is not
worth a cycle on its own; batch it with the next change that alters behaviour.

**2. Bump the version. This is mandatory and irreversible.** AMO refuses a version number it has
already accepted for a given add-on ID, with no expiry, so a re-sign at the same version fails.

```bash
pnpm version 2.5.4 --no-git-tag-version
```

Commit the bump with the change it ships, and rebuild so `dist/` carries the new number — the
version Firefox and Chrome display comes from `dist/<target>/manifest.json`, which only a build
regenerates. Editing source and reloading without rebuilding shows the same version with the old
code, and nothing warns you.

**3. Signing credentials are the user's, not the agent's.** `pnpm run sign:ff` needs
`WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` exported in the shell that runs it. An agent's shell is
started fresh from the profile and will not have them — deliberately, since they grant publishing
rights on the user's AMO account. **Do not attempt to run the signing step. Hand it to the user**
with the commands, after confirming the bump and the build are done.

```bash
export WEB_EXT_API_KEY='user:00000:00'
export WEB_EXT_API_SECRET='...'
pnpm run sign:ff
```

Credentials come from [AMO Developer Hub → Manage API Keys](https://addons.mozilla.org/developers/addon/api/key/).
The secret is displayed once; losing it means revoke and regenerate.

**4. Install the result.** `sign:ff` rebuilds, uploads on the **unlisted** channel (self-distribution:
no public listing, no human review, automated validation only), and writes a signed `.xpi` to
`web-ext-artifacts/`. Install it at `about:addons` → gear → **Install Add-on From File**. Firefox
treats it as an upgrade and keeps stored settings, except where a setting key was renamed, which
resets that one toggle to its default.

**5. Confirm what actually shipped.** Check the version in `about:addons`, and if the change should
be observable, verify the behaviour rather than the number. Grepping `dist/` for a string the change
introduced is a cheap way to prove the build carries it.

Two standing constraints:

- `browser_specific_settings.gecko.id` is `instagram-downloader@denchen`. AMO will not sign under an
  ID registered to another account. The distinct ID is also what lets this coexist with the
  published add-on — only enable one at a time, or both inject into Instagram and every button
  appears twice.
- **There are no auto-updates.** Self-distributed add-ons update only when someone builds, bumps,
  signs and installs again. Firefox silently staying several versions behind Chrome is the normal
  failure mode here; check it when behaviour differs between the two browsers.

## Traps that have already cost time

- **`gh pr create` defaults to the parent repo on a fork.** Always pass
  `--repo denchen/instagram-download-browser-extension --base master`. Without them a PR opens
  against upstream, which the divergence policy says never to do.
- **`gh` writes need `GH_CONFIG_DIR=~/.config/gh-personal`.** The default account is an Enterprise
  Managed User, blocked from writing to personal repos. Reads succeed, so the failure looks like a
  repository permission problem rather than an identity one.
- **oxfmt formats markdown here.** `README.md` and this file are in its `--check` set, so a
  documentation-only change can fail CI. Run `pnpm run fmt` before committing any `.md`.
- **Content scripts are classic scripts, not modules.** A top-level `import` stops the whole file,
  with no visible error. `esbuild.config.mjs` builds everything under the manifest's
  `content_scripts` as IIFE, and a one-shot build fails if any of them would not parse as a classic
  script. To load module code from a content script, `import()` it at runtime the way
  `content/loader.ts` does.
- **A `dataset.foo` write and its reader can use different spellings.** `button.ts` sets
  `dataset.videoCoverDownload`; `index.ts` reads `getAttribute("data-video-cover-download")`.
  Grepping either form finds one half and the code reads as dead. Check the kebab-case form before
  concluding anything is unused.

## Filename invariants

Downloads are `@username/[type - ]YYYY.MM.DDTHH.mm.ss[ NN].ext` in UTC.

- **The folder is the media's author, never the page being browsed.** A tagged post by @groot on
  @denchen's page goes to `@groot/`. Callers get this right by resolving from the media payload;
  `profile.ts` is the one page-derived case, which is correct because an avatar's author is the page
  owner. A tagged grid deliberately passes no username rather than misfiling under the page owner.
- **A type prefix marks the cases whose timestamp is the download time, not a post time.**
  `profile - ` and `cover - ` have no post time available; the prefix is what stops a meaningless
  timestamp reading as a real one.
- **Prefer failing visibly over guessing.** An ambiguous carousel index refuses rather than picking
  one; an unresolved username files under `@unknown/` with a warning rather than silently dropping
  the folder.

## How changes get verified

Most of this cannot be unit-tested — it reads a hostile, shifting DOM and a private API. The test
suite covers pure logic only.

Verification is loading the extension and clicking. When a question is about Instagram's DOM or its
API payloads, **measure rather than infer**: run a probe in the page console on a normally-browsed
tab. Several confident conclusions in this repo's history were wrong, and in each case one real
click settled in seconds what reasoning had not.

Automated navigation is not a substitute. A programmatically driven tab reliably gets a degraded
Instagram shell — no grid, no pagination — so DOM-structure questions need a hand-browsed tab.

## Where things are tracked

- [#1](https://github.com/denchen/instagram-download-browser-extension/issues/1) — brittleness
  tracker: selector fragility, silent-failure modes, priorities, and the upstream policy
- [#3](https://github.com/denchen/instagram-download-browser-extension/issues/3) — bulk download
  design, and the cache that would remove much of the DOM dependence above

Issue convention: no checkboxes. Items are struck through with an outcome tag when resolved
(✅ done / 🔀 tracked elsewhere / ⛔ won't do), and nothing is deleted.
