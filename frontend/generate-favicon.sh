#!/usr/bin/env bash
# Generate favicon.ico from logo.svg
#
# This script tries multiple methods to convert SVG to ICO:
#   1. ImageMagick (convert)
#   2. Inkscape
#   3. rsvg-convert + pngtoppm + ppmtowinicon
#   4. Node.js with sharp package
#   5. Fallback: Instructions for online converter

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOGO_SVG="$SCRIPT_DIR/public/logo.svg"
FAVICON_ICO="$SCRIPT_DIR/public/favicon.ico"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "🎨 Generating favicon.ico from logo.svg..."
echo ""

# Check if logo.svg exists
if [ ! -f "$LOGO_SVG" ]; then
    echo -e "${RED}❌ Error: logo.svg not found at $LOGO_SVG${NC}"
    exit 1
fi

# Method 1: Try ImageMagick
if command -v convert >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Found ImageMagick, using convert..."

    # Create temporary PNGs
    TMP_DIR=$(mktemp -d)
    convert "$LOGO_SVG" -resize 16x16 -background none -flatten "$TMP_DIR/favicon-16.png"
    convert "$LOGO_SVG" -resize 32x32 -background none -flatten "$TMP_DIR/favicon-32.png"
    convert "$LOGO_SVG" -resize 48x48 -background none -flatten "$TMP_DIR/favicon-48.png"

    # Combine into ICO
    convert "$TMP_DIR/favicon-16.png" "$TMP_DIR/favicon-32.png" "$TMP_DIR/favicon-48.png" "$FAVICON_ICO"

    # Clean up
    rm -rf "$TMP_DIR"

    echo -e "${GREEN}✅ favicon.ico created successfully!${NC}"
    echo "📍 Location: $FAVICON_ICO"
    exit 0
fi

# Method 2: Try Inkscape
if command -v inkscape >/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Found Inkscape, converting..."

    TMP_DIR=$(mktemp -d)
    inkscape "$LOGO_SVG" --export-type=png --export-width=32 --export-height=32 --export-filename="$TMP_DIR/favicon-32.png"
    inkscape "$LOGO_SVG" --export-type=png --export-width=16 --export-height=16 --export-filename="$TMP_DIR/favicon-16.png"

    # If convert is available, combine them
    if command -v convert >/dev/null 2>&1; then
        convert "$TMP_DIR/favicon-16.png" "$TMP_DIR/favicon-32.png" "$FAVICON_ICO"
        rm -rf "$TMP_DIR"
        echo -e "${GREEN}✅ favicon.ico created successfully!${NC}"
        echo "📍 Location: $FAVICON_ICO"
        exit 0
    else
        # Just use the 32x32 as favicon
        cp "$TMP_DIR/favicon-32.png" "$FAVICON_ICO"
        rm -rf "$TMP_DIR"
        echo -e "${YELLOW}⚠️  Created PNG favicon (ImageMagick needed for true ICO format)${NC}"
        echo "📍 Location: $FAVICON_ICO"
        exit 0
    fi
fi

# Method 3: Try Node.js with sharp
if command -v node >/dev/null 2>&1; then
    if [ -f "$SCRIPT_DIR/create-favicon.js" ]; then
        echo -e "${GREEN}✓${NC} Found Node.js, trying sharp..."
        cd "$SCRIPT_DIR"

        # Check if sharp is installed
        if npm list sharp >/dev/null 2>&1; then
            node create-favicon.js
            exit 0
        else
            echo -e "${YELLOW}⚠️  sharp package not installed${NC}"
            echo ""
            echo "Install with: npm install --save-dev sharp sharp-ico"
            echo "Then run: node create-favicon.js"
            echo ""
        fi
    fi
fi

# No tools available - provide instructions
echo -e "${YELLOW}⚠️  No conversion tools found${NC}"
echo ""
echo "Please use one of these free online converters:"
echo ""
echo -e "${GREEN}Option 1 (Recommended):${NC}"
echo "  1. Visit: https://favicon.io/favicon-converter/"
echo "  2. Upload: $LOGO_SVG"
echo "  3. Download the generated favicon.ico"
echo "  4. Save to: $FAVICON_ICO"
echo ""
echo -e "${GREEN}Option 2:${NC}"
echo "  Visit: https://cloudconvert.com/svg-to-ico"
echo ""
echo -e "${GREEN}Option 3:${NC}"
echo "  Visit: https://realfavicongenerator.net/"
echo ""
echo "Or install a conversion tool:"
echo "  • ImageMagick: brew install imagemagick (macOS)"
echo "  • Inkscape: brew install --cask inkscape (macOS)"
echo "  • Node.js: npm install --save-dev sharp sharp-ico"
echo ""
