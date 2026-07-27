package com.dontworry.spike

import android.app.Notification
import android.os.Build
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class DontWorryNotificationListenerService : NotificationListenerService() {
    override fun onNotificationPosted(statusBarNotification: StatusBarNotification) {
        if (!AllowedNotificationPackages.contains(
                packageName = statusBarNotification.packageName,
                ownPackageName = packageName,
                debug = BuildConfig.DEBUG,
            )
        ) {
            return
        }

        val extracted = NotificationContentExtractor.extract(
            NotificationSnapshotFactory.from(statusBarNotification.notification.extras),
        )
        SpikeTelemetryStore(this).recordNotification(
            eventKey = StableEventKey.create(
                packageName = statusBarNotification.packageName,
                notificationId = statusBarNotification.id,
                tag = statusBarNotification.tag,
            ),
            extracted = extracted,
            expectedFixtureBody = SpikeNotifications.FIXTURE_BODY,
        )
    }
}

private object NotificationSnapshotFactory {
    fun from(extras: Bundle): NotificationSnapshot {
        val messageBundles = if (Build.VERSION.SDK_INT >= 33) {
            extras.getParcelableArray(Notification.EXTRA_MESSAGES, Bundle::class.java)?.toList()
        } else {
            @Suppress("DEPRECATION")
            extras.getParcelableArray(Notification.EXTRA_MESSAGES)
                ?.mapNotNull { it as? Bundle }
        }.orEmpty()
        val messagingTexts = messageBundles.mapNotNull { bundle ->
            bundle.getCharSequence("text")?.toString()
        }

        return NotificationSnapshot(
            title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString(),
            text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString(),
            bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString(),
            textLines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
                ?.map(CharSequence::toString)
                .orEmpty(),
            messagingTexts = messagingTexts,
        )
    }
}
