# Brand/Style Presets Reference

## Preset Schema

Each preset is stored as `~/.banana/presets/NAME.json`:

```json
{
  "name": "tech-saas",
  "description": "Clean tech SaaS brand",
  "colors": ["#2563EB", "#1E40AF", "#F8FAFC"],
  "style": "clean minimal tech illustration, flat vectors, soft shadows",
  "typography": "bold geometric sans-serif",
  "lighting": "bright diffused studio, no harsh shadows",
  "mood": "professional, trustworthy, modern",
  "default_ratio": "16:9",
  "default_resolution": "2K"
}
```

## Managing Presets

```bash
presets.py list
presets.py show tech-saas
presets.py create NAME --colors "#hex,#hex" --style "..."
presets.py delete NAME --confirm
```
