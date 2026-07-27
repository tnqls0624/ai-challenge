package com.dontworry.spike

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NotificationContentExtractorTest {
    @Test
    fun `single text is full`() {
        val result = NotificationContentExtractor.extract(snapshot(text = "정상 본문"))
        assertEquals(ContentAvailability.FULL, result.availability)
        assertEquals("정상 본문", result.bodyCandidate)
    }

    @Test
    fun `big text wins over collapsed text`() {
        val result = NotificationContentExtractor.extract(
            snapshot(text = "짧은 본문…", bigText = "여러 줄의 전체 본문"),
        )
        assertEquals(ContentAvailability.FULL, result.availability)
        assertEquals("여러 줄의 전체 본문", result.bodyCandidate)
    }

    @Test
    fun `text lines preserve order`() {
        val result = NotificationContentExtractor.extract(
            snapshot(textLines = listOf("첫째 줄", "둘째 줄")),
        )
        assertEquals("첫째 줄\n둘째 줄", result.bodyCandidate)
    }

    @Test
    fun `missing body is unavailable`() {
        val result = NotificationContentExtractor.extract(snapshot())
        assertEquals(ContentAvailability.UNAVAILABLE, result.availability)
        assertNull(result.bodyCandidate)
    }

    @Test
    fun `ellipsis marks partial body`() {
        val result = NotificationContentExtractor.extract(snapshot(text = "본문 일부…"))
        assertEquals(ContentAvailability.PARTIAL, result.availability)
    }

    @Test
    fun `hidden sensitive text is unavailable and never inferred`() {
        val result = NotificationContentExtractor.extract(snapshot(text = "민감한 알림 콘텐츠가 숨겨졌습니다"))
        assertEquals(ContentAvailability.UNAVAILABLE, result.availability)
        assertNull(result.bodyCandidate)
    }

    @Test
    fun `messaging text preserves order and has priority`() {
        val result = NotificationContentExtractor.extract(
            snapshot(
                text = "요약",
                messagingTexts = listOf("첫 메시지", "둘째 메시지"),
            ),
        )
        assertEquals("첫 메시지\n둘째 메시지", result.bodyCandidate)
    }

    private fun snapshot(
        text: String? = null,
        bigText: String? = null,
        textLines: List<String> = emptyList(),
        messagingTexts: List<String> = emptyList(),
    ) = NotificationSnapshot(
        title = "합성 발신자",
        text = text,
        bigText = bigText,
        textLines = textLines,
        messagingTexts = messagingTexts,
    )
}
