"""Tiny server-rendered pages for errors before the React app loads."""

from __future__ import annotations

from html import escape

from fastapi.responses import HTMLResponse

_STYLE = (
    "body{margin:0;min-height:100vh;display:grid;place-items:center;background:#eef3f8;"
    "font-family:Nunito,ui-rounded,system-ui,sans-serif;color:#2c2b2b}"
    "main{max-width:420px;margin:24px;padding:32px;background:#fff;border-radius:24px;"
    "box-shadow:0 6px 24px rgb(31 146 252/.1);text-align:center}"
    "h1{font-size:20px;margin:0 0 8px}p{color:#565656;margin:0}"
)


def message_page(status: int, title: str, body: str) -> HTMLResponse:
    html = (
        "<!doctype html><html lang=en><meta charset=utf-8>"
        "<meta name=viewport content='width=device-width,initial-scale=1'>"
        f"<title>{escape(title)}</title><style>{_STYLE}</style>"
        f"<main role=alert><h1>{escape(title)}</h1><p>{escape(body)}</p></main>"
    )
    return HTMLResponse(html, status_code=status, headers={"Cache-Control": "no-store"})
