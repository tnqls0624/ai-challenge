# 돈워리 Android 기술 스파이크

이 앱은 P0 자동 감지 gate를 검증하기 위한 최소 네이티브 Android 앱입니다.

## 포함 범위

- Notification Listener 권한과 합성 알림 추출
- 허용 메시지 앱 package 필터
- 본문 `FULL`·`PARTIAL`·`UNAVAILABLE` 구분
- Call Screening 역할과 로컬-only 응답
- 등록된 debug fixture 번호만 차단
- 고우선순위 알림과 탭 후 경고 Activity
- 전화 IDLE 전환 후 통화 설문 알림 후보
- 원문·전체 번호를 logcat에 남기지 않는 telemetry

## 로컬 실행

```bash
export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew test assembleDebug
```

실기기 gate와 판정은 `docs/android-spike.md`에 기록합니다.

## 2026-07-28 실행 상태

- API 29·36 AOSP emulator: 알림 fixture 각 10/10
- API 29·36 AOSP emulator: Call Screening callback 각 20/20
- 관측 Call Screening 내부 처리시간: 0~11ms
- 고우선순위 경고·통화 종료 설문·알림 탭 Activity 진입 확인
- Samsung Android 14+ 실기기와 Samsung Messages·Phone 조합은 아직 대기

에뮬레이터 통과만으로 제출 기능을 확정하지 않습니다. 최종 gate와 제한사항은 `docs/android-spike.md`가 기준입니다.
