-- CreateIndex
CREATE INDEX "lead_stage_history_lead_id_exited_at_idx" ON "lead_stage_history"("lead_id", "exited_at");

-- CreateIndex
CREATE INDEX "lead_stage_history_stage_id_entered_at_idx" ON "lead_stage_history"("stage_id", "entered_at");

-- CreateIndex
CREATE INDEX "lead_stage_history_stage_id_exited_at_idx" ON "lead_stage_history"("stage_id", "exited_at");

