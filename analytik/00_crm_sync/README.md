# Модуль 00: Единый микросервис синхронизации и обогащения БД (`00_crm_sync`)

Этот микросервис отвечает исключительно за фоновую выгрузку данных из AmoCRM API v4 (каждые 10 минут и при первичной загрузке) и обогащение центральной базы данных PostgreSQL (`amocrm_analytics`) для всех аналитических приложений (`01_time_analytics`, `02_python_analytics`, `03_python_analytics`).

## Что собирает и обогащает `00_crm_sync`:
1. **Воронки, этапы и менеджеры** (`/api/v4/leads/pipelines`, `/api/v4/users`)
2. **Сделки и события переходов по этапам** (`/api/v4/leads`, `/api/v4/events`)
3. **Детальное BI-обогащение сделок** (`with=tags,contacts,loss_reason` + `custom_fields_values`):
   - Причины отказа (`loss_reason_id`, `loss_reason_name`)
   - Главный контакт сделки (`main_contact_id` — для расчёта LTV и повторных продаж)
   - Ближайшая задача (`closest_task_at` — для контроля просроченных задач и сделок без задач)
   - Кастомные поля (`custom_fields` JSONB) и сквозные UTM-метки (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`)

Точка входа воркера: [`analytik/01_time_analytics/src/worker-main.ts`](../01_time_analytics/src/worker-main.ts).
В [`docker-compose.yml`](../../docker-compose.yml) запускается как отдельный контейнер `crm_sync` с `SYNC_WORKER_ENABLED=true`, в то время как API-сервис `backend` работает с `SYNC_WORKER_ENABLED=false`.
