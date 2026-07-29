-- CreateEnum
CREATE TYPE "RiskEventType" AS ENUM ('SMS', 'CALL', 'URL', 'MANUAL');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('UNKNOWN', 'SAFE', 'CAUTION', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RiskCategory" AS ENUM ('UNCLASSIFIED', 'GOVERNMENT_IMPERSONATION', 'FAMILY_IMPERSONATION', 'FINANCIAL_FRAUD', 'MALWARE_INSTALLATION', 'CREDENTIAL_THEFT');

-- CreateEnum
CREATE TYPE "AnalysisConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('RECEIVED', 'LOCAL_ANALYZED', 'REPUTATION_CHECKING', 'FINALIZED', 'FINALIZED_PARTIAL');

-- CreateEnum
CREATE TYPE "AnalysisCompleteness" AS ENUM ('PROVISIONAL', 'FINAL', 'FINALIZED_PARTIAL');

-- CreateEnum
CREATE TYPE "UrlReputation" AS ENUM ('CLEAR', 'MALICIOUS', 'SHORTENED', 'SUSPICIOUS', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "RiskSignalGroup" AS ENUM ('URL_REPUTATION', 'RISKY_ACTION', 'IMPERSONATION_PRESSURE', 'PHONE_REPUTATION', 'CORRELATION');

-- CreateEnum
CREATE TYPE "RiskSignalSource" AS ENUM ('CORRELATION', 'KISA', 'PHONE_REPUTATION', 'RULE', 'SAFE_BROWSING', 'USER');

-- CreateTable
CREATE TABLE "risk_events" (
    "id" UUID NOT NULL,
    "client_event_id" VARCHAR(128) NOT NULL,
    "subject_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "type" "RiskEventType" NOT NULL,
    "risk_level" "RiskLevel" NOT NULL,
    "risk_score" INTEGER,
    "category" "RiskCategory" NOT NULL,
    "confidence" "AnalysisConfidence" NOT NULL,
    "analysis_status" "AnalysisStatus" NOT NULL,
    "analysis_completeness" "AnalysisCompleteness" NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "policy_version" VARCHAR(40) NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "request_digest" CHAR(64) NOT NULL,
    "sender_masked" VARCHAR(40),
    "sender_hash" CHAR(64),
    "normalized_length" INTEGER NOT NULL,
    "feature_snapshot" JSONB NOT NULL,
    "recommended_action_ids" TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "risk_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_event_urls" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "normalized_domain" VARCHAR(253) NOT NULL,
    "normalized_url_hash" CHAR(64) NOT NULL,
    "reputation" "UrlReputation" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_event_urls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_signals" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "type" VARCHAR(64) NOT NULL,
    "group" "RiskSignalGroup" NOT NULL,
    "score" INTEGER NOT NULL,
    "evidence" VARCHAR(240) NOT NULL,
    "source" "RiskSignalSource" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_signals_pkey" PRIMARY KEY ("id")
);

-- Keep persisted decisions valid even if a future application path bypasses DTO validation.
ALTER TABLE "risk_events"
ADD CONSTRAINT "risk_events_decision_check"
CHECK (
  ("risk_score" IS NULL OR "risk_score" BETWEEN 0 AND 100)
  AND "normalized_length" >= 0
  AND cardinality("recommended_action_ids") > 0
  AND (
    ("analysis_status" = 'FINALIZED' AND "analysis_completeness" = 'FINAL')
    OR (
      "analysis_status" = 'FINALIZED_PARTIAL'
      AND "analysis_completeness" = 'FINALIZED_PARTIAL'
    )
  )
);

ALTER TABLE "risk_signals"
ADD CONSTRAINT "risk_signals_score_check"
CHECK ("score" BETWEEN 0 AND 100);

-- CreateIndex
CREATE INDEX "risk_events_subject_id_occurred_at_idx" ON "risk_events"("subject_id", "occurred_at");

-- CreateIndex
CREATE INDEX "risk_events_subject_id_risk_level_occurred_at_idx" ON "risk_events"("subject_id", "risk_level", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "risk_events_device_id_client_event_id_key" ON "risk_events"("device_id", "client_event_id");

-- CreateIndex
CREATE INDEX "risk_event_urls_normalized_domain_idx" ON "risk_event_urls"("normalized_domain");

-- CreateIndex
CREATE INDEX "risk_event_urls_normalized_url_hash_idx" ON "risk_event_urls"("normalized_url_hash");

-- CreateIndex
CREATE UNIQUE INDEX "risk_event_urls_event_id_normalized_url_hash_key" ON "risk_event_urls"("event_id", "normalized_url_hash");

-- CreateIndex
CREATE INDEX "risk_signals_event_id_score_idx" ON "risk_signals"("event_id", "score");

-- AddForeignKey
ALTER TABLE "risk_events" ADD CONSTRAINT "risk_events_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subject_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_events" ADD CONSTRAINT "risk_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_event_urls" ADD CONSTRAINT "risk_event_urls_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "risk_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_signals" ADD CONSTRAINT "risk_signals_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "risk_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
