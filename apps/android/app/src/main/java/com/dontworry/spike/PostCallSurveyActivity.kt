package com.dontworry.spike

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.util.concurrent.Executors

@SuppressLint("SetTextI18n")
class PostCallSurveyActivity : Activity() {
    private val executor = Executors.newSingleThreadExecutor()
    private val api = DontWorryApiClient()
    private lateinit var sessionStore: DeviceSessionStore
    private lateinit var requestedPayment: CheckBox
    private lateinit var requestedAppInstall: CheckBox
    private lateinit var requestedRemoteControl: CheckBox
    private lateinit var requestedSecret: CheckBox
    private lateinit var clickedLink: CheckBox
    private lateinit var enteredPersonalInformation: CheckBox
    private lateinit var installedApp: CheckBox
    private lateinit var transferredMoney: CheckBox
    private lateinit var submitButton: Button
    private lateinit var resultView: TextView
    private var serverEventId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sessionStore = DeviceSessionStore(this)
        setContentView(buildContent())
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun buildContent(): ScrollView {
        requestedPayment = answer("송금·결제를 요구받음")
        requestedAppInstall = answer("앱 설치를 요구받음")
        requestedRemoteControl = answer("원격 제어·화면 공유를 요구받음")
        requestedSecret = answer("인증번호·비밀번호를 요구받음")
        clickedLink = answer("상대방이 보낸 링크를 열었음")
        enteredPersonalInformation = answer("개인정보·인증정보를 입력했음")
        installedApp = answer("상대방 안내로 앱을 설치했음")
        transferredMoney = answer("이미 송금·결제를 했음")
        submitButton = Button(this).apply {
            text = "선택한 내용 확인"
            textSize = 19f
            isAllCaps = false
            minHeight = 60
            setOnClickListener { submit() }
        }
        resultView = TextView(this).apply {
            textSize = 18f
            setPadding(0, 28, 0, 0)
        }
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 48)
            addView(TextView(this@PostCallSurveyActivity).apply {
                text = "방금 통화에서 받은 요구를 확인해 주세요"
                textSize = 28f
            })
            addView(TextView(this@PostCallSurveyActivity).apply {
                text = "해당하는 항목을 모두 선택하세요. 통화 내용은 수집하지 않습니다."
                textSize = 17f
                setPadding(0, 12, 0, 20)
            })
            listOf(
                requestedPayment,
                requestedAppInstall,
                requestedRemoteControl,
                requestedSecret,
                clickedLink,
                enteredPersonalInformation,
                installedApp,
                transferredMoney,
            ).forEach(::addView)
            addView(
                submitButton,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply { topMargin = 20 },
            )
            addView(resultView)
        }
        return ScrollView(this).apply { addView(content) }
    }

    private fun answer(label: String): CheckBox {
        return CheckBox(this).apply {
            text = label
            textSize = 18f
            minHeight = 56
        }
    }

    private fun submit() {
        val answers = answers()
        val decision = PostCallSurveyPolicy.evaluate(answers)
        resultView.text = """
            기기 즉시 결과 · ${levelLabel(decision.level)}
            피해 단계: ${decision.stage}
            ${decision.message}
        """.trimIndent()
        if (decision.level == "HIGH" || decision.level == "CRITICAL") {
            SpikeNotifications.showWarning(
                context = this,
                title = if (decision.level == "CRITICAL") {
                    "지금 바로 대응이 필요한 상황입니다"
                } else {
                    "위험 행동이 확인되었습니다"
                },
                message = decision.message,
            )
        }

        val credential = sessionStore.readCredential()
        if (credential == null) {
            resultView.append("\n\n보호자 연결 전이라 서버 사건 생성은 생략했습니다.")
            return
        }
        submitButton.isEnabled = false
        resultView.append("\n\n보호자 공동대응 항목을 준비하고 있습니다…")
        executor.execute {
            runCatching {
                val eventId = serverEventId ?: api.createCallEvent(credential).also {
                    serverEventId = it
                }
                api.submitPostCallSurvey(eventId, answers, credential)
            }.onSuccess { server ->
                runOnUiThread {
                    submitButton.isEnabled = true
                    resultView.text = buildString {
                        append("서버 최종 결과 · ${levelLabel(server.level)}")
                        append("\n피해 단계: ${server.incidentStage ?: "사건 없음"}")
                        append("\n분석 상태: ${completenessLabel(server.completeness)}")
                        if (server.evidence.isNotEmpty()) {
                            append("\n\n")
                            append(server.evidence.take(3).joinToString("\n") { "• $it" })
                        }
                    }
                }
            }.onFailure { error ->
                runOnUiThread {
                    submitButton.isEnabled = true
                    resultView.append(
                        "\n\n서버 확인을 완료하지 못했습니다. 로컬 안내를 유지합니다. " +
                            error.userMessage("잠시 후 다시 시도해 주세요."),
                    )
                }
            }
        }
    }

    private fun answers(): PostCallSurveyAnswers {
        return PostCallSurveyAnswers(
            clickedLink = clickedLink.isChecked,
            enteredPersonalInformation = enteredPersonalInformation.isChecked,
            installedApp = installedApp.isChecked,
            requestedAppInstall = requestedAppInstall.isChecked,
            requestedPayment = requestedPayment.isChecked,
            requestedRemoteControl = requestedRemoteControl.isChecked,
            requestedSecret = requestedSecret.isChecked,
            transferredMoney = transferredMoney.isChecked,
        )
    }
}
