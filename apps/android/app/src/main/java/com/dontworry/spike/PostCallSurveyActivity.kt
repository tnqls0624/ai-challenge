package com.dontworry.spike

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

@SuppressLint("SetTextI18n")
class PostCallSurveyActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(
            LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(32, 48, 32, 48)
                addView(TextView(this@PostCallSurveyActivity).apply {
                    text = "방금 통화에서 받은 요구를 확인해 주세요"
                    textSize = 26f
                })
                listOf("송금·결제 요구", "앱 설치 요구", "인증번호·비밀번호 요구", "해당 없음")
                    .forEach { label ->
                        addView(Button(this@PostCallSurveyActivity).apply {
                            text = label
                            textSize = 18f
                            isAllCaps = false
                            minHeight = 56
                            layoutParams = LinearLayout.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.WRAP_CONTENT,
                            ).apply { topMargin = 16 }
                        })
                    }
            },
        )
    }
}
