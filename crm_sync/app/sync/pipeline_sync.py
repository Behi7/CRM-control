import logging
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from app.models import Pipeline, Stage, AmoUser, CustomFieldDefinition, Account
from app.core.crm_client import crm_client

logger = logging.getLogger("PipelineSync")

async def sync_pipelines_and_stages(
    session: AsyncSession,
    account_id: int,
    subdomain: str,
    base_domain: str,
    token: str,
) -> bool:
    try:
        status, data = await crm_client.request(
            subdomain=subdomain,
            base_domain=base_domain,
            token=token,
            method="GET",
            path="/api/v4/leads/pipelines",
        )

        if status == 401:
            logger.warning(f"Account {account_id} token expired (401)")
            await session.execute(
                update(Account).where(Account.id == account_id).values(token_status="expired")
            )
            await session.commit()
            return False
        if status != 200 or not data:
            logger.error(f"Failed to fetch pipelines for account {account_id}: status={status}")
            return False

        pipes = data.get("_embedded", {}).get("pipelines", [])
        if not pipes and isinstance(data, list):
            pipes = data

        synced_pipe_ext_ids = []

        for p in pipes:
            p_ext = str(p["id"])
            p_name = p.get("name", f"Воронка {p_ext}")
            synced_pipe_ext_ids.append(p_ext)

            stmt = insert(Pipeline).values(
                account_id=account_id,
                external_id=p_ext,
                name=p_name,
                is_archived=False,
            ).on_conflict_do_update(
                index_elements=["account_id", "external_id"],
                set_={"name": p_name, "is_archived": False},
            ).returning(Pipeline.id)

            res = await session.execute(stmt)
            pipeline_id = res.scalar_one()

            # Stages
            statuses = p.get("_embedded", {}).get("statuses", [])
            synced_stage_ext_ids = []
            for s in statuses:
                s_ext = str(s["id"])
                s_name = s.get("name", f"Этап {s_ext}")
                s_sort = s.get("sort") or s.get("sort_order") or 0
                synced_stage_ext_ids.append(s_ext)

                stage_stmt = insert(Stage).values(
                    pipeline_id=pipeline_id,
                    external_id=s_ext,
                    name=s_name,
                    sort_order=s_sort,
                    is_archived=False,
                ).on_conflict_do_update(
                    index_elements=["pipeline_id", "external_id"],
                    set_={"name": s_name, "sort_order": s_sort, "is_archived": False},
                )
                await session.execute(stage_stmt)

            # Mark removed stages as archived
            if synced_stage_ext_ids:
                archive_stages_stmt = (
                    update(Stage)
                    .where(Stage.pipeline_id == pipeline_id)
                    .where(Stage.external_id.not_in(synced_stage_ext_ids))
                    .values(is_archived=True)
                )
                await session.execute(archive_stages_stmt)

        # Mark removed pipelines as archived
        if synced_pipe_ext_ids:
            archive_pipes_stmt = (
                update(Pipeline)
                .where(Pipeline.account_id == account_id)
                .where(Pipeline.external_id.not_in(synced_pipe_ext_ids))
                .values(is_archived=True)
            )
            await session.execute(archive_pipes_stmt)

        # Sync Amo Users (Managers)
        await sync_amo_users(session, account_id, subdomain, base_domain, token)

        # Sync Custom Fields Definitions
        await sync_custom_fields(session, account_id, subdomain, base_domain, token)

        await session.commit()
        logger.info(f"Successfully synced {len(pipes)} pipelines for account {account_id}")
        return True

    except Exception as e:
        logger.error(f"Error in sync_pipelines_and_stages for account {account_id}: {e}", exc_info=True)
        await session.rollback()
        return False


async def sync_amo_users(
    session: AsyncSession,
    account_id: int,
    subdomain: str,
    base_domain: str,
    token: str,
):
    try:
        all_users = []
        MAX_USER_PAGES = 100  # Safety cap: 100 * 250 = 25,000 managers
        page = 1
        last_first_id = None

        while page <= MAX_USER_PAGES:
            status, data = await crm_client.request(
                subdomain=subdomain,
                base_domain=base_domain,
                token=token,
                method="GET",
                path="/api/v4/users",
                params={"page": page, "limit": 250},
            )
            if status == 401:
                logger.warning(f"Account {account_id} token expired (401) during sync_amo_users")
                await session.execute(
                    update(Account).where(Account.id == account_id).values(token_status="expired")
                )
                await session.commit()
                return

            if status != 200 or not data:
                break

            users = data.get("_embedded", {}).get("users", [])
            if not users:
                break

            # Loop detection
            current_first_id = users[0].get("id") if users else None
            if current_first_id and current_first_id == last_first_id:
                logger.warning(f"sync_amo_users: pagination loop detected on page {page} for account {account_id}. Breaking.")
                break
            last_first_id = current_first_id

            all_users.extend(users)
            if len(users) < 250:
                break
            page += 1

        if page > MAX_USER_PAGES:
            logger.warning(f"sync_amo_users hit max pages limit ({MAX_USER_PAGES}) for account {account_id}")

        active_user_ext_ids = []
        for u in all_users:
            u_ext = str(u["id"])
            u_name = u.get("name") or f"Менеджер {u_ext}"
            u_email = u.get("email")
            is_active = u.get("rights", {}).get("is_active", True)
            is_archived = not is_active
            active_user_ext_ids.append(u_ext)

            stmt = insert(AmoUser).values(
                account_id=account_id,
                external_id=u_ext,
                name=u_name,
                email=u_email,
                is_archived=is_archived,
            ).on_conflict_do_update(
                index_elements=["account_id", "external_id"],
                set_={"name": u_name, "email": u_email, "is_archived": is_archived},
            )
            await session.execute(stmt)

        if active_user_ext_ids:
            archive_users_stmt = (
                update(AmoUser)
                .where(AmoUser.account_id == account_id)
                .where(AmoUser.external_id.not_in(active_user_ext_ids))
                .values(is_archived=True)
            )
            await session.execute(archive_users_stmt)

        logger.info(f"Synced {len(all_users)} amo users for account {account_id}")

    except Exception as e:
        logger.error(f"Error in sync_amo_users for account {account_id}: {e}", exc_info=True)
        raise


async def sync_custom_fields(
    session: AsyncSession,
    account_id: int,
    subdomain: str,
    base_domain: str,
    token: str,
):
    try:
        all_fields = []
        MAX_FIELD_PAGES = 100  # Safety cap: 100 * 250 = 25,000 custom fields
        page = 1
        last_first_id = None

        while page <= MAX_FIELD_PAGES:
            status, data = await crm_client.request(
                subdomain=subdomain,
                base_domain=base_domain,
                token=token,
                method="GET",
                path="/api/v4/leads/custom_fields",
                params={"page": page, "limit": 250},
            )
            if status == 401:
                logger.warning(f"Account {account_id} token expired (401) during sync_custom_fields")
                await session.execute(
                    update(Account).where(Account.id == account_id).values(token_status="expired")
                )
                await session.commit()
                return

            if status != 200 or not data:
                break

            fields = data.get("_embedded", {}).get("custom_fields", [])
            if not fields:
                break

            # Loop detection
            current_first_id = fields[0].get("id") if fields else None
            if current_first_id and current_first_id == last_first_id:
                logger.warning(f"sync_custom_fields: pagination loop detected on page {page} for account {account_id}. Breaking.")
                break
            last_first_id = current_first_id

            all_fields.extend(fields)
            if len(fields) < 250:
                break
            page += 1

        if page > MAX_FIELD_PAGES:
            logger.warning(f"sync_custom_fields hit max pages limit ({MAX_FIELD_PAGES}) for account {account_id}")

        active_field_ext_ids = []
        for f in all_fields:
            f_ext = str(f["id"])
            f_name = f.get("name") or f"Поле {f_ext}"
            f_code = f.get("code")
            f_type = f.get("type", "text")
            f_sort = f.get("sort", 0)
            raw_enums = None
            if isinstance(f.get("enums"), list):
                raw_enums = [
                    {"id": e.get("id"), "value": e.get("value"), "sort": e.get("sort", 0)}
                    for e in f["enums"]
                ]
            active_field_ext_ids.append(f_ext)

            stmt = insert(CustomFieldDefinition).values(
                account_id=account_id,
                external_id=f_ext,
                name=f_name,
                code=f_code,
                field_type=f_type,
                sort_order=f_sort,
                enums=raw_enums,
                is_archived=False,
            ).on_conflict_do_update(
                index_elements=["account_id", "external_id"],
                set_={
                    "name": f_name,
                    "code": f_code,
                    "field_type": f_type,
                    "sort_order": f_sort,
                    "enums": raw_enums,
                    "is_archived": False,
                },
            )
            await session.execute(stmt)

        if active_field_ext_ids:
            archive_fields_stmt = (
                update(CustomFieldDefinition)
                .where(CustomFieldDefinition.account_id == account_id)
                .where(CustomFieldDefinition.external_id.not_in(active_field_ext_ids))
                .values(is_archived=True)
            )
            await session.execute(archive_fields_stmt)

        logger.info(f"Synced {len(all_fields)} custom fields for account {account_id}")

    except Exception as e:
        logger.error(f"Error in sync_custom_fields for account {account_id}: {e}", exc_info=True)
        raise
