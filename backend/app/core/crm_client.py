import asyncio
import socket
from typing import Any, Dict, Optional
import httpx
from fastapi import HTTPException

# AmoCRM cluster routing fix:
# cfa.trunk.amocrm.ru (Selectel Russia 95.213.161.42, 95.213.201.60) drops HTTPS port 443
# connections originating from foreign/cloud data centers (e.g. Oracle Cloud Frankfurt).
# cfb.trunk.amocrm.ru (88.212.250.100, 23.111.41.254) is AmoCRM's official global Anycast
# proxy that serves *.amocrm.ru with valid wildcard SSL and instant response (~0.1s).
_BLOCKED_AMOCRM_IPS = {"95.213.161.42", "95.213.201.60"}
_AMOCRM_FALLBACK_IP = "88.212.250.100"

_orig_getaddrinfo = socket.getaddrinfo

def _amocrm_safe_getaddrinfo(host, port, *args, **kwargs):
    res = _orig_getaddrinfo(host, port, *args, **kwargs)
    new_res = []
    for r in res:
        family, socktype, proto, canonname, sockaddr = r
        if isinstance(sockaddr, tuple) and len(sockaddr) >= 2 and sockaddr[0] in _BLOCKED_AMOCRM_IPS:
            new_sockaddr = (_AMOCRM_FALLBACK_IP, sockaddr[1]) + sockaddr[2:]
            new_res.append((family, socktype, proto, canonname, new_sockaddr))
        else:
            new_res.append(r)
    return new_res

if socket.getaddrinfo is not _amocrm_safe_getaddrinfo:
    socket.getaddrinfo = _amocrm_safe_getaddrinfo


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
        timeout: float = 30.0,
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
                async with httpx.AsyncClient(timeout=timeout) as client:
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

