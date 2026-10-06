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

## Releases

A release is one version: a `package.json` bump, a signed Firefox `.xpi`, and a GitHub release
whose tag marks the commit both were built from. `package.json` is the source of truth. The build
writes its version into each `manifest.json`, and the tag only records it.

**Which request means what.**

- **"Make a new release"**, "cut a release", "ship it to Firefox", "make a new version", or "make a
  new build" when it means something to install as a new version: run the whole procedure below.
  The request covers merging the bump PR, since that PR only changes the version.
- **"Rebuild"**, or "build it" in the middle of other work: a local build only. Run
  `pnpm run build:chrome` (or `build:ff`) with no version change, then tell the user to click ↻ at
  `chrome://extensions` and reload open Instagram tabs. Content scripts are not re-injected into
  pages already open.
- If it is unclear which one is meant, ask. A release burns a version number permanently.

Chrome never needs a release. It loads `dist/chrome` directly, so a rebuild is enough, and the
version it shows is whatever the last build wrote.

### Procedure

Commands use the `gh` setup from "Traps" below: `GH_CONFIG_DIR=~/.config/gh-personal` and
`-R denchen/instagram-download-browser-extension`.

**1. Check there is something to release.** Start on an up-to-date, clean `master`, then list
what the release would contain:

```bash
git log --oneline "$(git describe --tags --abbrev=0)"..master
```

If it is only diagnostics (a log line's wording, comments, docs, CI), say so and ask before going
on. Each signing burns a version, so changes like that wait for one that alters behaviour.

**2. Pick the version** from those commits. Use a minor bump if any is a `feat:`, otherwise a patch
bump. Ask before a major bump. State the version you chose. Don't ask for approval of a
minor or patch.

**3. Bump in a PR.** AMO refuses a version it has already accepted for this add-on ID, with no
expiry, so this is irreversible once signed.

```bash
git checkout -b release/vX.Y.Z
pnpm version X.Y.Z --no-git-tag-version
git commit -am "chore: release vX.Y.Z"
```

Push it, open the PR (no Jira ticket, as with every PR in this fork), wait for `check`, and
squash-merge with `--match-head-commit`. **Never let `pnpm version` create the tag.** The squash
merge rewrites the commit, so a tag made on the branch points at a commit `master` never contains.

**4. Build from the merge commit.** Pull `master`, confirm `HEAD` is the bump's merge commit and
the tree is clean, then run `pnpm run build:chrome` and `pnpm run build:ff`. Check that both
`dist/*/manifest.json` show the new version. The version the browsers display comes from there,
and only a build regenerates it.

**5. Hand signing to the user, then stop.** `pnpm run sign:ff` needs `WEB_EXT_API_KEY` and
`WEB_EXT_API_SECRET` exported in the shell that runs it. An agent's shell starts fresh from the
profile without them, deliberately: they grant publishing rights on the user's AMO account.
**Never attempt the signing step.** Give the user these commands, and tell them to run the
commands from the same clean `master`, because `sign:ff` rebuilds from the working tree:

```bash
export WEB_EXT_API_KEY='user:00000:00'
export WEB_EXT_API_SECRET='...'
pnpm run sign:ff
```

Credentials come from
[AMO Developer Hub → Manage API Keys](https://addons.mozilla.org/developers/addon/api/key/). The
secret is displayed once, and losing it means revoke and regenerate. `sign:ff` uploads on the
**unlisted** channel (self-distribution: no public listing, no human review, automated validation
only) and writes `web-ext-artifacts/<hash>-X.Y.Z.xpi`.

Wait for the user to confirm signing succeeded. If AMO rejects the upload, nothing is released
yet: fix the problem and sign again. A version AMO _accepted_ can't be reused, so fixing anything
after that means going back to step 2.

**6. Publish the release** once the `.xpi` exists. Tag the bump's merge commit by its SHA, not
`master`, which may have moved. Attach the `.xpi` under a readable name:

```bash
cp web-ext-artifacts/*-X.Y.Z.xpi /tmp/instagram-download-browser-extension-X.Y.Z.xpi
GH_CONFIG_DIR=~/.config/gh-personal gh release create vX.Y.Z \
  -R denchen/instagram-download-browser-extension \
  --target <merge-sha> --title vX.Y.Z --generate-notes \
  --notes-start-tag "$(git describe --tags --abbrev=0)" \
  /tmp/instagram-download-browser-extension-X.Y.Z.xpi
```

Run `git describe` before the new tag exists locally, so it returns the previous release. The notes
list the PR titles merged since then.

**7. Check the tag workflow.** Pushing the tag runs `.github/workflows/release-tag.yml`. It fails
if the tag doesn't match `package.json` at that commit, or if the commit isn't on `master`. If it
fails, delete the release and its tag (`gh release delete vX.Y.Z --cleanup-tag`), fix the cause,
and publish again. Report the release URL when it passes.

**8. Install and confirm.** The user installs the `.xpi` at `about:addons` → gear → **Install
Add-on From File**. Firefox treats it as an upgrade and keeps stored settings, except where a
setting key was renamed, which resets that one toggle to its default. Have them check the version
in `about:addons`. If the release changes behaviour, verify the behaviour rather than the number.

### Standing constraints

- `browser_specific_settings.gecko.id` is `instagram-downloader@denchen`. AMO will not sign under an
  ID registered to another account. The distinct ID is also what lets this coexist with the
  published add-on. Only enable one at a time, or both inject into Instagram and every button
  appears twice.
- **There are no auto-updates.** Self-distributed add-ons update only when someone releases and
  installs again. Firefox silently falling several versions behind Chrome is the normal failure mode
  here. When behaviour differs between the two browsers, compare the version in `about:addons` with
  the latest release.
- `v2.5.3` is a baseline tag with no GitHub release. It marks the last version signed before releases
  were tracked, so the first release's notes start there. Earlier signed versions have no tags.

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
