import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from sqlalchemy.dialects.postgresql import insert
from models import (
    Lead, Pipeline, Stage, AmoUser, Tag, LeadTag,
    LeadStageHistory, LeadStageSkip, ProcessedCrmEvent
)
from crm_client import crm_client

logger = logging.getLogger("EventSync")

class SyncContext:
    def __init__(self):
        self.pipeline_map: Dict[str, int] = {}
        self.stage_map: Dict[str, int] = {}
        self.stage_objects: Dict[int, Any] = {}
        self.amo_user_map: Dict[str, int] = {}
        self.tag_map: Dict[str, int] = {}

async def build_sync_context(session: AsyncSession, account_id: int) -> SyncContext:
    ctx = SyncContext()

    # Pipelines and stages
    pipes_stmt = select(Pipeline).where(Pipeline.account_id == account_id)
    pipes_res = await session.execute(pipes_stmt)
    pipelines = pipes_res.scalars().all()

    pipe_ids = [p.id for p in pipelines]
    for p in pipelines:
        ctx.pipeline_map[p.external_id] = p.id

    if pipe_ids:
        stages_stmt = select(Stage).where(Stage.pipeline_id.in_(pipe_ids))
        stages_res = await session.execute(stages_stmt)
        stages = stages_res.scalars().all()

        for s in stages:
            ctx.stage_map[f"stage_{s.external_id}"] = s.id
            ctx.stage_objects[s.id] = {
                "id": s.id,
                "pipeline_id": s.pipeline_id,
                "external_id": s.external_id,
                "sort_order": s.sort_order,
                "name": s.name,
            }

    # Amo users
    users_stmt = select(AmoUser).where(AmoUser.account_id == account_id)
    users_res = await session.execute(users_stmt)
    for u in users_res.scalars().all():
        ctx.amo_user_map[u.external_id] = u.id

    # Tags
    tags_stmt = select(Tag).where(Tag.account_id == account_id)
    tags_res = await session.execute(tags_stmt)
    for t in tags_res.scalars().all():
        ctx.tag_map[t.external_id] = t.id

    return ctx


def extract_status_info(v: Any) -> Optional[Dict[str, int]]:
    if not v:
        return None
    if isinstance(v, str):
        try:
            import json
            return extract_status_info(json.loads(v))
        except Exception:
            return None
    if isinstance(v, list):
        for item in v:
            res = extract_status_info(item)
            if res:
                return res
        return None
    if not isinstance(v, dict):
        return None

    lead_status = v.get("lead_status")
    if isinstance(lead_status, dict) and lead_status.get("id") is not None:
        p_id = lead_status.get("pipeline_id")
        return {"status_id": int(lead_status["id"]), "pipeline_id": int(p_id) if p_id is not None else None}

    if v.get("status_id") is not None:
        p_id = v.get("pipeline_id")
        return {"status_id": int(v["status_id"]), "pipeline_id": int(p_id) if p_id is not None else None}

    if v.get("statusId") is not None:
        p_id = v.get("pipelineId")
        return {"status_id": int(v["statusId"]), "pipeline_id": int(p_id) if p_id is not None else None}

    if v.get("pipeline_id") is not None and v.get("id") is not None:
        return {"status_id": int(v["id"]), "pipeline_id": int(v["pipeline_id"])}

    if v.get("value") is not None:
        return extract_status_info(v["value"])

    return None


async def upsert_lead(
    session: AsyncSession,
    account_id: int,
    amo: Dict[str, Any],
    ctx: Optional[SyncContext] = None,
) -> Optional[Lead]:
    try:
        amo_id = str(amo["id"])
        pipe_ext = str(amo.get("pipeline_id", ""))
        stage_ext = str(amo.get("status_id", ""))

        pipeline_id = ctx.pipeline_map.get(pipe_ext) if ctx else None
        if not pipeline_id and pipe_ext:
            stmt = select(Pipeline).where(Pipeline.account_id == account_id, Pipeline.external_id == pipe_ext)
            p_res = await session.execute(stmt)
            p_obj = p_res.scalar_one_or_none()
            if p_obj:
                pipeline_id = p_obj.id
                if ctx:
                    ctx.pipeline_map[pipe_ext] = pipeline_id

        stage_id = ctx.stage_map.get(f"stage_{stage_ext}") if ctx else None
        if not stage_id and stage_ext and pipeline_id:
            st_stmt = select(Stage).where(Stage.pipeline_id == pipeline_id, Stage.external_id == stage_ext)
            st_res = await session.execute(st_stmt)
            st_obj = st_res.scalar_one_or_none()
            if st_obj:
                stage_id = st_obj.id
                if ctx:
                    ctx.stage_map[f"stage_{stage_ext}"] = stage_id

        status = "open"
        closed_at = None
        status_num = amo.get("status_id")
        if status_num == 142:
            status = "won"
            closed_raw = amo.get("closed_at")
            closed_at = datetime.fromtimestamp(closed_raw, tz=timezone.utc) if closed_raw else None
            stage_id = None
        elif status_num == 143:
            status = "lost"
            closed_raw = amo.get("closed_at")
            closed_at = datetime.fromtimestamp(closed_raw, tz=timezone.utc) if closed_raw else None
            stage_id = None

        # Check existing lead status
        lead_stmt = select(Lead).where(Lead.account_id == account_id, Lead.external_id == amo_id)
        lead_res = await session.execute(lead_stmt)
        existing_lead = lead_res.scalar_one_or_none()
        if existing_lead and existing_lead.status == "gone":
            status = "gone"

        # Responsible User
        responsible_user_id = None
        resp_user_ext = str(amo.get("responsible_user_id")) if amo.get("responsible_user_id") else None
        if resp_user_ext:
            if ctx and resp_user_ext in ctx.amo_user_map:
                responsible_user_id = ctx.amo_user_map[resp_user_ext]
            else:
                amo_user_stmt = insert(AmoUser).values(
                    account_id=account_id,
                    external_id=resp_user_ext,
                    name=f"Менеджер {resp_user_ext}",
                    is_archived=False,
                ).on_conflict_do_update(
                    index_elements=["account_id", "external_id"],
                    set_={"is_archived": False},
                ).returning(AmoUser.id)
                u_res = await session.execute(amo_user_stmt)
                responsible_user_id = u_res.scalar_one()
                if ctx:
                    ctx.amo_user_map[resp_user_ext] = responsible_user_id

        # Loss reason
        loss_reason_id = str(amo.get("loss_reason_id")) if amo.get("loss_reason_id") else None
        loss_reason_name = None
        loss_reason_embedded = amo.get("_embedded", {}).get("loss_reason")
        if isinstance(loss_reason_embedded, list) and loss_reason_embedded:
            loss_reason_name = loss_reason_embedded[0].get("name")
        elif isinstance(loss_reason_embedded, dict):
            loss_reason_name = loss_reason_embedded.get("name")

        # Source / Contacts
        embedded_source = amo.get("_embedded", {}).get("source")
        source_id = str(amo.get("source_id")) if amo.get("source_id") is not None else None
        if not source_id and embedded_source and embedded_source.get("id"):
            source_id = str(embedded_source.get("id"))
        source_name = embedded_source.get("name") if embedded_source else None

        contacts = amo.get("_embedded", {}).get("contacts", [])
        main_contact = next((c for c in contacts if c.get("is_main")), None) or (contacts[0] if contacts else None)
        main_contact_id = str(main_contact["id"]) if main_contact and main_contact.get("id") else None

        closest_task_raw = amo.get("closest_task_at")
        closest_task_at = datetime.fromtimestamp(closest_task_raw, tz=timezone.utc) if closest_task_raw and closest_task_raw > 0 else None

        price = amo.get("price")
        price_num = float(price) if price is not None else None

        # Custom fields & UTM
        custom_fields = None
        utm_source = None
        utm_medium = None
        utm_campaign = None
        utm_content = None
        utm_term = None

        cf_values = amo.get("custom_fields_values")
        if isinstance(cf_values, list) and cf_values:
            custom_fields = [
                {
                    "id": cf.get("field_id"),
                    "name": cf.get("field_name"),
                    "code": cf.get("field_code"),
                    "type": cf.get("field_type"),
                    "values": [v.get("value") for v in cf.get("values", [])],
                }
                for cf in cf_values
            ]

            for cf in cf_values:
                key = (cf.get("field_code") or cf.get("field_name") or "").strip().upper()
                vals = cf.get("values", [])
                val = str(vals[0].get("value")).strip() if vals and vals[0].get("value") is not None else None
                if not val:
                    continue
                if key in ("UTM_SOURCE", "ИСТОЧНИК", "SOURCE"):
                    utm_source = utm_source or val
                elif key == "UTM_MEDIUM":
                    utm_medium = utm_medium or val
                elif key == "UTM_CAMPAIGN":
                    utm_campaign = utm_campaign or val
                elif key == "UTM_CONTENT":
                    utm_content = utm_content or val
                elif key == "UTM_TERM":
                    utm_term = utm_term or val

        crm_created_at = datetime.fromtimestamp(amo.get("created_at", 0), tz=timezone.utc)
        crm_updated_at = datetime.fromtimestamp(amo.get("updated_at", amo.get("created_at", 0)), tz=timezone.utc)

        lead_insert_stmt = insert(Lead).values(
            account_id=account_id,
            external_id=amo_id,
            name=amo.get("name"),
            pipeline_id=pipeline_id,
            current_stage_id=stage_id,
            responsible_user_id=responsible_user_id,
            status=status,
            price=price_num,
            crm_created_at=crm_created_at,
            crm_closed_at=closed_at,
            closest_task_at=closest_task_at,
            custom_fields=custom_fields,
            utm_source=utm_source,
            utm_medium=utm_medium,
            utm_campaign=utm_campaign,
            utm_content=utm_content,
            utm_term=utm_term,
            loss_reason_id=loss_reason_id,
            loss_reason_name=loss_reason_name,
            main_contact_id=main_contact_id,
            source_id=source_id,
            source_name=source_name,
            updated_at=crm_updated_at,
        ).on_conflict_do_update(
            index_elements=["account_id", "external_id"],
            set_={
                "name": amo.get("name"),
                "pipeline_id": pipeline_id,
                "current_stage_id": stage_id,
                "responsible_user_id": responsible_user_id,
                "status": status,
                "price": price_num,
                "crm_closed_at": closed_at,
                "closest_task_at": closest_task_at,
                "custom_fields": custom_fields,
                "utm_source": utm_source,
                "utm_medium": utm_medium,
                "utm_campaign": utm_campaign,
                "utm_content": utm_content,
                "utm_term": utm_term,
                "loss_reason_id": loss_reason_id,
                "loss_reason_name": loss_reason_name,
                "main_contact_id": main_contact_id,
                "source_id": source_id,
                "source_name": source_name,
                "updated_at": crm_updated_at,
            },
        ).returning(Lead)

        res = await session.execute(lead_insert_stmt)
        lead = res.scalar_one()

        # Tags
        tags_data = amo.get("_embedded", {}).get("tags", [])
        tag_ids = []
        for t in tags_data:
            t_ext = str(t["id"])
            t_name = t.get("name", f"Тег {t_ext}")
            t_id = ctx.tag_map.get(t_ext) if ctx else None
            if not t_id:
                t_stmt = insert(Tag).values(
                    account_id=account_id,
                    external_id=t_ext,
                    name=t_name,
                    is_archived=False,
                ).on_conflict_do_update(
                    index_elements=["account_id", "external_id"],
                    set_={"name": t_name, "is_archived": False},
                ).returning(Tag.id)
                t_res = await session.execute(t_stmt)
                t_id = t_res.scalar_one()
                if ctx:
                    ctx.tag_map[t_ext] = t_id
            tag_ids.append(t_id)

        # Clear and recreate lead_tags
        await session.execute(delete(LeadTag).where(LeadTag.lead_id == lead.id))
        if tag_ids:
            for tid in set(tag_ids):
                await session.execute(
                    insert(LeadTag).values(lead_id=lead.id, tag_id=tid).on_conflict_do_nothing()
                )

        return lead

    except Exception as e:
        logger.error(f"Error upserting lead {amo.get('id')} for account {account_id}: {e}", exc_info=True)
        return None


async def process_status_changed(
    session: AsyncSession,
    account_id: int,
    subdomain: str,
    base_domain: str,
    token: str,
    event: Dict[str, Any],
    ctx: SyncContext,
):
    ev_id = str(event["id"])
    lead_ext = str(event["entity_id"])
    created_at_sec = event.get("created_at", 0)
    ts = datetime.fromtimestamp(created_at_sec, tz=timezone.utc)

    # Check if event already processed
    ev_stmt = select(ProcessedCrmEvent).where(
        ProcessedCrmEvent.account_id == account_id,
        ProcessedCrmEvent.external_event_id == ev_id,
    )
    if (await session.execute(ev_stmt)).scalar_one_or_none():
        return

    # Find or fetch lead
    lead_stmt = select(Lead).where(Lead.account_id == account_id, Lead.external_id == lead_ext)
    lead = (await session.execute(lead_stmt)).scalar_one_or_none()
    if not lead:
        status, data = await crm_client.request(
            subdomain=subdomain,
            base_domain=base_domain,
            token=token,
            method="GET",
            path=f"/api/v4/leads/{event['entity_id']}",
            params={"with": "tags,contacts,loss_reason"},
        )
        if status == 200 and data:
            lead = await upsert_lead(session, account_id, data, ctx)

    if not lead:
        await session.execute(
            insert(ProcessedCrmEvent).values(
                account_id=account_id,
                external_event_id=ev_id,
                lead_external_id=lead_ext,
                result="skipped_unknown_lead",
            ).on_conflict_do_nothing()
        )
        return

    status_info = extract_status_info(event.get("value_after"))
    status_after = status_info.get("status_id") if status_info else None
    result = "processed"

    # Terminal Won (142) or Lost (143)
    if status_after in (142, 143):
        open_hist_stmt = (
            select(LeadStageHistory)
            .where(LeadStageHistory.lead_id == lead.id, LeadStageHistory.exited_at.is_(None))
            .order_by(LeadStageHistory.entered_at.desc())
        )
        open_hist = (await session.execute(open_hist_stmt)).scalars().first()
        if open_hist:
            dur = max(0, int((ts - open_hist.entered_at).total_seconds()))
            await session.execute(
                update(LeadStageHistory)
                .where(LeadStageHistory.id == open_hist.id)
                .values(exited_at=ts, duration_seconds=dur)
            )

        term_status = "won" if status_after == 142 else "lost"
        await session.execute(
            update(Lead)
            .where(Lead.id == lead.id)
            .values(status=term_status, crm_closed_at=ts, updated_at=ts, current_stage_id=None)
        )
        result = f"closed_{term_status}"

    else:
        # Regular stage
        stage_id = ctx.stage_map.get(f"stage_{status_after}") if status_after else None
        if not stage_id and status_after:
            st_stmt = select(Stage).where(Stage.external_id == str(status_after))
            st_obj = (await session.execute(st_stmt)).scalar_one_or_none()
            if st_obj:
                stage_id = st_obj.id
                ctx.stage_map[f"stage_{status_after}"] = stage_id

        if not stage_id:
            await session.execute(
                insert(ProcessedCrmEvent).values(
                    account_id=account_id,
                    external_event_id=ev_id,
                    lead_external_id=lead_ext,
                    result="skipped_unknown_stage",
                ).on_conflict_do_nothing()
            )
            return

        # Close previous open stage history interval
        open_hist_stmt = (
            select(LeadStageHistory)
            .where(LeadStageHistory.lead_id == lead.id, LeadStageHistory.exited_at.is_(None))
            .order_by(LeadStageHistory.entered_at.desc())
        )
        open_hist = (await session.execute(open_hist_stmt)).scalars().first()

        if open_hist and open_hist.stage_id != stage_id:
            dur = max(0, int((ts - open_hist.entered_at).total_seconds()))
            await session.execute(
                update(LeadStageHistory)
                .where(LeadStageHistory.id == open_hist.id)
                .values(exited_at=ts, duration_seconds=dur)
            )

            # Check for skips
            from_stage = ctx.stage_objects.get(open_hist.stage_id)
            to_stage = ctx.stage_objects.get(stage_id)

            if from_stage and to_stage and from_stage["pipeline_id"] == to_stage["pipeline_id"]:
                diff = to_stage["sort_order"] - from_stage["sort_order"]
                if abs(diff) > 1:
                    dir_str = "forward" if diff > 0 else "backward"
                    lo = min(from_stage["sort_order"], to_stage["sort_order"])
                    hi = max(from_stage["sort_order"], to_stage["sort_order"])

                    # Intermediate stages
                    between_stmt = select(Stage).where(
                        Stage.pipeline_id == from_stage["pipeline_id"],
                        Stage.sort_order > lo,
                        Stage.sort_order < hi,
                        Stage.is_archived.is_(False),
                    )
                    between_stages = (await session.execute(between_stmt)).scalars().all()

                    for sk in between_stages:
                        skip_stmt = insert(LeadStageSkip).values(
                            account_id=account_id,
                            lead_id=lead.id,
                            pipeline_id=from_stage["pipeline_id"],
                            from_stage_id=from_stage["id"],
                            to_stage_id=to_stage["id"],
                            skipped_stage_id=sk.id,
                            transition_at=ts,
                            direction=dir_str,
                            source_event_id=ev_id,
                        ).on_conflict_do_nothing()
                        await session.execute(skip_stmt)

        # Create new open interval
        if not open_hist or open_hist.stage_id != stage_id:
            await session.execute(
                insert(LeadStageHistory).values(
                    lead_id=lead.id,
                    stage_id=stage_id,
                    entered_at=ts,
                    exited_at=None,
                    source_event_id=ev_id,
                )
            )

        # Update lead
        updates = {"current_stage_id": stage_id, "updated_at": ts}
        if lead.status in ("won", "lost"):
            updates["status"] = "open"
            updates["crm_closed_at"] = None
        await session.execute(update(Lead).where(Lead.id == lead.id).values(**updates))

    # Record processed event
    await session.execute(
        insert(ProcessedCrmEvent).values(
            account_id=account_id,
            external_event_id=ev_id,
            lead_external_id=lead_ext,
            result=result,
        ).on_conflict_do_nothing()
    )


async def process_lead_deleted(session: AsyncSession, account_id: int, event: Dict[str, Any]):
    ev_id = str(event["id"])
    lead_ext = str(event["entity_id"])
    created_at_sec = event.get("created_at", 0)
    ts = datetime.fromtimestamp(created_at_sec, tz=timezone.utc)

    lead_stmt = select(Lead).where(Lead.account_id == account_id, Lead.external_id == lead_ext)
    lead = (await session.execute(lead_stmt)).scalar_one_or_none()
    if not lead:
        return

    # Close open stage interval
    open_hist_stmt = (
        select(LeadStageHistory)
        .where(LeadStageHistory.lead_id == lead.id, LeadStageHistory.exited_at.is_(None))
        .order_by(LeadStageHistory.entered_at.desc())
    )
    open_hist = (await session.execute(open_hist_stmt)).scalars().first()
    if open_hist:
        dur = max(0, int((ts - open_hist.entered_at).total_seconds()))
        await session.execute(
            update(LeadStageHistory)
            .where(LeadStageHistory.id == open_hist.id)
            .values(exited_at=ts, duration_seconds=dur)
        )

    await session.execute(
        update(Lead).where(Lead.id == lead.id).values(status="gone", updated_at=ts)
    )

    await session.execute(
        insert(ProcessedCrmEvent).values(
            account_id=account_id,
            external_event_id=ev_id,
            lead_external_id=lead_ext,
            result="deleted",
        ).on_conflict_do_nothing()
    )


async def create_fallback_interval(session: AsyncSession, lead_id: int):
    lead = (await session.execute(select(Lead).where(Lead.id == lead_id))).scalar_one_or_none()
    if not lead or not lead.current_stage_id:
        return

    hist = (await session.execute(
        select(LeadStageHistory).where(LeadStageHistory.lead_id == lead_id)
    )).scalars().first()
    if hist:
        return

    closed = lead.crm_closed_at
    dur = int((closed - lead.crm_created_at).total_seconds()) if closed else None

    await session.execute(
        insert(LeadStageHistory).values(
            lead_id=lead_id,
            stage_id=lead.current_stage_id,
            entered_at=lead.crm_created_at,
            exited_at=closed,
            duration_seconds=dur,
        )
    )
