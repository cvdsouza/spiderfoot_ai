# SpiderFoot Logo Guidelines

## Current Logo

The current logo is a placeholder SVG combining:
- Spider web structure (representing SpiderFoot)
- Neural network nodes (representing AI)
- Circuit-like connections
- Color scheme: Indigo/Purple gradient (#6366f1 → #8b5cf6)

## Replacing with Your Custom Logo

### 1. Generate Your Logo Using AI Tools

**Recommended AI Logo Generators:**

- **DALL-E 3** (ChatGPT Plus / Bing Image Creator)
  ```
  Prompt: "Create a modern logo combining a spider web and AI neural
  network circuits, minimalist style, cybersecurity blue/purple theme,
  transparent background, professional tech aesthetic"
  ```

- **Midjourney**
  ```
  Prompt: "spiderfoot AI logo, spider web with neural network nodes,
  cybersecurity theme, minimalist, professional, --ar 1:1 --v 6"
  ```

- **Leonardo.ai** (Free tier available)
  ```
  Prompt: "minimalist tech logo, spider web and AI circuits combined,
  modern, blue purple gradient, transparent background"
  ```

- **Canva** (AI Logo Generator)
  - Search for "tech logo" or "AI logo" templates
  - Customize with spider web elements

### 2. Logo File Requirements

**Main Logo** (`logo.svg` or `logo.png`):
- **Format**: SVG (preferred) or PNG with transparency
- **Size**: 200×200px minimum (SVG scales infinitely)
- **Background**: Transparent
- **Colors**: Match theme (indigo #6366f1, purple #8b5cf6, or your brand colors)

**Favicon** (`favicon.ico`):
- **Format**: ICO (multi-size recommended)
- **Sizes**: 16×16, 32×32, and 48×48px (all in one .ico file)
- **Background**: Transparent or solid color that works on light/dark themes
- **How to create**: See [FAVICON_INSTRUCTIONS.md](../FAVICON_INSTRUCTIONS.md) or run `./generate-favicon.sh`

### 3. Replace the Files

Simply replace these files in `frontend/public/`:

```bash
# Replace main logo
frontend/public/logo.svg         # Keep as SVG for best quality

# Create favicon
frontend/public/favicon.ico      # See instructions below
```

**Creating favicon.ico from your logo.svg:**

**Quick method (2 minutes):**
1. Visit: https://favicon.io/favicon-converter/
2. Upload: `frontend/public/logo.svg`
3. Download: `favicon.ico`
4. Save to: `frontend/public/favicon.ico`

**Automated method:**
```bash
cd frontend
./generate-favicon.sh
```

The script will guide you through creating the favicon or use online converters.

See [FAVICON_INSTRUCTIONS.md](../FAVICON_INSTRUCTIONS.md) for detailed instructions.

**If you want to use PNG for the main logo:**

Update `frontend/src/components/auth/LoginPage.tsx`:
```tsx
<img
  src="/logo.png"  {/* Change from .svg to .png */}
  alt="SpiderFoot AI"
  className="w-24 h-24 animate-pulse-subtle"
/>
```

### 4. Logo Design Tips

**Do:**
- ✅ Keep it simple and recognizable at small sizes
- ✅ Use 2-3 colors maximum
- ✅ Make it work on both light and dark backgrounds
- ✅ Ensure it's recognizable in monochrome (for favicons)
- ✅ Test at multiple sizes (16px, 32px, 64px, 200px)

**Don't:**
- ❌ Use thin lines that disappear at small sizes
- ❌ Include too much detail
- ❌ Use gradients that don't work in monochrome
- ❌ Make it too busy or complex

### 5. Color Scheme

Current SpiderFoot theme colors (from `frontend/src/index.css`):

```css
--sf-accent: #6366f1    /* Indigo - primary brand color */
--sf-primary: #2563eb   /* Blue - action color */
--sf-bg: #ffffff        /* Light mode background */
--sf-bg-dark: #0f172a   /* Dark mode background */
--sf-text: #0f172a      /* Light mode text */
--sf-text-dark: #f1f5f9 /* Dark mode text */
```

Recommended logo colors:
- Primary: Indigo (#6366f1) or Purple (#8b5cf6)
- Accent: Cyan (#06b6d4) for AI nodes
- Dark elements: Slate (#1e293b)

### 6. Example Logo Concepts

**Concept 1: Web + Neural Network**
- Spider web as base structure
- Circuit nodes at intersection points
- Simplified spider in center
- Gradient purple/blue

**Concept 2: Abstract Spider + Data**
- Geometric spider made from triangles
- Data flow lines emanating
- Minimalist, modern tech aesthetic

**Concept 3: Shield + Spider**
- Security shield outline
- Spider web pattern inside
- Neural network accents
- Cybersecurity focus

### 7. Testing Your Logo

After replacing the files:

1. **Clear browser cache**: `Cmd/Ctrl + Shift + R`
2. **Check login page**: Visit `/login` route
3. **Check favicon**: Look at browser tab
4. **Test dark mode**: Toggle dark mode in UI
5. **Test on mobile**: Ensure it's visible at small sizes

### 8. Need Help?

If you need a professional logo designer:
- **Fiverr**: Search "tech logo design" (~$20-100)
- **99designs**: Logo contests (~$300-500)
- **Upwork**: Hire a designer (~$50-200)

For quick iterations, AI tools like DALL-E or Midjourney are fastest and cheapest.
