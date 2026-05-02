# MCP Tools Reference -- @ycse/nanobanana-mcp

## Tools

### gemini_generate_image
Generate an image from a text prompt.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | Text description |

### gemini_edit_image
Edit an existing image with text instructions.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `imagePath` | string | Yes | Path to image file |
| `prompt` | string | Yes | Edit instructions |

### gemini_chat
Multi-turn visual conversation maintaining session context.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | Yes | Chat message |

### set_aspect_ratio
Configure the aspect ratio for subsequent generations.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `ratio` | string | Yes | e.g., "16:9", "1:1", "9:16" |

**Supported:** 1:1, 16:9, 9:16, 4:3, 3:4, 2:3, 3:2, 4:5, 5:4, 1:4, 4:1, 1:8, 8:1, 21:9

### set_model
Switch the active Gemini model.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | Yes | Model identifier |

**Available:** `gemini-3.1-flash-image-preview` (default), `gemini-2.5-flash-image`

### get_image_history / clear_conversation
Retrieve session history or reset context. No parameters.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_AI_API_KEY` | Yes | API key from https://aistudio.google.com/apikey |
| `NANOBANANA_MODEL` | No | Override default model |

## Parameters That Do NOT Exist

- `numberOfImages` / `n` -- Gemini generates ONE image per call
- `negativePrompt` -- Use semantic reframing instead
- `seed` -- Not supported
