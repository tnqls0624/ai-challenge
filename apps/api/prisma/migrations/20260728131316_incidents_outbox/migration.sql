-- CreateEnum
CREATE TYPE "IncidentStage" AS ENUM ('S0', 'S1', 'S2', 'S3', 'S4');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ActionItemStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "NotificationOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "PushSubscriptionStatus" AS ENUM ('ACTIVE', 'REVOKED', 'INVALID');

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "risk_event_id" UUID NOT NULL,
    "stage" "IncidentStage" NOT NULL DEFAULT 'S0',
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "acknowledged_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_history" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "actor_guardian_id" UUID,
    "from_status" "IncidentStatus",
    "to_status" "IncidentStatus",
    "from_stage" "IncidentStage",
    "to_stage" "IncidentStage",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_items" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "action_id" VARCHAR(64) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "status" "ActionItemStatus" NOT NULL DEFAULT 'PENDING',
    "sort_order" INTEGER NOT NULL,
    "assigned_guardian_id" UUID,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "action_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_push_subscriptions" (
    "id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "token_digest" CHAR(64) NOT NULL,
    "token_ciphertext" TEXT NOT NULL,
    "status" "PushSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "guardian_push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_outbox" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "dedupe_key" VARCHAR(160) NOT NULL,
    "status" "NotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(3),
    "lock_owner" VARCHAR(80),
    "last_error_code" VARCHAR(80),
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "outbox_id" UUID NOT NULL,
    "push_subscription_id" UUID,
    "attempt" INTEGER NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL,
    "provider_message_id" VARCHAR(256),
    "error_code" VARCHAR(80),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "incidents"
ADD CONSTRAINT "incidents_state_check"
CHECK (
  "version" >= 1
  AND ("status" = 'RESOLVED') = ("resolved_at" IS NOT NULL)
  AND (
    "status" NOT IN ('ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED')
    OR "acknowledged_at" IS NOT NULL
  )
);

ALTER TABLE "action_items"
ADD CONSTRAINT "action_items_state_check"
CHECK (
  "sort_order" >= 0
  AND (
    ("status" = 'PENDING' AND "completed_at" IS NULL)
    OR ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL)
  )
);

ALTER TABLE "guardian_push_subscriptions"
ADD CONSTRAINT "guardian_push_subscriptions_state_check"
CHECK (
  "failure_count" >= 0
  AND (
    ("status" = 'ACTIVE' AND "revoked_at" IS NULL)
    OR ("status" IN ('REVOKED', 'INVALID') AND "revoked_at" IS NOT NULL)
  )
);

ALTER TABLE "notification_outbox"
ADD CONSTRAINT "notification_outbox_state_check"
CHECK (
  "attempt_count" >= 0
  AND (
    (
      "status" = 'PENDING'
      AND "locked_at" IS NULL
      AND "lock_owner" IS NULL
      AND "sent_at" IS NULL
    )
    OR (
      "status" = 'PROCESSING'
      AND "locked_at" IS NOT NULL
      AND "lock_owner" IS NOT NULL
      AND "sent_at" IS NULL
    )
    OR (
      "status" = 'SENT'
      AND "locked_at" IS NULL
      AND "lock_owner" IS NULL
      AND "sent_at" IS NOT NULL
    )
    OR (
      "status" IN ('FAILED', 'CANCELLED')
      AND "locked_at" IS NULL
      AND "lock_owner" IS NULL
      AND "sent_at" IS NULL
    )
  )
);

ALTER TABLE "notification_deliveries"
ADD CONSTRAINT "notification_deliveries_state_check"
CHECK (
  "attempt" >= 1
  AND (
    ("status" = 'SENT' AND "provider_message_id" IS NOT NULL AND "error_code" IS NULL)
    OR ("status" = 'FAILED' AND "error_code" IS NOT NULL)
  )
);

-- CreateIndex
CREATE UNIQUE INDEX "incidents_risk_event_id_key" ON "incidents"("risk_event_id");

-- CreateIndex
CREATE INDEX "incidents_subject_id_status_updated_at_idx" ON "incidents"("subject_id", "status", "updated_at");

-- CreateIndex
CREATE INDEX "incidents_status_updated_at_idx" ON "incidents"("status", "updated_at");

-- CreateIndex
CREATE INDEX "incident_history_incident_id_created_at_idx" ON "incident_history"("incident_id", "created_at");

-- CreateIndex
CREATE INDEX "action_items_incident_id_status_sort_order_idx" ON "action_items"("incident_id", "status", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "action_items_incident_id_action_id_key" ON "action_items"("incident_id", "action_id");

-- CreateIndex
CREATE UNIQUE INDEX "guardian_push_subscriptions_token_digest_key" ON "guardian_push_subscriptions"("token_digest");

-- CreateIndex
CREATE INDEX "guardian_push_subscriptions_guardian_id_status_idx" ON "guardian_push_subscriptions"("guardian_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "notification_outbox_dedupe_key_key" ON "notification_outbox"("dedupe_key");

-- CreateIndex
CREATE INDEX "notification_outbox_status_next_attempt_at_idx" ON "notification_outbox"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "notification_outbox_incident_id_status_idx" ON "notification_outbox"("incident_id", "status");

-- CreateIndex
CREATE INDEX "notification_deliveries_outbox_id_attempt_idx" ON "notification_deliveries"("outbox_id", "attempt");

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_risk_event_id_fkey" FOREIGN KEY ("risk_event_id") REFERENCES "risk_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_history" ADD CONSTRAINT "incident_history_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_history" ADD CONSTRAINT "incident_history_actor_guardian_id_fkey" FOREIGN KEY ("actor_guardian_id") REFERENCES "guardian_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_assigned_guardian_id_fkey" FOREIGN KEY ("assigned_guardian_id") REFERENCES "guardian_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_push_subscriptions" ADD CONSTRAINT "guardian_push_subscriptions_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "care_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_outbox_id_fkey" FOREIGN KEY ("outbox_id") REFERENCES "notification_outbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_push_subscription_id_fkey" FOREIGN KEY ("push_subscription_id") REFERENCES "guardian_push_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
