import json
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, AsyncMock
from sqlalchemy import select, update
from app.models import (
    Account, Pipeline, Stage, Lead, LeadStageHistory, LeadStageSkip,
    Tag, LeadTag, AmoUser, ProcessedCrmEvent
)
from app.sync.event_sync import (
    SyncContext, build_sync_context, extract_status_info,
    upsert_lead, process_status_changed, process_lead_deleted,
    process_lead_restored, create_fallback_interval, cleanup_old_events
)

# --- Test extract_status_info ---
def test_extract_status_info_none_or_empty():
    assert extract_status_info(None) is None
    assert extract_status_info("") is None
    assert extract_status_info({}) is None
    assert extract_status_info(12345) is None

def test_extract_status_info_json_string():
    raw = json.dumps({"status_id": 142, "pipeline_id": 55})
    res = extract_status_info(raw)
    assert res == {"status_id": 142, "pipeline_id": 55}

def test_extract_status_info_invalid_json_string():
    assert extract_status_info("invalid-json") is None

def test_extract_status_info_list():
    raw = [{"other": 1}, {"status_id": 10, "pipeline_id": 20}]
    res = extract_status_info(raw)
    assert res == {"status_id": 10, "pipeline_id": 20}
    assert extract_status_info([{"none": 1}]) is None

def test_extract_status_info_lead_status_dict():
    raw = {"lead_status": {"id": 100, "pipeline_id": 200}}
    assert extract_status_info(raw) == {"status_id": 100, "pipeline_id": 200}

def test_extract_status_info_statusId_camel_case():
    raw = {"statusId": 143, "pipelineId": 33}
    assert extract_status_info(raw) == {"status_id": 143, "pipeline_id": 33}

def test_extract_status_info_id_and_pipeline_id():
    raw = {"id": 15, "pipeline_id": 25}
    assert extract_status_info(raw) == {"status_id": 15, "pipeline_id": 25}

def test_extract_status_info_nested_value():
    raw = {"value": {"status_id": 88, "pipeline_id": 99}}
    assert extract_status_info(raw) == {"status_id": 88, "pipeline_id": 99}


# --- Test build_sync_context ---
async def test_build_sync_context(db_session, sample_account):
    pipe = Pipeline(account_id=sample_account.id, external_id="p10", name="P10")
    db_session.add(pipe)
    await db_session.commit()
    await db_session.refresh(pipe)

    st1 = Stage(pipeline_id=pipe.id, external_id="st101", name="Stage 1", sort_order=10)
    st2 = Stage(pipeline_id=pipe.id, external_id="st102", name="Stage 2", sort_order=20)
    user = AmoUser(account_id=sample_account.id, external_id="u50", name="Менеджер 50")
    tag = Tag(account_id=sample_account.id, external_id="t5", name="Тег 5")
    db_session.add_all([st1, st2, user, tag])
    await db_session.commit()

    ctx = await build_sync_context(db_session, sample_account.id)
    assert ctx.pipeline_map["p10"] == pipe.id
    assert ctx.stage_map["stage_st101"] == st1.id
    assert ctx.stage_objects[st1.id]["sort_order"] == 10
    assert ctx.stage_objects[st1.id]["name"] == "Stage 1"
    assert ctx.amo_user_map["u50"] == user.id
    assert ctx.tag_map["t5"] == tag.id


# --- Test upsert_lead ---
async def test_upsert_lead_create_and_update(db_session, sample_account):
    pipe = Pipeline(account_id=sample_account.id, external_id="p_upsert", name="Pipeline")
    db_session.add(pipe)
    await db_session.commit()
    await db_session.refresh(pipe)

    st = Stage(pipeline_id=pipe.id, external_id="st_upsert", name="Stage", sort_order=1)
    db_session.add(st)
    await db_session.commit()
    await db_session.refresh(st)

    ctx = await build_sync_context(db_session, sample_account.id)

    amo_data = {
        "id": 1001,
        "name": "Новая сделка из Amo",
        "pipeline_id": "p_upsert",
        "status_id": "st_upsert",
        "price": 250000,
        "responsible_user_id": "99",
        "closest_task_at": 1700000000,
        "created_at": 1690000000,
        "updated_at": 1690005000,
        "_embedded": {
            "tags": [{"id": 77, "name": "B2B"}],
            "contacts": [{"id": 888, "is_main": True}],
            "source": {"id": 10, "name": "Сайт"},
            "loss_reason": [{"name": "Дорого"}],
        },
        "custom_fields_values": [
            {
                "field_id": 1,
                "field_code": "UTM_SOURCE",
                "field_name": "UTM Source",
                "values": [{"value": "google"}],
            },
            {
                "field_id": 2,
                "field_code": "UTM_MEDIUM",
                "values": [{"value": "cpc"}],
            },
            {
                "field_id": 3,
                "field_code": "UTM_CAMPAIGN",
                "values": [{"value": "search"}],
            },
            {
                "field_id": 4,
                "field_code": "UTM_CONTENT",
                "values": [{"value": "ad1"}],
            },
            {
                "field_id": 5,
                "field_code": "UTM_TERM",
                "values": [{"value": "crm"}],
            },
        ],
    }

    lead = await upsert_lead(db_session, sample_account.id, amo_data, ctx)
    assert lead is not None
    assert lead.external_id == "1001"
    assert lead.name == "Новая сделка из Amo"
    assert float(lead.price) == 250000.0
    assert lead.status == "open"
    assert lead.utm_source == "google"
    assert lead.utm_medium == "cpc"
    assert lead.utm_campaign == "search"
    assert lead.utm_content == "ad1"
    assert lead.utm_term == "crm"
    assert lead.main_contact_id == "888"
    assert lead.source_name == "Сайт"
    assert lead.loss_reason_name == "Дорого"

    # Verify tags
    tags_res = await db_session.execute(
        select(Tag).join(LeadTag, Tag.id == LeadTag.tag_id).where(LeadTag.lead_id == lead.id)
    )
    tags = tags_res.scalars().all()
    assert len(tags) == 1
    assert tags[0].name == "B2B"

    # Now update the lead
    amo_data["name"] = "Обновленная сделка"
    amo_data["price"] = 300000
    amo_data["_embedded"]["tags"] = [{"id": 78, "name": "VIP"}]

    lead_updated = await upsert_lead(db_session, sample_account.id, amo_data, ctx)
    await db_session.refresh(lead_updated)
    assert lead_updated.name == "Обновленная сделка"
    assert float(lead_updated.price) == 300000.0

    # Verify tag replaced
    tags_res2 = await db_session.execute(
        select(Tag).join(LeadTag, Tag.id == LeadTag.tag_id).where(LeadTag.lead_id == lead.id)
    )
    tags2 = tags_res2.scalars().all()
    assert len(tags2) == 1
    assert tags2[0].name == "VIP"

async def test_upsert_lead_terminal_status_won_and_lost(db_session, sample_account):
    ctx = await build_sync_context(db_session, sample_account.id)
    amo_won = {
        "id": 2001,
        "name": "Выигранная сделка",
        "status_id": 142,
        "closed_at": 1700001000,
    }
    lead_won = await upsert_lead(db_session, sample_account.id, amo_won, ctx)
    assert lead_won.status == "won"
    assert lead_won.current_stage_id is None
    assert lead_won.crm_closed_at is not None

    amo_lost = {
        "id": 2002,
        "name": "Проигранная сделка",
        "status_id": 143,
        "closed_at": 1700002000,
    }
    lead_lost = await upsert_lead(db_session, sample_account.id, amo_lost, ctx)
    assert lead_lost.status == "lost"
    assert lead_lost.current_stage_id is None
    assert lead_lost.crm_closed_at is not None


# --- Test process_status_changed ---
async def test_process_status_changed_stage_transitions_and_skips(db_session, sample_account):
    now = datetime.now(timezone.utc)
    pipe = Pipeline(account_id=sample_account.id, external_id="500", name="Sales")
    db_session.add(pipe)
    await db_session.commit()
    await db_session.refresh(pipe)

    # 4 stages: sort orders 10, 20, 30, 40
    st1 = Stage(pipeline_id=pipe.id, external_id="101", name="Новая", sort_order=10)
    st2 = Stage(pipeline_id=pipe.id, external_id="102", name="Квалификация", sort_order=20)
    st3 = Stage(pipeline_id=pipe.id, external_id="103", name="КП отправлено", sort_order=30)
    st4 = Stage(pipeline_id=pipe.id, external_id="104", name="Договор", sort_order=40)
    db_session.add_all([st1, st2, st3, st4])
    await db_session.commit()

    ctx = await build_sync_context(db_session, sample_account.id)

    # Create lead initially in Stage 1 (101)
    lead = Lead(
        account_id=sample_account.id,
        external_id="lead_100",
        name="Сделка с пропусками",
        pipeline_id=pipe.id,
        current_stage_id=st1.id,
        status="open",
        crm_created_at=now - timedelta(days=2),
        updated_at=now - timedelta(days=2),
    )
    db_session.add(lead)
    await db_session.commit()
    await db_session.refresh(lead)

    # Initial history record for st1
    hist = LeadStageHistory(
        lead_id=lead.id,
        stage_id=st1.id,
        entered_at=now - timedelta(days=2),
        exited_at=None,
    )
    db_session.add(hist)
    await db_session.commit()

    # Event: Lead moves directly from Stage 1 (sort 10) to Stage 4 (sort 40), skipping 2 and 3!
    event = {
        "id": "ev_jump_forward",
        "entity_id": "lead_100",
        "created_at": int(now.timestamp()),
        "value_after": [{"lead_status": {"id": 104, "pipeline_id": int(pipe.external_id)}}],
    }

    await process_status_changed(
        db_session, sample_account.id, sample_account.subdomain,
        sample_account.base_domain, "token", event, ctx
    )

    # Check that previous history was closed
    hist_prev = (await db_session.execute(
        select(LeadStageHistory).where(LeadStageHistory.id == hist.id)
    )).scalar_one()
    assert hist_prev.exited_at is not None
    assert hist_prev.duration_seconds is not None

    # Check that new history was opened
    hist_new = (await db_session.execute(
        select(LeadStageHistory).where(LeadStageHistory.lead_id == lead.id, LeadStageHistory.stage_id == st4.id)
    )).scalar_one()
    assert hist_new.exited_at is None

    # Check that stage skips were recorded for intermediate stages (st2 and st3)
    skips_res = await db_session.execute(
        select(LeadStageSkip).where(LeadStageSkip.lead_id == lead.id)
    )
    skips = skips_res.scalars().all()
    assert len(skips) == 2
    skipped_ids = {s.skipped_stage_id for s in skips}
    assert skipped_ids == {st2.id, st3.id}
    assert all(s.direction == "forward" for s in skips)

    # Check deduplication: running same event again is a no-op
    await process_status_changed(
        db_session, sample_account.id, sample_account.subdomain,
        sample_account.base_domain, "token", event, ctx
    )
    events_count = (await db_session.execute(
        select(ProcessedCrmEvent).where(ProcessedCrmEvent.external_event_id == "ev_jump_forward")
    )).scalars().all()
    assert len(events_count) == 1
    assert events_count[0].result == "processed"

async def test_process_status_changed_terminal_won_and_lost(db_session, sample_account):
    now = datetime.now(timezone.utc)
    pipe = Pipeline(account_id=sample_account.id, external_id="p_term", name="P")
    db_session.add(pipe)
    await db_session.commit()
    await db_session.refresh(pipe)

    st1 = Stage(pipeline_id=pipe.id, external_id="201", name="В работе", sort_order=10)
    db_session.add(st1)
    await db_session.commit()
    await db_session.refresh(st1)

    ctx = await build_sync_context(db_session, sample_account.id)

    lead = Lead(
        account_id=sample_account.id,
        external_id="lead_term",
        name="Терминальная сделка",
        pipeline_id=pipe.id,
        current_stage_id=st1.id,
        status="open",
        crm_created_at=now - timedelta(hours=5),
        updated_at=now - timedelta(hours=5),
    )
    db_session.add(lead)
    await db_session.commit()

    # Move to Won (142)
    ev_won = {
        "id": "ev_won_1",
        "entity_id": "lead_term",
        "created_at": int(now.timestamp()),
        "value_after": [{"lead_status": {"id": 142}}],
    }
    await process_status_changed(
        db_session, sample_account.id, sample_account.subdomain,
        sample_account.base_domain, "token", ev_won, ctx
    )

    await db_session.refresh(lead)
    assert lead.status == "won"
    assert lead.current_stage_id is None
    assert lead.crm_closed_at is not None

    # Reopening deal: new event later than closed_at moving to st1
    later = now + timedelta(hours=1)
    ev_reopen = {
        "id": "ev_reopen_1",
        "entity_id": "lead_term",
        "created_at": int(later.timestamp()),
        "value_after": [{"lead_status": {"id": 201}}],
    }
    await process_status_changed(
        db_session, sample_account.id, sample_account.subdomain,
        sample_account.base_domain, "token", ev_reopen, ctx
    )

    await db_session.refresh(lead)
    assert lead.status == "open"
    assert lead.current_stage_id == st1.id
    assert lead.crm_closed_at is None

async def test_process_status_changed_missing_lead_fetched_via_api(db_session, sample_account):
    ctx = await build_sync_context(db_session, sample_account.id)

    api_lead_response = {
        "id": 9999,
        "name": "Сделка из API",
        "price": 100000,
        "created_at": 1690000000,
    }

    event = {
        "id": "ev_missing_lead",
        "entity_id": "9999",
        "created_at": 1690001000,
        "value_after": [{"lead_status": {"id": 142}}],
    }

    with patch("app.sync.event_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (200, api_lead_response)

        await process_status_changed(
            db_session, sample_account.id, sample_account.subdomain,
            sample_account.base_domain, "token", event, ctx
        )

        lead = (await db_session.execute(
            select(Lead).where(Lead.external_id == "9999")
        )).scalar_one_or_none()
        assert lead is not None
        assert lead.name == "Сделка из API"

async def test_process_status_changed_api_transient_error_postpones(db_session, sample_account):
    ctx = await build_sync_context(db_session, sample_account.id)
    event = {
        "id": "ev_transient_fail",
        "entity_id": "8888",
        "created_at": 1690001000,
        "value_after": [{"lead_status": {"id": 142}}],
    }

    with patch("app.sync.event_sync.crm_client.request", new_callable=AsyncMock) as mock_req:
        mock_req.return_value = (504, {"error": "gateway timeout"})

        await process_status_changed(
            db_session, sample_account.id, sample_account.subdomain,
            sample_account.base_domain, "token", event, ctx
        )

        # Event should NOT be marked in ProcessedCrmEvent so it can be retried
        ev_row = (await db_session.execute(
            select(ProcessedCrmEvent).where(ProcessedCrmEvent.external_event_id == "ev_transient_fail")
        )).scalar_one_or_none()
        assert ev_row is None

async def test_process_status_changed_unknown_stage(db_session, sample_account):
    ctx = await build_sync_context(db_session, sample_account.id)
    lead = Lead(
        account_id=sample_account.id,
        external_id="lead_unk_st",
        crm_created_at=datetime.now(timezone.utc),
    )
    db_session.add(lead)
    await db_session.commit()

    event = {
        "id": "ev_unk_st",
        "entity_id": "lead_unk_st",
        "created_at": int(datetime.now(timezone.utc).timestamp()),
        "value_after": [{"lead_status": {"id": 999999}}],
    }
    await process_status_changed(
        db_session, sample_account.id, sample_account.subdomain,
        sample_account.base_domain, "token", event, ctx
    )

    ev_row = (await db_session.execute(
        select(ProcessedCrmEvent).where(ProcessedCrmEvent.external_event_id == "ev_unk_st")
    )).scalar_one()
    assert ev_row.result == "skipped_unknown_stage"


# --- Test process_lead_deleted and process_lead_restored ---
async def test_process_lead_deleted_and_restored(db_session, sample_account):
    now = datetime.now(timezone.utc)
    pipe = Pipeline(account_id=sample_account.id, external_id="p_del_res", name="P")
    db_session.add(pipe)
    await db_session.commit()
    await db_session.refresh(pipe)

    st = Stage(pipeline_id=pipe.id, external_id="st_del_res", name="S", sort_order=1)
    db_session.add(st)
    await db_session.commit()
    await db_session.refresh(st)

    lead = Lead(
        account_id=sample_account.id,
        external_id="lead_del_res",
        name="Сделка на удаление",
        pipeline_id=pipe.id,
        current_stage_id=st.id,
        status="open",
        crm_created_at=now,
    )
    db_session.add(lead)
    await db_session.commit()
    await db_session.refresh(lead)

    hist = LeadStageHistory(
        lead_id=lead.id,
        stage_id=st.id,
        entered_at=now - timedelta(hours=1),
        exited_at=None,
    )
    db_session.add(hist)
    await db_session.commit()

    # 1. Delete event
    ev_del = {
        "id": "ev_delete_1",
        "entity_id": "lead_del_res",
        "created_at": int(now.timestamp()),
    }
    await process_lead_deleted(db_session, sample_account.id, ev_del)

    await db_session.refresh(lead)
    assert lead.status == "gone"

    await db_session.refresh(hist)
    assert hist.exited_at is not None

    del_ev = (await db_session.execute(
        select(ProcessedCrmEvent).where(ProcessedCrmEvent.external_event_id == "ev_delete_1")
    )).scalar_one()
    assert del_ev.result == "deleted"

    # 2. Restore event
    ev_res = {
        "id": "ev_restore_1",
        "entity_id": "lead_del_res",
        "created_at": int((now + timedelta(minutes=5)).timestamp()),
    }
    await process_lead_restored(db_session, sample_account.id, ev_res)

    await db_session.refresh(lead)
    assert lead.status == "open"

    res_ev = (await db_session.execute(
        select(ProcessedCrmEvent).where(ProcessedCrmEvent.external_event_id == "ev_restore_1")
    )).scalar_one()
    assert res_ev.result == "restored"

async def test_process_lead_deleted_unknown_lead(db_session, sample_account):
    ev = {"id": "ev_del_unk", "entity_id": "ghost_lead", "created_at": 1000}
    await process_lead_deleted(db_session, sample_account.id, ev)
    res = (await db_session.execute(
        select(ProcessedCrmEvent).where(ProcessedCrmEvent.external_event_id == "ev_del_unk")
    )).scalar_one()
    assert res.result == "deleted_unknown_lead"


# --- Test create_fallback_interval ---
async def test_create_fallback_interval(db_session, sample_account):
    pipe = Pipeline(account_id=sample_account.id, external_id="p_fb", name="P")
    db_session.add(pipe)
    await db_session.commit()
    await db_session.refresh(pipe)

    st = Stage(pipeline_id=pipe.id, external_id="st_fb", name="S")
    db_session.add(st)
    await db_session.commit()
    await db_session.refresh(st)

    created_at = datetime.now(timezone.utc) - timedelta(days=5)
    closed_at = datetime.now(timezone.utc) - timedelta(days=2)
    lead = Lead(
        account_id=sample_account.id,
        external_id="lead_fallback",
        current_stage_id=st.id,
        crm_created_at=created_at,
        crm_closed_at=closed_at,
    )
    db_session.add(lead)
    await db_session.commit()
    await db_session.refresh(lead)

    await create_fallback_interval(db_session, lead.id)

    hists = (await db_session.execute(
        select(LeadStageHistory).where(LeadStageHistory.lead_id == lead.id)
    )).scalars().all()
    assert len(hists) == 1
    assert hists[0].stage_id == st.id
    assert hists[0].duration_seconds == int((closed_at - created_at).total_seconds())

    # Running again does not duplicate interval
    await create_fallback_interval(db_session, lead.id)
    hists2 = (await db_session.execute(
        select(LeadStageHistory).where(LeadStageHistory.lead_id == lead.id)
    )).scalars().all()
    assert len(hists2) == 1


# --- Test cleanup_old_events ---
async def test_cleanup_old_events(db_session, sample_account):
    now = datetime.now(timezone.utc)
    old_time = now - timedelta(days=35)
    recent_time = now - timedelta(days=5)

    ev_old = ProcessedCrmEvent(
        account_id=sample_account.id,
        external_event_id="ev_ancient",
        lead_external_id="lead1",
        result="processed",
        created_at=old_time,
    )
    ev_recent = ProcessedCrmEvent(
        account_id=sample_account.id,
        external_event_id="ev_fresh",
        lead_external_id="lead2",
        result="processed",
        created_at=recent_time,
    )
    db_session.add_all([ev_old, ev_recent])
    await db_session.commit()

    deleted = await cleanup_old_events(db_session, retention_days=30, account_id=sample_account.id, batch_size=10)
    assert deleted == 1

    remaining = (await db_session.execute(select(ProcessedCrmEvent))).scalars().all()
    assert len(remaining) == 1
    assert remaining[0].external_event_id == "ev_fresh"

async def test_upsert_lead_db_lookups_without_context_cache(db_session, sample_account):
    pipe = Pipeline(account_id=sample_account.id, external_id="300", name="P300")
    db_session.add(pipe)
    await db_session.commit()
    await db_session.refresh(pipe)

    st = Stage(pipeline_id=pipe.id, external_id="3001", name="S3001")
    db_session.add(st)
    await db_session.commit()
    await db_session.refresh(st)

    # Empty context to force DB lookup for pipeline and stage
    empty_ctx = SyncContext()

    amo_data = {
        "id": 8877,
        "name": "DB Lookup Lead",
        "pipeline_id": "300",
        "status_id": "3001",
        "price": 1000,
    }
    lead = await upsert_lead(db_session, sample_account.id, amo_data, empty_ctx)
    assert lead.pipeline_id == pipe.id
    assert lead.current_stage_id == st.id

async def test_process_status_changed_skipped_unknown_lead(db_session, sample_account):
    ctx = await build_sync_context(db_session, sample_account.id)
    event = {
        "id": "ev_404_lead",
        "entity_id": "ghost_404",
        "created_at": 1000,
        "value_after": [{"lead_status": {"id": 142}}],
    }
    # 404 from API
    with patch("app.sync.event_sync.crm_client.request", return_value=(404, None)):
        await process_status_changed(
            db_session, sample_account.id, sample_account.subdomain,
            sample_account.base_domain, "token", event, ctx
        )
        ev_row = (await db_session.execute(
            select(ProcessedCrmEvent).where(ProcessedCrmEvent.external_event_id == "ev_404_lead")
        )).scalar_one()
        assert ev_row.result == "skipped_unknown_lead"

async def test_process_status_changed_exception_handling(db_session, sample_account):
    ctx = await build_sync_context(db_session, sample_account.id)
    event = {
        "id": "ev_error_1",
        "entity_id": "lead_err_1",
        "created_at": 1000,
        "value_after": [{"lead_status": {"id": 142}}],
    }
    with patch("app.sync.event_sync.select", side_effect=RuntimeError("SQL Error")):
        await process_status_changed(
            db_session, sample_account.id, sample_account.subdomain,
            sample_account.base_domain, "token", event, ctx
        )
        # Exception caught cleanly without crashing

async def test_process_lead_restored_unknown_lead(db_session, sample_account):
    ev = {"id": "ev_res_unk", "entity_id": "ghost_restore", "created_at": 1000}
    await process_lead_restored(db_session, sample_account.id, ev)
    res = (await db_session.execute(
        select(ProcessedCrmEvent).where(ProcessedCrmEvent.external_event_id == "ev_res_unk")
    )).scalar_one()
    assert res.result == "restored_unknown_lead"
