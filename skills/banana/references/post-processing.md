# Post-Processing Pipeline Reference

## Prerequisites

```bash
which magick    # ImageMagick 7 (preferred)
which convert   # ImageMagick 6 (fallback)
```

Install: `sudo apt install imagemagick` or `brew install imagemagick`

## Common Operations

```bash
# Resize for Instagram (1080x1080)
magick input.png -resize 1080x1080^ -gravity center -extent 1080x1080 instagram.png

# Remove white background
magick input.png -fuzz 10% -transparent white output.png

# PNG to WebP
magick input.png -quality 85 output.webp

# Add padding
magick input.png -bordercolor white -border 40 output.png
```

## Green Screen Transparency Pipeline

Gemini cannot generate transparent backgrounds. Workaround:

1. **Generate with green screen prompt:** Append `on a solid bright green (#00FF00) chroma key background`
2. **Remove green:** `magick input.png -fuzz 20% -transparent "#00FF00" output.png`
3. **Clean edges:** `magick output.png -channel A -blur 0x1 -level 50%,100% -trim +repage final.png`
