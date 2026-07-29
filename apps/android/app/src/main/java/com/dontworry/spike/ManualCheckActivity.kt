package com.dontworry.spike

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.text.InputFilter
import android.text.InputType
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.util.concurrent.Executors

@SuppressLint("SetTextI18n")
class ManualCheckActivity : Activity() {
    private val executor = Executors.newSingleThreadExecutor()
    private val api = DontWorryApiClient()
    private lateinit var sessionStore: DeviceSessionStore
    private lateinit var input: EditText
    private lateinit var analyzeButton: Button
    private lateinit var localResultView: TextView
    private lateinit var serverResultView: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        sessionStore = DeviceSessionStore(this)
        setContentView(buildContent())
        readSharedText(intent)?.let(input::setText)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        readSharedText(intent)?.let(input::setText)
    }

    override fun onDestroy() {
        input.text?.clear()
        executor.shutdownNow()
        super.onDestroy()
    }

    private fun buildContent(): ScrollView {
        input = EditText(this).apply {
            hint = "의심스러운 문자 내용을 붙여넣어 주세요"
            inputType = InputType.TYPE_CLASS_TEXT or
                InputType.TYPE_TEXT_FLAG_MULTI_LINE or
                InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            minLines = 7
            maxLines = 14
            textSize = 18f
            filters = arrayOf(InputFilter.LengthFilter(2_000))
            isSaveEnabled = false
        }
        analyzeButton = Button(this).apply {
            text = "이 문자 확인"
            textSize = 19f
            isAllCaps = false
            minHeight = 60
            setOnClickListener { analyze() }
        }
        localResultView = TextView(this).apply {
            textSize = 18f
            setPadding(0, 28, 0, 0)
        }
        serverResultView = TextView(this).apply {
            textSize = 17f
            setPadding(0, 20, 0, 0)
        }
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 48)
            addView(TextView(this@ManualCheckActivity).apply {
                text = "문자 직접 확인"
                textSize = 30f
            })
            addView(TextView(this@ManualCheckActivity).apply {
                text = "먼저 이 기기에서 즉시 확인하고, 연결된 경우 원문이 아닌 위험 특징만 서버로 보냅니다."
                textSize = 17f
                setPadding(0, 12, 0, 24)
            })
            addView(input)
            addView(analyzeButton, LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { topMargin = 16 })
            addView(localResultView)
            addView(serverResultView)
        }
        return ScrollView(this).apply { addView(content) }
    }

    private fun analyze() {
        val rawText = input.text.toString()
        if (rawText.isBlank()) {
            localResultView.text = "확인할 문자 내용을 입력해 주세요."
            return
        }
        val local = LocalRiskAnalyzer.analyze(rawText)
        localResultView.text = renderLocal(local)
        serverResultView.text = "로컬 확인 완료 · 서버 확인 준비 중"
        if (local.level == LocalRiskLevel.HIGH || local.level == LocalRiskLevel.CRITICAL) {
            SpikeNotifications.showWarning(
                context = this,
                title = local.title,
                message = local.evidence.firstOrNull()
                    ?: "상대방의 요구를 멈추고 공식 경로로 확인하세요.",
            )
        }

        val credential = sessionStore.readCredential()
        if (credential == null) {
            serverResultView.text =
                "기기가 보호자와 연결되지 않아 서버 확인은 생략했습니다. 로컬 결과는 저장하지 않습니다."
            return
        }
        analyzeButton.isEnabled = false
        serverResultView.text = "원문을 제외한 위험 특징과 URL 해시를 서버에서 확인하고 있습니다…"
        executor.execute {
            runCatching { api.createManualRiskEvent(local, credential) }
                .onSuccess { server ->
                    runOnUiThread {
                        analyzeButton.isEnabled = true
                        serverResultView.text = renderServer(server)
                    }
                }
                .onFailure { error ->
                    runOnUiThread {
                        analyzeButton.isEnabled = true
                        serverResultView.text =
                            "서버 확인을 완료하지 못했습니다. 로컬 경고는 그대로 유지됩니다. " +
                                error.userMessage("잠시 후 다시 시도해 주세요.")
                    }
                }
        }
    }

    private fun renderLocal(result: LocalRiskResult): String {
        val evidence = result.evidence.joinToString(separator = "\n") { "• $it" }
        val actions = result.recommendedActionIds
            .map(::actionLabel)
            .joinToString(separator = "\n") { "• $it" }
        return buildString {
            append("기기 즉시 결과 · ${levelLabel(result.level.name)}\n")
            append("${result.title}\n\n$evidence")
            if (actions.isNotEmpty()) append("\n\n지금 할 일\n$actions")
        }
    }

    private fun renderServer(result: ServerRiskResult): String {
        val evidence = result.evidence.take(3).joinToString(separator = "\n") { "• $it" }
        return buildString {
            append("서버 최종 결과 · ${levelLabel(result.level)}")
            append("\n분석 상태: ${completenessLabel(result.completeness)}")
            if (evidence.isNotEmpty()) append("\n\n$evidence")
        }
    }

    private fun readSharedText(intent: Intent): String? {
        if (intent.action != Intent.ACTION_SEND || intent.type != "text/plain") return null
        return intent.getStringExtra(Intent.EXTRA_TEXT)?.take(2_000)
    }
}

fun levelLabel(level: String): String {
    return when (level) {
        "CRITICAL" -> "매우 위험"
        "HIGH" -> "위험"
        "CAUTION" -> "주의"
        "SAFE" -> "안전"
        else -> "확인 필요"
    }
}

fun completenessLabel(value: String): String {
    return when (value) {
        "FINAL" -> "외부 확인 완료"
        "FINALIZED_PARTIAL" -> "일부 외부 확인 불가"
        else -> "확인 중"
    }
}

private fun actionLabel(id: String): String {
    return when (id) {
        "STOP_CONTACT" -> "상대방과의 연락을 멈추세요."
        "VERIFY_OFFICIAL_CHANNEL" -> "문자 속 번호가 아닌 기관 공식번호로 확인하세요."
        "CONTACT_GUARDIAN" -> "동의한 보호자에게 함께 확인을 요청하세요."
        else -> id
    }
}
