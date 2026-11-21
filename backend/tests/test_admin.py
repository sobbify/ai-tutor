from __future__ import annotations

from fastapi.testclient import TestClient

from ai_tutor.config import Settings

from .conftest import ADMIN_PASSWORD, CSRF, add_admin, enter, play_through


def test_admin_api_requires_login(client: TestClient) -> None:
    assert client.get("/api/admin/session").json() == {"username": None}
    assert client.get("/api/admin/stats").status_code == 401
    assert client.get("/api/admin/learners").status_code == 401


def test_learner_cookie_is_not_admin(learner: TestClient) -> None:
    assert learner.get("/api/admin/stats").status_code == 401


def test_login_cookie_flags_and_logout(client: TestClient, settings: Settings) -> None:
    add_admin(settings)
    r = client.post("/api/admin/login", json={"username": "OPS", "password": ADMIN_PASSWORD}, headers=CSRF)
    assert r.status_code == 200 and r.json() == {"username": "ops"}
    cookie = r.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=strict" in cookie and "Path=/api/admin" in cookie
    assert client.get("/api/admin/me").json() == {"username": "ops"}
    assert client.get("/api/admin/session").json() == {"username": "ops"}
    assert client.post("/api/admin/logout", headers=CSRF).status_code == 204
    assert client.get("/api/admin/me").status_code == 401


def test_wrong_password_same_message_and_lockout(tmp_path) -> None:  # type: ignore[no-untyped-def]
    from ai_tutor.main import create_app

    from .conftest import make_settings

    settings = make_settings(tmp_path, lockout_after_failures=3, admin_login_per_minute_ip=100)
    with TestClient(create_app(settings)) as c:
        add_admin(settings)
        bad = [c.post("/api/admin/login", json={"username": "ops", "password": "nope"}, headers=CSRF) for _ in range(3)]
        assert all(r.status_code == 401 and r.json()["detail"] == "Wrong username or password" for r in bad)
        unknown = c.post("/api/admin/login", json={"username": "ghost", "password": "nope"}, headers=CSRF)
        assert unknown.json()["detail"] == "Wrong username or password"
        locked = c.post("/api/admin/login", json={"username": "ops", "password": ADMIN_PASSWORD}, headers=CSRF)
        assert locked.status_code == 401  # locked out even with the right password


def test_login_rate_limited(tmp_path) -> None:  # type: ignore[no-untyped-def]
    from ai_tutor.main import create_app

    from .conftest import make_settings

    with TestClient(create_app(make_settings(tmp_path, admin_login_per_minute_ip=2))) as c:
        codes = [
            c.post("/api/admin/login", json={"username": "x", "password": "y"}, headers=CSRF).status_code
            for _ in range(3)
        ]
    assert codes == [401, 401, 429]


def test_dashboard_learners_replies_and_detail(admin: TestClient) -> None:
    enter(admin, "t-1", "Priya Sharma")
    play_through(admin, "morning-greeting")
    stats = admin.get("/api/admin/stats").json()
    assert stats["kpis"]["learners"] == 1 and stats["kpis"]["repliesTotal"] == 6 and stats["kpis"]["completedRuns"] == 1
    assert stats["kpis"]["accuracyMonth"] == 50.0
    assert len(stats["activity"]) == 30 and stats["activity"][-1]["replies"] == 6
    assert stats["topFixes"][0]["count"] == 1
    assert stats["moments"][0] == {
        "id": "morning-greeting",
        "title": "Morning Greeting at Drop-off",
        "learnersStarted": 1,
        "completions": 1,
        "accuracy": 50.0,
    }

    page = admin.get("/api/admin/learners", params={"q": "pri"}).json()
    assert (
        page["total"] == 1
        and page["items"][0]["uid"] == "t-1"
        and page["items"][0]["replies"] == 6
        and page["items"][0]["momentsDone"] == 1
    )
    assert admin.get("/api/admin/learners", params={"q": "%"}).json()["total"] == 0  # wildcards escaped

    detail = admin.get("/api/admin/learners/t-1").json()
    assert detail["name"] == "Priya Sharma" and len(detail["sessions"]) == 1 and len(detail["recentReplies"]) == 6

    fixes = admin.get("/api/admin/replies", params={"outcome": "fix"}).json()
    assert fixes["total"] == 3 and {r["fixBetter"] for r in fixes["items"]} == {
        "She will settle in quickly.",
        "Sure. Just to confirm: five ml of the cough syrup at eleven o’clock?",
        "A short, happy goodbye works best.",
    }


def test_learner_actions_are_audited(admin: TestClient) -> None:
    enter(admin, "t-9", "Ravi")
    play_through(admin, "morning-greeting")
    assert (
        admin.patch("/api/admin/learners/t-9", json={"name": "Ravi Kumar"}, headers=CSRF).json()["name"] == "Ravi Kumar"
    )
    export = admin.get("/api/admin/learners/t-9/export")
    assert export.headers["content-disposition"].startswith("attachment") and len(export.json()["runs"]) == 1
    assert admin.post("/api/admin/learners/t-9/reset", json={}, headers=CSRF).json() == {"runsDeleted": 1}
    assert admin.post("/api/admin/learners/t-9/signout", headers=CSRF).json() == {"sessionsEnded": 1}
    assert admin.get("/api/tutor/progress").status_code == 403  # the learner was signed out
    assert admin.delete("/api/admin/learners/t-9", headers=CSRF).status_code == 400  # needs confirmation
    assert admin.delete("/api/admin/learners/t-9", params={"confirm": "t-9"}, headers=CSRF).status_code == 204
    assert admin.get("/api/admin/learners/t-9").status_code == 404
    actions = [a["action"] for a in admin.get("/api/admin/audit").json()["items"]]
    for expected in (
        "learner.renamed",
        "learner.exported",
        "learner.progress_reset",
        "learner.signed_out",
        "learner.deleted",
        "admin.login",
    ):
        assert expected in actions


def test_content_editor(admin: TestClient) -> None:
    rows = admin.get("/api/admin/moments").json()
    assert [r["order"] for r in rows] == list(range(1, 10)) and rows[0]["lines"] == 10

    m = admin.get("/api/admin/moments/morning-greeting").json()
    m["turns"][0]["videoUrl"] = "https://cdn.example/ria-1.mp4"
    m["turns"][0]["parentLine"] = "Good morning! Ria is nervous."
    m["order"] = 3  # move it
    saved = admin.put("/api/admin/moments/morning-greeting", json=m, headers=CSRF)
    assert saved.status_code == 200, saved.text
    assert [r["id"] for r in admin.get("/api/admin/moments").json()][:3] == [
        "pickup-update",
        "parent-meeting",
        "morning-greeting",
    ]
    assert admin.get("/api/admin/moments").json()[2]["videos"] == 1

    m["turns"][0]["videoUrl"] = "http://insecure.example/x.mp4"
    assert admin.put("/api/admin/moments/morning-greeting", json=m, headers=CSRF).status_code == 422
    m["turns"][0]["videoUrl"] = None
    m["turns"][1]["id"] = m["turns"][0]["id"]
    assert (
        admin.put("/api/admin/moments/morning-greeting", json=m, headers=CSRF).status_code == 422
    )  # duplicate line ids

    new = {**admin.get("/api/admin/moments/upset-parent").json(), "id": "new-moment", "title": "New", "order": 1}
    new["turns"] = [{**t, "id": f"nm-{i}"} for i, t in enumerate(new["turns"])]
    assert admin.post("/api/admin/moments", json=new, headers=CSRF).status_code == 201
    assert admin.post("/api/admin/moments", json=new, headers=CSRF).status_code == 409
    assert admin.get("/api/admin/moments").json()[0]["id"] == "new-moment"
    clash = {**new, "id": "clash", "turns": [{**new["turns"][0], "id": "mg-2"}]}
    assert admin.post("/api/admin/moments", json=clash, headers=CSRF).status_code == 409
    assert (
        admin.delete("/api/admin/moments/new-moment", params={"confirm": "new-moment"}, headers=CSRF).status_code == 204
    )
    assert [r["order"] for r in admin.get("/api/admin/moments").json()] == list(range(1, 10))

    exported = admin.get("/api/admin/content/export").json()
    assert len(exported["moments"]) == 9
    assert admin.post("/api/admin/content/import", json=exported, headers=CSRF).json() == {"created": 0, "updated": 9}


def test_unpublished_moment_hidden_from_learners(admin: TestClient) -> None:
    m = admin.get("/api/admin/moments/admission-tour").json()
    m["published"] = False
    admin.put("/api/admin/moments/admission-tour", json=m, headers=CSRF)
    enter(admin)
    ids = [x["id"] for x in admin.get("/api/tutor/progress").json()["moments"]]
    assert "admission-tour" not in ids and len(ids) == 7


def test_backup_and_admins(admin: TestClient) -> None:
    enter(admin, "b-1", "Bea")
    play_through(admin, "morning-greeting")
    backup = admin.get("/api/admin/backup").json()
    assert (
        backup["format"] == "ai-tutor-backup"
        and len(backup["learners"]) == 1
        and len(backup["content"]["moments"]) == 9
    )
    assert "passwordHash" not in str(backup) and "password_hash" not in str(backup)

    weak = admin.post("/api/admin/admins", json={"username": "second", "password": "short"}, headers=CSRF)
    assert weak.status_code == 400
    assert (
        admin.post(
            "/api/admin/admins", json={"username": "second", "password": "Another-Strong-77"}, headers=CSRF
        ).status_code
        == 201
    )
    assert [a["username"] for a in admin.get("/api/admin/admins").json()] == ["ops", "second"]
    assert admin.delete("/api/admin/admins/ops", headers=CSRF).status_code == 400  # not yourself
    assert admin.delete("/api/admin/admins/second", headers=CSRF).status_code == 204


def test_change_password_signs_out_other_sessions(admin: TestClient, settings: Settings) -> None:
    from ai_tutor.main import create_app

    with TestClient(create_app(settings)) as other:
        other.post("/api/admin/login", json={"username": "ops", "password": ADMIN_PASSWORD}, headers=CSRF)
        assert other.get("/api/admin/me").status_code == 200
        r = admin.post(
            "/api/admin/me/password",
            json={"currentPassword": ADMIN_PASSWORD, "newPassword": "Brand-New-Pass-42"},
            headers=CSRF,
        )
        assert r.status_code == 204
        assert other.get("/api/admin/me").status_code == 401
        assert admin.get("/api/admin/me").status_code == 200
