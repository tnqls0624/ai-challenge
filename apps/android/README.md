# 돈워리 Android 기술 스파이크

이 앱은 P0 수동 보호 흐름과 자동 감지 gate를 함께 검증하는 네이티브 Android 앱입니다.

## 포함 범위

- Notification Listener 권한과 합성 알림 추출
- 허용 메시지 앱 package 필터
- 본문 `FULL`·`PARTIAL`·`UNAVAILABLE` 구분
- Call Screening 역할과 로컬-only 응답
- 등록된 debug fixture 번호만 차단
- 고우선순위 알림과 탭 후 경고 Activity
- 전화 IDLE 전환 후 통화 설문 알림 후보
- 원문·전체 번호를 logcat에 남기지 않는 telemetry
- 6자리 코드 preview·명시적 연결/자동 알림 동의
- Android Keystore 공개키와 AES-GCM 기기 credential 보관
- 공유 메뉴·붙여넣기 문자 로컬 판정
- 원문 없이 추출 특징·정규화 URL 해시만 NestJS API에 동기화
- 서버 장애 시 로컬 결과 유지

## 로컬 실행

```bash
export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew test assembleDebug
```

debug APK의 API 기본 주소는 Android emulator에서 host를 가리키는
`http://10.0.2.2:4000`입니다. release 주소는 실제 배포 공급자가 확정될 때
`app/build.gradle.kts`의 `API_BASE_URL`을 교체해야 합니다. debug manifest만 로컬 HTTP를
허용하고 release는 cleartext 통신을 막습니다.

수동 흐름은 다음 순서로 확인합니다.

1. 보호자 API에서 대상자와 6자리 활성화 코드를 생성합니다.
2. Android의 `보호자와 6자리 코드로 연결`에서 preview 내용을 확인하고 동의합니다.
3. `문자 직접 확인`에 합성 문자를 붙여넣거나 다른 앱의 공유 메뉴에서 돈워리를 선택합니다.
4. 로컬 결과가 즉시 표시되고 연결된 기기는 특징만 서버로 보내 최종 결과를 표시합니다.

실기기 gate와 판정은 `docs/android-spike.md`에 기록합니다.

## 2026-07-28 실행 상태

- API 29·36 AOSP emulator: 알림 fixture 각 10/10
- API 29·36 AOSP emulator: Call Screening callback 각 20/20
- 관측 Call Screening 내부 처리시간: 0~11ms
- 고우선순위 경고·통화 종료 설문·알림 탭 Activity 진입 확인
- Samsung Android 14+ 실기기와 Samsung Messages·Phone 조합은 아직 대기

에뮬레이터 통과만으로 제출 기능을 확정하지 않습니다. 최종 gate와 제한사항은 `docs/android-spike.md`가 기준입니다.
