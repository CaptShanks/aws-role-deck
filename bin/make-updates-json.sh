#!/bin/bash
#--
# make-updates-json.sh — generate the self-hosted Firefox auto-update manifest.
#
# Usage: bin/make-updates-json.sh [version]
#   version defaults to the version in package.json.
#
# Writes updates.json in the current directory, pointing the add-on's
# update_link at the signed .xpi attached to the matching GitHub release.
#--
set -e

version="${1:-$(node -p "require('./package.json').version")}"
id=$(node -p "require('./manifest_firefox.json').browser_specific_settings.gecko.id")
repo="${REPO:-CaptShanks/aws-role-deck}"

cat > updates.json <<EOF
{
  "addons": {
    "$id": {
      "updates": [
        { "version": "$version", "update_link": "https://github.com/$repo/releases/download/v$version/roledeck-$version.xpi" }
      ]
    }
  }
}
EOF

echo "wrote updates.json (version $version, id $id)"
