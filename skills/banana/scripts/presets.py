#!/usr/bin/env python3
"""Banana Claude -- Brand/Style Presets

Usage:
    presets.py list
    presets.py show NAME
    presets.py create NAME --colors "#hex,#hex" --style "..." [options]
    presets.py delete NAME --confirm
"""

import argparse
import json
import re
import sys
from pathlib import Path

PRESETS_DIR = Path.home() / ".banana" / "presets"


def _ensure_dir():
    PRESETS_DIR.mkdir(parents=True, exist_ok=True)


def _sanitize_name(name):
    safe = re.sub(r'[^a-zA-Z0-9_\-]', '', name)
    if not safe:
        print("Error: Preset name must contain only letters, numbers, hyphens, and underscores.", file=sys.stderr)
        sys.exit(1)
    return safe


def _preset_path(name):
    return PRESETS_DIR / f"{_sanitize_name(name)}.json"


def _load_preset(name):
    path = _preset_path(name)
    if not path.exists():
        print(f"Error: Preset '{name}' not found.", file=sys.stderr)
        sys.exit(1)
    with open(path, "r") as f:
        return json.load(f)


def cmd_list(args):
    _ensure_dir()
    presets = sorted(PRESETS_DIR.glob("*.json"))
    if not presets:
        print("No presets found.")
        return
    for p in presets:
        try:
            with open(p, "r") as f:
                data = json.load(f)
            print(f"  {p.stem:20s} -- {data.get('description', 'No description')}")
        except Exception:
            print(f"  {p.stem:20s} -- (invalid)")


def cmd_show(args):
    print(json.dumps(_load_preset(args.name), indent=2))


def cmd_create(args):
    _ensure_dir()
    path = _preset_path(args.name)
    if path.exists():
        print(f"Error: Preset '{args.name}' already exists.", file=sys.stderr)
        sys.exit(1)
    colors = [c.strip() for c in args.colors.split(",")] if args.colors else []
    preset = {
        "name": args.name,
        "description": args.description or f"Custom preset: {args.name}",
        "colors": colors,
        "style": args.style or "",
        "typography": args.typography or "",
        "lighting": args.lighting or "",
        "mood": args.mood or "",
        "default_ratio": args.ratio or "16:9",
        "default_resolution": args.resolution or "2K",
    }
    with open(path, "w") as f:
        json.dump(preset, f, indent=2)
    print(f"Preset '{args.name}' created at {path}")


def cmd_delete(args):
    if not args.confirm:
        print("Error: Pass --confirm to delete.", file=sys.stderr)
        sys.exit(1)
    path = _preset_path(args.name)
    if not path.exists():
        print(f"Error: Preset '{args.name}' not found.", file=sys.stderr)
        sys.exit(1)
    path.unlink()
    print(f"Preset '{args.name}' deleted.")


def main():
    parser = argparse.ArgumentParser(description="Banana Claude Brand/Style Presets")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list")
    p_show = sub.add_parser("show")
    p_show.add_argument("name")
    p_create = sub.add_parser("create")
    p_create.add_argument("name")
    p_create.add_argument("--colors", default="")
    p_create.add_argument("--style", default="")
    p_create.add_argument("--typography", default="")
    p_create.add_argument("--lighting", default="")
    p_create.add_argument("--mood", default="")
    p_create.add_argument("--description", default="")
    p_create.add_argument("--ratio", default="16:9")
    p_create.add_argument("--resolution", default="2K")
    p_delete = sub.add_parser("delete")
    p_delete.add_argument("name")
    p_delete.add_argument("--confirm", action="store_true")
    args = parser.parse_args()
    cmds = {"list": cmd_list, "show": cmd_show, "create": cmd_create, "delete": cmd_delete}
    cmds[args.command](args)


if __name__ == "__main__":
    main()
