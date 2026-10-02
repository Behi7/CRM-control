import asyncio
from typing import Any, Dict, Optional
import httpx
from fastapi import HTTPException

class CrmClient:
    @staticmethod
    def build_base_url(subdomain: str, base_domain: str) -> str:
        return f"https://{subdomain.strip().lower()}.{base_domain.strip().lower()}"

    @classmethod
    async def request(
        cls,
        subdomain: str,
        base_domain: str,
        token: str,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json_body: Optional[Any] = None,
        retries: int = 3,
    ) -> httpx.Response:
        url = cls.build_base_url(subdomain, base_domain) + path
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "AmoCRM-Analytics-Python/1.0",
        }

        last_exc: Optional[Exception] = None
        for attempt in range(retries):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.request(method, url, headers=headers, params=params, json=json_body)
                    if resp.status_code == 429:
                        retry_after = int(resp.headers.get("Retry-After", "1"))
                        await asyncio.sleep(min(retry_after, 5))
                        continue
                    return resp
            except Exception as e:
                last_exc = e
                await asyncio.sleep(0.5 * (2 ** attempt))

        raise HTTPException(status_code=502, detail=f"Failed to communicate with amoCRM: {str(last_exc)}")
