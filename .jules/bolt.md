## 2025-02-27 - Avoid Correlated Subqueries with ARRAY_AGG over Grouped Rows
**Learning:** Using `WHERE foreign_key = ANY(ARRAY_AGG(l.id))` inside a grouped query's SELECT list forces PostgreSQL to materialize array aggregates per group and re-evaluate row comparisons, preventing efficient join planning.
**Action:** Replace `ANY(ARRAY_AGG(...))` subqueries with a `LEFT JOIN` on a pre-aggregated subquery (`SELECT lead_id, COUNT(*) AS count FROM child_table GROUP BY lead_id`). This allows PostgreSQL to use standard hash joins without multiplying main rows or materializing array aggregates.
