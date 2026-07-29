package com.dontworry.spike

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LocalRiskAnalyzerTest {
    @Test
    fun `law enforcement impersonation plus payment is critical`() {
        val result = LocalRiskAnalyzer.analyze(
            "검찰 수사관입니다. 오늘까지 안전 계좌로 송금하세요.",
        )

        assertEquals(LocalRiskLevel.CRITICAL, result.level)
        assertTrue(result.features.requestsPayment)
        assertTrue(result.features.impersonatedEntityTypes.contains("LAW_ENFORCEMENT"))
    }

    @Test
    fun `secret request is high`() {
        val result = LocalRiskAnalyzer.analyze("인증번호를 지금 알려 주세요")

        assertEquals(LocalRiskLevel.HIGH, result.level)
        assertTrue(result.features.requestsSecret)
    }

    @Test
    fun `app install plus remote control is critical`() {
        val result = LocalRiskAnalyzer.analyze(
            "보안 앱을 설치하고 AnyDesk로 화면 공유하세요.",
        )

        assertEquals(LocalRiskLevel.CRITICAL, result.level)
        assertTrue(result.features.requestsAppInstall)
        assertTrue(result.features.requestsRemoteControl)
    }

    @Test
    fun `ordinary complete text is safe locally`() {
        val result = LocalRiskAnalyzer.analyze("내일 오전 열 시에 병원 앞에서 만나요.")

        assertEquals(LocalRiskLevel.SAFE, result.level)
        assertTrue(result.recommendedActionIds.isEmpty())
    }

    @Test
    fun `ordinary public link stays unknown until reputation lookup`() {
        val result = LocalRiskAnalyzer.analyze("자세한 내용은 https://example.com/help 에서 확인하세요.")

        assertEquals(LocalRiskLevel.UNKNOWN, result.level)
        assertEquals("https://example.com/help", result.urls.single().canonical)
    }

    @Test
    fun `shortened link is caution`() {
        val result = LocalRiskAnalyzer.analyze("https://bit.ly/example 를 확인해 주세요.")

        assertEquals(LocalRiskLevel.CAUTION, result.level)
    }

    @Test
    fun `canonicalization strips default port and fragment`() {
        val url = LocalRiskAnalyzer.canonicalizeUrl(
            "HTTPS://Example.INVALID:443/pay?q=1#private",
        )

        assertEquals("https://example.invalid/pay?q=1", url?.canonical)
        assertEquals("example.invalid", url?.normalizedDomain)
        assertTrue(url?.normalizedUrlHash?.matches(Regex("[a-f0-9]{64}")) == true)
    }

    @Test
    fun `private and credentialed URLs are rejected`() {
        assertNull(LocalRiskAnalyzer.canonicalizeUrl("http://127.0.0.1/private"))
        assertNull(LocalRiskAnalyzer.canonicalizeUrl("https://user:pass@example.com/"))
    }

    @Test
    fun `analysis result does not retain raw input`() {
        val secret = "이 문자열은 결과 객체에 남으면 안 됩니다 12345"
        val result = LocalRiskAnalyzer.analyze(secret)

        assertFalse(result.toString().contains(secret))
    }
}
