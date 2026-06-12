"""Test e2e temporaire : génère un JWT (secret dev) et appelle l'endpoint Spring IA."""
import base64
import hashlib
import hmac
import json
import time
import urllib.request

SECRET_B64 = "WkB3cVhuRlBLdVZ2dDVCRjlUSGYyUUpBYUhzeUZNNlViQUJFMlFLZlBvPQ=="
KEY = base64.b64decode(SECRET_B64)
BASE = "http://localhost:8081"


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def make_jwt(role: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "sub": "test.manager@rh.com",
        "role": role,
        "userId": 1,
        "employeeId": 1,
        "iat": now,
        "exp": now + 3600,
    }
    seg = b64url(json.dumps(header, separators=(",", ":")).encode()) + "." + \
          b64url(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(KEY, seg.encode(), hashlib.sha256).digest()
    return seg + "." + b64url(sig)


def call(path: str, token: str):
    req = urllib.request.Request(BASE + path, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def main():
    token = make_jwt("MANAGER")
    for emp in (19, 1, 11):
        status, body = call(f"/api/predictions/absenteisme/{emp}", token)
        print(f"GET /api/predictions/absenteisme/{emp} -> HTTP {status}")
        try:
            data = json.loads(body)
            print(f"   risk_level={data.get('riskLevel')} proba={data.get('riskProba')} label={data.get('riskLabel')}")
        except Exception:
            print(f"   {body[:300]}")
    # Test sans token (doit être 401/403)
    req = urllib.request.Request(BASE + "/api/predictions/absenteisme/1")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"Sans token -> HTTP {resp.status}")
    except urllib.error.HTTPError as e:
        print(f"Sans token -> HTTP {e.code} (sécurité OK)")


if __name__ == "__main__":
    main()
