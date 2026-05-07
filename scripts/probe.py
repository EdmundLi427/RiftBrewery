#!/usr/bin/env python3
"""Print a real card and a real set as JSON so we can verify field shape."""
import json
from curl_cffi import requests

s = requests.Session(impersonate="chrome120")

print("=== /sets sample ===")
r = s.get("https://api.riftcodex.com/sets?page=1&size=2", timeout=30)
body = r.json()
print(f"top-level keys: {list(body.keys())}")
if body.get("items"):
    print(json.dumps(body["items"][0], indent=2))

print("\n=== /cards sample ===")
r = s.get("https://api.riftcodex.com/cards?page=1&size=2", timeout=30)
body = r.json()
print(f"top-level keys: {list(body.keys())}")
if body.get("items"):
    print(json.dumps(body["items"][0], indent=2))
