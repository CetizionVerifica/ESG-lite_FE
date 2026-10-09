#!/usr/bin/env python3
"""Make every new delete in the UI a deliberate, reviewed decision.

The redesign rebuilds screens that can delete production records (entries,
batches, factors, users, sites). This fails when a change adds a call that
deletes data through the API (axios/api .delete(), method "DELETE", or a
bulk-delete / batch delete endpoint) unless the line, or the line above it,
carries a marker comment:

    // data-loss-reviewed: <confirm dialog, what is deleted, can it be undone>

Only lines this branch ADDS are checked, so existing code never trips it.
Usage: python3 ci/check_delete_calls.py <base-ref>
"""
import re
import subprocess
import sys

MARKER = re.compile(r"data-loss-reviewed:\s*\S", re.IGNORECASE)
PATTERNS = [
    re.compile(r"\.delete\s*(<[^>]*>)?\s*\("),
    re.compile(r"method\s*:\s*['\"`]DELETE['\"`]", re.IGNORECASE),
    re.compile(r"['\"`/](bulk-delete|bulk_delete|delete-all|purge)\b", re.IGNORECASE),
]


def main() -> int:
    base = sys.argv[1]
    diff = subprocess.run(
        ["git", "diff", "--unified=1", "--no-color", "--diff-filter=AM", f"{base}...HEAD", "--", "src"],
        check=True, capture_output=True, text=True,
    ).stdout
    path, line_no, prev, blocked = None, 0, "", []
    for raw in diff.splitlines():
        if raw.startswith("+++ "):
            path = raw[6:] if raw.startswith("+++ b/") else None
            continue
        if raw.startswith("@@"):
            m = re.search(r"\+(\d+)", raw)
            line_no, prev = (int(m.group(1)) if m else 0), ""
            continue
        if path is None or raw.startswith("--- ") or raw.startswith("-"):
            continue
        text = raw[1:]
        if raw.startswith("+") and not path.endswith((".test.ts", ".test.tsx")):
            if any(p.search(text) for p in PATTERNS) and not (MARKER.search(text) or MARKER.search(prev)):
                blocked.append((path, line_no, text.strip()))
        prev = text
        line_no += 1

    if not blocked:
        print("No unreviewed delete calls added.")
        return 0
    for path, no, text in blocked:
        print(f"{path}:{no}: {text[:160]}")
        print(f"::error file={path},line={no}::New call deletes production data. Add a confirm step and a `// data-loss-reviewed: <reason>` comment.")
    print(
        "\nThis branch adds UI calls that delete production records. Make sure the user\n"
        "confirms first and sees exactly what will be deleted, then mark each line with\n"
        "`// data-loss-reviewed: <what is deleted and how the user confirms>`."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
