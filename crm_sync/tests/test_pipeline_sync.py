import pytest
from unittest.mock import patch, AsyncMock
from sqlalchemy import select
from app.models import Pipeline, Stage, AmoUser, CustomFieldDefinition, Account
from app.sync.pipeline_sync import (
    sync_pipelines_and_stages, sync_amo_users, sync_custom_fields
)

# --- Test sync_pipelines_and_stages ---
async def test_sync_pipelines_and_stages_success(db_session, sample_account):
    api_pipelines = {
        "_embedded": {
            "pipelines": [
                {
                    "id": 11,
                    "name": "Воронка продаж",
                    "_embedded": {
                        "statuses": [
                            {"id": 111, "name": "Этап 1", "sort": 10},
                            {"id": 112, "name": "Этап 2", "sort": 20},
                        ]
                    },
                }
            ]
        }
    }
    api_users = {
        "_embedded": {
            "users": [
                {"id": 501, "name": "Менеджер Алексей", "email": "alex@test.com", "rights": {"is_active": True}}
            ]
        }
    }
    api_fields = {
        "_embedded": {
            "custom_fields": [
                {
                    "id": 901,
                    "name": "Бюджет клиента",
                    "code": "BUDGET",
                    "type": "numeric",
                    "sort": 1,
                    "enums": None,
                }
            ]
        }
    }

    async def mock_request(*args, **kwargs):
        path = kwargs.get("path", "")
        if "pipelines" in path:
            return 200, api_pipelines
        elif "users" in path:
            return 200, api_users
        elif "custom_fields" in path:
            return 200, api_fields
        return 404, None

    with patch("app.sync.pipeline_sync.crm_client.request", side_effect=mock_request):
        ok = await sync_pipelines_and_stages(
            db_session, sample_account.id, sample_account.subdomain,
            sample_account.base_domain, "token"
        )
        assert ok is True

        # Verify pipelines
        pipes = (await db_session.execute(
            select(Pipeline).where(Pipeline.account_id == sample_account.id)
        )).scalars().all()
        assert len(pipes) == 1
        assert pipes[0].external_id == "11"
        assert pipes[0].name == "Воронка продаж"
        assert pipes[0].is_archived is False

        # Verify stages
        stages = (await db_session.execute(
            select(Stage).where(Stage.pipeline_id == pipes[0].id)
        )).scalars().all()
        assert len(stages) == 2
        assert {s.external_id for s in stages} == {"111", "112"}

        # Verify users
        users = (await db_session.execute(
            select(AmoUser).where(AmoUser.account_id == sample_account.id)
        )).scalars().all()
        assert len(users) == 1
        assert users[0].external_id == "501"
        assert users[0].name == "Менеджер Алексей"

        # Verify fields
        fields = (await db_session.execute(
            select(CustomFieldDefinition).where(CustomFieldDefinition.account_id == sample_account.id)
        )).scalars().all()
        assert len(fields) == 1
        assert fields[0].external_id == "901"
        assert fields[0].name == "Бюджет клиента"

async def test_sync_pipelines_and_stages_archives_removed(db_session, sample_account):
    # Setup initial pipeline with 2 stages
    p = Pipeline(account_id=sample_account.id, external_id="11", name="Воронка", is_archived=False)
    p_old = Pipeline(account_id=sample_account.id, external_id="12", name="Старая Воронка", is_archived=False)
    db_session.add_all([p, p_old])
    await db_session.commit()
    await db_session.refresh(p)
    await db_session.refresh(p_old)

    s1 = Stage(pipeline_id=p.id, external_id="111", name="S1", is_archived=False)
    s2 = Stage(pipeline_id=p.id, external_id="112", name="S2 Removed", is_archived=False)
    db_session.add_all([s1, s2])
    await db_session.commit()

    # API returns only p (11) and only s1 (111)
    api_pipelines = {
        "_embedded": {
            "pipelines": [
                {
                    "id": 11,
                    "name": "Воронка",
                    "_embedded": {
                        "statuses": [
                            {"id": 111, "name": "S1", "sort": 10},
                        ]
                    },
                }
            ]
        }
    }

    async def mock_request(*args, **kwargs):
        path = kwargs.get("path", "")
        if "pipelines" in path:
            return 200, api_pipelines
        return 204, None

    with patch("app.sync.pipeline_sync.crm_client.request", side_effect=mock_request):
        ok = await sync_pipelines_and_stages(
            db_session, sample_account.id, sample_account.subdomain,
            sample_account.base_domain, "token"
        )
        assert ok is True

        # Pipeline 12 should now be archived
        await db_session.refresh(p_old)
        assert p_old.is_archived is True

        # Stage 112 should now be archived
        await db_session.refresh(s2)
        assert s2.is_archived is True

        # Stage 111 should NOT be archived
        await db_session.refresh(s1)
        assert s1.is_archived is False

async def test_sync_pipelines_401_expired(db_session, sample_account):
    with patch("app.sync.pipeline_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (401, {"error": "Unauthorized"})

        ok = await sync_pipelines_and_stages(
            db_session, sample_account.id, sample_account.subdomain,
            sample_account.base_domain, "token"
        )
        assert ok is False

        await db_session.refresh(sample_account)
        assert sample_account.token_status == "expired"

async def test_sync_pipelines_api_error(db_session, sample_account):
    with patch("app.sync.pipeline_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (500, {"error": "Server error"})

        ok = await sync_pipelines_and_stages(
            db_session, sample_account.id, sample_account.subdomain,
            sample_account.base_domain, "token"
        )
        assert ok is False


# --- Test sync_amo_users ---
async def test_sync_amo_users_pagination_and_loop_detection(db_session, sample_account):
    page_1 = {
        "_embedded": {
            "users": [{"id": i, "name": f"User {i}", "rights": {"is_active": True}} for i in range(1, 251)]
        }
    }
    # Page 2 returns same first user to simulate loop
    page_2 = {
        "_embedded": {
            "users": [{"id": 1, "name": "User 1", "rights": {"is_active": True}}]
        }
    }

    with patch("app.sync.pipeline_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.side_effect = [
            (200, page_1),
            (200, page_2),
        ]

        ok = await sync_amo_users(
            db_session, sample_account.id, sample_account.subdomain,
            sample_account.base_domain, "token"
        )
        assert ok is True

        users = (await db_session.execute(
            select(AmoUser).where(AmoUser.account_id == sample_account.id)
        )).scalars().all()
        assert len(users) == 250

async def test_sync_amo_users_401(db_session, sample_account):
    with patch("app.sync.pipeline_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (401, None)
        ok = await sync_amo_users(
            db_session, sample_account.id, sample_account.subdomain,
            sample_account.base_domain, "token"
        )
        assert ok is False
        await db_session.refresh(sample_account)
        assert sample_account.token_status == "expired"


# --- Test sync_custom_fields ---
async def test_sync_custom_fields_with_enums_and_archive(db_session, sample_account):
    # Initial field
    cf_old = CustomFieldDefinition(
        account_id=sample_account.id,
        external_id="cf_old",
        name="Удаленное поле",
        field_type="text",
        is_archived=False,
    )
    db_session.add(cf_old)
    await db_session.commit()

    fields_data = {
        "_embedded": {
            "custom_fields": [
                {
                    "id": 7001,
                    "name": "Источник лида",
                    "code": "LEAD_SRC",
                    "type": "select",
                    "sort": 10,
                    "enums": [
                        {"id": 1, "value": "Звонок", "sort": 1},
                        {"id": 2, "value": "Заявка", "sort": 2},
                    ],
                }
            ]
        }
    }

    with patch("app.sync.pipeline_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (200, fields_data)
        ok = await sync_custom_fields(
            db_session, sample_account.id, sample_account.subdomain,
            sample_account.base_domain, "token"
        )
        assert ok is True

        # Check new field
        cf_new = (await db_session.execute(
            select(CustomFieldDefinition).where(
                CustomFieldDefinition.account_id == sample_account.id,
                CustomFieldDefinition.external_id == "7001",
            )
        )).scalar_one()
        assert cf_new.name == "Источник лида"
        assert len(cf_new.enums) == 2

        # Check old field archived
        await db_session.refresh(cf_old)
        assert cf_old.is_archived is True

async def test_sync_custom_fields_401(db_session, sample_account):
    with patch("app.sync.pipeline_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (401, None)
        ok = await sync_custom_fields(
            db_session, sample_account.id, sample_account.subdomain,
            sample_account.base_domain, "token"
        )
        assert ok is False
        await db_session.refresh(sample_account)
        assert sample_account.token_status == "expired"
