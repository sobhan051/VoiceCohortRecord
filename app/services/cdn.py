"""Server-side CDN proxy with an in-memory cache.

Tailwind and the Vazirmatn font are fetched server-side and cached so the app
works in restricted-network environments. The HTML loads the proxied routes,
not the public CDNs.
"""
import httpx

from app.core.config import get_proxy_url

# url -> fetched text content
_cdn_cache = {}


async def fetch_cdn_resource(url: str):
    if url in _cdn_cache:
        return _cdn_cache[url]

    proxy_url = get_proxy_url()
    transport = httpx.AsyncHTTPTransport(proxy=proxy_url) if proxy_url else None

    try:
        async with httpx.AsyncClient(
            transport=transport,
            follow_redirects=True,       # let httpx handle redirects automatically
            timeout=10.0                 # 10-second timeout
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            content = resp.text
        _cdn_cache[url] = content
        return content
    except Exception as e:
        print(f"WARNING: Failed to fetch CDN resource {url}: {e}")
        # Return empty/fallback content so the page doesn't break
        if url.endswith('.css') or 'vazirmatn' in url:
            return '/* CDN fetch failed */'
        elif url.endswith('.js') or 'tailwindcss' in url:
            return '/* CDN fetch failed */'
        return ''
