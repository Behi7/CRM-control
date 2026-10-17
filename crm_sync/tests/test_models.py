import pytest
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from app.models import (
    Base, Account, Pipeline, Stage, Lead, LeadStageHistory, LeadStageSkip,
    Tag, LeadTag, AmoUser, CustomFieldDefinition, ProcessedCrmEvent,
    Notification, QcSettings, QcRule, QcCallEvaluation, LeadTask
)

async def test_account_creation_and_defaults(db_session):
    acc = Account(
        subdomain="company1",
        base_domain="amocrm.ru",
    )
    db_session.add(acc)
    await db_session.commit()
    await db_session.refresh(acc)

    assert acc.id is not None
    assert acc.subdomain == "company1"
    assert acc.base_domain == "amocrm.ru"
    assert acc.token_status == "active"
    assert acc.subscription_status == "active"
    assert acc.status == "connected"
    assert acc.sync_status == "active"
    assert acc.timezone == "UTC"
    assert acc.backfill_status == "pending"
    assert acc.ai_enabled is False
    assert acc.anomaly_settings == {}

async def test_account_unique_subdomain(db_session):
    acc1 = Account(subdomain="unique-sub", base_domain="amocrm.ru")
    acc2 = Account(subdomain="unique-sub", base_domain="amocrm.ru")
    db_session.add(acc1)
    await db_session.commit()

    db_session.add(acc2)
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()

async def test_pipeline_and_stage_hierarchy(db_session, sample_account):
    pipe = Pipeline(
        account_id=sample_account.id,
        external_id="pipe_100",
        name="Основная воронка",
    )
    db_session.add(pipe)
    await db_session.commit()
    await db_session.refresh(pipe)

    stage1 = Stage(
        pipeline_id=pipe.id,
        external_id="st_1",
        name="Первичный контакт",
        sort_order=10,
    )
    stage2 = Stage(
        pipeline_id=pipe.id,
        external_id="st_2",
        name="Переговоры",
        sort_order=20,
    )
    db_session.add_all([stage1, stage2])
    await db_session.commit()

    # Query back via relationships
    res = await db_session.execute(
        select(Pipeline).options(selectinload(Pipeline.stages)).where(Pipeline.id == pipe.id)
    )
    loaded_pipe = res.scalar_one()
    assert loaded_pipe.name == "Основная воронка"
    assert len(loaded_pipe.stages) == 2
    assert {s.external_id for s in loaded_pipe.stages} == {"st_1", "st_2"}

async def test_pipeline_unique_constraint(db_session, sample_account):
    p1 = Pipeline(account_id=sample_account.id, external_id="dup_pipe", name="P1")
    p2 = Pipeline(account_id=sample_account.id, external_id="dup_pipe", name="P2")
    db_session.add(p1)
    await db_session.commit()

    db_session.add(p2)
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()

async def test_stage_unique_constraint(db_session, sample_account):
    pipe = Pipeline(account_id=sample_account.id, external_id="p_unique", name="P")
    db_session.add(pipe)
    await db_session.commit()
    await db_session.refresh(pipe)

    s1 = Stage(pipeline_id=pipe.id, external_id="st_dup", name="S1")
    s2 = Stage(pipeline_id=pipe.id, external_id="st_dup", name="S2")
    db_session.add(s1)
    await db_session.commit()

    db_session.add(s2)
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()

async def test_lead_lifecycle_and_history(db_session, sample_account):
    now = datetime.now(timezone.utc)
    pipe = Pipeline(account_id=sample_account.id, external_id="p_lead", name="Pipeline")
    db_session.add(pipe)
    await db_session.commit()
    await db_session.refresh(pipe)

    st1 = Stage(pipeline_id=pipe.id, external_id="st_l1", name="Stage 1", sort_order=1)
    st2 = Stage(pipeline_id=pipe.id, external_id="st_l2", name="Stage 2", sort_order=2)
    db_session.add_all([st1, st2])
    await db_session.commit()
    await db_session.refresh(st1)
    await db_session.refresh(st2)

    user = AmoUser(account_id=sample_account.id, external_id="u_1", name="Иван Менеджер")
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)

    lead = Lead(
        account_id=sample_account.id,
        external_id="lead_999",
        name="Сделка на миллион",
        pipeline_id=pipe.id,
        current_stage_id=st1.id,
        responsible_user_id=user.id,
        status="open",
        price=1000000.50,
        crm_created_at=now,
        custom_fields=[{"id": 12, "name": "Город", "values": ["Москва"]}],
        utm_source="yandex",
        utm_campaign="cpc",
    )
    db_session.add(lead)
    await db_session.commit()
    await db_session.refresh(lead)

    assert lead.id is not None
    assert float(lead.price) == 1000000.50
    assert lead.utm_source == "yandex"
    assert lead.custom_fields == [{"id": 12, "name": "Город", "values": ["Москва"]}]

    # Stage history
    hist = LeadStageHistory(
        lead_id=lead.id,
        stage_id=st1.id,
        entered_at=now,
        exited_at=None,
        duration_seconds=None,
        source_event_id="ev_001",
    )
    db_session.add(hist)
    await db_session.commit()
    await db_session.refresh(hist)

    assert hist.id is not None
    assert hist.lead_id == lead.id

    # Stage skip
    skip = LeadStageSkip(
        account_id=sample_account.id,
        lead_id=lead.id,
        pipeline_id=pipe.id,
        from_stage_id=st1.id,
        to_stage_id=st2.id,
        skipped_stage_id=st1.id,
        transition_at=now,
        direction="forward",
        source_event_id="ev_002",
    )
    db_session.add(skip)
    await db_session.commit()
    await db_session.refresh(skip)

    assert skip.id is not None

async def test_tags_and_lead_tags(db_session, sample_account):
    now = datetime.now(timezone.utc)
    tag = Tag(account_id=sample_account.id, external_id="tag_vip", name="VIP")
    db_session.add(tag)
    await db_session.commit()
    await db_session.refresh(tag)

    lead = Lead(
        account_id=sample_account.id,
        external_id="lead_with_tag",
        name="Тестовая",
        crm_created_at=now,
    )
    db_session.add(lead)
    await db_session.commit()
    await db_session.refresh(lead)

    lt = LeadTag(lead_id=lead.id, tag_id=tag.id)
    db_session.add(lt)
    await db_session.commit()

    res = await db_session.execute(select(LeadTag).where(LeadTag.lead_id == lead.id))
    assert res.scalar_one().tag_id == tag.id

async def test_custom_field_definitions(db_session, sample_account):
    cf = CustomFieldDefinition(
        account_id=sample_account.id,
        external_id="cf_123",
        name="Тарифный план",
        code="TARIFF",
        field_type="select",
        sort_order=5,
        enums=[{"id": 1, "value": "Базовый", "sort": 1}, {"id": 2, "value": "PRO", "sort": 2}],
    )
    db_session.add(cf)
    await db_session.commit()
    await db_session.refresh(cf)

    assert cf.id is not None
    assert cf.code == "TARIFF"
    assert len(cf.enums) == 2

async def test_processed_crm_events(db_session, sample_account):
    ev = ProcessedCrmEvent(
        account_id=sample_account.id,
        external_event_id="ev_xyz_1",
        lead_external_id="lead_123",
        result="processed",
    )
    db_session.add(ev)
    await db_session.commit()
    await db_session.refresh(ev)

    assert ev.id is not None
    assert ev.result == "processed"

    # Unique constraint test
    ev_dup = ProcessedCrmEvent(
        account_id=sample_account.id,
        external_event_id="ev_xyz_1",
        lead_external_id="lead_123",
        result="error",
    )
    db_session.add(ev_dup)
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()

async def test_qc_settings_and_evaluations(db_session, sample_account):
    now = datetime.now(timezone.utc)
    qc_set = QcSettings(
        account_id=sample_account.id,
        is_enabled=True,
        ai_model="gemini-2.5-flash",
        min_duration_sec=30,
        max_duration_sec=900,
        disabled_pipeline_ids=[10, 20],
    )
    db_session.add(qc_set)
    await db_session.commit()
    await db_session.refresh(qc_set)

    assert qc_set.id is not None
    assert qc_set.min_duration_sec == 30

    rule = QcRule(
        account_id=sample_account.id,
        title="Приветствие по регламенту",
        penalty_points=15,
        is_active=True,
    )
    db_session.add(rule)
    await db_session.commit()
    await db_session.refresh(rule)

    assert rule.id is not None
    assert rule.penalty_points == 15

    eval_call = QcCallEvaluation(
        account_id=sample_account.id,
        external_call_id="call_9999",
        call_direction="in",
        call_date=now,
        duration_seconds=120,
        status="pending",
        phone="+79991234567",
    )
    db_session.add(eval_call)
    await db_session.commit()
    await db_session.refresh(eval_call)

    assert eval_call.id is not None
    assert eval_call.status == "pending"

async def test_lead_task_model(db_session, sample_account):
    now = datetime.now(timezone.utc)
    task = LeadTask(
        account_id=sample_account.id,
        external_task_id="task_8888",
        lead_external_id="lead_ext_1",
        text="Связаться с клиентом для уточнения ТЗ",
        is_completed=False,
        task_created_at=now,
    )
    db_session.add(task)
    await db_session.commit()
    await db_session.refresh(task)

    assert task.id is not None
    assert task.text == "Связаться с клиентом для уточнения ТЗ"
    assert task.is_completed is False

async def test_notification_model(db_session, sample_account):
    n = Notification(
        account_id=sample_account.id,
        type="warning",
        message="Срок действия токена истекает",
        is_read=False,
    )
    db_session.add(n)
    await db_session.commit()
    await db_session.refresh(n)

    assert n.id is not None
    assert n.is_read is False

async def test_account_cascade_delete(db_session, sample_account):
    pipe = Pipeline(account_id=sample_account.id, external_id="p_del", name="To Delete")
    db_session.add(pipe)
    await db_session.commit()
    await db_session.refresh(pipe)

    st = Stage(pipeline_id=pipe.id, external_id="s_del", name="Stage Delete")
    db_session.add(st)
    await db_session.commit()

    # Delete account
    await db_session.delete(sample_account)
    await db_session.commit()

    # Verify cascades
    res_p = await db_session.execute(select(Pipeline).where(Pipeline.id == pipe.id))
    assert res_p.scalar_one_or_none() is None
    res_s = await db_session.execute(select(Stage).where(Stage.pipeline_id == pipe.id))
    assert res_s.scalar_one_or_none() is None

