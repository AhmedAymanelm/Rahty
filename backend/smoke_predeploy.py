#!/usr/bin/env python3
"""Unified pre-deploy smoke checks for Railway/GitHub.

Usage:
  API_BASE="https://your-app.up.railway.app/api" python3 backend/smoke_predeploy.py

Optional env vars:
  SMOKE_USERNAME (default: admin)
  SMOKE_PASSWORD (default: admin123)
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request


API_BASE = os.getenv("API_BASE", "http://127.0.0.1:8000/api").rstrip("/")
SMOKE_USERNAME = os.getenv("SMOKE_USERNAME", "admin")
SMOKE_PASSWORD = os.getenv("SMOKE_PASSWORD", "admin123")


def request_json(path: str, method: str = "GET", token: str | None = None, payload: dict | None = None):
    url = f"{API_BASE}{path}"
    body = None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(url=url, method=method, data=body, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode("utf-8")
            data = json.loads(raw) if raw else {}
            return resp.status, data
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8") if exc.fp else ""
        try:
            data = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            data = {"detail": raw or str(exc)}
        return exc.code, data


def check(name: str, ok: bool, detail: str):
    icon = "PASS" if ok else "FAIL"
    print(f"[{icon}] {name}: {detail}")
    return ok


def main() -> int:
    print(f"Running smoke checks against: {API_BASE}")
    all_ok = True

    status, health = request_json("/health")
    all_ok &= check(
        "health endpoint",
        status == 200 and health.get("status") == "running",
        f"http={status}, body={health}",
    )

    status, login = request_json(
        "/auth/login",
        method="POST",
        payload={"username": SMOKE_USERNAME, "password": SMOKE_PASSWORD},
    )
    token = login.get("access_token") if isinstance(login, dict) else None
    all_ok &= check(
        "auth login",
        status == 200 and bool(token),
        f"http={status}, token={'yes' if token else 'no'}",
    )

    if not token:
        print("Smoke aborted: cannot continue without auth token.")
        return 1

    status, me = request_json("/auth/me", token=token)
    all_ok &= check(
        "auth me",
        status == 200 and bool(me.get("id")) and bool(me.get("role")),
        f"http={status}, user={me.get('username')}, role={me.get('role')}",
    )

    status, hotels = request_json("/hotels", token=token)
    is_hotels_ok = status == 200 and isinstance(hotels, list) and len(hotels) >= 1
    all_ok &= check(
        "hotels list",
        is_hotels_ok,
        f"http={status}, count={len(hotels) if isinstance(hotels, list) else 'n/a'}",
    )

    if is_hotels_ok:
        hid = hotels[0].get("id")
        status, attendance = request_json(f"/dashboard/attendance?hotel_id={hid}", token=token)
        all_ok &= check(
            "attendance list",
            status == 200 and isinstance(attendance, list),
            f"http={status}, rows={len(attendance) if isinstance(attendance, list) else 'n/a'}",
        )

        status, overview = request_json(f"/dashboard/overview?hotel_id={hid}", token=token)
        all_ok &= check(
            "dashboard overview",
            status == 200 and isinstance(overview, dict) and "faults" in overview,
            f"http={status}, keys={list(overview.keys())[:5] if isinstance(overview, dict) else 'n/a'}",
        )

    print("Smoke result:", "READY" if all_ok else "NOT READY")
    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(main())
