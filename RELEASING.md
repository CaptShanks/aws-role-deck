# Releasing RoleDeck

RoleDeck is distributed as an **unlisted, self-signed Firefox add-on** (signed by
Mozilla, hosted on our GitHub Releases — no public AMO listing, no review). The
team's Firefox auto-updates from the `update_url` baked into the manifest:
`https://github.com/CaptShanks/aws-role-deck/releases/latest/download/updates.json`.

So each release must: bump the version → build → **sign** → attach the signed
`.xpi` + a matching `updates.json` to the GitHub release (which becomes
"latest"). Firefox then sees the new version and updates everyone.

---

## One-time setup

1. **Get AMO API credentials** (free): https://addons.mozilla.org/developers/addon/api/key/
   → generate a **JWT issuer** (key) and **JWT secret**.
2. For the **automated** path, add them as GitHub repo secrets:
   ```bash
   gh secret set AMO_JWT_ISSUER --repo CaptShanks/aws-role-deck
   gh secret set AMO_JWT_SECRET --repo CaptShanks/aws-role-deck
   ```
   For the **manual** path, keep them handy as env vars (below).

> A given version can only be signed **once** on AMO — always bump the version
> before signing a new build.

---

## Option A — Automated (recommended)

Bump the version, tag, and push. The `Release` workflow does the rest (test →
build → sign → attach `.xpi` + `updates.json` + zips to the release).

```bash
# 1. Bump version in manifest.json, package.json, and src/options.html (the <span class="ver">)
# 2. Commit the bump
git commit -am "v0.2.0"
# 3. Tag and push
git tag v0.2.0
git push origin main --tags
```

That's it — the GitHub Action signs and publishes, and the team auto-updates.

---

## Option B — Manual (no CI secrets needed)

```bash
# 1. Bump the version (manifest.json, package.json, src/options.html), commit.

# 2. Build + sign (unlisted). Produces a signed .xpi in web-ext-artifacts/.
WEB_EXT_API_KEY="<JWT issuer>" WEB_EXT_API_SECRET="<JWT secret>" npm run sign:firefox

# 3. Name the .xpi for a stable update_link, and build the update manifest.
VERSION=$(node -p "require('./package.json').version")
cp web-ext-artifacts/*.xpi "roledeck-$VERSION.xpi"
bin/make-updates-json.sh "$VERSION"

# 4. Build the store zips (optional) and publish the release.
npm run archive
gh release create "v$VERSION" --title "RoleDeck v$VERSION" --generate-notes \
  "roledeck-$VERSION.xpi" updates.json \
  "dist/chrome/roledeck-chrome-$(cat dist/version).zip" \
  "dist/firefox/roledeck-firefox-$(cat dist/version).zip"
```

---

## How the team installs

- **Self-serve:** share the release's `roledeck-<version>.xpi` link; opening it
  in Firefox installs it (signed, so it's permanent). It auto-updates after that.
- **Managed:** force-install across the org via Firefox enterprise policy
  (`policies.json` / GPO) using the `.xpi` URL.
