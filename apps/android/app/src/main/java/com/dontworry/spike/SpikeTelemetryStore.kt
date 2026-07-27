package com.dontworry.spike

import android.content.Context

data class SpikeTelemetry(
    val notificationPosts: Int,
    val notificationUpdates: Int,
    val lastContentAvailability: String,
    val lastBodyLength: Int,
    val fixtureMatched: Boolean,
    val callCallbacks: Int,
    val callDecision: String,
    val callElapsedMs: Long,
    val pendingSurvey: Boolean,
)

class SpikeTelemetryStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

    fun recordNotification(
        eventKey: String,
        extracted: ExtractedNotification,
        expectedFixtureBody: String,
    ) {
        val priorKey = preferences.getString(KEY_LAST_EVENT, null)
        val isUpdate = priorKey == eventKey
        val body = extracted.bodyCandidate
        preferences.edit()
            .putString(KEY_LAST_EVENT, eventKey)
            .putInt(
                if (isUpdate) KEY_NOTIFICATION_UPDATES else KEY_NOTIFICATION_POSTS,
                preferences.getInt(
                    if (isUpdate) KEY_NOTIFICATION_UPDATES else KEY_NOTIFICATION_POSTS,
                    0,
                ) + 1,
            )
            .putString(KEY_CONTENT_AVAILABILITY, extracted.availability.name)
            .putInt(KEY_BODY_LENGTH, body?.length ?: 0)
            .putString(KEY_BODY_HASH, body?.let(::sha256).orEmpty())
            .putString(KEY_SENDER_HASH, extracted.senderCandidate?.let(::sha256).orEmpty())
            .putBoolean(KEY_FIXTURE_MATCHED, body == expectedFixtureBody)
            .apply()
    }

    fun recordScreening(numberHash: String, decision: CallDecision, elapsedMs: Long) {
        preferences.edit()
            .putString(KEY_CALL_HASH_PREFIX, numberHash.take(12))
            .putInt(
                KEY_CALL_CALLBACKS,
                preferences.getInt(KEY_CALL_CALLBACKS, 0) + 1,
            )
            .putString(KEY_CALL_DECISION, decision.reason)
            .putLong(KEY_CALL_ELAPSED_MS, elapsedMs)
            .putBoolean(KEY_PENDING_SURVEY, true)
            .apply()
    }

    fun consumePendingSurvey(): Boolean {
        if (!preferences.getBoolean(KEY_PENDING_SURVEY, false)) return false
        return preferences.edit().putBoolean(KEY_PENDING_SURVEY, false).commit()
    }

    fun snapshot(): SpikeTelemetry {
        return SpikeTelemetry(
            notificationPosts = preferences.getInt(KEY_NOTIFICATION_POSTS, 0),
            notificationUpdates = preferences.getInt(KEY_NOTIFICATION_UPDATES, 0),
            lastContentAvailability = preferences.getString(KEY_CONTENT_AVAILABILITY, "NONE") ?: "NONE",
            lastBodyLength = preferences.getInt(KEY_BODY_LENGTH, 0),
            fixtureMatched = preferences.getBoolean(KEY_FIXTURE_MATCHED, false),
            callCallbacks = preferences.getInt(KEY_CALL_CALLBACKS, 0),
            callDecision = preferences.getString(KEY_CALL_DECISION, "NONE") ?: "NONE",
            callElapsedMs = preferences.getLong(KEY_CALL_ELAPSED_MS, -1),
            pendingSurvey = preferences.getBoolean(KEY_PENDING_SURVEY, false),
        )
    }

    companion object {
        private const val PREFERENCES = "spike_telemetry"
        private const val KEY_LAST_EVENT = "last_event"
        private const val KEY_NOTIFICATION_POSTS = "notification_posts"
        private const val KEY_NOTIFICATION_UPDATES = "notification_updates"
        private const val KEY_CONTENT_AVAILABILITY = "content_availability"
        private const val KEY_BODY_LENGTH = "body_length"
        private const val KEY_BODY_HASH = "body_hash"
        private const val KEY_SENDER_HASH = "sender_hash"
        private const val KEY_FIXTURE_MATCHED = "fixture_matched"
        private const val KEY_CALL_HASH_PREFIX = "call_hash_prefix"
        private const val KEY_CALL_CALLBACKS = "call_callbacks"
        private const val KEY_CALL_DECISION = "call_decision"
        private const val KEY_CALL_ELAPSED_MS = "call_elapsed_ms"
        private const val KEY_PENDING_SURVEY = "pending_survey"
    }
}
