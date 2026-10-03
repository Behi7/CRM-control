from datetime import datetime, timezone
from typing import Optional, List, Any
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey,
    Numeric, Text, UniqueConstraint, Index, func
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    subdomain = Column(String, unique=True, nullable=False)
    external_account_id = Column(String, nullable=True)
    base_domain = Column(String, default="amocrm.ru", nullable=False)
    encrypted_token = Column(Text, nullable=True)
    token_expires_at = Column(DateTime(timezone=True), nullable=True)
    token_status = Column(String, default="active", nullable=False)
    subscription_status = Column(String, default="active", nullable=False)
    status = Column(String, default="connected", nullable=False)
    sync_status = Column(String, default="active", nullable=False)
    timezone = Column(String, default="UTC", nullable=False)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    backfill_status = Column(String, default="pending", nullable=False)
    backfill_error = Column(Text, nullable=True)
    backfill_error_at = Column(DateTime(timezone=True), nullable=True)
    backfill_cursor = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    pipelines = relationship("Pipeline", back_populates="account", cascade="all, delete-orphan")
    leads = relationship("Lead", back_populates="account", cascade="all, delete-orphan")
    tags = relationship("Tag", back_populates="account", cascade="all, delete-orphan")
    amo_users = relationship("AmoUser", back_populates="account", cascade="all, delete-orphan")


class Pipeline(Base):
    __tablename__ = "pipelines"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    external_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    account = relationship("Account", back_populates="pipelines")
    stages = relationship("Stage", back_populates="pipeline", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("account_id", "external_id", name="pipelines_account_id_external_id_key"),
    )


class Stage(Base):
    __tablename__ = "stages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id", ondelete="CASCADE"), nullable=False)
    external_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    pipeline = relationship("Pipeline", back_populates="stages")

    __table_args__ = (
        UniqueConstraint("pipeline_id", "external_id", name="stages_pipeline_id_external_id_key"),
    )


class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    external_id = Column(String, nullable=False)
    name = Column(String, nullable=True)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id", ondelete="SET NULL"), nullable=True)
    current_stage_id = Column(Integer, ForeignKey("stages.id", ondelete="SET NULL"), nullable=True)
    responsible_user_id = Column(Integer, ForeignKey("amo_users.id", ondelete="SET NULL"), nullable=True)
    status = Column(String, default="open", nullable=False)
    price = Column(Numeric(15, 2), nullable=True)
    crm_created_at = Column(DateTime(timezone=True), nullable=False)
    crm_closed_at = Column(DateTime(timezone=True), nullable=True)
    closest_task_at = Column(DateTime(timezone=True), nullable=True)
    custom_fields = Column(JSONB, nullable=True)
    utm_source = Column(String, nullable=True)
    utm_medium = Column(String, nullable=True)
    utm_campaign = Column(String, nullable=True)
    utm_content = Column(String, nullable=True)
    utm_term = Column(String, nullable=True)
    loss_reason_id = Column(String, nullable=True)
    loss_reason_name = Column(String, nullable=True)
    main_contact_id = Column(String, nullable=True)
    source_id = Column(String, nullable=True)
    source_name = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    account = relationship("Account", back_populates="leads")
    stage_history = relationship("LeadStageHistory", back_populates="lead", cascade="all, delete-orphan")
    stage_skips = relationship("LeadStageSkip", back_populates="lead", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("account_id", "external_id", name="leads_account_id_external_id_key"),
        Index("idx_leads_account_status", "account_id", "status"),
        Index("idx_leads_pipeline", "pipeline_id"),
        Index("idx_leads_created_at", "crm_created_at"),
    )


class LeadStageHistory(Base):
    __tablename__ = "lead_stage_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False)
    stage_id = Column(Integer, ForeignKey("stages.id", ondelete="CASCADE"), nullable=False)
    entered_at = Column(DateTime(timezone=True), nullable=False)
    exited_at = Column(DateTime(timezone=True), nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    source_event_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    lead = relationship("Lead", back_populates="stage_history")

    __table_args__ = (
        Index("idx_stage_history_stage", "stage_id"),
        Index("idx_stage_history_lead", "lead_id"),
    )


class LeadStageSkip(Base):
    __tablename__ = "lead_stage_skips"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False)
    pipeline_id = Column(Integer, ForeignKey("pipelines.id", ondelete="CASCADE"), nullable=False)
    from_stage_id = Column(Integer, ForeignKey("stages.id", ondelete="CASCADE"), nullable=False)
    to_stage_id = Column(Integer, ForeignKey("stages.id", ondelete="CASCADE"), nullable=False)
    skipped_stage_id = Column(Integer, ForeignKey("stages.id", ondelete="CASCADE"), nullable=False)
    transition_at = Column(DateTime(timezone=True), nullable=False)
    direction = Column(String, default="forward", nullable=False)
    source_event_id = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    lead = relationship("Lead", back_populates="stage_skips")

    __table_args__ = (
        UniqueConstraint("lead_id", "source_event_id", "skipped_stage_id", name="lead_stage_skips_lead_id_source_event_id_skipped_stage_id_key"),
        Index("idx_stage_skips_skipped", "skipped_stage_id"),
    )


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    external_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False)

    account = relationship("Account", back_populates="tags")

    __table_args__ = (
        UniqueConstraint("account_id", "external_id", name="tags_account_id_external_id_key"),
    )


class LeadTag(Base):
    __tablename__ = "lead_tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False)

    __table_args__ = (
        UniqueConstraint("lead_id", "tag_id", name="lead_tags_lead_id_tag_id_key"),
        Index("idx_lead_tags_tag", "tag_id"),
        Index("idx_lead_tags_lead", "lead_id"),
    )


class AmoUser(Base):
    __tablename__ = "amo_users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    external_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    is_archived = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    account = relationship("Account", back_populates="amo_users")

    __table_args__ = (
        UniqueConstraint("account_id", "external_id", name="amo_users_account_id_external_id_key"),
    )


class CustomFieldDefinition(Base):
    __tablename__ = "custom_field_definitions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    external_id = Column(String, nullable=False)
    name = Column(String, nullable=False)
    code = Column(String, nullable=True)
    field_type = Column(String, default="text", nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    enums = Column(JSONB, nullable=True)
    is_archived = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        UniqueConstraint("account_id", "external_id", name="custom_field_definitions_account_id_external_id_key"),
    )


class ProcessedCrmEvent(Base):
    __tablename__ = "processed_crm_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    external_event_id = Column(String, nullable=False)
    lead_external_id = Column(String, nullable=False)
    result = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        UniqueConstraint("account_id", "external_event_id", name="processed_crm_events_account_id_external_event_id_key"),
        Index("idx_processed_crm_events_account", "account_id"),
    )


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=True)
    type = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
