package com.dontworry.spike

enum class ContentAvailability {
    FULL,
    PARTIAL,
    UNAVAILABLE,
}

data class NotificationSnapshot(
    val title: String?,
    val text: String?,
    val bigText: String?,
    val textLines: List<String>,
    val messagingTexts: List<String>,
)

data class ExtractedNotification(
    val availability: ContentAvailability,
    val senderCandidate: String?,
    val bodyCandidate: String?,
)

object NotificationContentExtractor {
    private val hiddenMarkers = listOf(
        "내용이 숨겨",
        "민감한 알림",
        "content hidden",
        "sensitive notification",
    )

    fun extract(snapshot: NotificationSnapshot): ExtractedNotification {
        val candidate = when {
            snapshot.messagingTexts.any { it.isNotBlank() } ->
                snapshot.messagingTexts.filter { it.isNotBlank() }.joinToString("\n")
            !snapshot.bigText.isNullOrBlank() -> snapshot.bigText
            snapshot.textLines.any { it.isNotBlank() } ->
                snapshot.textLines.filter { it.isNotBlank() }.joinToString("\n")
            !snapshot.text.isNullOrBlank() -> snapshot.text
            else -> null
        }?.trim()

        if (candidate.isNullOrEmpty() || hiddenMarkers.any { candidate.contains(it, ignoreCase = true) }) {
            return ExtractedNotification(
                availability = ContentAvailability.UNAVAILABLE,
                senderCandidate = snapshot.title?.trim()?.takeIf { it.isNotEmpty() },
                bodyCandidate = null,
            )
        }

        val partial = candidate.endsWith("…") || candidate.endsWith("...")
        return ExtractedNotification(
            availability = if (partial) ContentAvailability.PARTIAL else ContentAvailability.FULL,
            senderCandidate = snapshot.title?.trim()?.takeIf { it.isNotEmpty() },
            bodyCandidate = candidate,
        )
    }
}

object AllowedNotificationPackages {
    private val productionAllowlist = setOf(
        "com.samsung.android.messaging",
        "com.google.android.apps.messaging",
        "com.android.messaging",
        "com.android.mms",
    )

    fun contains(packageName: String, ownPackageName: String, debug: Boolean): Boolean {
        return packageName in productionAllowlist || (debug && packageName == ownPackageName)
    }
}

data class CallDecision(
    val block: Boolean,
    val silence: Boolean,
    val reason: String,
)

object CallDecisionPolicy {
    fun evaluate(numberHash: String, demoNumberHash: String, debug: Boolean): CallDecision {
        val isRegisteredDemo = debug && numberHash == demoNumberHash
        return if (isRegisteredDemo) {
            CallDecision(block = true, silence = false, reason = "REGISTERED_DEMO_NUMBER")
        } else {
            CallDecision(block = false, silence = false, reason = "ALLOW_UNVERIFIED_NUMBER")
        }
    }
}

object StableEventKey {
    fun create(packageName: String, notificationId: Int, tag: String?): String {
        return "$packageName:$notificationId:${tag.orEmpty()}"
    }
}
