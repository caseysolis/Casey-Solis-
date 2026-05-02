#!/usr/bin/env python3
"""
Validate that the Banana Claude MCP server is properly configured.

Usage:
    python3 validate_setup.py
"""

import json
import shutil
import sys
from pathlib import Path

SETTINGS_PATH = Path.home() / ".claude" / "settings.json"
MCP_NAME = "nanobanana-mcp"
OUTPUT_DIR = Path.home() / "Documents" / "nanobanana_generated"


def check(label, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    msg = f"  [{status}] {label}"
    if detail:
        msg += f" -- {detail}"
    print(msg)
    return passed


def main():
    print("Banana Claude -- Setup Validation")
    print("=" * 40)
    results = []

    results.append(check("Claude Code settings.json exists", SETTINGS_PATH.exists(), str(SETTINGS_PATH)))

    if not SETTINGS_PATH.exists():
        print("\nCannot continue without settings.json.")
        return 1

    try:
        with open(SETTINGS_PATH) as f:
            settings = json.load(f)
        results.append(check("settings.json is valid JSON", True))
    except json.JSONDecodeError as e:
        results.append(check("settings.json is valid JSON", False, str(e)))
        return 1

    servers = settings.get("mcpServers", {})
    has_mcp = MCP_NAME in servers
    results.append(check(f"MCP server '{MCP_NAME}' configured", has_mcp))

    if has_mcp:
        mcp = servers[MCP_NAME]
        results.append(check("Command is 'npx'", mcp.get("command") == "npx"))
        args = mcp.get("args", [])
        results.append(check("Package is @ycse/nanobanana-mcp", "@ycse/nanobanana-mcp" in args))
        env = mcp.get("env", {})
        key = env.get("GOOGLE_AI_API_KEY", "")
        results.append(check("GOOGLE_AI_API_KEY is set", bool(key)))

    has_npx = shutil.which("npx") is not None
    results.append(check("npx is available in PATH", has_npx, shutil.which("npx") or "not found"))

    if OUTPUT_DIR.exists():
        results.append(check("Output directory exists", True, str(OUTPUT_DIR)))
    else:
        try:
            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
            results.append(check("Output directory created", True, str(OUTPUT_DIR)))
        except OSError as e:
            results.append(check("Output directory writable", False, str(e)))

    passed = sum(1 for r in results if r)
    total = len(results)
    print(f"\n{'=' * 40}")
    print(f"Results: {passed}/{total} checks passed")
    if passed == total:
        print("Status: Ready to generate images!")
        return 0
    print("Status: Some checks failed. Fix the issues above.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
