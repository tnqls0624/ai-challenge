package com.dontworry.spike

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build

object SpikeNotifications {
    const val FIXTURE_BODY = "합성 테스트: 오늘까지 납부하라는 문구입니다."
    private const val WARNING_CHANNEL = "risk-warning"
    private const val FIXTURE_CHANNEL = "fixture-message"

    fun createChannels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                WARNING_CHANNEL,
                "위험 경고",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "보이스피싱 위험 행동을 즉시 경고합니다."
                lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            },
        )
        manager.createNotificationChannel(
            NotificationChannel(
                FIXTURE_CHANNEL,
                "합성 메시지 fixture",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Notification Listener 스파이크 전용 합성 알림입니다."
                lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            },
        )
    }

    fun postFixture(context: Context) {
        if (!canNotify(context)) return
        createChannels(context)
        val notification = Notification.Builder(context, FIXTURE_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("합성 발신자")
            .setContentText(FIXTURE_BODY)
            .setStyle(Notification.BigTextStyle().bigText(FIXTURE_BODY))
            .setAutoCancel(true)
            .build()
        context.getSystemService(NotificationManager::class.java)
            .notify(FIXTURE_NOTIFICATION_ID, notification)
    }

    fun showWarning(context: Context, title: String, message: String) {
        if (!canNotify(context)) return
        createChannels(context)
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            Intent(context, WarningActivity::class.java)
                .putExtra(WarningActivity.EXTRA_TITLE, title)
                .putExtra(WarningActivity.EXTRA_MESSAGE, message),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = Notification.Builder(context, WARNING_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(Notification.BigTextStyle().bigText(message))
            .setCategory(Notification.CATEGORY_CALL)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()
        context.getSystemService(NotificationManager::class.java)
            .notify(WARNING_NOTIFICATION_ID, notification)
    }

    fun showSurvey(context: Context) {
        if (!canNotify(context)) return
        createChannels(context)
        val pendingIntent = PendingIntent.getActivity(
            context,
            1,
            Intent(context, PostCallSurveyActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = Notification.Builder(context, WARNING_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("방금 통화에서 이런 요구를 받았나요?")
            .setContentText("송금·앱 설치·인증번호 요구를 확인해 주세요.")
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()
        context.getSystemService(NotificationManager::class.java)
            .notify(SURVEY_NOTIFICATION_ID, notification)
    }

    private fun canNotify(context: Context): Boolean {
        return Build.VERSION.SDK_INT < 33 ||
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
    }

    private const val FIXTURE_NOTIFICATION_ID = 101
    private const val WARNING_NOTIFICATION_ID = 201
    private const val SURVEY_NOTIFICATION_ID = 301
}
