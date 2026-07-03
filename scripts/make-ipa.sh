#!/bin/bash

#
# Geoff make-ipa Script
#
# Wraps the latest Xcode archive's App.app into an unsigned .ipa for SideStore.
#
# A free Apple ID CANNOT use Xcode's "Archive -> Distribute App" export (that flow
# requires the paid Apple Developer Program). Instead we hand-build the .ipa package
# ourselves (a Payload/ folder zipped up) and let SideStore re-sign it on-device with
# your Apple ID. The archive's existing signature/profile is irrelevant.
#
# Usage:
#   scripts/make-ipa.sh [output.ipa]      # default: ~/Desktop/Geoff.ipa
#
# Prerequisite: build an archive first in Xcode (Product -> Archive).
#

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

ARCHIVES_DIR="$HOME/Library/Developer/Xcode/Archives"
OUTPUT="${1:-$HOME/Desktop/Geoff.ipa}"

echo ""
echo -e "${BLUE}== Geoff .ipa builder (free Apple ID / SideStore) ==${NC}"

# 1. Find the newest .xcarchive
if [ ! -d "$ARCHIVES_DIR" ]; then
  echo -e "${RED}No archives found.${NC} Open Xcode and run Product -> Archive first."
  exit 1
fi

ARCHIVE="$(find "$ARCHIVES_DIR" -maxdepth 2 -name '*.xcarchive' -print0 \
  | xargs -0 ls -dt 2>/dev/null | head -1)"

if [ -z "$ARCHIVE" ]; then
  echo -e "${RED}No .xcarchive in $ARCHIVES_DIR.${NC} Run Product -> Archive in Xcode first."
  exit 1
fi
echo -e "${YELLOW}Archive:${NC} $ARCHIVE"

# 2. Locate the .app inside the archive
APP="$(find "$ARCHIVE/Products/Applications" -maxdepth 1 -name '*.app' | head -1)"
if [ -z "$APP" ]; then
  echo -e "${RED}No .app inside the archive.${NC} The archive may be incomplete; re-archive."
  exit 1
fi
echo -e "${YELLOW}App:    ${NC} $APP"

# 3. Assemble Payload/ and zip it into the .ipa
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/Payload"
cp -R "$APP" "$WORK/Payload/"

mkdir -p "$(dirname "$OUTPUT")"
rm -f "$OUTPUT"
( cd "$WORK" && zip -qry "$OUTPUT" Payload )

# 4. Summary
echo ""
echo -e "${GREEN}Built:${NC} $OUTPUT"
ls -lh "$OUTPUT" | awk '{print "  size: " $5}'
echo -e "${BLUE}Contents:${NC}"
unzip -l "$OUTPUT" | grep -E 'Payload/.*\.app/' | head -8
echo ""
echo -e "Next: AirDrop ${YELLOW}$OUTPUT${NC} to your iPhone, then SideStore -> My Apps -> +."
echo ""
