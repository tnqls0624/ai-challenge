package com.dontworry.spike

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.text.InputFilter
import android.text.InputType
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import java.util.concurrent.Executors

@SuppressLint("SetTextI18n")
class ActivationActivity : Activity() {
    private val executor = Executors.newSingleThreadExecutor()
    private val api = DontWorryApiClient()
    private lateinit var sessionStore: DeviceSessionStore
    private lateinit var codeInput: EditText
    private lateinit var previewButton: Button
    private lateinit var consentSection: LinearLayout
    private lateinit var previewSummary: TextView
    private lateinit var connectionConsent: CheckBox
    private lateinit var autoAlertConsent: CheckBox
    private lateinit var shareLevelGroup: RadioGroup
    private lateinit var activateButton: Button
    private lateinit var status: TextView
    private var preview: ActivationPreview? = null

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
        codeInput = EditText(this).apply {
            hint = "보호자가 알려준 6자리 코드"
            inputType = InputType.TYPE_CLASS_NUMBER
            filters = arrayOf(InputFilter.LengthFilter(6))
            textSize = 20f
        }
        previewButton = actionButton("연결 정보 확인") { requestPreview() }
        previewSummary = TextView(this).apply { textSize = 19f }
        connectionConsent = CheckBox(this).apply {
            text = "보호자와 연결하고 위험 사건을 공유하는 데 동의합니다. (필수)"
            textSize = 17f
            setOnCheckedChangeListener { _, checked -> activateButton.isEnabled = checked }
        }
        autoAlertConsent = CheckBox(this).apply {
            text = "매우 위험한 사건을 보호자에게 자동 알림으로 보내는 데 동의합니다. (선택)"
            textSize = 17f
        }
        shareLevelGroup = RadioGroup(this).apply {
            orientation = RadioGroup.VERTICAL
            addView(RadioButton(this@ActivationActivity).apply {
                id = View.generateViewId()
                tag = "MINIMAL"
                text = "최소 공유 — 위험 수준·유형·시각"
                isChecked = true
            })
            addView(RadioButton(this@ActivationActivity).apply {
                id = View.generateViewId()
                tag = "BASIC"
                text = "기본 공유 — 최소 공유 + 행동 신호·체크리스트"
            })
        }
        activateButton = actionButton("동의하고 보호 시작") { activate() }.apply {
            isEnabled = false
        }
        status = TextView(this).apply {
            textSize = 16f
            setPadding(0, 24, 0, 0)
        }
        consentSection = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
            setPadding(0, 28, 0, 0)
            addView(previewSummary)
            addView(connectionConsent)
            addView(autoAlertConsent)
            addView(TextView(this@ActivationActivity).apply {
                text = "보호자에게 보여줄 범위"
                textSize = 18f
                setPadding(0, 20, 0, 8)
            })
            addView(shareLevelGroup)
            addView(activateButton)
        }
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 48)
            addView(TextView(this@ActivationActivity).apply {
                text = "보호자와 연결"
                textSize = 30f
            })
            addView(TextView(this@ActivationActivity).apply {
                text = "연결 정보와 공유 범위를 확인한 뒤 직접 동의해 주세요."
                textSize = 17f
                setPadding(0, 12, 0, 24)
            })
            addView(codeInput)
            addView(previewButton)
            addView(consentSection)
            addView(status)
        }
        return ScrollView(this).apply { addView(content) }
    }

    private fun requestPreview() {
        val code = codeInput.text.toString().trim()
        if (!code.matches(Regex("\\d{6}"))) {
            status.text = "6자리 숫자 코드를 입력해 주세요."
            return
        }
        setBusy(true, "연결 정보를 확인하고 있습니다…")
        val installationId = sessionStore.getOrCreateInstallationId()
        executor.execute {
            runCatching { api.previewActivation(code, installationId) }
                .onSuccess { result ->
                    runOnUiThread {
                        preview = result
                        previewSummary.text = """
                            대상자: ${result.subjectDisplayName}
                            보호자: ${result.guardianDisplayName}
                            관계: ${relationshipLabel(result.relationshipRole)}
                            만료: ${result.expiresAt}
                        """.trimIndent()
                        consentSection.visibility = View.VISIBLE
                        status.text = "연결 대상이 맞는지 확인하고 동의를 선택해 주세요."
                        setBusy(false)
                    }
                }
                .onFailure { error ->
                    runOnUiThread {
                        setBusy(false, error.userMessage("연결 코드를 확인하지 못했습니다."))
                    }
                }
        }
    }

    private fun activate() {
        val currentPreview = preview ?: return
        if (!connectionConsent.isChecked) {
            status.text = "필수 연결 동의를 확인해 주세요."
            return
        }
        val selected = findViewById<RadioButton>(shareLevelGroup.checkedRadioButtonId)
        val shareLevel = selected?.tag as? String ?: "MINIMAL"
        setBusy(true, "기기 자격증명을 안전하게 만들고 있습니다…")
        executor.execute {
            runCatching {
                api.activate(
                    preview = currentPreview,
                    installationId = sessionStore.getOrCreateInstallationId(),
                    publicKey = sessionStore.getOrCreatePublicKey(),
                    shareLevel = shareLevel,
                    autoAlertGranted = autoAlertConsent.isChecked,
                )
            }.onSuccess { activation ->
                sessionStore.saveActivation(
                    credential = activation.deviceCredential,
                    deviceId = activation.deviceId,
                    subjectId = activation.subjectId,
                    careConnectionId = activation.careConnectionId,
                )
                runOnUiThread {
                    status.text = "연결이 완료되었습니다. 이제 문자 직접 확인을 사용할 수 있습니다."
                    setBusy(false)
                    activateButton.isEnabled = false
                    codeInput.isEnabled = false
                }
            }.onFailure { error ->
                runOnUiThread {
                    setBusy(false, error.userMessage("기기를 활성화하지 못했습니다."))
                }
            }
        }
    }

    private fun setBusy(busy: Boolean, message: String? = null) {
        previewButton.isEnabled = !busy
        activateButton.isEnabled = !busy && connectionConsent.isChecked
        if (message != null) status.text = message
    }

    private fun actionButton(label: String, action: () -> Unit): Button {
        return Button(this).apply {
            text = label
            textSize = 18f
            isAllCaps = false
            setOnClickListener { action() }
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = 16 }
            minHeight = 56
        }
    }
}

private fun relationshipLabel(role: String): String {
    return when (role) {
        "CHILD" -> "자녀"
        "RELATIVE" -> "친지"
        "SOCIAL_WORKER" -> "생활지원사"
        else -> "보호자"
    }
}

fun Throwable.userMessage(fallback: String): String {
    return when (this) {
        is DontWorryApiException -> "$fallback ($code)"
        else -> "$fallback 네트워크와 API 주소를 확인해 주세요."
    }
}
