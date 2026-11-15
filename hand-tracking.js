const MEDIAPIPE_MODULE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/+esm";
const MEDIAPIPE_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const button = document.getElementById("handControlButton");
const status = document.getElementById("handStatus");
const video = document.getElementById("handCamera");
const cameraPanel = document.getElementById("handCameraPanel");
const overlay = document.getElementById("handOverlay");
const overlayContext = overlay?.getContext("2d");
const gestureChip = document.getElementById("handGesture");
const gestureText = document.getElementById("handGestureText");
const fingerChips = [...document.querySelectorAll(".hand-fingers [data-finger]")];
const cursor = document.getElementById("handCursor");

let landmarker = null;
let stream = null;
let animationFrame = 0;
let enabled = false;
let pinching = false;
let activeTarget = null;
let pinchStartX = 0;
let pinchStartY = 0;
let previousX = 0;
let previousY = 0;
let movedDistance = 0;
let lastVideoTime = -1;
let snapArmedAt = 0;
let lastSnapAt = 0;
let snapTarget = null;
let snapStartX = 0;
let snapStartY = 0;
let fistStartedAt = 0;
let fistTriggered = false;
let swipeSamples = [];
let lastSwipeAt = 0;
let swipeGrouped = false;
let swipeSpent = false;
let pinchBlocked = false;
let palmScrollY = null;
let palmSince = 0;
const pointerId = 9876;
const PAGE_ORDER = ["opening", "catalog", "about"];
const DRAG_START_PX = 24;
const PINCH_START_DISTANCE = 0.48;
const PINCH_RELEASE_DISTANCE = 0.56;
const FIST_HOLD_MS = 480;
// Thumb, index and middle tips gathered within this many palm widths start a page swipe.
const SWIPE_GROUP_START = 0.6;
const SWIPE_GROUP_RELEASE = 0.8;
// Open-palm scroll: page pixels per viewport-height of palm travel, and settle time.
const PALM_SCROLL_GAIN = 2.5;
const PALM_SETTLE_MS = 180;

// MediaPipe hand skeleton, grouped by finger (thumb → pinky) plus the palm.
const FINGER_CHAINS = [[0, 1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]];
const PALM_CHAIN = [0, 5, 9, 13, 17, 0];
const FINGER_TIPS = [4, 8, 12, 16, 20];
const GESTURE_LABELS = {
    searching: "손을 보여 주세요",
    point: "가리키는 중",
    pinch: "집는 중 · 놓으면 클릭",
    drag: "드래그 중",
    fist: "주먹 · 유지하면 뒤로",
    swipe: "세 손가락 · 좌우로 넘기기",
    scroll: "손바닥 · 위아래로 스크롤",
};
const MODE_COLORS = {
    point: "#97ffdc",
    pinch: "#70ffcc",
    drag: "#70ffcc",
    fist: "#ffbe70",
    swipe: "#c9b2ff",
    scroll: "#8fd0ff",
};
let shownMode = "";
let shownText = "";
let flashUntil = 0;
let fingerStates = [false, false, false, false, false];

let statusTimer = 0;

function setStatus(message, isError = false, hideAfterMs = 0) {
    clearTimeout(statusTimer);
    if (hideAfterMs) statusTimer = setTimeout(() => setStatus(""), hideAfterMs);
    status.textContent = message;
    status.classList.toggle("is-error", isError);
    status.classList.toggle("is-visible", Boolean(message));
}

function dispatchPointer(target, type, x, y) {
    target?.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId,
        pointerType: "touch",
        isPrimary: true,
        clientX: x,
        clientY: y,
        button: type === "pointermove" ? -1 : 0,
        buttons: type === "pointerup" ? 0 : 1,
    }));
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

// Same curl rule the fist detector uses, so the chips show what the gestures see.
function readFingerStates(hand) {
    const wrist = hand[0];
    const thumbOut = distance(hand[4], hand[17]) > distance(hand[2], hand[17]) * 1.1;
    const others = [[8, 6], [12, 10], [16, 14], [20, 18]].map(([tip, joint]) =>
        distance(hand[tip], wrist) >= distance(hand[joint], wrist) * 1.06);
    return [thumbOut, ...others];
}

function renderFingerChips(states) {
    states.forEach((isOn, index) => {
        if (fingerStates[index] === isOn) return;
        fingerStates[index] = isOn;
        fingerChips[index]?.classList.toggle("is-on", isOn);
    });
}

function setGesture(mode, hold = 0, label = GESTURE_LABELS[mode]) {
    if (!gestureChip) return;
    gestureChip.style.setProperty("--hold", Math.min(1, Math.max(0, hold)).toFixed(3));
    if (performance.now() < flashUntil) return;
    gestureChip.classList.remove("is-flash");
    if (mode !== shownMode) {
        shownMode = mode;
        if (cameraPanel) cameraPanel.dataset.mode = mode;
    }
    if (label !== shownText) {
        shownText = label;
        gestureText.textContent = label;
    }
}

function flashGesture(label) {
    if (!gestureChip) return;
    flashUntil = performance.now() + 650;
    shownText = label;
    gestureText.textContent = label;
    gestureChip.classList.remove("is-flash");
    void gestureChip.offsetWidth;
    gestureChip.classList.add("is-flash");
}

function sizeOverlay() {
    const width = overlay.clientWidth;
    const height = overlay.clientHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (overlay.width !== pixelWidth || overlay.height !== pixelHeight) {
        overlay.width = pixelWidth;
        overlay.height = pixelHeight;
    }
    overlayContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    return { width, height, ratio };
}

function clearOverlay() {
    if (!overlayContext) return;
    overlayContext.setTransform(1, 0, 0, 1, 0, 0);
    overlayContext.clearRect(0, 0, overlay.width, overlay.height);
}

function drawHand(hand, mode, pinchRatio) {
    if (!overlayContext) return;
    const ctx = overlayContext;
    const { width, height, ratio } = sizeOverlay();
    ctx.clearRect(0, 0, width, height);
    // Map landmarks through the same object-fit: cover crop the video uses.
    const videoWidth = video.videoWidth || 640;
    const videoHeight = video.videoHeight || 480;
    const scale = Math.max(width / videoWidth, height / videoHeight);
    const offsetX = (width - videoWidth * scale) / 2;
    const offsetY = (height - videoHeight * scale) / 2;
    const points = hand.map((point) => [point.x * videoWidth * scale + offsetX, point.y * videoHeight * scale + offsetY]);
    const accent = MODE_COLORS[mode] || "#d6c8ff";
    const idle = "rgba(214, 200, 255, 0.5)";
    const unit = Math.max(0.75, width / 180);

    const strokeChain = (chain, color, lineWidth) => {
        ctx.beginPath();
        chain.forEach((pointIndex, step) => {
            const [x, y] = points[pointIndex];
            if (step === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    };
    const dot = (x, y, radius, color) => {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    };

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    strokeChain(PALM_CHAIN, idle, 1.2 * unit);
    FINGER_CHAINS.forEach((chain, finger) => {
        const isOn = fingerStates[finger];
        strokeChain(chain, isOn ? accent : idle, (isOn ? 2 : 1.3) * unit);
    });
    points.forEach(([x, y], pointIndex) => {
        if (!FINGER_TIPS.includes(pointIndex)) dot(x, y, 1.4 * unit, "rgba(240, 234, 255, 0.8)");
    });

    // Thumb–index link fades in as the fingers approach a pinch.
    const [thumbX, thumbY] = points[4];
    const [indexX, indexY] = points[8];
    const isPinchMode = mode === "pinch" || mode === "drag";
    const approach = Math.min(1, Math.max(0, (1.1 - pinchRatio) / (1.1 - PINCH_START_DISTANCE)));
    if (mode === "scroll") {
        // Open palm: up/down chevrons at the palm centre.
        const palmX = [0, 5, 9, 13, 17].reduce((sum, i) => sum + points[i][0], 0) / 5;
        const palmY = [0, 5, 9, 13, 17].reduce((sum, i) => sum + points[i][1], 0) / 5;
        ctx.beginPath();
        for (const side of [-1, 1]) {
            const tipY = palmY + side * 14 * unit;
            ctx.moveTo(palmX - 6 * unit, tipY - side * 5 * unit);
            ctx.lineTo(palmX, tipY);
            ctx.lineTo(palmX + 6 * unit, tipY - side * 5 * unit);
        }
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2 * unit;
        ctx.stroke();
    } else if (mode === "swipe") {
        // Gathered thumb, index and middle: outline the trio with left/right chevrons.
        const [middleX, middleY] = points[12];
        const centerX = (thumbX + indexX + middleX) / 3;
        const centerY = (thumbY + indexY + middleY) / 3;
        ctx.beginPath();
        ctx.moveTo(thumbX, thumbY);
        ctx.lineTo(indexX, indexY);
        ctx.lineTo(middleX, middleY);
        ctx.closePath();
        ctx.fillStyle = "rgba(201, 178, 255, 0.22)";
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2 * unit;
        ctx.stroke();
        ctx.beginPath();
        for (const side of [-1, 1]) {
            const tipX = centerX + side * 22 * unit;
            ctx.moveTo(tipX - side * 5 * unit, centerY - 6 * unit);
            ctx.lineTo(tipX, centerY);
            ctx.lineTo(tipX - side * 5 * unit, centerY + 6 * unit);
        }
        ctx.lineWidth = 1.8 * unit;
        ctx.stroke();
    } else if (isPinchMode || approach > 0) {
        ctx.beginPath();
        ctx.moveTo(thumbX, thumbY);
        ctx.lineTo(indexX, indexY);
        ctx.setLineDash(isPinchMode ? [] : [3 * unit, 3 * unit]);
        ctx.strokeStyle = isPinchMode ? accent : `rgba(151, 255, 220, ${0.25 + approach * 0.6})`;
        ctx.lineWidth = (isPinchMode ? 2.4 : 1.4) * unit;
        ctx.stroke();
        ctx.setLineDash([]);
    }

    ctx.shadowColor = accent;
    FINGER_TIPS.forEach((tipIndex, finger) => {
        const isOn = fingerStates[finger];
        const [x, y] = points[tipIndex];
        ctx.shadowBlur = isOn ? 8 * ratio : 0;
        dot(x, y, (isOn ? 3.2 : 2.2) * unit, isOn ? accent : idle);
    });
    ctx.shadowBlur = 0;

    if (isPinchMode) {
        ctx.beginPath();
        ctx.arc((thumbX + indexX) / 2, (thumbY + indexY) / 2, 6 * unit, 0, Math.PI * 2);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5 * unit;
        ctx.stroke();
    }
}

function resetHandReadout() {
    clearOverlay();
    renderFingerChips([false, false, false, false, false]);
    cameraPanel?.classList.remove("has-hand");
    flashUntil = 0;
    setGesture("searching");
}

function markClick() {
    cursor.classList.remove("is-snapping");
    void cursor.offsetWidth;
    cursor.classList.add("is-snapping");
    flashGesture("클릭!");
}

function updateCursor(x, y, isPinching) {
    cursor.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    cursor.classList.toggle("is-pinching", isPinching);
}

function findInteractiveTarget(x, y) {
    const selector = ".tcg-card, .booster-pack, button, [role='button'], a, input, select";
    const offsets = [[0, 0], [-18, 0], [18, 0], [0, -18], [0, 18]];
    for (const [offsetX, offsetY] of offsets) {
        const target = document.elementFromPoint(x + offsetX, y + offsetY)?.closest(selector);
        if (target) return target;
    }
    return null;
}

function beginPinch(x, y, targetOverride = null) {
    pinching = true;
    pinchStartX = x;
    pinchStartY = y;
    previousX = x;
    previousY = y;
    movedDistance = 0;
    activeTarget = targetOverride || document.elementFromPoint(x, y);
    const interactive = activeTarget?.closest(".tcg-card, .booster-pack, button, [role='button'], a, input, select");
    activeTarget = interactive || null;
    if (activeTarget) {
        dispatchPointer(activeTarget, "pointerdown", x, y);
        activeTarget.classList.add("is-hand-held");
    }
}

function movePinch(x, y) {
    const dx = x - pinchStartX;
    const dy = y - pinchStartY;
    movedDistance = Math.max(movedDistance, Math.hypot(dx, dy));
    if (activeTarget) {
        dispatchPointer(activeTarget, "pointermove", x, y);
    } else {
        window.scrollBy({ top: (previousY - y) * 1.8, behavior: "auto" });
    }
    previousX = x;
    previousY = y;
}

function endPinch(x, y) {
    if (activeTarget) {
        dispatchPointer(activeTarget, "pointerup", x, y);
        activeTarget.classList.remove("is-hand-held");
    }
    pinching = false;
    activeTarget = null;
}

// Abort a pinch without a click, e.g. when the middle finger joins it for a swipe.
function cancelPinch() {
    if (activeTarget) {
        dispatchPointer(activeTarget, "pointercancel", previousX, previousY);
        activeTarget.classList.remove("is-hand-held");
    }
    pinching = false;
    activeTarget = null;
    movedDistance = 0;
    snapArmedAt = 0;
    snapTarget = null;
    snapStartX = 0;
    snapStartY = 0;
}

function releaseGesture() {
    if (pinching) endPinch(pinchStartX, previousY);
    fistStartedAt = 0;
    fistTriggered = false;
    snapArmedAt = 0;
    snapTarget = null;
    snapStartX = 0;
    snapStartY = 0;
    swipeSamples = [];
    swipeGrouped = false;
    swipeSpent = false;
    pinchBlocked = false;
    palmScrollY = null;
    palmSince = 0;
    cursor.classList.remove("is-visible", "is-pinching", "is-fist");
}

function updateIndexGesture(hand, palmWidth, x, y, isFist) {
    const now = performance.now();
    const thumb = hand[4];
    const index = hand[8];
    const indexDistance = Math.hypot(thumb.x - index.x, thumb.y - index.y) / palmWidth;
    // After a three-finger swipe, wait for thumb and index to open before pinching again.
    if (pinchBlocked) {
        if (indexDistance < PINCH_RELEASE_DISTANCE) return { isActive: false, didClick: false };
        pinchBlocked = false;
    }
    // Once a gesture starts, keep it alive across small landmark fluctuations.
    const gestureStarted = snapArmedAt > 0 || pinching;
    const fingersTogether = indexDistance < (gestureStarted ? PINCH_RELEASE_DISTANCE : PINCH_START_DISTANCE);

    if (isFist) {
        if (pinching) endPinch(x, y);
        snapArmedAt = 0;
        snapTarget = null;
        snapStartX = 0;
        snapStartY = 0;
        return { isActive: false, didClick: false };
    }

    if (fingersTogether) {
        if (!snapArmedAt) {
            snapArmedAt = now;
            snapStartX = x;
            snapStartY = y;
            snapTarget = findInteractiveTarget(x, y);
            beginPinch(x, y, snapTarget);
        }
        const travel = Math.hypot(x - snapStartX, y - snapStartY);
        if (pinching && travel >= DRAG_START_PX) {
            movePinch(x, y);
        }
        return { isActive: true, didClick: false };
    }

    const heldFor = snapArmedAt ? now - snapArmedAt : 0;
    const didDrag = movedDistance >= DRAG_START_PX;
    if (pinching) endPinch(x, y);
    const target = snapTarget;
    snapArmedAt = 0;
    snapTarget = null;
    snapStartX = 0;
    snapStartY = 0;
    const shouldClick = !didDrag && heldFor > 0 &&
        now - lastSnapAt >= 180 && target?.isConnected;
    if (shouldClick) {
        lastSnapAt = now;
        target.click();
        markClick();
    }
    return { isActive: false, didClick: Boolean(shouldClick) };
}

function completePendingClick() {
    const target = snapTarget;
    const now = performance.now();
    const shouldClick = snapArmedAt > 0 && movedDistance < DRAG_START_PX &&
        target?.isConnected && now - lastSnapAt >= 180;
    if (shouldClick) {
        lastSnapAt = now;
        target.click();
        markClick();
    }
    return Boolean(shouldClick);
}

function goBackInSite() {
    const modal = document.getElementById("cardModal");
    if (modal && !modal.classList.contains("hidden")) {
        document.getElementById("closeModalButton")?.click();
        return;
    }

    const currentPage = document.getElementById("pageStack")?.dataset.page || PAGE_ORDER[0];
    const currentIndex = PAGE_ORDER.indexOf(currentPage);
    const previousPage = PAGE_ORDER[currentIndex - 1];
    if (previousPage) {
        document.querySelector(`[data-page-target="${previousPage}"]`)?.click();
        return;
    }

    if (history.length > 1) history.back();
}

function detectFist(hand) {
    const now = performance.now();
    const wrist = hand[0];
    const fingerPairs = [[8, 6], [12, 10], [16, 14], [20, 18]];
    const curledFingers = fingerPairs.filter(([tipIndex, jointIndex]) => {
        const tip = hand[tipIndex];
        const joint = hand[jointIndex];
        return Math.hypot(tip.x - wrist.x, tip.y - wrist.y) < Math.hypot(joint.x - wrist.x, joint.y - wrist.y) * 1.06;
    }).length;
    const isFist = curledFingers >= 4;

    if (!isFist) {
        fistStartedAt = 0;
        fistTriggered = false;
        cursor.classList.remove("is-fist");
        return false;
    }

    cursor.classList.add("is-fist");
    if (!fistStartedAt) fistStartedAt = now;
    if (!fistTriggered && !pinching && now - fistStartedAt >= FIST_HOLD_MS) {
        fistTriggered = true;
        goBackInSite();
        flashGesture("뒤로 가기");
    }
    return true;
}

// Page swipe: gather the thumb, index and middle fingertips, then move the hand
// left or right. Returns whether the three fingers are currently gathered.
function updateSwipeGroup(hand, palmWidth) {
    const thumb = hand[4];
    const index = hand[8];
    const middle = hand[12];
    const spread = Math.max(distance(thumb, index), distance(thumb, middle), distance(index, middle)) / palmWidth;
    // A middle finger curled into the palm can sit near a plain pinch on screen; require it to reach out.
    const middleReaching = distance(middle, hand[0]) > distance(hand[10], hand[0]) * 0.85;
    const wasGrouped = swipeGrouped;
    swipeGrouped = wasGrouped ? spread < SWIPE_GROUP_RELEASE : spread < SWIPE_GROUP_START && middleReaching;

    if (!swipeGrouped) {
        if (wasGrouped) {
            swipeSamples = [];
            swipeSpent = false;
            // Fingers part one at a time; don't let a leftover thumb+index pinch click.
            pinchBlocked = true;
        }
        return false;
    }
    if (!wasGrouped) {
        cancelPinch();
        fistStartedAt = 0;
        fistTriggered = false;
        cursor.classList.remove("is-fist");
        swipeSamples = [];
    }
    // One page per gather, so the hand's return stroke doesn't flip back.
    if (swipeSpent) return true;

    const now = performance.now();
    // Mirror MediaPipe's camera coordinate so movement matches what users see.
    swipeSamples.push({ x: 1 - (thumb.x + index.x + middle.x) / 3, y: (thumb.y + index.y + middle.y) / 3, time: now });
    swipeSamples = swipeSamples.filter((sample) => now - sample.time <= 850).slice(-18);
    if (swipeSamples.length < 5 || now - lastSwipeAt < 850) return true;

    const first = swipeSamples[0];
    const last = swipeSamples[swipeSamples.length - 1];
    const elapsed = last.time - first.time;
    const deltaX = last.x - first.x;
    const deltaY = last.y - first.y;
    const horizontalTravel = swipeSamples.slice(1).reduce((sum, sample, sampleIndex) => {
        return sum + Math.abs(sample.x - swipeSamples[sampleIndex].x);
    }, 0);
    const directionConsistency = horizontalTravel ? Math.abs(deltaX) / horizontalTravel : 0;
    const isDeliberateSwipe = elapsed >= 140 && Math.abs(deltaX) >= 0.105 &&
        Math.abs(deltaX) > Math.abs(deltaY) * 1.45 && directionConsistency >= 0.62;
    if (!isDeliberateSwipe) return true;

    const currentPage = document.getElementById("pageStack")?.dataset.page || PAGE_ORDER[0];
    const currentIndex = PAGE_ORDER.indexOf(currentPage);
    // Left hand movement advances to the section on the right; right goes back.
    const nextIndex = deltaX < 0 ? currentIndex + 1 : currentIndex - 1;
    const targetPage = PAGE_ORDER[nextIndex];
    swipeSamples = [];
    lastSwipeAt = now;
    swipeSpent = true;
    if (!targetPage) {
        flashGesture(nextIndex > currentIndex ? "마지막 페이지예요" : "첫 페이지예요");
        return true;
    }

    document.querySelector(`[data-page-target="${targetPage}"]`)?.click();
    flashGesture(nextIndex > currentIndex ? "다음 페이지 ›" : "‹ 이전 페이지");
    return true;
}

// A deliberately spread hand: all four fingers raised and the thumb out to the side.
function isSpreadPalm(hand) {
    const wrist = hand[0];
    const raised = [[8, 6], [12, 10], [16, 14], [20, 18]].every(([tip, joint]) =>
        distance(hand[tip], wrist) > distance(hand[joint], wrist) * 1.04 && hand[tip].y < hand[joint].y + 0.035);
    const thumbOut = distance(hand[4], hand[17]) > distance(hand[2], hand[17]) * 1.1;
    return raised && thumbOut && distance(hand[5], hand[17]) > 0.075;
}

function scrollPageBy(top) {
    const modal = document.getElementById("cardModal");
    const dialog = modal && !modal.classList.contains("hidden") ? modal.querySelector(".card-modal-dialog") : null;
    (dialog || window).scrollBy({ top, behavior: "auto" });
}

// Open palm moved up/down scrolls like dragging the page: hand up shows content further down.
function updatePalmScroll(hand, isPalm) {
    if (!isPalm) {
        palmScrollY = null;
        palmSince = 0;
        return false;
    }
    const now = performance.now();
    const palmY = [0, 5, 9, 13, 17].reduce((sum, i) => sum + hand[i].y, 0) / 5;
    if (palmScrollY === null) {
        palmScrollY = palmY;
        palmSince = now;
        return true;
    }
    // Smooth landmark jitter; opening the hand gets a short settle so the page doesn't jolt.
    const smoothed = palmScrollY + (palmY - palmScrollY) * 0.5;
    const deltaY = smoothed - palmScrollY;
    palmScrollY = smoothed;
    if (now - palmSince < PALM_SETTLE_MS || Math.abs(deltaY) < 0.002) return true;
    scrollPageBy(-deltaY * window.innerHeight * PALM_SCROLL_GAIN);
    return true;
}

function trackFrame() {
    if (!enabled) return;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const result = landmarker.detectForVideo(video, performance.now());
        const hand = result.landmarks?.[0];
        if (hand) {
            const index = hand[8];
            const thumb = hand[4];
            const palmWidth = Math.hypot(hand[5].x - hand[17].x, hand[5].y - hand[17].y) || 0.12;
            const indexPinchDistance = Math.hypot(index.x - thumb.x, index.y - thumb.y) / palmWidth;
            // The pinch point is more stable and intuitive than either fingertip alone.
            const pinchX = (index.x + thumb.x) / 2;
            const pinchY = (index.y + thumb.y) / 2;
            const x = (1 - pinchX) * window.innerWidth;
            const y = pinchY * window.innerHeight;
            // The three-finger swipe outranks the plain pinch, which outranks the fist.
            const isSwipeGroup = updateSwipeGroup(hand, palmWidth);
            // A pinch often curls the other fingers and can resemble a fist. Give the
            // index gesture priority while the thumb and index are near each other.
            const isIndexGesturePose = isSwipeGroup || indexPinchDistance < 0.72 || snapArmedAt > 0 || pinching;
            const isFist = isIndexGesturePose ? false : detectFist(hand);
            const indexGesture = isSwipeGroup
                ? { isActive: false, didClick: false }
                : updateIndexGesture(hand, palmWidth, x, y, isFist);
            if (indexGesture.didClick) {
                fistStartedAt = 0;
                fistTriggered = false;
                cursor.classList.remove("is-fist");
            }
            // Open-palm scroll yields to every other gesture, including a pinch on its way in.
            const isScrolling = updatePalmScroll(hand,
                !isIndexGesturePose && !isFist && !indexGesture.isActive && isSpreadPalm(hand));
            cursor.classList.add("is-visible");
            updateCursor(x, y, pinching);

            cameraPanel?.classList.add("has-hand");
            let mode = "point";
            let hold = 0;
            let label;
            if (isFist) {
                mode = "fist";
                hold = fistTriggered ? 1 : (performance.now() - fistStartedAt) / FIST_HOLD_MS;
                if (fistTriggered) label = "주먹 · 손을 펴면 다시 사용";
            } else if (isSwipeGroup) {
                mode = "swipe";
                if (swipeSpent) label = "손가락을 펴면 다시 넘기기";
            } else if (pinching && movedDistance >= DRAG_START_PX) {
                mode = "drag";
            } else if (indexGesture.isActive) {
                mode = "pinch";
            } else if (isScrolling) {
                mode = "scroll";
            }
            // Chips light the fingers that are raised, plus the ones doing the gesture.
            const fingers = readFingerStates(hand);
            if (mode === "pinch" || mode === "drag") fingers[0] = fingers[1] = true;
            if (mode === "swipe") fingers[0] = fingers[1] = fingers[2] = true;
            renderFingerChips(fingers);
            setGesture(mode, hold, label);
            drawHand(hand, mode, indexPinchDistance);
        } else {
            completePendingClick();
            releaseGesture();
            clearOverlay();
            renderFingerChips([false, false, false, false, false]);
            cameraPanel?.classList.remove("has-hand");
            setGesture("searching");
        }
    }
    animationFrame = requestAnimationFrame(trackFrame);
}

async function startHandControl() {
    if (enabled || button.disabled) return;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    document.getElementById("handControlState").textContent = "연결하는 중…";
    setStatus("손 인식기를 불러오는 중…");
    try {
        if (!landmarker) {
            const { FilesetResolver, HandLandmarker } = await import(MEDIAPIPE_MODULE);
            const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
            landmarker = await HandLandmarker.createFromOptions(vision, {
                baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
                runningMode: "VIDEO",
                numHands: 1,
                minHandDetectionConfidence: 0.45,
                minHandPresenceConfidence: 0.42,
                minTrackingConfidence: 0.42,
            });
        }
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
        });
        video.srcObject = stream;
        await video.play();
        resetHandReadout();
        cameraPanel.classList.add("is-visible");
        enabled = true;
        button.classList.add("is-active");
        const label = button.querySelector(".hand-control-label");
        if (label) label.textContent = "Hand On";
        document.getElementById("handControlState").textContent = "손 인식 활성화";
        button.setAttribute("aria-pressed", "true");
        button.setAttribute("aria-label", "카메라 끄기");
        // Brief how-to that fades after 3 seconds; the camera preview keeps showing gestures live.
        setStatus("검지+엄지를 짧게 모으면 클릭 · 모은 채 움직이면 드래그 · 엄지+검지+중지를 모아 좌우로 움직이면 페이지 전환 · 손바닥을 펴고 위아래로 움직이면 스크롤 · 주먹을 쥐면 뒤로 가기", false, 3000);
        animationFrame = requestAnimationFrame(trackFrame);
    } catch (error) {
        console.error("Hand tracking could not start", error);
        stopHandControl();
        setStatus("손 인식을 시작하지 못했습니다. 카메라 권한과 인터넷 연결을 확인해 주세요.", true);
    } finally {
        button.disabled = false;
        button.removeAttribute("aria-busy");
    }
}

function stopHandControl() {
    enabled = false;
    cancelAnimationFrame(animationFrame);
    releaseGesture();
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    lastVideoTime = -1;
    video.srcObject = null;
    cameraPanel?.classList.remove("is-visible");
    resetHandReadout();
    button.classList.remove("is-active");
    const label = button.querySelector(".hand-control-label");
    if (label) label.textContent = "Hand";
    document.getElementById("handControlState").textContent = "손으로 조작하기";
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", "카메라 켜기");
    setStatus("");
}

button?.addEventListener("click", () => {
    if (enabled) stopHandControl();
    else startHandControl();
});
window.addEventListener("beforeunload", stopHandControl);
