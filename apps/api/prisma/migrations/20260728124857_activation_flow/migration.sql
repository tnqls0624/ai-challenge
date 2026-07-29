-- DropIndex
DROP INDEX "activation_codes_code_digest_key";

-- AlterTable
ALTER TABLE "activation_sessions"
ADD COLUMN "device_installation_digest" CHAR(64);

-- Existing pre-activation-flow sessions cannot be tied to a client installation.
-- Give each one a deterministic, non-secret legacy marker before enforcing NOT NULL.
UPDATE "activation_sessions"
SET "device_installation_digest" =
  md5("id"::text) || md5('legacy-activation-session:' || "id"::text)
WHERE "device_installation_digest" IS NULL;

ALTER TABLE "activation_sessions"
ALTER COLUMN "device_installation_digest" SET NOT NULL;

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "guardian_id" UUID,
    "scope" VARCHAR(64) NOT NULL,
    "key_digest" CHAR(64) NOT NULL,
    "request_digest" CHAR(64) NOT NULL,
    "resource_id" UUID NOT NULL,
    "response_status" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idempotency_records_expires_at_idx" ON "idempotency_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_scope_key_digest_key" ON "idempotency_records"("scope", "key_digest");

-- CreateIndex
CREATE INDEX "activation_codes_code_digest_status_idx" ON "activation_codes"("code_digest", "status");

-- A numeric code can be reused after consumption/invalidation, but only one
-- live issuance may resolve to a given digest at a time.
CREATE UNIQUE INDEX "activation_codes_one_issued_digest_key"
ON "activation_codes"("code_digest")
WHERE "status" = 'ISSUED';

-- CreateIndex
CREATE INDEX "activation_sessions_device_installation_digest_created_at_idx" ON "activation_sessions"("device_installation_digest", "created_at");

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
