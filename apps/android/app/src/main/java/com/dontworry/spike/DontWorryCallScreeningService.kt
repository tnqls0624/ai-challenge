package com.dontworry.spike

import android.os.SystemClock
import android.telecom.Call
import android.telecom.CallScreeningService
import android.telephony.PhoneNumberUtils

class DontWorryCallScreeningService : CallScreeningService() {
    override fun onScreenCall(callDetails: Call.Details) {
        val startedAt = SystemClock.elapsedRealtimeNanos()
        val normalizedNumber = PhoneNumberUtils.normalizeNumber(
            callDetails.handle?.schemeSpecificPart.orEmpty(),
        )
        val numberHash = sha256(normalizedNumber)
        val decision = CallDecisionPolicy.evaluate(
            numberHash = numberHash,
            demoNumberHash = sha256(PhoneNumberUtils.normalizeNumber(BuildConfig.SPIKE_DEMO_NUMBER)),
            debug = BuildConfig.DEBUG,
        )

        val response = CallResponse.Builder()
            .setDisallowCall(decision.block)
            .setRejectCall(decision.block)
            .setSilenceCall(decision.silence)
            .setSkipCallLog(false)
            .setSkipNotification(false)
            .build()

        respondToCall(callDetails, response)

        val elapsedMs = (SystemClock.elapsedRealtimeNanos() - startedAt) / 1_000_000
        SpikeTelemetryStore(this).recordScreening(
            numberHash = numberHash,
            decision = decision,
            elapsedMs = elapsedMs,
        )

        if (!decision.block) {
            SpikeNotifications.showWarning(
                context = this,
                title = "확인이 필요한 전화입니다",
                message = "통화 중에는 송금·앱 설치·인증번호 전달을 하지 마세요.",
            )
        }
    }
}
