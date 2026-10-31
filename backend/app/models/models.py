from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Numeric, Text, ForeignKey,
    Index, UniqueConstraint, func
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from app.core.database import Base

class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    subdomain = Column(Text, nullable=False)
    external_account_id = Column(Text, nullable=True)
    base_domain = Column(Text, nullable=False, default="amocrm.ru")
    encrypted_token = Column(Text, nullable=True)
    token_expires_at = Column(DateTime(timezone=True), nullable=True)
    token_status = Column(Text, nullable=False, default="active")
    subscription_status = Column(Text, nullable=False, default="active")
    status = Column(Text, nullable=False, default="connected")
    sync_status = Column(Text, nullable=False, default="active")
    timezone = Column(Text, nullable=False, default="UTC")
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    backfill_status = Column(Text, nullable=False, default="pending")
    backfill_error = Column(Text, nullable=True)
    backfill_error_at = Column(DateTime(timezone=True), nullable=True)
    backfill_cursor = Column(JSONB, nullable=True)
    ai_enabled = Column(Boolean, nullable=False, default=False)
    ai_model = Column(Text, nullable=True, default="gemini-2.5-flash")
    ai_encrypted_token = Column(Text, nullable=True)
    ai_company_context = Column(Text, nullable=True)
    anomaly_settings = Column(JSONB, nullable=True, default=dict)
    chat_settings = Column(JSONB, nullable=True, default=dict)
    predictions_settings = Column(JSONB, nullable=True, default=dict)
    crm_nodes_settings = Column(JSONB, nullable=True, default=dict)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("subdomain", "base_domain", name="accounts_subdomain_base_domain_key"),
    )

    users = relationship("User", back_populates="account")
    pipelines = relationship("Pipeline", back_populates="account")
    leads = relationship("Lead", back_populates="account")
    tags = relationship("Tag", back_populates="account")
    amo_users = relationship("AmoUser", back_populates="account")
    notifications = relationship("Notification", back_populates="account")
    custom_field_definitions = relationship("CustomFieldDefinition", back_populates="account")
    qc_settings = relationship("QcSettings", back_populates="account", uselist=False)

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(Text, unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    role = Column(Text, nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="SET NULL"), unique=True, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    account = relationship("Account", back_populates="users")
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(Text, unique=True, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("refresh_tokens_user_id_idx", "user_id"),
        Index("refresh_tokens_expires_at_idx", "expires_at"),
    )

    user = relationship("User", back_populates="refresh_tokens")

class Pipeline(Base):
    __tablename__ = "pipelines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    external_id = Column(Text, nullable=False)
    name = Column(Text, nullable=False)
    is_archived = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        UniqueConstraint("account_id", "external_id", name="pipelines_account_id_external_id_key"),
    )

    account = relationship("Account", back_populates="pipelines")
    stages = relationship("Stage", back_populates="pipeline")
    leads = relationship("Lead", back_populates="pipeline")

class Stage(Base):
    __tablename__ = "stages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id"), nullable=False)
    external_id = Column(Text, nullable=False)
    name = Column(Text, nullable=False)
    sort_order = Column(Integer, nullable=True)
    is_archived = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        UniqueConstraint("pipeline_id", "external_id", name="stages_pipeline_id_external_id_key"),
    )

    pipeline = relationship("Pipeline", back_populates="stages")
    lead_stage_history = relationship("LeadStageHistory", back_populates="stage")

class AmoUser(Base):
    __tablename__ = "amo_users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    external_id = Column(Text, nullable=False)
    name = Column(Text, nullable=False)
    email = Column(Text, nullable=True)
    is_archived = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        UniqueConstraint("account_id", "external_id", name="amo_users_account_id_external_id_key"),
    )

    account = relationship("Account", back_populates="amo_users")
    leads = relationship("Lead", back_populates="responsible_user")

class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    external_id = Column(Text, nullable=False)
    name = Column(Text, nullable=True)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id"), nullable=True)
    current_stage_id = Column(Integer, ForeignKey("stages.id"), nullable=True)
    responsible_user_id = Column(Integer, ForeignKey("amo_users.id"), nullable=True)
    status = Column(Text, nullable=False, default="open")
    price = Column(Numeric(18, 2), nullable=True)
    loss_reason_id = Column(Text, nullable=True)
    loss_reason_name = Column(Text, nullable=True)
    main_contact_id = Column(Text, nullable=True)
    closest_task_at = Column(DateTime(timezone=True), nullable=True)
    custom_fields = Column(JSONB, nullable=True)
    utm_source = Column(Text, nullable=True)
    utm_medium = Column(Text, nullable=True)
    utm_campaign = Column(Text, nullable=True)
    utm_content = Column(Text, nullable=True)
    utm_term = Column(Text, nullable=True)
    source_external_id = Column(Text, nullable=True)
    source_name = Column(Text, nullable=True)
    crm_created_at = Column(DateTime(timezone=True), nullable=False)
    crm_closed_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    last_seen_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("account_id", "external_id", name="leads_account_id_external_id_key"),
        Index("leads_account_id_status_idx", "account_id", "status"),
        Index("leads_account_id_pipeline_id_status_idx", "account_id", "pipeline_id", "status"),
        Index("leads_account_id_responsible_user_id_idx", "account_id", "responsible_user_id"),
        Index("leads_account_id_crm_created_at_idx", "account_id", "crm_created_at"),
    )

    account = relationship("Account", back_populates="leads")
    pipeline = relationship("Pipeline", back_populates="leads")
    current_stage = relationship("Stage", foreign_keys=[current_stage_id])
    responsible_user = relationship("AmoUser", back_populates="leads")
    lead_stage_history = relationship("LeadStageHistory", back_populates="lead")
    lead_tags = relationship("LeadTag", back_populates="lead", cascade="all, delete-orphan")
    tasks = relationship("LeadTask", back_populates="lead", cascade="all, delete-orphan")

class LeadStageHistory(Base):
    __tablename__ = "lead_stage_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False)
    stage_id = Column(Integer, ForeignKey("stages.id"), nullable=False)
    entered_at = Column(DateTime(timezone=True), nullable=False)
    exited_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    source_event_id = Column(Text, nullable=True)

    __table_args__ = (
        Index("lead_stage_history_lead_id_idx", "lead_id"),
        Index("lead_stage_history_stage_id_duration_seconds_idx", "stage_id", "duration_seconds"),
        Index("lead_stage_history_stage_id_entered_at_idx", "stage_id", "entered_at"),
    )

    lead = relationship("Lead", back_populates="lead_stage_history")
    stage = relationship("Stage", back_populates="lead_stage_history")

class LeadStageSkip(Base):
    __tablename__ = "lead_stage_skips"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False)
    pipeline_id = Column(Integer, nullable=False)
    source_event_id = Column(Text, nullable=False)
    transition_at = Column(DateTime(timezone=True), nullable=False)
    from_stage_id = Column(Integer, nullable=False)
    to_stage_id = Column(Integer, nullable=False)
    skipped_stage_id = Column(Integer, nullable=False)
    direction = Column(Text, nullable=False, default="forward")
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("lead_id", "source_event_id", "skipped_stage_id", name="lead_stage_skips_lead_id_source_event_id_skipped_stage_id_key"),
        Index("lead_stage_skips_account_id_pipeline_id_idx", "account_id", "pipeline_id"),
    )

    account = relationship("Account")
    lead = relationship("Lead")

class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    external_id = Column(Text, nullable=False)
    name = Column(Text, nullable=False)
    is_archived = Column(Boolean, nullable=False, default=False)

    __table_args__ = (
        UniqueConstraint("account_id", "external_id", name="tags_account_id_external_id_key"),
    )

    account = relationship("Account", back_populates="tags")
    lead_tags = relationship("LeadTag", back_populates="tag", cascade="all, delete-orphan")

class LeadTag(Base):
    __tablename__ = "lead_tags"

    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), primary_key=True)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True)

    __table_args__ = (
        Index("lead_tags_tag_id_idx", "tag_id"),
    )

    lead = relationship("Lead", back_populates="lead_tags")
    tag = relationship("Tag", back_populates="lead_tags")

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    type = Column(Text, nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("notifications_account_id_is_read_idx", "account_id", "is_read"),
    )

    account = relationship("Account", back_populates="notifications")

class CustomFieldDefinition(Base):
    __tablename__ = "custom_field_definitions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    external_id = Column(Text, nullable=False)
    name = Column(Text, nullable=False)
    code = Column(Text, nullable=True)
    field_type = Column(Text, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    enums = Column(JSONB, nullable=True)
    is_archived = Column(Boolean, nullable=False, default=False)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("account_id", "external_id", name="custom_field_definitions_account_id_external_id_key"),
    )

    account = relationship("Account", back_populates="custom_field_definitions")

class ProcessedCrmEvent(Base):
    __tablename__ = "processed_crm_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    external_event_id = Column(Text, nullable=False)
    lead_external_id = Column(Text, nullable=True)
    result = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("account_id", "external_event_id", name="processed_crm_events_account_id_external_event_id_key"),
        Index("idx_processed_crm_events_account", "account_id"),
        Index("idx_processed_crm_events_created_at", "created_at"),
    )

    account = relationship("Account")

class QcSettings(Base):
    __tablename__ = "qc_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), unique=True, nullable=False)
    is_enabled = Column(Boolean, nullable=False, default=False)
    ai_model = Column(Text, nullable=True, default=None)
    min_duration_sec = Column(Integer, nullable=False, default=20)
    max_duration_sec = Column(Integer, nullable=False, default=600)
    disabled_pipeline_ids = Column(JSONB, nullable=True, default=list)
    system_prompt = Column(Text, nullable=True)
    last_call_synced_at = Column(DateTime(timezone=True), nullable=True)
    activated_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    account = relationship("Account", back_populates="qc_settings")

class QcRule(Base):
    __tablename__ = "qc_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id", ondelete="CASCADE"), nullable=True)
    title = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    penalty_points = Column(Integer, nullable=False, default=10)
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    account = relationship("Account")
    pipeline = relationship("Pipeline")

class QcCallEvaluation(Base):
    __tablename__ = "qc_call_evaluations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    external_call_id = Column(Text, nullable=False)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="SET NULL"), nullable=True)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id", ondelete="SET NULL"), nullable=True)
    amo_user_id = Column(Integer, ForeignKey("amo_users.id", ondelete="SET NULL"), nullable=True)
    contact_id = Column(Text, nullable=True)
    phone = Column(Text, nullable=True)
    call_direction = Column(Text, nullable=True)
    call_date = Column(DateTime(timezone=True), nullable=False)
    duration_seconds = Column(Integer, nullable=False)
    recording_url = Column(Text, nullable=True)
    call_status = Column(Integer, nullable=True)
    status = Column(Text, nullable=False, default="completed")
    skip_reason = Column(Text, nullable=True)
    overall_score = Column(Integer, nullable=True)
    rules_breakdown = Column(JSONB, nullable=True)
    errors_list = Column(JSONB, nullable=True)
    bottleneck = Column(Text, nullable=True)
    transcript = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    recommendation = Column(Text, nullable=True)
    anomaly_points = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("account_id", "external_call_id", name="qc_call_evaluations_account_external_call_id_key"),
        Index("idx_qc_eval_account_lead", "account_id", "lead_id"),
        Index("idx_qc_eval_account_date", "account_id", "call_date"),
        Index("idx_qc_eval_account_score", "account_id", "overall_score"),
    )

    account = relationship("Account")
    lead = relationship("Lead")
    pipeline = relationship("Pipeline")
    responsible_user = relationship("AmoUser")

class DealAnomalyAudit(Base):
    __tablename__ = "deal_anomaly_audits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), unique=True, nullable=False)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id", ondelete="SET NULL"), nullable=True)
    responsible_user_id = Column(Integer, ForeignKey("amo_users.id", ondelete="SET NULL"), nullable=True)

    anomaly_score = Column(Integer, nullable=False, default=0)
    anomaly_level = Column(Text, nullable=False, default="fair")
    manager_fault = Column(Text, nullable=False, default="none")

    stated_loss_reason = Column(Text, nullable=True)
    real_loss_reason = Column(Text, nullable=True)
    pivot_point = Column(Text, nullable=True)
    forensic_summary = Column(Text, nullable=True)
    rop_recommendation = Column(Text, nullable=True)

    score_breakdown = Column(JSONB, nullable=True)
    ai_verdict = Column(JSONB, nullable=True)

    is_reviewed = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        Index("idx_deal_anomaly_acc_level", "account_id", "anomaly_level"),
        Index("idx_deal_anomaly_acc_score", "account_id", "anomaly_score"),
        Index("idx_deal_anomaly_lead", "lead_id"),
    )

    account = relationship("Account")
    lead = relationship("Lead")
    pipeline = relationship("Pipeline")
    responsible_user = relationship("AmoUser")

class LeadTask(Base):
    __tablename__ = "lead_tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    external_task_id = Column(Text, nullable=False)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=True)
    lead_external_id = Column(Text, nullable=True)
    responsible_user_id = Column(Integer, ForeignKey("amo_users.id", ondelete="SET NULL"), nullable=True)
    task_type_id = Column(Integer, nullable=True)
    text = Column(Text, nullable=True)
    is_completed = Column(Boolean, nullable=False, default=False)
    task_created_at = Column(DateTime(timezone=True), nullable=False)
    complete_till = Column(DateTime(timezone=True), nullable=True)
    task_closed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("account_id", "external_task_id", name="lead_tasks_account_id_external_task_id_key"),
        Index("idx_lead_tasks_account_lead", "account_id", "lead_id"),
        Index("idx_lead_tasks_lead_created", "lead_id", "task_created_at"),
    )

    account = relationship("Account")
    lead = relationship("Lead", back_populates="tasks")
    responsible_user = relationship("AmoUser")

