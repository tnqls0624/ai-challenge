-- CreateEnum
CREATE TYPE "RelationshipRole" AS ENUM ('CARE_WORKER', 'WELFARE_STAFF', 'RELATIVE', 'NEIGHBOR', 'CHILD');

-- CreateEnum
CREATE TYPE "CareConnectionStatus" AS ENUM ('PENDING_CONSENT', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "ShareLevel" AS ENUM ('MINIMAL', 'BASIC');

-- CreateEnum
CREATE TYPE "AlertThreshold" AS ENUM ('NONE', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ReceiveThreshold" AS ENUM ('REQUEST_ONLY', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "ActivationCodeStatus" AS ENUM ('ISSUED', 'CONSUMED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "ActivationSessionStatus" AS ENUM ('ISSUED', 'CONSUMED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('CARE_CONNECTION', 'AUTO_GUARDIAN_ALERT', 'RAW_SERVER_ANALYSIS', 'MODEL_IMPROVEMENT');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'REVOKED');

-- CreateTable
CREATE TABLE "guardian_accounts" (
    "id" UUID NOT NULL,
    "firebase_uid" VARCHAR(128) NOT NULL,
    "display_name" VARCHAR(80) NOT NULL,
    "email" VARCHAR(254),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "guardian_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_profiles" (
    "id" UUID NOT NULL,
    "display_name" VARCHAR(80) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subject_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_connections" (
    "id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "role" "RelationshipRole" NOT NULL,
    "status" "CareConnectionStatus" NOT NULL DEFAULT 'PENDING_CONSENT',
    "share_level" "ShareLevel" NOT NULL DEFAULT 'MINIMAL',
    "auto_alert_threshold" "AlertThreshold" NOT NULL DEFAULT 'NONE',
    "guardian_receive_threshold" "ReceiveThreshold" NOT NULL DEFAULT 'CRITICAL',
    "push_enabled" BOOLEAN NOT NULL DEFAULT true,
    "subject_settings_version" INTEGER NOT NULL DEFAULT 1,
    "guardian_settings_version" INTEGER NOT NULL DEFAULT 1,
    "activated_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "care_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activation_codes" (
    "id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "code_digest" CHAR(64) NOT NULL,
    "status" "ActivationCodeStatus" NOT NULL DEFAULT 'ISSUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_attempt_at" TIMESTAMPTZ(3),
    "consumed_at" TIMESTAMPTZ(3),
    "invalidated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activation_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activation_sessions" (
    "id" UUID NOT NULL,
    "activation_code_id" UUID NOT NULL,
    "token_digest" CHAR(64) NOT NULL,
    "status" "ActivationSessionStatus" NOT NULL DEFAULT 'ISSUED',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "invalidated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "public_key_fingerprint" CHAR(64) NOT NULL,
    "credential_digest" CHAR(64) NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'PENDING',
    "activated_at" TIMESTAMPTZ(3),
    "last_seen_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "device_id" UUID,
    "connection_id" UUID,
    "type" "ConsentType" NOT NULL,
    "status" "ConsentStatus" NOT NULL,
    "text_version" VARCHAR(40) NOT NULL,
    "scope" JSONB,
    "granted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guardian_accounts_firebase_uid_key" ON "guardian_accounts"("firebase_uid");

-- CreateIndex
CREATE INDEX "care_connections_guardian_id_status_idx" ON "care_connections"("guardian_id", "status");

-- CreateIndex
CREATE INDEX "care_connections_subject_id_status_idx" ON "care_connections"("subject_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "care_connections_guardian_id_subject_id_key" ON "care_connections"("guardian_id", "subject_id");

-- P0 allows only one active guardian connection per subject.
CREATE UNIQUE INDEX "care_connections_one_active_per_subject_key"
ON "care_connections"("subject_id")
WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "activation_codes_code_digest_key" ON "activation_codes"("code_digest");

-- CreateIndex
CREATE INDEX "activation_codes_guardian_id_created_at_idx" ON "activation_codes"("guardian_id", "created_at");

-- CreateIndex
CREATE INDEX "activation_codes_subject_id_status_expires_at_idx" ON "activation_codes"("subject_id", "status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "activation_sessions_token_digest_key" ON "activation_sessions"("token_digest");

-- CreateIndex
CREATE INDEX "activation_sessions_activation_code_id_status_idx" ON "activation_sessions"("activation_code_id", "status");

-- CreateIndex
CREATE INDEX "activation_sessions_status_expires_at_idx" ON "activation_sessions"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "devices_public_key_fingerprint_key" ON "devices"("public_key_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "devices_credential_digest_key" ON "devices"("credential_digest");

-- CreateIndex
CREATE INDEX "devices_subject_id_status_idx" ON "devices"("subject_id", "status");

-- CreateIndex
CREATE INDEX "consents_subject_id_type_created_at_idx" ON "consents"("subject_id", "type", "created_at");

-- CreateIndex
CREATE INDEX "consents_connection_id_type_status_idx" ON "consents"("connection_id", "type", "status");

-- State timestamps are guarded at the database boundary as well as in application services.
ALTER TABLE "care_connections"
ADD CONSTRAINT "care_connections_status_timestamp_check"
CHECK (
  ("status" = 'PENDING_CONSENT' AND "activated_at" IS NULL AND "revoked_at" IS NULL)
  OR ("status" = 'ACTIVE' AND "activated_at" IS NOT NULL AND "revoked_at" IS NULL)
  OR ("status" = 'REVOKED' AND "revoked_at" IS NOT NULL)
);

ALTER TABLE "activation_codes"
ADD CONSTRAINT "activation_codes_state_check"
CHECK (
  "attempts" >= 0
  AND "expires_at" > "created_at"
  AND ("status" <> 'CONSUMED' OR "consumed_at" IS NOT NULL)
  AND ("status" <> 'INVALIDATED' OR "invalidated_at" IS NOT NULL)
);

ALTER TABLE "activation_sessions"
ADD CONSTRAINT "activation_sessions_state_check"
CHECK (
  "expires_at" > "created_at"
  AND ("status" <> 'CONSUMED' OR "consumed_at" IS NOT NULL)
  AND ("status" <> 'INVALIDATED' OR "invalidated_at" IS NOT NULL)
);

ALTER TABLE "devices"
ADD CONSTRAINT "devices_state_check"
CHECK (
  ("status" = 'PENDING' AND "activated_at" IS NULL AND "revoked_at" IS NULL)
  OR ("status" = 'ACTIVE' AND "activated_at" IS NOT NULL AND "revoked_at" IS NULL)
  OR ("status" = 'REVOKED' AND "revoked_at" IS NOT NULL)
);

ALTER TABLE "consents"
ADD CONSTRAINT "consents_state_check"
CHECK (
  ("status" = 'GRANTED' AND "granted_at" IS NOT NULL AND "revoked_at" IS NULL)
  OR ("status" = 'REVOKED' AND "revoked_at" IS NOT NULL)
);

-- AddForeignKey
ALTER TABLE "care_connections" ADD CONSTRAINT "care_connections_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_connections" ADD CONSTRAINT "care_connections_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_codes" ADD CONSTRAINT "activation_codes_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardian_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_codes" ADD CONSTRAINT "activation_codes_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_sessions" ADD CONSTRAINT "activation_sessions_activation_code_id_fkey" FOREIGN KEY ("activation_code_id") REFERENCES "activation_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "care_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
