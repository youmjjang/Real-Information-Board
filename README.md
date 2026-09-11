# Real Information Board

T04 과제 — 서울 현재 기온을 실제 공개 원천에서 조회하고, 서로 다른 KST 날짜 2건을 보존해 어제 대비 변화를 표시합니다.

- Live source: Open-Meteo
- Timezone: Asia/Seoul
- Synthetic failure replay: timeout / 401 / 429 / offline / schema change
- Preserves last good value on failure
- No API key or secret required

## 제출 전
1. 2026-09-12에 공개 URL에서 "오늘 실제 기록 저장"을 눌러 9/11, 9/12 두 기록을 확인합니다.
2. ALEPH 실제 공개 원천 기록에도 9/12 기록을 추가합니다.
3. 공개 URL과 full commit URL을 제출합니다.
