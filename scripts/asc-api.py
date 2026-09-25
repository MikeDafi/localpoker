"""
Talk to the App Store Connect API with the same key CI uses to submit builds.

Signing in through the web UI would need an Apple ID password and a 2FA code,
which an agent must never handle. This key is the account's own credential,
already provisioned for this app, and TestFlight tester management is a
first-class part of the same API that uploads the build.
"""

import json
import sys
import time
import urllib.error
import urllib.request

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives import hashes

KEY_ID = "YMUGSZ476Q"
ISSUER_ID = "92c03eb1-db75-47cf-a217-485ede98fb89"
KEY_PATH = "/Users/maskndaf/Downloads/AuthKey_YMUGSZ476Q.p8"
APP_ID = "6815726621"
BASE = "https://api.appstoreconnect.apple.com"


def _b64(raw: bytes) -> str:
    import base64

    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def token() -> str:
    with open(KEY_PATH, "rb") as handle:
        key = serialization.load_pem_private_key(handle.read(), password=None)
    header = {"alg": "ES256", "kid": KEY_ID, "typ": "JWT"}
    now = int(time.time())
    payload = {
        "iss": ISSUER_ID,
        "iat": now,
        # Apple rejects anything longer than 20 minutes.
        "exp": now + 15 * 60,
        "aud": "appstoreconnect-v1",
    }
    signing_input = f"{_b64(json.dumps(header).encode())}.{_b64(json.dumps(payload).encode())}"
    der = key.sign(signing_input.encode(), ec.ECDSA(hashes.SHA256()))
    r, s = decode_dss_signature(der)
    # JWT wants the raw r||s pair, not the DER structure OpenSSL hands back.
    signature = r.to_bytes(32, "big") + s.to_bytes(32, "big")
    return f"{signing_input}.{_b64(signature)}"


def call(method: str, path: str, body=None):
    url = path if path.startswith("http") else f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Authorization", f"Bearer {token()}")
    request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read()
            return response.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as error:
        raw = error.read()
        try:
            return error.code, json.loads(raw)
        except Exception:
            return error.code, {"raw": raw.decode(errors="replace")}


def show(status, payload, label):
    print(f"--- {label}: HTTP {status}")
    if status >= 300:
        for item in payload.get("errors", [{"detail": payload}]):
            print("   ", item.get("title", ""), "|", item.get("detail", item))
    return payload


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "survey"
    if what == "survey":
        status, payload = call("GET", f"/v1/apps/{APP_ID}/betaGroups?limit=50")
        show(status, payload, "beta groups")
        for group in payload.get("data", []):
            attrs = group["attributes"]
            print(f"    id={group['id']} name={attrs.get('name')!r} internal={attrs.get('isInternalGroup')}")

        status, payload = call("GET", "/v1/users?limit=50")
        show(status, payload, "App Store Connect users")
        for user in payload.get("data", []):
            attrs = user["attributes"]
            print(f"    id={user['id']} {attrs.get('username')} roles={attrs.get('roles')}")

        status, payload = call("GET", f"/v1/apps/{APP_ID}/builds?limit=5")
        show(status, payload, "builds")
        for build in payload.get("data", []):
            attrs = build["attributes"]
            print(f"    id={build['id']} v={attrs.get('version')} state={attrs.get('processingState')}")

    if what == "setup":
        email = "maskndafi@gmail.com"
        build_id = sys.argv[2] if len(sys.argv) > 2 else None

        # 1. An internal group, created only if one is not already there.
        status, payload = call("GET", f"/v1/apps/{APP_ID}/betaGroups?limit=50")
        groups = [g for g in payload.get("data", []) if g["attributes"].get("isInternalGroup")]
        if groups:
            group = groups[0]
            print(f"internal group already exists: {group['attributes']['name']} ({group['id']})")
        else:
            status, payload = call("POST", "/v1/betaGroups", {
                "data": {
                    "type": "betaGroups",
                    "attributes": {"name": "Internal Testers", "isInternalGroup": True},
                    "relationships": {"app": {"data": {"type": "apps", "id": APP_ID}}},
                }
            })
            show(status, payload, "create internal group")
            if status >= 300:
                sys.exit(1)
            group = payload["data"]
            print(f"created internal group {group['id']}")
        group_id = group["id"]

        # 2. The tester. Already-present is success, not an error.
        status, payload = call("GET", f"/v1/betaGroups/{group_id}/betaTesters?limit=50")
        existing = [t for t in payload.get("data", [])
                    if (t["attributes"].get("email") or "").lower() == email]
        if existing:
            print(f"{email} is already in the group")
        else:
            status, payload = call("POST", "/v1/betaTesters", {
                "data": {
                    "type": "betaTesters",
                    "attributes": {"email": email, "firstName": "Mike", "lastName": "Dafi"},
                    "relationships": {"betaGroups": {"data": [{"type": "betaGroups", "id": group_id}]}},
                }
            })
            show(status, payload, f"add {email}")
            if status >= 300:
                sys.exit(1)
            print(f"added {email}")

        # 3. The build, so the group actually has something to install.
        if build_id:
            status, payload = call("POST", f"/v1/betaGroups/{group_id}/relationships/builds", {
                "data": [{"type": "builds", "id": build_id}]
            })
            if status >= 300:
                show(status, payload, "assign build")
            else:
                print(f"assigned build {build_id} to the group")

        status, payload = call("GET", f"/v1/betaGroups/{group_id}/betaTesters?limit=50")
        print("group now contains:")
        for tester in payload.get("data", []):
            a = tester["attributes"]
            print(f"    {a.get('email')}  state={a.get('state')}  invite={a.get('inviteType')}")
