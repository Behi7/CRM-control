import asyncio
import time
import re
import httpx
from typing import Optional, Dict, Any, Tuple
from app.config import settings

_SAFE_SUBDOMAIN_RE = re.compile(r'^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?$')
_ALLOWED_BASE_DOMAINS = {"amocrm.ru", "amocrm.com", "kommo.com"}

class CrmClient:
    def __init__(self, rps: int = 5):
        self.rps = rps
        self._global_lock = asyncio.Lock()
        self._last_global_time: float = 0.0
        self._min_interval = 1.0 / max(1, rps)
        self._client: Optional[httpx.AsyncClient] = None
        self._client_lock = asyncio.Lock()

    async def _rate_limit(self):
        async with self._global_lock:
            now = time.monotonic()
            elapsed = now - self._last_global_time
            if elapsed < self._min_interval:
                await asyncio.sleep(self._min_interval - elapsed)
            self._last_global_time = time.monotonic()

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            async with self._client_lock:
                if self._client is None or self._client.is_closed:
                    self._client = httpx.AsyncClient(
                        timeout=30.0,
                        limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
                    )
        return self._client

    async def close(self):
        async with self._client_lock:
            if self._client and not self._client.is_closed:
                await self._client.aclose()
                self._client = None

    async def request(
        self,
        subdomain: str,
        base_domain: str,
        token: str,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json_data: Optional[Dict[str, Any]] = None,
        max_retries: int = 3,
    ) -> Tuple[int, Any]:
        if not subdomain or not _SAFE_SUBDOMAIN_RE.match(subdomain):
            raise ValueError(f"Invalid or unsafe subdomain: {subdomain!r}")
        if not base_domain or base_domain not in _ALLOWED_BASE_DOMAINS:
            raise ValueError(f"Disallowed or unsafe base_domain: {base_domain!r}")

        url = f"https://{subdomain}.{base_domain}{path}"
        headers = {
            "Authorization": f"Bearer {token}",
            "User-Agent": "AmoCrm-Analytics-Sync/2.0",
            "Content-Type": "application/json",
        }

        client = await self._get_client()

        for attempt in range(max_retries):
            await self._rate_limit()
            try:
                resp = await client.request(
                    method=method,
                    url=url,
                    headers=headers,
                    params=params,
                    json=json_data,
                )

                if resp.status_code == 429:
                    retry_after_hdr = resp.headers.get("Retry-After")
                    try:
                        wait_sec = float(retry_after_hdr) if retry_after_hdr else 2.0 * (attempt + 1)
                    except Exception:
                        wait_sec = 2.0 * (attempt + 1)
                    await asyncio.sleep(max(wait_sec, 1.5 * (attempt + 1)))
                    continue

                if resp.status_code in (502, 503, 504):
                    if attempt < max_retries - 1:
                        await asyncio.sleep(1.5 * (attempt + 1))
                        continue

                if resp.status_code == 401 and attempt < max_retries - 1:
                    # Transient gateway throttling spike protection
                    await asyncio.sleep(2.0 * (attempt + 1))
                    continue

                if resp.status_code == 204:
                    return 204, None

                data = None
                if resp.status_code < 400:
                    try:
                        data = resp.json()
                    except Exception:
                        data = resp.text
                else:
                    try:
                        data = resp.json()
                    except Exception:
                        data = resp.text

                return resp.status_code, data

            except (httpx.TimeoutException, httpx.NetworkError) as e:
                if attempt == max_retries - 1:
                    return 504, {"error": str(e)}
                await asyncio.sleep(1.5 * (attempt + 1))
            except Exception as e:
                return 500, {"error": str(e)}

        return 500, {"error": "Max retries exceeded"}

crm_client = CrmClient(rps=settings.AMO_CRM_RATE_LIMIT_RPS)
