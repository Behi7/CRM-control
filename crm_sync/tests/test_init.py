import pytest

def test_app_core_init():
    import app.core as core
    assert hasattr(core, "async_engine")
    assert hasattr(core, "AsyncSessionLocal")
    assert hasattr(core, "decrypt_token")
    assert hasattr(core, "encrypt_token")
    assert hasattr(core, "crm_client")
    assert "async_engine" in core.__all__

def test_app_models_init():
    import app.models as models
    assert hasattr(models, "Base")
    assert hasattr(models, "Account")
    assert hasattr(models, "Pipeline")
    assert hasattr(models, "Stage")
    assert hasattr(models, "Lead")
    assert hasattr(models, "LeadStageHistory")
    assert hasattr(models, "LeadStageSkip")
    assert hasattr(models, "Tag")
    assert hasattr(models, "LeadTag")
    assert hasattr(models, "AmoUser")
    assert hasattr(models, "CustomFieldDefinition")
    assert hasattr(models, "ProcessedCrmEvent")
    assert hasattr(models, "Notification")
    assert hasattr(models, "QcSettings")
    assert hasattr(models, "QcRule")
    assert hasattr(models, "QcCallEvaluation")
    assert hasattr(models, "LeadTask")
    assert "Account" in models.__all__

def test_app_sync_init():
    import app.sync as sync
    assert hasattr(sync, "sync_pipelines_and_stages")
    assert hasattr(sync, "run_delta_sync")
    assert hasattr(sync, "run_enrich_account")
    assert hasattr(sync, "run_backfill")
    assert hasattr(sync, "run_calls_sync")
    assert hasattr(sync, "run_tasks_sync")
    assert hasattr(sync, "SyncContext")
    assert hasattr(sync, "build_sync_context")
    assert hasattr(sync, "upsert_lead")
    assert hasattr(sync, "process_status_changed")
    assert hasattr(sync, "process_lead_deleted")
    assert hasattr(sync, "process_lead_restored")
    assert hasattr(sync, "create_fallback_interval")
    assert hasattr(sync, "cleanup_old_events")
    assert "sync_pipelines_and_stages" in sync.__all__
