-- CreateEnum
CREATE TYPE "ExplanationSource" AS ENUM ('TEMPLATE', 'OPENAI');

-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "summary" VARCHAR(400),
ADD COLUMN     "summary_source" "ExplanationSource" NOT NULL DEFAULT 'TEMPLATE';

-- AlterTable
ALTER TABLE "risk_events" ADD COLUMN     "explanation_body" VARCHAR(300),
ADD COLUMN     "explanation_source" "ExplanationSource" NOT NULL DEFAULT 'TEMPLATE',
ADD COLUMN     "explanation_title" VARCHAR(80);
