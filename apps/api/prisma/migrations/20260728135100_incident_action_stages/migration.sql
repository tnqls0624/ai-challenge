-- Preserve completed checklists when an incident advances to another damage stage.
DROP INDEX "action_items_incident_id_action_id_key";

DROP INDEX "action_items_incident_id_status_sort_order_idx";

ALTER TABLE "action_items"
ADD COLUMN "stage" "IncidentStage" NOT NULL DEFAULT 'S0';

CREATE INDEX "action_items_incident_id_stage_status_sort_order_idx"
ON "action_items"("incident_id", "stage", "status", "sort_order");

CREATE UNIQUE INDEX "action_items_incident_id_stage_action_id_key"
ON "action_items"("incident_id", "stage", "action_id");
