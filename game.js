(() => {
    "use strict";
    const P_MAX_PX = 220, P_MAX_RATIO = .30, A = .41, SWEEP_FACTOR = .20;
    const SWEEP_SPEED = 1500, LAUNCH_T = -.08, DISTANCE = 1.1;
    const JUDGMENTS = [[.01, "PERFECT", 100], [.025, "GREAT", 60], [.05, "GOOD", 30], [.10, "CLOSE", 10]];
    const MULTIPLIERS = { Bronze: 1, Silver: 1.2, Gold: 1.4, Platinum: 1.7, Legendary: 2 };
    const ANCHORS = [[-600, 0], [0, .08], [1500, .20], [1600, .27], [1700, .39], [1800, .53], [1900, .70], [2025, 1]];
    const ERAS = [[-600, "고대 그리스"], [0, "로마"], [800, "이슬람 황금기"], [1450, "르네상스"], [1600, "과학혁명"], [1700, "계몽의 시대"], [1780, "산업혁명"], [1870, "전기의 시대"], [1950, "컴퓨터 시대"]];
    const BEST_KEY = "mathematica-chrono-best-v1", TUTORIAL_KEY = "mathematica-chrono-tutorial-v1";
    function interpolate(value, input, output) {
        let i = 1;
        while (i < ANCHORS.length - 1 && value > ANCHORS[i][input]) i++;
        const a = ANCHORS[i - 1], b = ANCHORS[i];
        return a[output] + (value - a[input]) / (b[input] - a[input]) * (b[output] - a[output]);
    }
    const yearToT = year => interpolate(year, 0, 1);
    const tToYear = t => interpolate(t, 1, 0);
    const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
    const yearLabel = year => Math.round(year) < 0 ? `BC ${Math.abs(Math.round(year))}` : `${Math.round(year)}`;
    const shuffle = items => {
        const copy = [...items];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    };
    document.addEventListener("DOMContentLoaded", () => {
        const root = document.getElementById("chronoGame");
        const page = root.closest(".page-view");
        const reduced = matchMedia("(prefers-reduced-motion: reduce)");
        root.innerHTML = `
          <aside class="chrono-hand-panel"><p class="chrono-label">YOUR HAND</p><div class="chrono-hand"></div><div class="chrono-card-info"></div></aside>
          <div class="chrono-mobile-score"></div>
          <div class="chrono-track" tabindex="0" aria-label="시간 트랙. Space를 누르다 떼어 던지고 위 화살표를 연타해 스윕하세요.">
            <div class="chrono-dust" aria-hidden="true"></div><div class="chrono-axis"></div>
            <div class="chrono-markers"></div><div class="chrono-launch" aria-hidden="true"></div><div class="chrono-tether"></div>
            <button class="chrono-stone" type="button" aria-label="카드를 아래로 당겼다 놓으세요"><img draggable="false" alt=""><span class="chrono-live-year"></span><span class="chrono-sweep">✧ SWEEP ✧</span></button>
            <div class="chrono-reveal" role="status" aria-live="polite"></div>
            <div class="chrono-coach"><span class="chrono-coach-hand" aria-hidden="true">☞</span><span>아래로 당기기 → 놓기 → 문질러 더 멀리</span><small>Space 길게 누르고 놓기 · ↑ 연타로 스윕</small></div>
            <section class="chrono-results" aria-label="나의 연대기" hidden></section>
          </div>
          <aside class="chrono-score-panel"><p class="chrono-label">CHRONICLE</p><ol class="chrono-scores"></ol><p class="chrono-total"></p><p class="chrono-best"></p></aside>`;
        const $ = selector => root.querySelector(selector);
        const track = $(".chrono-track"), stone = $(".chrono-stone"), axis = $(".chrono-axis");
        const coach = $(".chrono-coach"), reveal = $(".chrono-reveal"), results = $(".chrono-results");
        const orbit = document.querySelector(".celestial-orbit").cloneNode(true);
        $(".chrono-launch").append(orbit);
        for (let year = -600; year <= 2000; year += 100) {
            const tick = document.createElement("div");
            tick.className = "chrono-tick";
            tick.style.bottom = `${yearToT(year) * 100}%`;
            // Early centuries share a deliberately compressed scale.
            tick.innerHTML = `<span>${year < 1500 && ![-600, 0, 1500].includes(year) ? "" : yearLabel(year)}</span>`;
            axis.append(tick);
        }
        const endpoint = document.createElement("div");
        endpoint.className = "chrono-tick"; endpoint.style.bottom = "100%";
        endpoint.innerHTML = "<span>2025</span>"; axis.append(endpoint);
        ERAS.forEach(([year, name]) => {
            const era = document.createElement("span");
            era.className = "chrono-era"; era.style.bottom = `${yearToT(year) * 100}%`; era.textContent = name; axis.append(era);
        });
        let deck = [], owned, selected = 0, shots = [], phase = "ready", t = LAUNCH_T, velocity = 0;
        let pull = 0, intensity = 0, sweepTarget = 0, pointer = null, lastPointer = null, chargeStart = null;
        let lastFrame = 0, revealElapsed = 0, revealStep = 0, pending = null, total = 0;
        let best = Math.max(0, Number(safeStorageGet(BEST_KEY)) || 0), startingBest = best, started = false;
        const active = () => !page.hidden && page.classList.contains("is-active") && !document.hidden;
        const length = () => axis.getBoundingClientRect().height;
        const maxPull = () => Math.min(P_MAX_PX, length() * P_MAX_RATIO);
        const y = value => axis.offsetTop + length() * (1 - value);
        const multiplier = card => owned.has(card.id) ? MULTIPLIERS[card.rarity] : 1;
        function renderScores() {
            $(".chrono-scores").innerHTML = Array.from({ length: 5 }, (_, i) => `<li><span>${String(i + 1).padStart(2, "0")}</span><strong>${shots[i] ? shots[i].judgment : "—"}</strong><b>${shots[i]?.score ?? "—"}</b></li>`).join("");
            $(".chrono-total").innerHTML = `<span>TOTAL</span> ${total}`;
            $(".chrono-best").textContent = `BEST ${best}`;
            $(".chrono-mobile-score").textContent = `${Math.min(shots.length + 1, 5)}/5 · ${total}점 · BEST ${best}`;
        }
        function renderHand() {
            $(".chrono-hand").innerHTML = deck.map((card, i) => `<button type="button" data-card="${i}" class="chrono-hand-card ${i === selected ? "is-selected" : ""}" style="--fan:${i - 2}" ${shots.some(shot => shot.card.id === card.id) ? "disabled" : ""} aria-label="${card.name}" aria-pressed="${i === selected}"><img src="thumbs/${card.id}.webp" alt="" draggable="false"></button>`).join("");
            const card = deck[selected];
            $(".chrono-card-info").innerHTML = `<h3>${card.name}</h3><p>${card.discoverer}</p><span>×${multiplier(card).toFixed(1)}</span>`;
            stone.querySelector("img").src = `thumbs/${card.id}.webp`;
            stone.setAttribute("aria-label", `${card.name}, ${card.discoverer}. 아래로 당겼다 놓으세요`);
        }
        function position() {
            stone.style.top = `${y(t) + pull}px`;
            stone.style.setProperty("--tilt", `${-pull / Math.max(1, maxPull()) * 24}deg`);
            $(".chrono-launch").style.top = `${y(LAUNCH_T)}px`;
            $(".chrono-launch").style.setProperty("--power", `${pull / Math.max(1, maxPull()) * 360}deg`);
            $(".chrono-tether").style.top = `${y(LAUNCH_T)}px`;
            $(".chrono-tether").style.height = `${pull}px`;
            $(".chrono-live-year").textContent = phase === "sliding" ? yearLabel(tToYear(t)) : "";
            stone.classList.toggle("is-sweeping", phase === "sliding" && intensity > .15);
        }
        function start() {
            started = true;
            owned = new Set(state.inventory.map(entry => entry.formulaId));
            const pool = library.filter(card => owned.has(card.id));
            pool.push(...shuffle(library.filter(card => !owned.has(card.id))).slice(0, Math.max(0, 10 - pool.length)));
            deck = shuffle(pool).slice(0, 5); shots = []; selected = 0; total = 0; startingBest = best;
            phase = "ready"; t = LAUNCH_T; pull = 0; intensity = 0; pointer = null; chargeStart = null;
            results.hidden = true; reveal.textContent = ""; $(".chrono-markers").replaceChildren();
            stone.hidden = false; coach.hidden = !!safeStorageGet(TUTORIAL_KEY);
            renderHand(); renderScores(); position();
        }
        function launch() {
            if (phase !== "aiming") return;
            chargeStart = null;
            if (pull < 10) { phase = "ready"; pull = 0; position(); return; }
            velocity = Math.sqrt(2 * A * DISTANCE * pull / maxPull());
            pull = 0; t = LAUNCH_T; phase = "sliding"; intensity = 0; sweepTarget = 0;
            coach.hidden = true; safeStorageSet(TUTORIAL_KEY, "1"); track.focus({ preventScroll: true });
        }
        function stop() {
            phase = "reveal"; revealElapsed = 0; revealStep = 0;
            const card = deck[selected], target = yearToT(card.year), error = Math.abs(t - target);
            const [, judgment, base] = (t <= 1 && JUDGMENTS.find(([limit]) => error <= limit)) || [Infinity, "MISS", 0];
            pending = { card, t, target, judgment, base, score: Math.round(base * multiplier(card)), landing: Math.round(tToYear(t)) };
            stone.classList.remove("is-sweeping");
        }
        function markShot() {
            const marker = document.createElement("div"); marker.className = "chrono-shot-marker";
            marker.style.setProperty("--shot", shots.length);
            const top = 8 + (1 - pending.target) * 62, landing = 8 + (1 - clamp(pending.t)) * 62;
            marker.innerHTML = `<span class="chrono-pin" style="top:${top}%">✦<b>${yearLabel(pending.card.year)}</b></span><span class="chrono-thread" style="top:${Math.min(top, landing)}%;height:${Math.abs(top - landing)}%"></span><span class="chrono-landed" style="top:${landing}%">◇</span><span class="chrono-error" style="top:${(top + landing) / 2}%">${pending.landing - pending.card.year >= 0 ? "+" : ""}${pending.landing - pending.card.year}년</span>`;
            $(".chrono-markers").append(marker);
        }
        function finish() {
            phase = "finished"; stone.hidden = true;
            const average = shots.reduce((sum, shot) => sum + shot.base, 0) / 5;
            const [rank, title] = average >= 60 ? ["S", "시간의 지배자"] : average >= 35 ? ["A", "연대기 학자"] : average >= 15 ? ["B", "시간 여행자"] : ["C", "길 잃은 방랑자"];
            if (total > best) { best = total; safeStorageSet(BEST_KEY, String(best)); }
            results.innerHTML = `<p class="chrono-label">나의 연대기</p><h3>${rank} · ${title}</h3><p class="chrono-final-total">${total} <small>BEST ${best}</small></p>${total > startingBest ? '<p class="chrono-new-best">NEW BEST</p>' : ""}<div class="chrono-result-list">${[...shots].sort((a, b) => a.card.year - b.card.year).map(shot => `<button type="button" data-result="${shot.card.id}"><img src="thumbs/${shot.card.id}.webp" alt=""><span><strong>${shot.card.name}</strong><span>${yearLabel(shot.landing)} → ${yearLabel(shot.card.year)}</span><small>${shot.judgment} · ${shot.score}점${owned.has(shot.card.id) ? "" : " · 미보유 · 팩에서 찾아보세요"}</small></span></button>`).join("")}</div><div class="chrono-result-actions"><button class="archive-action" type="button" data-replay>다시 하기</button><button class="archive-action" type="button" data-pack>팩 열러 가기</button></div>`;
            results.hidden = false; renderScores();
        }
        function advanceReveal(dt) {
            revealElapsed += dt;
            const delay = reduced.matches ? .1 : .4;
            if (revealStep === 0 && revealElapsed >= delay) { markShot(); revealStep = 1; }
            if (revealStep === 1 && revealElapsed >= delay + (reduced.matches ? .1 : .45)) {
                reveal.className = `chrono-reveal ${pending.judgment === "PERFECT" ? "is-perfect" : ""}`;
                reveal.innerHTML = `<strong>${pending.judgment}</strong><p>${yearLabel(pending.card.year)} · ${pending.card.discoverer} · ${pending.card.note}</p><span class="chrono-flying-score">+${pending.score}</span>`;
                if (pending.judgment === "PERFECT") navigator.vibrate?.(30);
                revealStep = 2;
            }
            if (revealStep === 2 && revealElapsed >= (reduced.matches ? .8 : 2.8)) {
                shots.push(pending); total += pending.score;
                $(".chrono-markers").lastElementChild.classList.add("is-settled"); renderScores();
                if (shots.length === 5) { reveal.textContent = ""; finish(); return; }
                selected = deck.findIndex(card => !shots.some(shot => shot.card.id === card.id));
                phase = "ready"; t = LAUNCH_T; reveal.textContent = ""; renderHand();
            }
        }
        function frame(now) {
            const dt = Math.min((now - lastFrame) / 1000 || 0, .04); lastFrame = now;
            if (active() && started) {
                if (chargeStart !== null && phase === "aiming") pull = Math.min(maxPull(), pull + dt * maxPull() / 1.25);
                if (phase === "sliding") {
                    intensity += (sweepTarget - intensity) * (1 - Math.exp(-12 * dt));
                    sweepTarget *= Math.exp(-5 * dt);
                    const deceleration = A * (1 - SWEEP_FACTOR * intensity), step = Math.min(dt, velocity / deceleration);
                    t += velocity * step - .5 * deceleration * step * step;
                    velocity = Math.max(0, velocity - deceleration * step);
                    if (t > 1 || velocity === 0) stop();
                } else if (phase === "reveal") advanceReveal(dt);
                position();
            }
            requestAnimationFrame(frame);
        }
        stone.addEventListener("pointerdown", event => {
            if (phase !== "ready" || event.button !== 0) return;
            event.preventDefault(); phase = "aiming"; pointer = { id: event.pointerId, y: event.clientY }; pull = 0;
            stone.setPointerCapture(event.pointerId);
        });
        track.addEventListener("pointermove", event => {
            if (phase === "aiming" && pointer?.id === event.pointerId) pull = clamp(event.clientY - pointer.y, 0, maxPull());
            if (phase === "sliding") {
                const now = performance.now();
                if (lastPointer?.id === event.pointerId) {
                    const seconds = Math.max(.001, (now - lastPointer.time) / 1000);
                    sweepTarget = clamp(Math.hypot(event.clientX - lastPointer.x, event.clientY - lastPointer.y) / seconds / SWEEP_SPEED);
                }
                lastPointer = { id: event.pointerId, x: event.clientX, y: event.clientY, time: now };
            }
        });
        track.addEventListener("pointerup", event => {
            if (pointer?.id === event.pointerId) { pointer = null; launch(); }
            lastPointer = null;
        });
        track.addEventListener("pointercancel", () => { if (phase === "aiming") { phase = "ready"; pull = 0; } pointer = null; lastPointer = null; });
        document.addEventListener("keydown", event => {
            if (!active() || !document.getElementById("cardModal").classList.contains("hidden")) return;
            if (event.code === "Space" && ["ready", "aiming"].includes(phase) && !event.target.closest("button:not(.chrono-stone)")) {
                event.preventDefault(); if (!event.repeat && phase === "ready") { phase = "aiming"; chargeStart = performance.now(); pull = 0; }
            }
            if (event.code === "ArrowUp" && phase === "sliding") { event.preventDefault(); sweepTarget = 1; }
        });
        document.addEventListener("keyup", event => { if (event.code === "Space" && chargeStart !== null) { event.preventDefault(); launch(); } });
        const cancelAim = () => { if (phase === "aiming") { phase = "ready"; pull = 0; chargeStart = null; pointer = null; } };
        window.addEventListener("blur", cancelAim);
        function syncPage() {
            if (!active()) cancelAim();
            else {
                page.style.height = `${Math.max(0, window.innerHeight - page.getBoundingClientRect().top)}px`;
                if (!started) start();
                position();
            }
        }
        new MutationObserver(syncPage).observe(page, { attributes: true, attributeFilter: ["class", "hidden"] });
        root.addEventListener("click", event => {
            const hand = event.target.closest("[data-card]");
            if (hand && phase === "ready") { selected = Number(hand.dataset.card); renderHand(); }
            const result = event.target.closest("[data-result]");
            if (result && phase === "finished") openCardModal(formulaById[result.dataset.result]);
            if (event.target.closest("[data-replay]")) start();
            if (event.target.closest("[data-pack]")) document.querySelector('[data-page-target="opening"]').click();
        });
        document.getElementById("chronoHelp").addEventListener("click", () => { coach.hidden = !coach.hidden; });
        new ResizeObserver(position).observe(track);
        window.addEventListener("resize", syncPage);
        syncPage(); requestAnimationFrame(frame);
    });
})();
