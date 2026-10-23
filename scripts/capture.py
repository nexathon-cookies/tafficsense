"""
Capture screenshots of every TrafficSense page for desktop and mobile.

Setup (run from the repository root, with the app running on localhost:3000):

    pip install playwright && playwright install chromium
    python scripts/capture.py

Demo passwords are read from supabase/.temp/demo-accounts.json, which
`just db-seed` writes (mode 0600, git-ignored). Nothing needs to be exported.
Output goes to ./screens/<role>/<page>-<width>.png and a summary is printed.
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from playwright.async_api import async_playwright, TimeoutError as PWTimeout

BASE = os.environ.get("APP_URL", "http://localhost:3000")
ACCOUNTS_FILE = Path("supabase/.temp/demo-accounts.json")
OUT = Path("screens")

WIDTHS = {"desktop": (1440, 900), "mobile": (390, 844)}

# Organisation IDs from scripts/seed-demo.mjs
ORG_A = "10000000-0000-4000-8000-000000000001"  # Harbour employer
ORG_B = "10000000-0000-4000-8000-000000000002"  # Junction employer

# (slug, path) pairs for pages that need no sign-in.
PUBLIC_PAGES = [
    ("home", "/"),
    ("planner", "/planner"),
    ("traffic", "/traffic"),
    ("demo", "/demo"),
    ("about", "/about"),
    ("login", "/login"),
    ("register", "/register"),
    ("not-found", "/this-page-does-not-exist"),
]

# Pages per signed-in role. Keys match the labels in the seed output.
ROLE_PAGES = {
    "commuter": ("commuter", [
        ("workspace", "/workspace"),
        ("planner", "/planner"),
        ("traffic", "/traffic"),
        ("access-denied-authority", "/authority"),  # should redirect to /access-denied
    ]),
    "employer-a": ("employer-a", [
        ("employer-list", "/employer"),
        ("employer-org-a", f"/employer/{ORG_A}"),
        ("employer-org-b-denied", f"/employer/{ORG_B}"),
        ("workspace", "/workspace"),
    ]),
    "authority": ("authority", [
        ("authority", "/authority"),
        ("planner", "/planner"),
    ]),
    "admin": ("admin", [
        ("admin", "/admin"),
        ("authority", "/authority"),
    ]),
}


def load_accounts() -> dict:
    """Return {label: {"email": ..., "password": ...}} from the seed output."""
    if not ACCOUNTS_FILE.exists():
        sys.exit(
            f"Missing {ACCOUNTS_FILE}. Run `just db-seed` first; it writes the demo passwords there."
        )
    raw = json.loads(ACCOUNTS_FILE.read_text())
    # Accept either a list of records or a dict keyed by label.
    records = raw if isinstance(raw, list) else [{"label": k, **v} for k, v in raw.items()]
    accounts = {}
    for record in records:
        label = record.get("label") or record.get("name")
        email = record.get("email")
        password = record.get("password")
        if label and email and password:
            accounts[label] = {"email": email, "password": password}
    if not accounts:
        sys.exit(f"{ACCOUNTS_FILE} has no usable accounts. Re-run `just db-seed`.")
    return accounts


async def settle(page):
    """Wait for the page to load. Maps keep network requests open, so do not
    rely only on networkidle; cap the wait and give tiles a moment."""
    try:
        await page.wait_for_load_state("networkidle", timeout=15000)
    except PWTimeout:
        pass
    await page.wait_for_timeout(1500)


async def login(page, account):
    await page.goto(f"{BASE}/login")
    await settle(page)
    await page.get_by_label("Email address").fill(account["email"])
    await page.get_by_label("Password").fill(account["password"])
    await page.get_by_role("button", name="Sign in").click()
    await settle(page)


async def capture(browser, role_dir: str, pages, account=None, results=None):
    for width_name, (w, h) in WIDTHS.items():
        ctx = await browser.new_context(viewport={"width": w, "height": h})
        page = await ctx.new_page()
        try:
            if account:
                await login(page, account)
            for slug, path in pages:
                target = OUT / role_dir / f"{slug}-{width_name}.png"
                target.parent.mkdir(parents=True, exist_ok=True)
                try:
                    await page.goto(BASE + path)
                    await settle(page)
                    await page.screenshot(path=str(target), full_page=True)
                    status = f"ok -> {page.url.replace(BASE, '') or '/'}"
                except Exception as exc:  # keep going so one bad page does not stop the run
                    status = f"FAILED: {exc.__class__.__name__}: {str(exc)[:120]}"
                if results is not None:
                    results.append((f"{role_dir}/{slug} [{width_name}]", status))
                print(f"  {role_dir}/{slug} [{width_name}]: {status}")
        finally:
            await ctx.close()


async def main():
    accounts = load_accounts()
    OUT.mkdir(exist_ok=True)
    results: list[tuple[str, str]] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        print("Public pages")
        await capture(browser, "public", PUBLIC_PAGES, results=results)

        for role_key, (label, pages) in ROLE_PAGES.items():
            if label not in accounts:
                print(f"Skipping {role_key}: no account '{label}' in {ACCOUNTS_FILE}")
                continue
            print(f"Signed in as {role_key}")
            await capture(browser, role_key, pages, account=accounts[label], results=results)

        await browser.close()

    failed = [name for name, status in results if status.startswith("FAILED")]
    print(f"\nDone. {len(results) - len(failed)} captured, {len(failed)} failed. Output: {OUT.resolve()}")
    for name in failed:
        print(f"  failed: {name}")


if __name__ == "__main__":
    asyncio.run(main())
