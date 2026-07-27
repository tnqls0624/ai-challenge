package com.dontworry.spike

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.TextView

@SuppressLint("SetTextI18n")
class WarningActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(32, 48, 32, 48)
                addView(TextView(this@WarningActivity).apply {
                    text = intent.getStringExtra(EXTRA_TITLE) ?: "위험 경고"
                    textSize = 30f
                })
                addView(TextView(this@WarningActivity).apply {
                    text = intent.getStringExtra(EXTRA_MESSAGE)
                        ?: "상대방의 요구를 따르기 전에 공식 경로로 확인하세요."
                    textSize = 20f
                    setPadding(0, 24, 0, 0)
                })
            },
        )
    }

    companion object {
        const val EXTRA_TITLE = "title"
        const val EXTRA_MESSAGE = "message"
    }
}
