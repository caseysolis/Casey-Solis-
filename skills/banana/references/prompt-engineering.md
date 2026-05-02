# Prompt Engineering Reference -- Banana Claude

> Aligned with Google's March 2026 "Ultimate Prompting Guide" for Gemini image generation.

## The 5-Component Prompt Formula

Write as natural narrative paragraphs -- NEVER as comma-separated keyword lists.

### Component 1 -- SUBJECT
Who or what is the primary focus. Be specific about physical characteristics.

### Component 2 -- ACTION
What the subject is doing. Use strong present-tense verbs.

### Component 3 -- LOCATION / CONTEXT
Where the scene takes place. Include environmental details, time of day, atmospheric conditions.

### Component 4 -- COMPOSITION
Camera perspective, framing, and spatial relationship.

### Component 5 -- STYLE (includes lighting)
The visual register, aesthetic, medium, and lighting combined. Reference real cameras, film stock, photographers, or publications.

## BANNED PROMPT KEYWORDS -- NEVER USE THESE

- "4k" / "8k" / "ultra HD" / "high resolution" (use the `imageSize` parameter instead)
- "masterpiece"
- "highly detailed" / "ultra detailed"
- "hyperrealistic" / "ultra realistic"
- "photorealistic" (describe the camera/film instead)
- "best quality"
- "trending on artstation"

USE INSTEAD (prestigious context anchors):
- "Pulitzer Prize-winning cover photograph"
- "Vanity Fair editorial portrait"
- "National Geographic cover story"
- "WIRED magazine feature spread"

## No Negative Prompts

Gemini has NO negative prompt parameter. Use semantic reframing:
- Instead of "no blur" -> "sharp, tack-sharp detail"
- Instead of "no people" -> "empty, deserted, uninhabited"

## Domain Mode Libraries

### Cinema
Camera: RED V-Raptor, ARRI Alexa 65. Film stocks: Kodak Vision3 500T. Shot types: Dutch angle, overhead crane.

### Product
Surfaces: polished marble, brushed concrete. Lighting: softbox diffused, rim separation. Style refs: Apple product photography, Aesop minimal.

### Portrait
Focal lengths: 85mm (classic), 105mm (compression). Apertures: f/1.4 (dreamy bokeh).

### Editorial/Fashion
Publication refs: Vogue Italia, Harper's Bazaar, National Geographic, Kinfolk.

### UI/Web
Styles: flat vector, isometric 3D, glassmorphism, material design.

### Logo
Construction: geometric primitives, golden ratio. Colors: max 2-3 colors.

### Landscape
Depth layers: foreground interest, midground subject, background atmosphere.

### Infographic
Layout: modular sections, clear visual hierarchy. Text: use quotes for exact text.

### Abstract
Geometry: fractals, voronoi tessellation. Textures: marble veining, fluid dynamics.

## Proven Templates

### Instagram Ad / Social Media
```
Hyper-realistic gym selfie of athletic 24yo influencer with glowing olive
skin, wearing crinkle-textured athleisure set in mauve. iPhone 16 Pro Max
front-facing portrait mode capturing sweat droplets on collarbones.
Vanity Fair wellness editorial aesthetic.
```

### Product / Commercial
```
Gatorade bottle with condensation dripping down the sides, surrounded by
lightning bolts and vibrant blue and orange light rays. The Gatorade logo
is prominently displayed. Commercial food photography. Bon Appetit magazine.
```

### Fashion / Editorial
```
A 24-year-old female AI influencer posing confidently in an urban cityscape
during golden hour. Captured with Sony A7R IV at 85mm f/1.4.
```

## Safety Filter Rephrase Strategies

| Category | Rephrase approach |
|----------|-------------------|
| Violence/weapons | Use aftermath: "battle-worn" -> "weathered veteran" |
| Real public figures | Use archetypes: "tech entrepreneur in a minimalist office" |
| NSFW/suggestive | Use artistic framing: "fashion editorial, fully clothed" |
