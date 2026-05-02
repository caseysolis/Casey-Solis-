# Gemini Image Generation Models

> Last updated: 2026-03-19
> Aligned with Google's March 2026 API state

## Available Models

### gemini-3.1-flash-image-preview -- Nano Banana 2 (DEFAULT)
| Property | Value |
|----------|-------|
| **Model ID** | `gemini-3.1-flash-image-preview` |
| **Status** | Preview -- **Active, recommended default** |
| **Max Resolution** | Up to 4096x4096 (4K tier) |
| **Aspect Ratios** | All 14 ratios including extreme: 1:4, 4:1, 1:8, 8:1 |
| **Rate Limits (Free)** | ~5-15 RPM / ~20-500 RPD |
| **Best For** | All standard production generation and editing |

### gemini-2.5-flash-image -- Nano Banana (Original)
| Property | Value |
|----------|-------|
| **Model ID** | `gemini-2.5-flash-image` |
| **Status** | GA -- **Active** |
| **Max Resolution** | Up to 1024x1024 (1K tier) |
| **Cost** | ~$0.039/image at 1K |
| **Best For** | Free-tier users, budget-conscious workflows |

## DEPRECATED -- Do NOT Use
- `gemini-3-pro-image-preview` -- Shut down March 9, 2026. Use `gemini-3.1-flash-image-preview` instead.
- `gemini-2.0-flash-exp` -- Deprecated, replaced by gemini-2.5-flash-image

## Resolution Tiers

| `imageSize` Value | Model Availability | Use Case |
|-------------------|-------------------|----------|
| `512` | Nano Banana 2 only | Drafts, quick iteration |
| `1K` | All models | Standard web use |
| `2K` | Nano Banana 2 only | Quality assets |
| `4K` | Nano Banana 2 only | Print production |

**IMPORTANT:** `imageSize` values MUST be UPPERCASE. `"2k"` fails silently.

## Aspect Ratios

| Ratio | NB2 (3.1 Flash) | NB (2.5 Flash) |
|-------|:----------------:|:--------------:|
| `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `2:3`, `3:2`, `4:5`, `5:4`, `21:9` | ✅ | ✅ |
| `1:4`, `4:1`, `1:8`, `8:1` | ✅ | ❌ |

## Required API Parameters

```json
{
  "contents": [{"parts": [{"text": "your prompt here"}]}],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "2K"
    }
  }
}
```

## Pricing

| Model | Resolution | Cost/Image |
|-------|-----------|------------|
| NB2 (3.1 Flash) | 1K | ~$0.067 |
| NB2 (3.1 Flash) | 2K | ~$0.134 |
| NB2 (3.1 Flash) | 4K | ~$0.268 |
| NB (2.5 Flash) | 1K | ~$0.039 |
| Batch API | Any | 50% discount |
