#!/usr/bin/env python3
"""Banana Claude -- Cost Tracker

Usage:
    cost_tracker.py log --model MODEL --resolution RES --prompt "summary"
    cost_tracker.py summary
    cost_tracker.py today
    cost_tracker.py estimate --model MODEL --resolution RES --count N
    cost_tracker.py reset --confirm
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

LEDGER_PATH = Path.home() / ".banana" / "costs.json"

PRICING = {
    "gemini-3.1-flash-image-preview": {"512": 0.020, "1K": 0.039, "2K": 0.078, "4K": 0.156},
    "gemini-2.5-flash-image": {"512": 0.020, "1K": 0.039},
}
BATCH_DISCOUNT = 0.5


def _load_ledger():
    if not LEDGER_PATH.exists():
        return {"total_cost": 0.0, "total_images": 0, "entries": [], "daily": {}}
    with open(LEDGER_PATH, "r") as f:
        return json.load(f)


def _save_ledger(ledger):
    LEDGER_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LEDGER_PATH, "w") as f:
        json.dump(ledger, f, indent=2)


def _lookup_cost(model, resolution, batch=False):
    model_pricing = PRICING.get(model)
    if not model_pricing:
        for key in PRICING:
            if key in model or model in key:
                model_pricing = PRICING[key]
                break
    if not model_pricing:
        model_pricing = PRICING["gemini-3.1-flash-image-preview"]
    cost = model_pricing.get(resolution, model_pricing.get("1K", 0.039))
    if batch:
        cost *= BATCH_DISCOUNT
    return cost


def cmd_log(args):
    ledger = _load_ledger()
    cost = _lookup_cost(args.model, args.resolution, getattr(args, "batch", False))
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    entry = {"ts": now, "model": args.model, "res": args.resolution, "cost": cost, "prompt": args.prompt[:100]}
    ledger["entries"].append(entry)
    ledger["total_cost"] = round(ledger["total_cost"] + cost, 4)
    ledger["total_images"] += 1
    if today not in ledger["daily"]:
        ledger["daily"][today] = {"count": 0, "cost": 0.0}
    ledger["daily"][today]["count"] += 1
    ledger["daily"][today]["cost"] = round(ledger["daily"][today]["cost"] + cost, 4)
    _save_ledger(ledger)
    print(json.dumps({"logged": True, "cost": cost, "total_cost": ledger["total_cost"]}))


def cmd_summary(args):
    ledger = _load_ledger()
    print(f"Total images: {ledger['total_images']}")
    print(f"Total cost:   ${ledger['total_cost']:.3f}")
    daily = ledger.get("daily", {})
    if daily:
        for day in sorted(daily.keys(), reverse=True)[:7]:
            d = daily[day]
            print(f"  {day}: {d['count']} images, ${d['cost']:.3f}")


def cmd_today(args):
    ledger = _load_ledger()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    daily = ledger.get("daily", {}).get(today, {"count": 0, "cost": 0.0})
    print(f"Today ({today}): {daily['count']} images, ${daily['cost']:.3f}")


def cmd_estimate(args):
    cost_per = _lookup_cost(args.model, args.resolution, getattr(args, "batch", False))
    total = round(cost_per * args.count, 3)
    print(f"Cost/image: ${cost_per:.3f}")
    print(f"Total est:  ${total:.3f}")


def cmd_reset(args):
    if not args.confirm:
        print("Error: Pass --confirm to reset the cost ledger.", file=sys.stderr)
        sys.exit(1)
    _save_ledger({"total_cost": 0.0, "total_images": 0, "entries": [], "daily": {}})
    print("Cost ledger reset.")


def main():
    parser = argparse.ArgumentParser(description="Banana Claude Cost Tracker")
    sub = parser.add_subparsers(dest="command", required=True)
    p_log = sub.add_parser("log")
    p_log.add_argument("--model", required=True)
    p_log.add_argument("--resolution", required=True)
    p_log.add_argument("--prompt", required=True)
    p_log.add_argument("--batch", action="store_true")
    sub.add_parser("summary")
    sub.add_parser("today")
    p_est = sub.add_parser("estimate")
    p_est.add_argument("--model", required=True)
    p_est.add_argument("--resolution", required=True)
    p_est.add_argument("--count", required=True, type=int)
    p_est.add_argument("--batch", action="store_true")
    p_reset = sub.add_parser("reset")
    p_reset.add_argument("--confirm", action="store_true")
    args = parser.parse_args()
    cmds = {"log": cmd_log, "summary": cmd_summary, "today": cmd_today, "estimate": cmd_estimate, "reset": cmd_reset}
    cmds[args.command](args)


if __name__ == "__main__":
    main()
