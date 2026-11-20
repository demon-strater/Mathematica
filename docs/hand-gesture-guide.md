# 손 모션 조작 이식 가이드 (Mathematica → 다른 사이트)

웹캠으로 손을 인식해 마우스 없이 사이트를 조작하는 기능입니다. 구현은 전부 `hand-tracking.js` 한 파일(ES module, 약 780줄)에 있고 서버는 필요 없습니다. 이 문서는 그 파일을 다른 사이트로 옮길 때 무엇을 가져가고 무엇을 바꿔야 하는지 정리합니다.

## 1. 제스처 한눈에 보기

| 동작 | 손 모양 | 결과 | 화면 피드백 |
|---|---|---|---|
| 가리키기 | 아무 손 모양 | 엄지·검지 사이 중간점이 화면 커서가 됨 | 민트색 원형 커서 |
| 클릭 | 엄지+검지 끝을 짧게 모았다 떼기 | 손끝 아래 버튼·카드에 `element.click()` | 커서가 작아지고, 뗄 때 노란 파동 + "클릭!" |
| 드래그 | 엄지+검지를 모은 채 24px 이상 이동 | 대상에 `pointerdown → pointermove → pointerup` 전달. 대상이 없으면 페이지 스크롤 | "드래그 중" |
| 페이지 넘기기 | 엄지+검지+중지 끝을 모아 좌우로 휘두르기 | 손을 왼쪽으로 → 다음 페이지, 오른쪽으로 → 이전 페이지. 모을 때마다 한 번만 | 세 손가락 삼각형 + 좌우 화살표, "다음 페이지 ›" |
| 스크롤 | 손바닥을 활짝 펴고 위아래로 이동 | 손을 올리면 아래 내용이 보임(페이지를 끄는 방향). 카드 상세 창이 열려 있으면 창 안을 스크롤 | 손바닥 위아래 화살표 |
| 처음으로 | 주먹을 0.48초 유지 | 카드 상세 창 닫기 → Pack Opening 페이지 → 뜯지 않은 새 팩. 손을 펴야 다시 작동 | 주황 커서, 안내 칩이 차오르는 진행 막대, "새 팩으로" |

카메라 미리보기(오른쪽 아래)에는 거울처럼 뒤집힌 영상, 손 뼈대, 손가락별 상태 칩(엄지~소지), 현재 제스처 이름이 표시됩니다. 켜면 사용법 한 줄이 3초간 뜹니다.

## 2. 구조

- **인식기:** MediaPipe Tasks Vision `HandLandmarker`. 다음 세 주소에서 불러오고, Hand 버튼을 처음 눌렀을 때 한 번만 로드합니다.

  ```text
  https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm
  https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm
  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
  ```

  - 설정: `runningMode: "VIDEO"`, `numHands: 1`, `delegate: "GPU"`, 감지·추적 신뢰도 0.42~0.45
- **카메라:** 640×480 전면 카메라, 음성 없음. HTTPS나 localhost에서만 열립니다.
- **루프:** `requestAnimationFrame`마다 새 영상 프레임이 있을 때만 `detectForVideo`를 호출합니다.
  - `landmarks`(화면 좌표 0~1)는 커서, 클릭, 스와이프, 스크롤 판정에 씁니다.
  - `worldLandmarks`(미터 단위 3D 좌표)는 주먹 판정에 씁니다.
- **좌표:** `x = (1 - (엄지끝.x + 검지끝.x)/2) * innerWidth`, `y = (평균 y) * innerHeight`.
  - x를 `1 -`로 뒤집어야 사용자가 거울을 보듯 움직입니다.
  - 미리보기 영상과 캔버스도 CSS `transform: scaleX(-1)`로 함께 뒤집습니다.
  - 뼈대는 영상의 `object-fit: cover` 잘림과 같은 계산으로 캔버스에 그립니다.
- **이벤트:**
  - 드래그는 합성 `PointerEvent`로 보냅니다(`pointerType: "touch"`, `pointerId: 9876`). 사이트의 기존 pointer 핸들러(팩 찢기, 카드 뒤집기)가 그대로 반응합니다.
  - 합성 pointer 이벤트로는 브라우저가 click을 만들지 않습니다. 그래서 클릭은 `target.click()`을 직접 호출합니다.
- **대상 찾기:**
  - `document.elementFromPoint`로 커서 위치와 상하좌우 18px 지점을 차례로 검사합니다.
  - `.closest(".tcg-card, .booster-pack, button, [role='button'], a, input, select")`로 조작 가능한 요소를 찾습니다.
  - 손가락이 조금 빗나가도 버튼이 잡히게 하기 위해서입니다.

## 3. 판정 순서와 충돌 규칙

매 프레임 아래 순서대로 판정하고, 앞의 것이 성립하면 뒤의 것은 막습니다.

1. **주먹:** 3D 좌표에서 네 손가락이 모두 접혔으면 다른 판정을 모두 건너뜁니다.
2. **세 손가락 모으기(스와이프):** 엄지·검지·중지 끝 간격이 손바닥 폭의 0.6배 미만이고, 중지가 뻗어 있어야 합니다.
3. **집기(클릭·드래그):** 엄지·검지 거리가 손바닥 폭의 0.72배 미만이면 집기 자세로 보고 주먹 판정(2D 예비 규칙)을 막습니다. 이미 집는 중이어도 막습니다.
4. **2D 주먹 예비 규칙:** `worldLandmarks`가 없을 때만 씁니다. 네 손끝이 각 PIP 관절보다 손목에 가까우면 주먹입니다.
5. **손바닥 스크롤:** 위 어느 것도 아니고, 네 손가락이 다 펴졌고 엄지도 옆으로 벌어졌을 때만 작동합니다.

실제로 겪은 문제와 해결:

- **주먹이 핀치로 오인됨:**
  - 원인: 주먹을 쥐면 엄지 끝이 접힌 검지 바로 위에 놓여 2D로는 "집기"와 구별되지 않았습니다.
  - 해결: 각 손가락의 접힘 정도를 `손끝↔손가락 뿌리 거리 / 손가락 길이`로 3D에서 계산합니다. 네 손가락 모두 0.6 미만이면 주먹입니다. 한 번 주먹으로 판정되면 0.7 미만까지 유지해서, 유지 시간이 떨림 때문에 초기화되지 않게 합니다.
  - 근거: 주먹은 약 0.4~0.6, 집기는 검지를 뻗어야 하므로 0.65 이상입니다.
- **집기 경계 떨림:** 시작은 0.48 미만, 해제는 0.56 이상으로 문턱을 둘로 나눴습니다.
- **스와이프 후 원치 않는 클릭:** 세 손가락을 뗄 때 엄지·검지가 마지막에 떨어지면 클릭이 될 수 있습니다. 스와이프가 끝나면 엄지·검지가 한 번 벌어질 때까지 집기를 막습니다(`pinchBlocked`).
- **스와이프 되돌림:** 손을 되돌리는 동작이 반대 방향 스와이프로 읽히지 않도록, 손가락을 한 번 모을 때 한 페이지만 넘깁니다(`swipeSpent`). 스와이프 사이에는 850ms 간격을 둡니다.
- **의도한 스와이프만 인정하는 조건:**
  - 최근 850ms 샘플 중 가로 이동이 카메라 화면 폭의 10.5% 이상
  - 가로 이동이 세로 이동의 1.45배 초과
  - 방향 일관성 0.62 이상
  - 지속 시간 140ms 이상
- **손바닥 스크롤 튐:** 손을 펴는 순간 화면이 튀지 않게 180ms 동안 정착한 뒤 스크롤합니다. 위치는 0.5 비율로 평활화합니다.
- **손이 화면에서 사라질 때:** 집던 중이면 클릭을 마저 처리한 뒤 모든 상태를 초기화합니다(`completePendingClick` → `releaseGesture`).

## 4. 조절 값 (`hand-tracking.js` 상단 상수)

| 상수 | 값 | 의미 |
|---|---|---|
| `PINCH_START_DISTANCE` / `PINCH_RELEASE_DISTANCE` | 0.48 / 0.56 | 엄지·검지 거리(손바닥 폭 대비) 집기 시작 / 해제 |
| `DRAG_START_PX` | 24 | 이 이상 움직이면 클릭이 아니라 드래그 |
| `FIST_HOLD_MS` | 480 | 주먹 유지 시간 |
| `FIST_FOLD_ENTER` / `FIST_FOLD_STAY` | 0.6 / 0.7 | 손가락 접힘 비율 주먹 진입 / 유지 |
| `SWIPE_GROUP_START` / `SWIPE_GROUP_RELEASE` | 0.6 / 0.8 | 세 손가락 모음 시작 / 해제 |
| `PALM_SCROLL_GAIN` | 2.5 | 손바닥 이동량 대비 스크롤 배율 |
| `PALM_SETTLE_MS` | 180 | 손바닥 스크롤 정착 시간 |

## 5. 다른 사이트에 붙이는 순서

### 5-1. 가져갈 것

1. `hand-tracking.js`를 그대로 복사합니다.
2. 아래 HTML을 `</body>` 직전에 넣고, 모듈로 불러옵니다.

```html
<footer class="command-bar">
  <button id="handControlButton" class="hand-control-button" type="button" aria-pressed="false" aria-label="손 인식 카메라 켜기">
    <svg aria-hidden="true"><use href="#icon-hand"/></svg>
    <span><span class="hand-control-label">Hand</span><small id="handControlState">손으로 조작하기</small></span>
    <span class="hand-control-dot" aria-hidden="true"></span>
  </button>
</footer>
<div id="handStatus" class="hand-status" role="status" aria-live="polite"></div>
<div id="handCameraPanel" class="hand-camera" data-mode="searching" aria-hidden="true">
  <video id="handCamera" class="hand-camera-video" autoplay muted playsinline></video>
  <canvas id="handOverlay" class="hand-camera-overlay"></canvas>
  <div class="hand-fingers">
    <span data-finger="0">엄지</span><span data-finger="1">검지</span><span data-finger="2">중지</span><span data-finger="3">약지</span><span data-finger="4">소지</span>
  </div>
  <div id="handGesture" class="hand-gesture"><span id="handGestureText">손을 보여 주세요</span></div>
</div>
<div id="handCursor" class="hand-cursor" aria-hidden="true"></div>
<script type="module" src="hand-tracking.js"></script>
```

3. CSS는 다음 선택자 규칙을 가져갑니다.
   - **`style.css`:** `.hand-status`, `.hand-camera`(+ `[data-mode]`별 `--hand-accent` 색), `.hand-camera-video`, `.hand-camera-overlay`, `.hand-fingers`, `.hand-gesture`(+ `::before` 진행 막대, `.is-flash`), `.hand-cursor`(+ `.is-visible`, `.is-pinching`, `.is-snapping`, `.is-fist`), `@keyframes handGestureFlash`, `@keyframes handSnapPulse`
   - **`sanctum.css`:**
     - 일반 규칙: `.command-bar`, `.hand-control-button`(+ `.is-active`, `[aria-busy]`), `.hand-status`, `.hand-camera` 크기·위치
     - 모바일: `@media (max-width: 768px)` 안의 같은 선택자
   - 꼭 지켜야 할 것:
     - 영상과 캔버스는 `scaleX(-1)`로 함께 뒤집습니다.
     - 커서는 `position: fixed; pointer-events: none`입니다.
     - 카메라 패널과 커서는 사이트의 모든 요소보다 위에 있어야 합니다(z-index 10018~10030).

### 5-2. 사이트에 맞게 바꿀 것 (Mathematica 전용 부분)

| 위치 | 지금 하는 일 | 바꿀 내용 |
|---|---|---|
| `PAGE_ORDER` 상수 | `["opening", "catalog", "about"]` | 새 사이트의 페이지 순서 |
| 스와이프·주먹의 페이지 이동 | `#pageStack`의 `data-page`로 현재 페이지를 읽고, `[data-page-target="..."]` 탭을 클릭 | 새 사이트의 페이지 전환 방식. 탭 버튼이 있으면 그것을 클릭, 없으면 해당 함수 호출 |
| `findInteractiveTarget`, `beginPinch`의 선택자 | `.tcg-card, .booster-pack` + 일반 버튼·링크·입력 | 새 사이트에서 집을 수 있어야 하는 요소의 클래스 |
| `returnToSealedPack()` (주먹 동작) | `#cardModal` 닫기(`#closeModalButton`) → Pack Opening → `#newPackButton` 클릭 | 새 사이트의 "처음으로" 동작. 예: 열린 창 닫고 홈으로 |
| `scrollPageBy()` | `#cardModal`이 열려 있으면 `.card-modal-dialog` 안을 스크롤 | 새 사이트의 모달 선택자. 모달이 없으면 `window.scrollBy`만 남김 |
| `.tcg-card.is-hand-held` (CSS) | 드래그 중인 카드를 위로 올림 | 새 사이트의 드래그 대상 |
| 한국어 문구 | `GESTURE_LABELS`, `flashGesture(...)` 인자, `setStatus(...)` 사용법 문장 | 새 사이트의 말투나 언어 |

## 6. 확인 방법

- **실제 확인:** HTTPS(또는 `http://localhost`)에서 Hand 버튼 → 카메라 허용. 미리보기의 손가락 칩과 제스처 이름이 손 모양과 맞는지 봅니다.
- **자동 확인(웹캠 없이):** 이 저장소의 주먹 판정 수정은 아래 방식으로 검증했습니다.
  - Chromium을 `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`으로 실행해 가짜 카메라를 씁니다.
  - MediaPipe 모듈 요청(`@mediapipe/tasks-vision`)을 가로채 가짜 모듈로 응답합니다. 가짜 모듈의 `detectForVideo`는 테스트가 넣어 둔 손 좌표(`landmarks`, `worldLandmarks`)를 돌려줍니다.
  - 주먹, 집기, 손바닥 좌표를 바꿔 가며 `#handCameraPanel[data-mode]`와 페이지 상태를 확인합니다.

```js
// puppeteer: MediaPipe 대신 테스트 손 좌표를 돌려주는 가짜 모듈
await page.setRequestInterception(true);
page.on('request', r => r.url().includes('@mediapipe/tasks-vision')
  ? r.respond({ status: 200, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' },
      body: `export const FilesetResolver = { forVisionTasks: async () => ({}) };
             export const HandLandmarker = { createFromOptions: async () => ({ detectForVideo: () => {
               const p = window.__pose; return p ? { landmarks: [p.image], worldLandmarks: [p.world] } : { landmarks: [] }; } }) };` })
  : r.continue());
```

## 7. 주의

- 카메라 영상은 브라우저 안에서만 처리하고 어디에도 보내지 않습니다. 단, 첫 실행 때 CDN에서 인식 모델(수 MB)을 받으므로 인터넷이 필요합니다.
- 페이지를 떠나면(`beforeunload`) 카메라를 끕니다. Hand 버튼을 다시 누르면 꺼집니다.
- 손은 한 개만 인식합니다(`numHands: 1`). 조명이 어둡거나 역광이면 인식률이 떨어집니다.
- 문턱 값은 노트북 웹캠(640×480, 화면에서 40~70cm)에 맞춰져 있습니다. 카메라가 멀거나 해상도가 다르면 0.48/0.56 집기 거리부터 조정하세요.
