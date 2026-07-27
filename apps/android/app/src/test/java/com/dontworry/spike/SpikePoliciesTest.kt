package com.dontworry.spike

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SpikePoliciesTest {
    @Test
    fun `only registered debug fixture can be blocked`() {
        val demoHash = sha256("+15551234567")
        assertTrue(CallDecisionPolicy.evaluate(demoHash, demoHash, debug = true).block)
        assertFalse(CallDecisionPolicy.evaluate(sha256("+821012341234"), demoHash, debug = true).block)
        assertFalse(CallDecisionPolicy.evaluate(demoHash, demoHash, debug = false).block)
    }

    @Test
    fun `event key is stable across notification updates`() {
        assertEquals(
            "com.example.messages:42:conversation-1",
            StableEventKey.create("com.example.messages", 42, "conversation-1"),
        )
    }

    @Test
    fun `own package is allowlisted only in debug`() {
        assertTrue(AllowedNotificationPackages.contains("com.dontworry.spike", "com.dontworry.spike", true))
        assertFalse(AllowedNotificationPackages.contains("com.dontworry.spike", "com.dontworry.spike", false))
    }
}
