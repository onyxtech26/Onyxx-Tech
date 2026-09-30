"""Stamp styles.css / common.js with a content hash in every page that links them.

WHY THIS EXISTS
---------------
The domain is proxied through Cloudflare, which overrides Vercel's cache
policy on static assets: Vercel serves `styles.css` as
`max-age=0, must-revalidate`, but through the domain it arrives as
`max-age=14400` — four hours. `max-age` is an instruction to the *browser*,
not just to the CDN, so for four hours after a deploy a returning visitor
uses their cached stylesheet without even asking whether it changed.

The result is new HTML with an old stylesheet: markup referencing classes the
cached CSS has never heard of, which renders as raw unstyled browser
defaults. This happened for real on 2026-09-30 with the new contact form.

Purging the Cloudflare cache fixes it once. Versioning the URL fixes it
permanently: `styles.css?v=a1b2c3d4` is a *different URL*, so a cached copy of
the old one can never be substituted for it. The hash is of the file contents,
so it only changes when the file actually changes and repeat visits still hit
cache.

USAGE
-----
Run from the repo root after ANY edit to styles.css or common.js, before
committing:

    python tools/stamp_assets.py

It rewrites the query string in every .html file that references them,
including pages in blog/ and case-studies/ that link via `../`.
"""
import hashlib
import io
import os
import re
import sys

ASSETS = ["styles.css", "common.js",
          # The admin tool has its own pair and sits behind the same CDN, so it
          # can go stale in exactly the same way.
          "admin-dashboard.css", "admin-dashboard.js"]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def digest(path):
    """Short content hash. Line endings are normalised first so a checkout on
    another platform does not produce a different stamp for identical CSS."""
    data = io.open(path, "rb").read().replace(b"\r\n", b"\n")
    return hashlib.md5(data).hexdigest()[:8]


def html_files():
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames
                       if d not in {".git", "node_modules", "graphify-out", "tools", "docs"}]
        for f in filenames:
            if f.endswith(".html"):
                yield os.path.join(dirpath, f)


def main():
    stamps = {}
    for a in ASSETS:
        p = os.path.join(ROOT, a)
        if not os.path.isfile(p):
            print(f"!! {a} not found at repo root", file=sys.stderr)
            return 1
        stamps[a] = digest(p)
        print(f"{a}: v={stamps[a]}")

    changed = 0
    for path in html_files():
        c = io.open(path, encoding="utf-8", newline="").read()
        before = c
        for asset, stamp in stamps.items():
            # Matches href="styles.css", src="../common.js", and any existing
            # ?v=… so re-running replaces rather than appends.
            pattern = re.compile(
                r'((?:href|src)=")((?:\.\./)*' + re.escape(asset) + r')(\?v=[0-9a-f]+)?(")'
            )
            c = pattern.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={stamp}{m.group(4)}", c)
        if c != before:
            io.open(path, "w", encoding="utf-8", newline="").write(c)
            changed += 1

    print(f"stamped {changed} html files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
