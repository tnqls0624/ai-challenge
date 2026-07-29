package com.dontworry.spike

import java.net.IDN
import java.net.URI
import java.security.MessageDigest
import java.text.Normalizer

enum class LocalRiskLevel {
    UNKNOWN,
    SAFE,
    CAUTION,
    HIGH,
    CRITICAL,
}

data class LocalRiskFeatures(
    val contentAvailable: Boolean,
    val contentTruncated: Boolean,
    val extractionComplete: Boolean,
    val impersonatedEntityTypes: List<String>,
    val normalizedLength: Int,
    val requestsAppInstall: Boolean,
    val requestsPayment: Boolean,
    val requestsRemoteControl: Boolean,
    val requestsSecret: Boolean,
    val riskKeywordIds: List<String>,
)

data class CanonicalRiskUrl(
    val canonical: String,
    val normalizedDomain: String,
    val normalizedUrlHash: String,
)

data class LocalRiskResult(
    val level: LocalRiskLevel,
    val title: String,
    val evidence: List<String>,
    val recommendedActionIds: List<String>,
    val features: LocalRiskFeatures,
    val urls: List<CanonicalRiskUrl>,
)

object LocalRiskAnalyzer {
    const val POLICY_VERSION = "2026-07-28.1"
    const val SCHEMA_VERSION = 1

    private val paymentPattern =
        Regex("(송금|입금|납부|결제|현금|대출).{0,16}(요청|필요|하세|하세요|해라|하십시오|바랍니다|신청)|(계좌|카드).{0,16}(보내|이체|결제|납부)")
    private val appInstallPattern =
        Regex("(앱|어플|애플리케이션|보안 ?프로그램).{0,16}(설치|다운로드)|\\.apk(?:\\s|$)", RegexOption.IGNORE_CASE)
    private val remoteControlPattern =
        Regex("(원격 ?제어|화면 ?공유|팀뷰어|애니데스크|퀵서포트|quicksupport|anydesk|teamviewer)", RegexOption.IGNORE_CASE)
    private val secretPattern =
        Regex("(인증 ?번호|비밀번호|보안 ?카드|주민 ?등록 ?번호|otp).{0,16}(알려|입력|전달|보내)", RegexOption.IGNORE_CASE)
    private val urlPattern = Regex("https?://[^\\s<>\"']+", RegexOption.IGNORE_CASE)
    private val shortenerDomains = setOf(
        "bit.ly",
        "goo.gl",
        "han.gl",
        "is.gd",
        "me2.do",
        "naver.me",
        "tinyurl.com",
        "t.co",
    )

    fun analyze(rawText: String): LocalRiskResult {
        val text = normalizeText(rawText)
        val requestsPayment = paymentPattern.containsMatchIn(text)
        val requestsAppInstall = appInstallPattern.containsMatchIn(text)
        val requestsRemoteControl = remoteControlPattern.containsMatchIn(text)
        val requestsSecret = secretPattern.containsMatchIn(text)
        val entities = buildList {
            if (Regex("(검찰|경찰|수사관|법원)").containsMatchIn(text)) add("LAW_ENFORCEMENT")
            if (Regex("(건강보험|국세청|금융감독원|공공기관|정부|구청|시청)").containsMatchIn(text)) {
                add("PUBLIC_AGENCY")
            }
            if (Regex("(은행|카드사|저축은행|금융기관)").containsMatchIn(text)) {
                add("FINANCIAL_INSTITUTION")
            }
            if (Regex("(엄마|아빠|어머니|아버지|아들|딸|자녀)").containsMatchIn(text)) add("FAMILY")
            if (Regex("(택배|배송|우체국)").containsMatchIn(text)) add("DELIVERY")
        }.distinct()
        val urgency = Regex("(긴급|즉시|당장|오늘까지|지금 바로|시간이 없)").containsMatchIn(text)
        val fear = Regex("(체포|구속|압류|처벌|계정 정지|피해 발생)").containsMatchIn(text)
        val secrecy = Regex("(비밀|아무에게도|말하지 마|보안 유지)").containsMatchIn(text)
        val keywordIds = buildList {
            if (urgency) add("URGENCY")
            if (fear) add("FEAR")
            if (secrecy) add("SECRECY")
            if (requestsPayment) add("PAYMENT_REQUEST")
            if (requestsAppInstall) add("APP_INSTALL")
            if (requestsRemoteControl) add("REMOTE_CONTROL")
            if (requestsSecret) add("SECRET_REQUEST")
        }
        val urls = urlPattern.findAll(text)
            .mapNotNull { canonicalizeUrl(it.value.trimEnd('.', ',', ')', ']', '}', '!', '?')) }
            .distinctBy(CanonicalRiskUrl::normalizedUrlHash)
            .take(5)
            .toList()
        val suspiciousUrl = urls.any(::looksSuspicious)
        val hasPressure = entities.isNotEmpty() || urgency || fear || secrecy

        val level = when {
            requestsPayment && entities.isNotEmpty() -> LocalRiskLevel.CRITICAL
            requestsAppInstall && (requestsRemoteControl || secrecy) -> LocalRiskLevel.CRITICAL
            requestsSecret -> LocalRiskLevel.HIGH
            requestsPayment || requestsAppInstall || requestsRemoteControl || hasPressure ||
                suspiciousUrl -> LocalRiskLevel.CAUTION
            urls.isNotEmpty() -> LocalRiskLevel.UNKNOWN
            text.length >= 8 -> LocalRiskLevel.SAFE
            else -> LocalRiskLevel.UNKNOWN
        }
        val evidence = buildList {
            if (requestsPayment) add("송금·결제 등 금전 행동을 요구합니다.")
            if (requestsAppInstall) add("확인되지 않은 앱 설치를 요구합니다.")
            if (requestsRemoteControl) add("기기 원격 제어 또는 화면 공유를 요구합니다.")
            if (requestsSecret) add("인증번호·비밀번호 등 비밀정보를 요구합니다.")
            if (hasPressure) add("기관·가족 사칭 또는 긴급한 행동 압박 표현이 있습니다.")
            if (suspiciousUrl) add("목적지를 바로 확인하기 어려운 링크가 포함되어 있습니다.")
            if (isEmpty()) {
                add(
                    if (urls.isEmpty()) "현재 로컬 규칙에서 뚜렷한 위험 요구를 찾지 못했습니다."
                    else "링크의 외부 평판 확인이 필요합니다.",
                )
            }
        }.take(3)

        return LocalRiskResult(
            level = level,
            title = when (level) {
                LocalRiskLevel.CRITICAL -> "매우 위험한 요청입니다"
                LocalRiskLevel.HIGH -> "위험 신호가 확인되었습니다"
                LocalRiskLevel.CAUTION -> "주의해서 확인해 주세요"
                LocalRiskLevel.SAFE -> "뚜렷한 위험 신호가 없습니다"
                LocalRiskLevel.UNKNOWN -> "추가 확인이 필요합니다"
            },
            evidence = evidence,
            recommendedActionIds = when (level) {
                LocalRiskLevel.CRITICAL, LocalRiskLevel.HIGH ->
                    listOf("STOP_CONTACT", "VERIFY_OFFICIAL_CHANNEL", "CONTACT_GUARDIAN")
                LocalRiskLevel.CAUTION, LocalRiskLevel.UNKNOWN ->
                    listOf("VERIFY_OFFICIAL_CHANNEL")
                LocalRiskLevel.SAFE -> emptyList()
            },
            features = LocalRiskFeatures(
                contentAvailable = text.isNotEmpty(),
                contentTruncated = false,
                extractionComplete = true,
                impersonatedEntityTypes = entities,
                normalizedLength = text.length,
                requestsAppInstall = requestsAppInstall,
                requestsPayment = requestsPayment,
                requestsRemoteControl = requestsRemoteControl,
                requestsSecret = requestsSecret,
                riskKeywordIds = keywordIds,
            ),
            urls = urls,
        )
    }

    fun normalizeText(value: String): String {
        return Normalizer.normalize(value, Normalizer.Form.NFKC)
            .replace(Regex("\\s+"), " ")
            .trim()
    }

    fun canonicalizeUrl(rawValue: String): CanonicalRiskUrl? {
        if (rawValue.isBlank() || rawValue.length > 2_048) return null
        return runCatching {
            val parsed = URI(rawValue)
            val scheme = parsed.scheme?.lowercase()
            if (scheme != "http" && scheme != "https") return null
            if (parsed.rawUserInfo != null) return null
            val rawHost = parsed.host ?: return null
            val hostname = IDN.toASCII(rawHost.removeSuffix(".").lowercase())
            if (isPrivateOrReserved(hostname)) return null
            val port = when {
                parsed.port == 80 && scheme == "http" -> -1
                parsed.port == 443 && scheme == "https" -> -1
                else -> parsed.port
            }
            val canonical = URI(
                scheme,
                null,
                hostname,
                port,
                parsed.path.ifEmpty { "/" },
                parsed.query,
                null,
            ).toASCIIString()
            CanonicalRiskUrl(
                canonical = canonical,
                normalizedDomain = hostname,
                normalizedUrlHash = sha256(canonical),
            )
        }.getOrNull()
    }

    private fun looksSuspicious(url: CanonicalRiskUrl): Boolean {
        val labels = url.normalizedDomain.split('.')
        return url.normalizedDomain in shortenerDomains ||
            labels.any { it.startsWith("xn--") } ||
            labels.size > 5 ||
            url.normalizedDomain.matches(Regex("\\d{1,3}(\\.\\d{1,3}){3}"))
    }

    private fun isPrivateOrReserved(hostname: String): Boolean {
        if (
            hostname == "localhost" ||
            hostname.endsWith(".localhost") ||
            hostname == "metadata.google.internal"
        ) {
            return true
        }
        val parts = hostname.split('.').mapNotNull(String::toIntOrNull)
        if (parts.size != 4) return false
        val first = parts[0]
        val second = parts[1]
        return first == 0 ||
            first == 10 ||
            first == 127 ||
            first >= 224 ||
            (first == 100 && second in 64..127) ||
            (first == 169 && second == 254) ||
            (first == 172 && second in 16..31) ||
            (first == 192 && second == 168)
    }
}

fun sha256(value: String): String {
    return MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
}
