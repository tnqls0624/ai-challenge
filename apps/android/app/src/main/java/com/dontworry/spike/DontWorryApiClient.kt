package com.dontworry.spike

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.util.UUID

data class ActivationPreview(
    val activationSessionId: String,
    val autoAlertConsentVersion: String,
    val careConnectionConsentVersion: String,
    val expiresAt: String,
    val guardianDisplayName: String,
    val relationshipRole: String,
    val subjectDisplayName: String,
)

data class ActivatedDevice(
    val careConnectionId: String,
    val deviceCredential: String,
    val deviceId: String,
    val subjectId: String,
)

data class ServerRiskResult(
    val completeness: String,
    val evidence: List<String>,
    val level: String,
    val recommendedActionIds: List<String>,
)

data class PostCallServerResult(
    val completeness: String,
    val evidence: List<String>,
    val incidentStage: String?,
    val level: String,
)

class DontWorryApiException(
    val status: Int,
    val code: String,
    override val message: String,
) : RuntimeException(message)

class DontWorryApiClient(
    private val baseUrl: String = BuildConfig.API_BASE_URL,
) {
    fun previewActivation(code: String, installationId: String): ActivationPreview {
        val response = post(
            path = "/v1/devices/activation-previews",
            body = JSONObject()
                .put("code", code)
                .put("deviceInstallationId", installationId),
        )
        val versions = response.getJSONObject("consentTextVersions")
        return ActivationPreview(
            activationSessionId = response.getString("activationSessionId"),
            autoAlertConsentVersion = versions.getString("autoGuardianAlert"),
            careConnectionConsentVersion = versions.getString("careConnection"),
            expiresAt = response.getString("expiresAt"),
            guardianDisplayName = response.getString("guardianDisplayName"),
            relationshipRole = response.getString("relationshipRole"),
            subjectDisplayName = response.getString("subjectDisplayName"),
        )
    }

    fun activate(
        preview: ActivationPreview,
        installationId: String,
        publicKey: String,
        shareLevel: String,
        autoAlertGranted: Boolean,
    ): ActivatedDevice {
        val body = JSONObject()
            .put("activationSessionId", preview.activationSessionId)
            .put("deviceInstallationId", installationId)
            .put("devicePublicKey", publicKey)
            .put("shareLevel", shareLevel)
            .put(
                "careConnectionConsent",
                JSONObject()
                    .put("granted", true)
                    .put("consentTextVersion", preview.careConnectionConsentVersion),
            )
            .put(
                "autoGuardianAlertConsent",
                JSONObject()
                    .put("granted", autoAlertGranted)
                    .put("threshold", if (autoAlertGranted) "CRITICAL" else "NONE")
                    .put("consentTextVersion", preview.autoAlertConsentVersion),
            )
        val response = post(
            path = "/v1/devices/activate",
            body = body,
            headers = mapOf("Idempotency-Key" to "activate-${UUID.randomUUID()}"),
        )
        return ActivatedDevice(
            careConnectionId = response.getString("careConnectionId"),
            deviceCredential = response.getString("deviceCredential"),
            deviceId = response.getString("deviceId"),
            subjectId = response.getString("subjectId"),
        )
    }

    fun createManualRiskEvent(
        result: LocalRiskResult,
        credential: String,
    ): ServerRiskResult {
        val eventId = UUID.randomUUID().toString()
        val features = result.features
        val body = JSONObject()
            .put("schemaVersion", LocalRiskAnalyzer.SCHEMA_VERSION)
            .put("policyVersion", LocalRiskAnalyzer.POLICY_VERSION)
            .put("eventId", eventId)
            .put("type", "MANUAL")
            .put("occurredAt", Instant.now().toString())
            .put(
                "urls",
                JSONArray().apply {
                    result.urls.forEach { url ->
                        put(
                            JSONObject()
                                .put("canonical", url.canonical)
                                .put("normalizedDomain", url.normalizedDomain)
                                .put("normalizedUrlHash", url.normalizedUrlHash),
                        )
                    }
                },
            )
            .put(
                "features",
                JSONObject()
                    .put("contentAvailable", features.contentAvailable)
                    .put("extractionComplete", features.extractionComplete)
                    .put("contentTruncated", features.contentTruncated)
                    .put("normalizedLength", features.normalizedLength)
                    .put("impersonatedEntityTypes", JSONArray(features.impersonatedEntityTypes))
                    .put("riskKeywordIds", JSONArray(features.riskKeywordIds))
                    .put("requestsPayment", features.requestsPayment)
                    .put("requestsAppInstall", features.requestsAppInstall)
                    .put("requestsRemoteControl", features.requestsRemoteControl)
                    .put("requestsSecret", features.requestsSecret),
            )
        if (result.level != LocalRiskLevel.UNKNOWN) {
            body.put("localDecision", JSONObject().put("level", result.level.name))
        }
        val response = post(
            path = "/v1/risk-events",
            body = body,
            headers = mapOf(
                "Authorization" to "Bearer $credential",
                "Idempotency-Key" to "manual-$eventId",
            ),
        )
        val signals = response.getJSONArray("signals")
        val evidence = buildList {
            for (index in 0 until signals.length()) {
                add(signals.getJSONObject(index).getString("evidence"))
            }
        }
        return ServerRiskResult(
            completeness = response.getString("completeness"),
            evidence = evidence,
            level = response.getString("level"),
            recommendedActionIds = response.getJSONArray("recommendedActionIds").toStringList(),
        )
    }

    fun createCallEvent(credential: String): String {
        val eventId = UUID.randomUUID().toString()
        val body = JSONObject()
            .put("schemaVersion", LocalRiskAnalyzer.SCHEMA_VERSION)
            .put("policyVersion", LocalRiskAnalyzer.POLICY_VERSION)
            .put("eventId", eventId)
            .put("type", "CALL")
            .put("occurredAt", Instant.now().toString())
            .put("urls", JSONArray())
            .put(
                "features",
                JSONObject()
                    .put("contentAvailable", false)
                    .put("extractionComplete", false)
                    .put("contentTruncated", false)
                    .put("normalizedLength", 0)
                    .put("impersonatedEntityTypes", JSONArray())
                    .put("riskKeywordIds", JSONArray())
                    .put("requestsPayment", false)
                    .put("requestsAppInstall", false)
                    .put("requestsRemoteControl", false)
                    .put("requestsSecret", false),
            )
        return post(
            path = "/v1/risk-events",
            body = body,
            headers = mapOf(
                "Authorization" to "Bearer $credential",
                "Idempotency-Key" to "call-$eventId",
            ),
        ).getString("id")
    }

    fun submitPostCallSurvey(
        eventId: String,
        answers: PostCallSurveyAnswers,
        credential: String,
    ): PostCallServerResult {
        val response = post(
            path = "/v1/risk-events/$eventId/post-call-survey",
            body = JSONObject()
                .put("clickedLink", answers.clickedLink)
                .put("enteredPersonalInformation", answers.enteredPersonalInformation)
                .put("installedApp", answers.installedApp)
                .put("requestedAppInstall", answers.requestedAppInstall)
                .put("requestedPayment", answers.requestedPayment)
                .put("requestedRemoteControl", answers.requestedRemoteControl)
                .put("requestedSecret", answers.requestedSecret)
                .put("transferredMoney", answers.transferredMoney),
            headers = mapOf(
                "Authorization" to "Bearer $credential",
                "Idempotency-Key" to "survey-${UUID.randomUUID()}",
            ),
        )
        val signals = response.getJSONArray("signals")
        val evidence = buildList {
            for (index in 0 until signals.length()) {
                add(signals.getJSONObject(index).getString("evidence"))
            }
        }
        return PostCallServerResult(
            completeness = response.getString("completeness"),
            evidence = evidence,
            incidentStage = if (response.isNull("incidentStage")) {
                null
            } else {
                response.getString("incidentStage")
            },
            level = response.getString("level"),
        )
    }

    private fun post(
        path: String,
        body: JSONObject,
        headers: Map<String, String> = emptyMap(),
    ): JSONObject {
        val connection = URL("${baseUrl.trimEnd('/')}$path").openConnection() as HttpURLConnection
        return try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 5_000
            connection.readTimeout = 8_000
            connection.doOutput = true
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            headers.forEach(connection::setRequestProperty)
            connection.outputStream.use { output ->
                output.write(body.toString().toByteArray(Charsets.UTF_8))
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val responseText = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            val response = if (responseText.isBlank()) JSONObject() else JSONObject(responseText)
            if (status !in 200..299) {
                throw DontWorryApiException(
                    status = status,
                    code = response.optString("code", "HTTP_$status"),
                    message = response.optString("message", "서버 요청에 실패했습니다."),
                )
            }
            response
        } finally {
            connection.disconnect()
        }
    }
}

private fun JSONArray.toStringList(): List<String> {
    return buildList {
        for (index in 0 until length()) add(getString(index))
    }
}
