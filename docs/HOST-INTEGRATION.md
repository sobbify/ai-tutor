# Opening ELSA from Buddy's World

ELSA has no logins for teachers. Buddy's World opens it with a **signed link**, and ELSA turns that
link into a private session cookie, then removes it from the address bar.

## 1. The link

```
https://<elsa-host>/in?uid=<teacher id>&name=<display name>&centre=<centre id>&ts=<unix seconds>&sig=<signature>
```

| Parameter | Required | Rules |
|---|---|---|
| `uid` | yes | Buddy's World's stable ID for the teacher. 1–128 characters: letters, digits, `.` `_` `-` (no `..`). |
| `name` | yes | Her display name, up to 80 characters. ELSA greets her by the first word. |
| `centre` | no | Her centre's ID (same character rules as `uid`). Without it she can't join a practice group. |
| `ts` | yes | The current Unix time in seconds, when the link is made. |
| `sig` | yes | The signature below, as 64 lowercase hex characters. |

Make a fresh link each time she taps ELSA. A link works for **5 minutes**
(`ENTRY_LINK_MAX_AGE_SECONDS`), with a minute's allowance for clock drift.

## 2. The signature

Both sides share one secret, `ENTRY_LINK_SECRET`: 32 or more random characters, kept on the
Buddy's World **server** (never inside the Android app, where it could be extracted).

```
message = uid + "\n" + name + "\n" + (centre or "") + "\n" + ts      (UTF-8, the raw values, before URL-encoding)
sig     = lowercase hex of HMAC-SHA256(key = ENTRY_LINK_SECRET, data = message)
```

Then URL-encode each parameter value as usual.

### Kotlin (server side)

```kotlin
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import java.net.URLEncoder

fun elsaLink(base: String, secret: String, uid: String, name: String, centre: String?): String {
    val ts = System.currentTimeMillis() / 1000
    val message = "$uid\n$name\n${centre ?: ""}\n$ts"
    val mac = Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(secret.toByteArray(), "HmacSHA256")) }
    val sig = mac.doFinal(message.toByteArray()).joinToString("") { "%02x".format(it) }
    fun enc(v: String) = URLEncoder.encode(v, "UTF-8")
    val c = if (centre.isNullOrEmpty()) "" else "&centre=${enc(centre)}"
    return "$base/in?uid=${enc(uid)}&name=${enc(name)}$c&ts=$ts&sig=$sig"
}
```

### Node.js

```js
import crypto from 'node:crypto';

export function elsaLink(base, secret, uid, name, centre) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', secret).update(`${uid}\n${name}\n${centre ?? ''}\n${ts}`).digest('hex');
  const q = new URLSearchParams({ uid, name, ...(centre ? { centre } : {}), ts: String(ts), sig });
  return `${base}/in?${q}`;
}
```

### Python

```python
from ai_tutor.security.links import signed_entry_url  # or copy its 15 lines
url = signed_entry_url("https://elsa.example", SECRET, "t-123", "Priya Sharma", "pune-01")
```

### Testing a link

From the ELSA server (or `docker compose exec app …`):

```
python -m ai_tutor make-link test-teacher Priya --centre pune-01 --base https://elsa.example
```

A bad, edited or expired link shows "This link has expired. Please open ELSA again from Buddy's
World." and sets no cookie. The server logs `entry_rejected` with the reason (`missing`,
`malformed`, `expired`, `bad_signature`), never the teacher's details.

In development (`ENVIRONMENT=development`, no secret set), plain `/in?uid=…&name=…` links work.
Production refuses to start without a secret.

## 3. Showing ELSA

- **In a WebView or Custom Tab:** open the link; ELSA redirects to `/`.
- **In an `<iframe>`:** set `EMBED_ORIGINS=https://<buddys-world-origin>` on ELSA. The session cookie
  then becomes `SameSite=None; Secure`, so ELSA must be served over HTTPS.
- ELSA needs the microphone. In a WebView, grant `RECORD_AUDIO` and allow
  `onPermissionRequest` for audio capture.

## 4. Practice reminders (optional)

Buddy's World can fetch due reminders for its own push notifications:

```
GET /api/host/nudges
Authorization: Bearer <HOST_API_KEY>
```

Off unless `HOST_API_KEY` is set. Reminders follow each teacher's chosen time, on school days only,
and never after 8 pm.
