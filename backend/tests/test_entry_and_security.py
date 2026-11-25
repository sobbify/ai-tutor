from __future__ import annotations

from fastapi.testclient import TestClient

from ai_tutor.config import Settings
from ai_tutor.main import create_app

from .conftest import CSRF, enter, make_settings


def test_entry_sets_httponly_cookie_and_redirects_to_bare_url(client: TestClient) -> None:
    r = client.get("/in", params={"uid": "t-1", "name": "  Priya   Sharma "}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/"
    cookie = r.headers["set-cookie"]
    assert "ai_tutor_session=" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie and "Path=/" in cookie
    assert r.headers["cache-control"] == "no-store" and r.headers["referrer-policy"] == "no-referrer"
    me = client.get("/api/me").json()
    assert me == {"uid": "t-1", "name": "Priya Sharma", "firstName": "Priya"}


def test_entry_rejects_bad_input(client: TestClient) -> None:
    for params in (
        {"uid": "", "name": "A"},
        {"uid": "a b", "name": "A"},
        {"uid": "../x", "name": "A"},
        {"uid": "ok", "name": "<script>"},
        {"uid": "x" * 200, "name": "A"},
    ):
        r = client.get("/in", params=params, follow_redirects=False)
        assert r.status_code == 400, params
        assert "set-cookie" not in r.headers


def test_same_uid_updates_name_and_keeps_progress(client: TestClient) -> None:
    enter(client, "t-2", "Old Name")
    client.post("/api/tutor/moments/morning-greeting/run", json={}, headers=CSRF)
    enter(client, "t-2", "New Name")
    assert client.get("/api/me").json()["name"] == "New Name"
    assert client.get("/api/tutor/progress").json()["moments"][0]["status"] == "in_progress"


def test_no_cookie_means_no_access(client: TestClient) -> None:
    assert client.get("/api/tutor/progress").status_code == 403
    page = client.get("/")
    assert page.status_code == 403 and "Session not available" in page.text


def test_pages_served_with_cookie_and_assets_cached(learner: TestClient) -> None:
    page = learner.get("/moments/morning-greeting")
    assert page.status_code == 200 and "<div id=root>" in page.text and page.headers["cache-control"] == "no-store"
    asset = learner.get("/assets/app.js")
    assert asset.status_code == 200 and "immutable" in asset.headers["cache-control"]
    traversal = learner.get("/assets/..%2F..%2F..%2Fpyproject.toml")
    assert traversal.status_code == 404 and "[project]" not in traversal.text


def test_admin_console_page_loads_without_learner_cookie(client: TestClient) -> None:
    assert client.get("/admin").status_code == 200
    assert client.get("/admin/learners").status_code == 200


def test_csrf_header_required_for_mutations(learner: TestClient) -> None:
    assert learner.post("/api/tutor/moments/morning-greeting/run", json={}).status_code == 403
    assert (
        learner.post(
            "/api/tutor/moments/morning-greeting/run", json={}, headers={**CSRF, "Origin": "https://evil.example"}
        ).status_code
        == 403
    )
    assert (
        learner.post(
            "/api/tutor/moments/morning-greeting/run", json={}, headers={**CSRF, "Origin": "http://testserver"}
        ).status_code
        == 200
    )


def test_security_headers(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.json()["ok"] is True
    for h in ("x-content-type-options", "referrer-policy", "x-frame-options", "permissions-policy", "x-request-id"):
        assert h in r.headers
    assert r.headers["cache-control"] == "no-store"


def test_sign_out_ends_session(learner: TestClient) -> None:
    assert learner.post("/api/signout", headers=CSRF).status_code == 204
    assert learner.get("/api/tutor/progress").status_code == 403


def test_entry_rate_limited(tmp_path) -> None:  # type: ignore[no-untyped-def]
    settings = make_settings(tmp_path, in_per_minute_ip=3)
    with TestClient(create_app(settings)) as c:
        codes = [
            c.get("/in", params={"uid": f"u{i}", "name": "A"}, follow_redirects=False).status_code for i in range(4)
        ]
    assert codes == [303, 303, 303, 429]


def test_secure_cookie_and_hsts_in_production(tmp_path) -> None:  # type: ignore[no-untyped-def]
    settings: Settings = make_settings(tmp_path, environment="production", allow_sqlite_in_production=True)
    with TestClient(create_app(settings), base_url="https://tutor.example") as c:
        r = c.get("/in", params={"uid": "t", "name": "A"}, follow_redirects=False)
        assert "Secure" in r.headers["set-cookie"]
        assert "strict-transport-security" in r.headers
        assert c.get("/api/docs").status_code in (403, 404)


def test_ready_reports_database(client: TestClient) -> None:
    body = client.get("/api/ready").json()
    assert body == {"ok": True, "database": "ok", "database_kind": body["database_kind"], "evaluator": "rules"}
    assert body["database_kind"] in {"sqlite", "postgresql"}  # postgresql when TEST_DATABASE_URL is set


def test_framing_denied_by_default(client: TestClient) -> None:
    r = client.get("/api/health")
    assert r.headers["x-frame-options"] == "DENY" and "frame-ancestors 'none'" in r.headers["content-security-policy"]


def test_embedding_in_host_app(tmp_path) -> None:  # type: ignore[no-untyped-def]
    settings = make_settings(tmp_path, embed_origins="https://host.example")
    with TestClient(create_app(settings), base_url="https://tutor.example") as c:
        r = c.get("/in", params={"uid": "t", "name": "A"}, follow_redirects=False)
        assert "SameSite=none" in r.headers["set-cookie"] and "Secure" in r.headers["set-cookie"]
        assert "x-frame-options" not in r.headers
        assert "frame-ancestors 'self' https://host.example" in r.headers["content-security-policy"]


def test_oversized_request_rejected(learner: TestClient) -> None:
    r = learner.post(
        "/api/tutor/moments/morning-greeting/replies",
        content=b"x",
        headers={**CSRF, "Content-Length": str(50 * 1024 * 1024), "Content-Type": "application/octet-stream"},
    )
    assert r.status_code == 413
