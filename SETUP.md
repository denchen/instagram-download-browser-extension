# Setting up a new Mac for this repo

Everything repo-side (rulesets, Actions policy, Dependabot, secret scanning) lives on GitHub and
needs nothing from a new machine. This is the machine-side part: a personal GitHub identity that
is separate from the work one, SSH authentication and commit signing with that identity, and the
credentials that must never reach GitHub. Budget about 20 minutes.

Replace `denchen`, the key names and the paths if they differ. The clone path matters: git applies
the personal identity by directory.

## 1. Tools

```bash
brew install git gh direnv fnm
```

Add `eval "$(fnm env --use-on-cd)"` and `eval "$(direnv hook zsh)"` to `~/.zshrc`. Node comes from
`.nvmrc` and pnpm from the `packageManager` field once you are in the repo (`corepack enable`).

## 2. A personal SSH key, not copied from the old machine

Make a fresh key with a passphrase; the Keychain stores the passphrase so you type it once.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_personal -C personal
```

Append to `~/.ssh/config`. The alias is what keeps this key away from work repos.

```
Host github-personal
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_personal
  IdentitiesOnly yes
  UseKeychain yes
  AddKeysToAgent yes
```

## 3. Register the key on GitHub twice

GitHub tracks authentication keys and signing keys separately. The same key has to be added as
both or commits show as Unverified.

```bash
export GH_CONFIG_DIR=~/.config/gh-personal
gh auth login -h github.com -p ssh -s admin:public_key,admin:ssh_signing_key
gh ssh-key add ~/.ssh/id_ed25519_personal.pub --type authentication --title "<machine> auth"
gh ssh-key add ~/.ssh/id_ed25519_personal.pub --type signing --title "<machine> signing"
```

Log in as the personal account, not the work one. `GH_CONFIG_DIR` is what keeps the two `gh`
logins apart; `.envrc` in the repo exports it, so inside the repo plain `gh` is the personal one.

## 4. Git identity and signing, scoped to personal repos

`~/.gitconfig` keeps the work identity as the default and includes the personal one by directory:

```
[includeIf "gitdir:~/git/instagram-download-browser-extension/"]
  path = ~/.gitconfig-personal
```

`~/.gitconfig-personal`:

```
[user]
	name = Dennis Chen
	email = 2073768+denchen@users.noreply.github.com
	signingkey = ~/.ssh/id_ed25519_personal.pub
[gpg]
	format = ssh
[gpg "ssh"]
	allowedSignersFile = ~/.ssh/allowed_signers
[commit]
	gpgsign = true
[tag]
	gpgsign = true
```

`~/.ssh/allowed_signers`, so `git log --show-signature` can verify your own commits locally:

```bash
printf '%s namespaces="git" %s\n' 2073768+denchen@users.noreply.github.com "$(cut -d' ' -f1,2 ~/.ssh/id_ed25519_personal.pub)" > ~/.ssh/allowed_signers
```

## 5. Clone and check

```bash
git clone git@github-personal:denchen/instagram-download-browser-extension.git ~/git/instagram-download-browser-extension
cd ~/git/instagram-download-browser-extension
git config blame.ignoreRevsFile .git-blame-ignore-revs
direnv allow
pnpm install
```

Confirm the identity took: `git config user.email` should show the noreply address and
`git config commit.gpgsign` should be `true`. Then make sure GitHub agrees before doing real work:

```bash
git checkout -b signing-check && git commit --allow-empty -m "test: signing" && git push -u origin signing-check
gh api repos/denchen/instagram-download-browser-extension/commits/$(git rev-parse HEAD) --jq .commit.verification
git push origin --delete signing-check && git checkout master && git branch -D signing-check
```

`verified: true, reason: valid` is the answer. Anything else means step 3 or 4 is incomplete.
`master` rejects unsigned commits, so this is worth the minute.

## 6. Secrets that stay on the machine

`.envrc` is gitignored and holds the only secrets this project has:

```bash
export GH_CONFIG_DIR="$HOME/.config/gh-personal"
export WEB_EXT_API_KEY='user:00000:00'
export WEB_EXT_API_SECRET='...'
```

The Mozilla Add-ons credentials come from
[AMO Developer Hub → Manage API Keys](https://addons.mozilla.org/developers/addon/api/key/). The
secret is shown once; if the old machine is gone, revoke and regenerate rather than hunting for it.
They grant publishing rights, so they never go into GitHub secrets, a commit, or a shell command
in history (`export` from `.envrc` only). Push protection on the repo is a backstop, not a plan.

## 7. Account hygiene, once per machine change

- GitHub: 2FA with a passkey or security key, not SMS. Vigilant mode on
  (Settings → SSH and GPG keys → "Flag unsigned commits as unverified"); it is an account setting
  and should already be on.
- Mozilla Add-ons: 2FA on the account that owns the API keys.
- Old machine: delete its **authentication** key on GitHub. Leave its **signing** key in place;
  removing a signing key can turn the commits it signed Unverified, and without the private key it
  cannot sign anything new.

## What the repo enforces on its own

For context when something is refused. `master` takes only squash or rebase merges from a PR with
the `check` job green, linear history, and signed commits; `v*` tags cannot be moved or deleted.
Actions must be pinned to a full commit SHA and come from GitHub, a verified creator, or
`pnpm/action-setup`. `pnpm install` refuses any version published in the last 7 days
(`minimumReleaseAge`), and install scripts are denied unless listed in `pnpm-workspace.yaml`.
Dependabot opens one grouped PR a week. None of it is configured locally, so none of it needs
redoing.
