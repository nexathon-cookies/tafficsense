"""
Convert every PNG in the screens folder to WebP, then delete the PNG.

Usage (run from the repository root):

    pip install pillow
    python scripts/png-webp.py              # converts ./screens
    python scripts/png-webp.py path/to/dir  # converts another folder
    python scripts/png-webp.py --keep-png   # keep PNGs after converting

Safety:
- A PNG is deleted only after its WebP file is written AND reopened successfully.
- If a conversion fails, that PNG is kept and the error is printed.
- An existing .webp with the same name is overwritten.
"""

import argparse
import sys
from pathlib import Path

from PIL import Image

QUALITY = 85   # 0-100; 85 is visually close to lossless for UI screenshots
METHOD = 6     # 0-6; higher = smaller file, slower encode


def convert(png: Path, keep_png: bool) -> tuple[bool, str]:
    webp = png.with_suffix(".webp")
    try:
        with Image.open(png) as img:
            # Keep transparency if present; otherwise store as RGB.
            mode = "RGBA" if "A" in img.getbands() else "RGB"
            img.convert(mode).save(webp, "WEBP", quality=QUALITY, method=METHOD)
    except Exception as exc:
        return False, f"convert failed: {exc}"

    # Verify the WebP can be opened before touching the original.
    try:
        with Image.open(webp) as check:
            check.verify()
        with Image.open(webp) as check:
            if check.size == (0, 0):
                raise ValueError("zero-size image")
    except Exception as exc:
        webp.unlink(missing_ok=True)
        return False, f"verification failed, PNG kept: {exc}"

    if not keep_png:
        png.unlink()
    return True, f"{webp.name} ({webp.stat().st_size / 1024:.0f} KB)"


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert PNG screenshots to WebP.")
    parser.add_argument("folder", nargs="?", default="screens", help="folder to scan (default: screens)")
    parser.add_argument("--keep-png", action="store_true", help="do not delete the PNG files")
    args = parser.parse_args()

    root = Path(args.folder)
    if not root.is_dir():
        print(f"Folder not found: {root.resolve()}")
        return 1

    pngs = sorted(root.rglob("*.png"))
    if not pngs:
        print(f"No PNG files found under {root.resolve()}")
        return 0

    ok, failed = 0, []
    total_before = 0
    total_after = 0
    for png in pngs:
        total_before += png.stat().st_size
        success, message = convert(png, args.keep_png)
        status = "ok" if success else "FAILED"
        print(f"  [{status}] {png.relative_to(root)} -> {message}")
        if success:
            ok += 1
            total_after += (png.with_suffix(".webp")).stat().st_size
        else:
            failed.append(png)

    print()
    print(f"Converted {ok} of {len(pngs)} files.")
    if total_before and total_after:
        saved_mb = (total_before - total_after) / (1024 * 1024)
        print(f"PNG total {total_before / (1024 * 1024):.1f} MB -> WebP total {total_after / (1024 * 1024):.1f} MB "
              f"(saved {saved_mb:.1f} MB)")
    if failed:
        print("Kept these PNGs because conversion failed:")
        for png in failed:
            print(f"  {png}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
