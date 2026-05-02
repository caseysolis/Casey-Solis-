# Cost Tracking Reference

## Pricing Table

| Model | Resolution | Cost/Image |
|-------|-----------|------------|
| 3.1 Flash | 512 | $0.020 |
| 3.1 Flash | 1K | $0.039 |
| 3.1 Flash | 2K | $0.078 |
| 3.1 Flash | 4K | $0.156 |
| 2.5 Flash | 1K | $0.039 |
| Batch API | Any | 50% of above |

## Cost Tracker Commands

```bash
# Log a generation
cost_tracker.py log --model gemini-3.1-flash-image-preview --resolution 1K --prompt "coffee shop hero"

# View summary
cost_tracker.py summary

# Today's usage
cost_tracker.py today

# Estimate before batch
cost_tracker.py estimate --model gemini-3.1-flash-image-preview --resolution 1K --count 10

# Reset ledger
cost_tracker.py reset --confirm
```

## Storage

Ledger stored at `~/.banana/costs.json`. Created automatically on first use.
