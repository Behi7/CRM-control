import asyncio
import time
import httpx
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.core.crm_client import CrmClient, _SAFE_SUBDOMAIN_RE, _ALLOWED_BASE_DOMAINS

def test_safe_subdomain_regex():
    # Valid subdomains
    assert _SAFE_SUBDOMAIN_RE.match("company")
    assert _SAFE_SUBDOMAIN_RE.match("my-company-123")
    assert _SAFE_SUBDOMAIN_RE.match("crm")

    # Invalid subdomains
    assert not _SAFE_SUBDOMAIN_RE.match("")
    assert not _SAFE_SUBDOMAIN_RE.match("-company")
    assert not _SAFE_SUBDOMAIN_RE.match("company-")
    assert not _SAFE_SUBDOMAIN_RE.match("company.ru")
    assert not _SAFE_SUBDOMAIN_RE.match("company/path")
    assert not _SAFE_SUBDOMAIN_RE.match("company name")
    assert not _SAFE_SUBDOMAIN_RE.match("a" * 64)  # too long (max 63)

def test_allowed_base_domains():
    assert "amocrm.ru" in _ALLOWED_BASE_DOMAINS
    assert "amocrm.com" in _ALLOWED_BASE_DOMAINS
    assert "kommo.com" in _ALLOWED_BASE_DOMAINS
    assert "evil.com" not in _ALLOWED_BASE_DOMAINS

async def test_crm_client_invalid_subdomain():
    client = CrmClient(rps=10)
    with pytest.raises(ValueError, match="Invalid or unsafe subdomain"):
        await client.request(
            subdomain="invalid_subdomain!",
            base_domain="amocrm.ru",
            token="token",
            method="GET",
            path="/api/v4/leads",
        )

async def test_crm_client_disallowed_base_domain():
    client = CrmClient(rps=10)
    with pytest.raises(ValueError, match="Disallowed or unsafe base_domain"):
        await client.request(
            subdomain="validcrm",
            base_domain="attacker.com",
            token="token",
            method="GET",
            path="/api/v4/leads",
        )

async def test_crm_client_get_and_close():
    client = CrmClient(rps=10)
    http_client = await client._get_client()
    assert isinstance(http_client, httpx.AsyncClient)
    assert not http_client.is_closed

    # Second call returns the same client instance
    http_client2 = await client._get_client()
    assert http_client2 is http_client

    await client.close()
    assert http_client.is_closed
    assert client._client is None

async def test_crm_client_rate_limit():
    client = CrmClient(rps=20)  # 50ms interval
    start = time.monotonic()
    await client._rate_limit()
    await client._rate_limit()
    elapsed = time.monotonic() - start
    assert elapsed >= 0.04  # should be around ~0.05s

async def test_crm_client_successful_json_request():
    client = CrmClient(rps=100)
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"id": 123, "name": "Тестовая сделка"}

    with patch.object(client, "_get_client", new_callable=AsyncMock) as mock_get:
        mock_http = AsyncMock()
        mock_http.request.return_value = mock_resp
        mock_get.return_value = mock_http

        status, data = await client.request(
            subdomain="validcrm",
            base_domain="amocrm.ru",
            token="test-token",
            method="GET",
            path="/api/v4/leads/123",
        )

        assert status == 200
        assert data == {"id": 123, "name": "Тестовая сделка"}
        mock_http.request.assert_called_once_with(
            method="GET",
            url="https://validcrm.amocrm.ru/api/v4/leads/123",
            headers={
                "Authorization": "Bearer test-token",
                "User-Agent": "AmoCrm-Analytics-Sync/2.0",
                "Content-Type": "application/json",
            },
            params=None,
            json=None,
        )

async def test_crm_client_status_204_no_content():
    client = CrmClient(rps=100)
    mock_resp = MagicMock()
    mock_resp.status_code = 204

    with patch.object(client, "_get_client", new_callable=AsyncMock) as mock_get:
        mock_http = AsyncMock()
        mock_http.request.return_value = mock_resp
        mock_get.return_value = mock_http

        status, data = await client.request(
            subdomain="validcrm",
            base_domain="amocrm.ru",
            token="test-token",
            method="GET",
            path="/api/v4/leads",
        )

        assert status == 204
        assert data is None

async def test_crm_client_non_json_response():
    client = CrmClient(rps=100)
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.side_effect = ValueError("Not JSON")
    mock_resp.text = "Plain text response"

    with patch.object(client, "_get_client", new_callable=AsyncMock) as mock_get:
        mock_http = AsyncMock()
        mock_http.request.return_value = mock_resp
        mock_get.return_value = mock_http

        status, data = await client.request(
            subdomain="validcrm",
            base_domain="amocrm.ru",
            token="token",
            method="GET",
            path="/test",
        )
        assert status == 200
        assert data == "Plain text response"

async def test_crm_client_rate_limit_429_retry_success():
    client = CrmClient(rps=100)
    resp_429 = MagicMock()
    resp_429.status_code = 429
    resp_429.headers = {"Retry-After": "0.01"}

    resp_200 = MagicMock()
    resp_200.status_code = 200
    resp_200.json.return_value = {"success": True}

    with patch.object(client, "_get_client", new_callable=AsyncMock) as mock_get:
        mock_http = AsyncMock()
        mock_http.request.side_effect = [resp_429, resp_200]
        mock_get.return_value = mock_http

        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            status, data = await client.request(
                subdomain="validcrm",
                base_domain="amocrm.ru",
                token="token",
                method="GET",
                path="/api/v4/leads",
                max_retries=2,
            )
            assert status == 200
            assert data == {"success": True}
            assert mock_sleep.called

async def test_crm_client_rate_limit_429_exhausted():
    client = CrmClient(rps=100)
    resp_429 = MagicMock()
    resp_429.status_code = 429
    resp_429.headers = {"Retry-After": "0.01"}

    with patch.object(client, "_get_client", new_callable=AsyncMock) as mock_get:
        mock_http = AsyncMock()
        mock_http.request.return_value = resp_429
        mock_get.return_value = mock_http

        with patch("asyncio.sleep", new_callable=AsyncMock):
            status, data = await client.request(
                subdomain="validcrm",
                base_domain="amocrm.ru",
                token="token",
                method="GET",
                path="/api/v4/leads",
                max_retries=2,
            )
            assert status == 429
            assert data == {"error": "Rate limit exceeded"}

async def test_crm_client_502_503_504_retries():
    client = CrmClient(rps=100)
    resp_502 = MagicMock()
    resp_502.status_code = 502

    resp_200 = MagicMock()
    resp_200.status_code = 200
    resp_200.json.return_value = {"recovered": True}

    with patch.object(client, "_get_client", new_callable=AsyncMock) as mock_get:
        mock_http = AsyncMock()
        mock_http.request.side_effect = [resp_502, resp_200]
        mock_get.return_value = mock_http

        with patch("asyncio.sleep", new_callable=AsyncMock):
            status, data = await client.request(
                subdomain="validcrm",
                base_domain="amocrm.ru",
                token="token",
                method="GET",
                path="/test",
                max_retries=2,
            )
            assert status == 200
            assert data == {"recovered": True}

async def test_crm_client_401_transient_retry():
    client = CrmClient(rps=100)
    resp_401 = MagicMock()
    resp_401.status_code = 401
    resp_401.json.return_value = {"error": "unauthorized"}

    resp_200 = MagicMock()
    resp_200.status_code = 200
    resp_200.json.return_value = {"ok": True}

    with patch.object(client, "_get_client", new_callable=AsyncMock) as mock_get:
        mock_http = AsyncMock()
        mock_http.request.side_effect = [resp_401, resp_200]
        mock_get.return_value = mock_http

        with patch("asyncio.sleep", new_callable=AsyncMock):
            status, data = await client.request(
                subdomain="validcrm",
                base_domain="amocrm.ru",
                token="token",
                method="GET",
                path="/test",
                max_retries=2,
            )
            assert status == 200
            assert data == {"ok": True}

async def test_crm_client_timeout_and_network_error():
    client = CrmClient(rps=100)

    with patch.object(client, "_get_client", new_callable=AsyncMock) as mock_get:
        mock_http = AsyncMock()
        mock_http.request.side_effect = httpx.TimeoutException("Connection timed out")
        mock_get.return_value = mock_http

        with patch("asyncio.sleep", new_callable=AsyncMock):
            status, data = await client.request(
                subdomain="validcrm",
                base_domain="amocrm.ru",
                token="token",
                method="GET",
                path="/test",
                max_retries=2,
            )
            assert status == 504
            assert "Connection timed out" in data["error"]

async def test_crm_client_unexpected_exception():
    client = CrmClient(rps=100)

    with patch.object(client, "_get_client", new_callable=AsyncMock) as mock_get:
        mock_http = AsyncMock()
        mock_http.request.side_effect = RuntimeError("Catastrophic error")
        mock_get.return_value = mock_http

        status, data = await client.request(
            subdomain="validcrm",
            base_domain="amocrm.ru",
            token="token",
            method="GET",
            path="/test",
            max_retries=1,
        )
        assert status == 500
        assert data == {"error": "Catastrophic error"}

async def test_crm_client_rate_limit_invalid_retry_after_header():
    client = CrmClient(rps=100)
    resp_429 = MagicMock()
    resp_429.status_code = 429
    resp_429.headers = {"Retry-After": "not-a-number"}

    resp_200 = MagicMock()
    resp_200.status_code = 200
    resp_200.json.return_value = {"ok": True}

    with patch.object(client, "_get_client", new_callable=AsyncMock) as mock_get:
        mock_http = AsyncMock()
        mock_http.request.side_effect = [resp_429, resp_200]
        mock_get.return_value = mock_http

        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            status, data = await client.request(
                subdomain="validcrm",
                base_domain="amocrm.ru",
                token="token",
                method="GET",
                path="/test",
                max_retries=2,
            )
            assert status == 200
            assert mock_sleep.called

async def test_crm_client_error_response_non_json_text():
    client = CrmClient(rps=100)
    resp_500 = MagicMock()
    resp_500.status_code = 500
    resp_500.json.side_effect = ValueError("Not JSON")
    resp_500.text = "Internal Server Error HTML page"

    with patch.object(client, "_get_client", new_callable=AsyncMock) as mock_get:
        mock_http = AsyncMock()
        mock_http.request.return_value = resp_500
        mock_get.return_value = mock_http

        with patch("asyncio.sleep", new_callable=AsyncMock):
            status, data = await client.request(
                subdomain="validcrm",
                base_domain="amocrm.ru",
                token="token",
                method="GET",
                path="/test",
                max_retries=1,
            )
            assert status == 500
            assert data == "Internal Server Error HTML page"

async def test_crm_client_max_retries_loop_exhaustion():
    client = CrmClient(rps=100)
    resp_502 = MagicMock()
    resp_502.status_code = 502

    with patch.object(client, "_get_client", new_callable=AsyncMock) as mock_get:
        mock_http = AsyncMock()
        mock_http.request.return_value = resp_502
        mock_get.return_value = mock_http

        with patch("asyncio.sleep", new_callable=AsyncMock):
            # force loop to finish without returning by setting max_retries
            # where 502 always continues if attempt < max_retries - 1
            # so with max_retries=0 it doesn't loop
            status, data = await client.request(
                subdomain="validcrm",
                base_domain="amocrm.ru",
                token="token",
                method="GET",
                path="/test",
                max_retries=0,
            )
            assert status == 500
            assert data == {"error": "Max retries exceeded"}
