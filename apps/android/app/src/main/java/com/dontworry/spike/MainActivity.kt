package com.dontworry.spike

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.NotificationManager
import android.app.role.RoleManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.telecom.TelecomManager
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

@SuppressLint("SetTextI18n")
class MainActivity : Activity() {
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        SpikeNotifications.createChannels(this)
        setContentView(buildContent())
        requestRuntimePermissions()
        refreshStatus()
    }

    override fun onResume() {
        super.onResume()
        if (::status.isInitialized) refreshStatus()
    }

    private fun buildContent(): ScrollView {
        status = TextView(this).apply {
            textSize = 18f
            setPadding(0, 0, 0, 24)
        }
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 32, 32, 32)
            addView(TextView(this@MainActivity).apply {
                text = "돈워리 Android 기술 스파이크"
                textSize = 26f
            })
            addView(status)
            addView(actionButton("1. 알림 접근 설정 열기") {
                startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            })
            addView(actionButton("2. 합성 메시지 알림 보내기") {
                SpikeNotifications.postFixture(this@MainActivity)
            })
            addView(actionButton("3. 전화 선별 역할 요청") {
                requestCallScreeningRole()
            })
            addView(actionButton("4. 고우선순위 경고 시험") {
                SpikeNotifications.showWarning(
                    this@MainActivity,
                    "매우 위험한 요청입니다",
                    "송금하거나 앱을 설치하지 말고 보호자에게 확인하세요.",
                )
            })
            addView(actionButton("5. 통화 후 설문 알림 시험") {
                SpikeNotifications.showSurvey(this@MainActivity)
            })
            addView(actionButton("상태 새로고침") {
                refreshStatus()
            })
        }
        return ScrollView(this).apply { addView(content) }
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

    private fun requestRuntimePermissions() {
        val permissions = buildList {
            if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                add(Manifest.permission.POST_NOTIFICATIONS)
            }
            if (checkSelfPermission(Manifest.permission.READ_PHONE_STATE) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                add(Manifest.permission.READ_PHONE_STATE)
            }
        }
        if (permissions.isNotEmpty()) requestPermissions(permissions.toTypedArray(), 100)
    }

    private fun requestCallScreeningRole() {
        val roleManager = getSystemService(RoleManager::class.java)
        if (roleManager.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING) &&
            !roleManager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)
        ) {
            startActivityForResult(
                roleManager.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING),
                200,
            )
        }
    }

    private fun refreshStatus() {
        val enabledListeners = Settings.Secure.getString(
            contentResolver,
            "enabled_notification_listeners",
        ).orEmpty()
        val listenerComponent = ComponentName(
            this,
            DontWorryNotificationListenerService::class.java,
        ).flattenToString()
        val listenerEnabled = enabledListeners.contains(listenerComponent)

        val roleManager = getSystemService(RoleManager::class.java)
        val roleHeld = roleManager.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING) &&
            roleManager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)
        val defaultDialer = getSystemService(TelecomManager::class.java).defaultDialerPackage
        val telemetry = SpikeTelemetryStore(this).snapshot()
        val fullScreenAllowed = if (Build.VERSION.SDK_INT >= 34) {
            getSystemService(NotificationManager::class.java).canUseFullScreenIntent()
        } else {
            null
        }

        status.text = """
            API: ${Build.VERSION.SDK_INT}
            기기: ${Build.MANUFACTURER} ${Build.MODEL}
            알림 접근: $listenerEnabled
            전화 선별 역할: $roleHeld
            기본 전화 앱: ${defaultDialer ?: "없음"}
            full-screen 허용: ${fullScreenAllowed ?: "해당 없음"}

            알림 fixture 게시: ${telemetry.notificationPosts}
            동일 알림 수정: ${telemetry.notificationUpdates}
            최근 본문 상태: ${telemetry.lastContentAvailability}
            최근 본문 길이: ${telemetry.lastBodyLength}
            합성 fixture 일치: ${telemetry.fixtureMatched}

            최근 전화 판정: ${telemetry.callDecision}
            전화 callback 누적: ${telemetry.callCallbacks}
            전화 callback 처리: ${telemetry.callElapsedMs}ms
            설문 대기: ${telemetry.pendingSurvey}
        """.trimIndent()
    }
}
