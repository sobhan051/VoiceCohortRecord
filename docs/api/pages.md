# Pages & CDN

`app/routers/pages.py:1` — HTML page routes + server-side CDN proxy.

## Page routes

All return `FileResponse` from `app/core/config.py:16` `STATIC_DIR` (`<root>/static`).

| Method | Path | Handler | File served | Notes |
|---|---|---|---|---|
| `GET` | `/` | `read_index()` (`pages.py:11`) | `static/signup.html` | Default entry — signup |
| `GET` | `/form` | `questionnaire()` (`pages.py:19`) | `static/index.html` | Main questionnaire UI |
| `GET` | `/signup` | `signup_page()` (`pages.py:24`) | `static/signup.html` | Explicit signup |
| `GET` | `/login` | `login_page()` (`pages.py:29`) | `static/login.html` | Login |
| `GET` | `/dashboard` | `dashboard_page()` (`pages.py:35`) | `static/dashboard.html` | Role-based (user/admin) dashboard |

No auth gate — any visitor can fetch the HTML. The JS inside redirects to `/login` if `localStorage.vcr_user` is missing/invalid.

`app/main.py:26` also mounts the raw static dir:

```python
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
```

So `/static/app.js`, `/static/dashboard.js` etc. are served directly.

---

## CDN proxy

`app/services/cdn.py:1` — in-memory cache + optional proxy.

### `GET /cdn/tailwindcss` — `pages.py:41`

```python
@router.get("/cdn/tailwindcss")
async def tailwind_css():
    content = await fetch_cdn_resource("https://cdn.tailwindcss.com")
    return Response(content, media_type="application/javascript")
```

### `GET /cdn/vazirmatn` — `pages.py:48`

```python
@router.get("/cdn/vazirmatn")
async def vazirmatn_css():
    content = await fetch_cdn_resource(
        "https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css"
    )
    return Response(content, media_type="text/css")
```

### `fetch_cdn_resource(url)` — `cdn.py:15`

- In-memory `_cdn_cache: dict` (`cdn.py:12`) — no TTL, no eviction. Cache lost on restart.
- Resolves proxy via `get_proxy_url()` (`GENAI_PROXY` → `HTTP_PROXY` → `HTTPS_PROXY`).
- `httpx.AsyncClient(transport=AsyncHTTPTransport(proxy=…), follow_redirects=True, timeout=10.0)` (`cdn.py:22`).
- On failure: logs `WARNING: Failed to fetch CDN resource …`, returns `/* CDN fetch failed */` for `.css`/`.js`, `""` otherwise — page still loads but unstyled.

### Current usage — opt-in

`static/index.html:8` currently loads **public CDNs directly**:

```html
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
<link href="https://cdn.jsdelivr.net/npm/@fontsource/vazirmatn@5.2.8/400.min.css">
<!-- <script src="/cdn/tailwindcss"></script>
<link href="/cdn/vazirmatn" rel="stylesheet">  uncomment if proxy needed -->
```

Similarly `dashboard.html:5`, `login.html`, `signup.html`. To enable the proxy (e.g. in restricted networks or HF Spaces behind a proxy), uncomment the proxied lines and remove the public ones.

!!! tip "Restricted networks"
    Set `GENAI_PROXY=http://…` and switch HTML to `/cdn/*` — then Tailwind + font are fetched server-side through the same proxy that Gemini uses.
