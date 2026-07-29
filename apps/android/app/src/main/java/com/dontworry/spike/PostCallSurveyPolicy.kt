package com.dontworry.spike

data class PostCallSurveyAnswers(
    val clickedLink: Boolean,
    val enteredPersonalInformation: Boolean,
    val installedApp: Boolean,
    val requestedAppInstall: Boolean,
    val requestedPayment: Boolean,
    val requestedRemoteControl: Boolean,
    val requestedSecret: Boolean,
    val transferredMoney: Boolean,
)

data class PostCallSurveyDecision(
    val level: String,
    val message: String,
    val stage: String,
)

object PostCallSurveyPolicy {
    fun evaluate(answers: PostCallSurveyAnswers): PostCallSurveyDecision {
        val level = when {
            answers.transferredMoney || answers.installedApp ||
                (answers.requestedAppInstall && answers.requestedRemoteControl) -> "CRITICAL"
            answers.enteredPersonalInformation || answers.requestedSecret -> "HIGH"
            answers.clickedLink || answers.requestedPayment || answers.requestedAppInstall ||
                answers.requestedRemoteControl -> "CAUTION"
            else -> "UNKNOWN"
        }
        val stage = when {
            answers.transferredMoney -> "S4"
            answers.installedApp -> "S3"
            answers.enteredPersonalInformation -> "S2"
            answers.clickedLink -> "S1"
            else -> "S0"
        }
        val message = when (stage) {
            "S4" -> "112와 은행에 즉시 연락해 신고와 지급정지를 요청하세요."
            "S3" -> "네트워크를 끄고 안전한 다른 기기에서 공식 점검 도움을 받으세요."
            "S2" -> "비밀번호를 바꾸고 금융기관에 개인정보 노출 사실을 알리세요."
            "S1" -> "링크를 닫고 파일이나 앱을 설치하지 마세요."
            else -> if (level == "UNKNOWN") {
                "해당 항목이 없다면 공식번호로 한 번 더 확인하세요."
            } else {
                "상대방과의 연락을 멈추고 공식번호와 보호자에게 확인하세요."
            }
        }
        return PostCallSurveyDecision(level = level, message = message, stage = stage)
    }
}
