package com.dontworry.spike

import org.junit.Assert.assertEquals
import org.junit.Test

class PostCallSurveyPolicyTest {
    @Test
    fun `confirmed actions map to the highest damage stage`() {
        assertDecision(answer(clickedLink = true), "CAUTION", "S1")
        assertDecision(answer(enteredPersonalInformation = true), "HIGH", "S2")
        assertDecision(answer(installedApp = true), "CRITICAL", "S3")
        assertDecision(answer(transferredMoney = true), "CRITICAL", "S4")
    }

    @Test
    fun `app install plus remote control request is critical before action`() {
        assertDecision(
            answer(requestedAppInstall = true, requestedRemoteControl = true),
            "CRITICAL",
            "S0",
        )
    }

    @Test
    fun `no selected behavior remains unknown`() {
        assertDecision(answer(), "UNKNOWN", "S0")
    }

    private fun assertDecision(
        answers: PostCallSurveyAnswers,
        expectedLevel: String,
        expectedStage: String,
    ) {
        val result = PostCallSurveyPolicy.evaluate(answers)
        assertEquals(expectedLevel, result.level)
        assertEquals(expectedStage, result.stage)
    }

    private fun answer(
        clickedLink: Boolean = false,
        enteredPersonalInformation: Boolean = false,
        installedApp: Boolean = false,
        requestedAppInstall: Boolean = false,
        requestedPayment: Boolean = false,
        requestedRemoteControl: Boolean = false,
        requestedSecret: Boolean = false,
        transferredMoney: Boolean = false,
    ) = PostCallSurveyAnswers(
        clickedLink = clickedLink,
        enteredPersonalInformation = enteredPersonalInformation,
        installedApp = installedApp,
        requestedAppInstall = requestedAppInstall,
        requestedPayment = requestedPayment,
        requestedRemoteControl = requestedRemoteControl,
        requestedSecret = requestedSecret,
        transferredMoney = transferredMoney,
    )
}
