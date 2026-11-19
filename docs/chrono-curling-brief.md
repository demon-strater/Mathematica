# 개발 요청: Mathematica 사이트에 "Chrono Curling(시간 컬링)" 게임 추가

확정된 기획이다. 적힌 범위만 구현하고 기능을 더하지 마라. 애매하면 더 단순한 쪽을 택한다.
토큰 절약: 카드 이미지 28장을 다시 열어 보지 마라(필요한 데이터는 아래 표에 다 있다). 큰 파일은 필요한 함수만 읽어라.
프로젝트 규칙은 `AGENTS.md`를 따른다(수정한 CSS/JS의 `?v=` 올리기, 단계별 로컬 커밋, 되돌리기는 revert).

## 1. 게임 한 줄
카드를 아래로 당겼다 놓아 세로 "시간의 강" 위로 미끄러뜨리고, 그 공식이 발표된 해에 멈추게 한다. 지식(언제 나왔지?)과 손맛(정확히 세우기)의 게임. 한 판 = 카드 5장, 1~2분.

## 2. 선행 작업: 카드 데이터를 그림 기준으로 교체 (필수)
현재 버그: `script.js`의 `FORMULA_LIBRARY`(33개)와 카드 그림 PNG(28장)가 이름으로 매칭되지 않고 파일 순서 fallback으로 붙는다. 그래서 대부분 카드의 이름·연도·발견자가 그림과 다르다(예: 피타고라스 그림 = Stokes 1854 데이터).

- `FORMULA_LIBRARY`를 아래 28장으로 교체한다. 각 항목에 `art`(파일명), `name`(한국어), `discoverer`, `year`, `note`(공개 문구), `metrics`(아래 값 ×10, 즉 100점 척도)를 둔다. 희귀도는 기존 `enrichFormula`가 metrics로 계산한다. `note`는 `detail.origin`으로 쓴다. `latex`는 짧은 수식 문자열로 채운다(모르면 이름).
- 그림은 `art` 필드로만 붙인다. 이름 매칭, fallback 배정, `KOREAN_CARD_NAME_TO_ID`, GitHub contents API로 카드 그림을 찾는 로직은 제거한다. 팩·카드 뒷면 그림 로직은 유지한다. 파일명 오타(멕스웰, 디렉, 세넌, 캐플러, 애너지)는 그대로 둔다.
- 보유 카드 마이그레이션: 저장 키를 `...-inventory-v6`로 올린다. v5를 읽을 때 옛 id를 "지금 화면에 보이던 그림"의 새 id로 한 번 바꾼다.

  `euler_identity→euler_identity, pythagorean_theorem→euler_lagrange, quadratic_formula→mass_energy, fundamental_theorem_calculus→dirac_equation, newton_second_law→maxwell_equations, mass_energy→central_limit_theorem, bayes_theorem→fundamental_theorem_calculus, gaussian_integral→bell_inequality, shannon_entropy→shannon_entropy, bell_inequality→standard_model, navier_stokes→poincare_conjecture, black_scholes→navier_stokes, riemann_zeta→rsa, euclid_primes→gauss_bonnet, de_moivre→newton_gravitation, binomial_theorem→euler_polyhedron, green_theorem→black_scholes, heron_formula→pagerank, law_of_cosines→simplex, ceva_theorem→archimedes_principle, pick_theorem→kepler_laws, inclusion_exclusion→ohm_law, eulers_formula→coulomb_law, cauchy_schwarz→hooke_law, stokes_theorem→pythagorean_theorem, maxwell_equations→snell_law, wave_equation→doppler_effect, heat_equation→nash_equilibrium, taylor_series→bell_inequality, lagrange_multiplier→shannon_entropy, euler_lagrange→standard_model, gauss_divergence→poincare_conjecture, central_limit_theorem→navier_stokes`
- `STARTER_IDS` = shannon_entropy, poincare_conjecture, standard_model, central_limit_theorem, kepler_laws
- 하드코딩된 "33"(수집 카운터 초기값, `aria-valuemax`, About 본문 "33가지")을 28로 바꾼다.
- 게임용 썸네일: 28장을 `thumbs/<id>.webp`로 만든다(폭 360, 품질 80). 게임에서는 원본 PNG(장당 2.5MB) 대신 이것을 쓴다. 저장소 루트에 새 PNG를 두지 마라.

| id | art | name | discoverer | year | 공·영·역·가 | note(공개 문구) |
|---|---|---|---|---|---|---|
| euler_identity | 2.오일러 항등식.png | 오일러 항등식 | 레온하르트 오일러 | 1748 | 10·10·10·8 | 『무한 해석 입문』에서 오일러 공식과 함께 정리 |
| euler_lagrange | 3.오일러-라그랑주 방정식.png | 오일러-라그랑주 방정식 | 오일러·라그랑주 | 1755 | 10·10·10·10 | 19세 라그랑주가 오일러에게 보낸 편지로 변분법 완성 |
| mass_energy | 4.질량-애너지 보존의 원리.png | 질량-에너지 등가 원리 | 알베르트 아인슈타인 | 1905 | 10·10·10·10 | '기적의 해'에 낸 특수상대성이론 후속 논문 |
| dirac_equation | 5.디렉 방정식.png | 디랙 방정식 | 폴 디랙 | 1928 | 10·10·9·9 | 상대론적 전자 방정식, 반물질을 예언 |
| maxwell_equations | 6.멕스웰 방정식.png | 맥스웰 방정식 | 제임스 클러크 맥스웰 | 1865 | 10·10·9·9 | 「전자기장의 동역학 이론」, 빛은 전자기파 |
| central_limit_theorem | 7.중심 극한 정리.png | 중심 극한 정리 | 피에르시몽 라플라스 | 1810 | 10·10·10·7 | 드무아브르(1733)의 발견을 라플라스가 일반화 |
| fundamental_theorem_calculus | 8.미적분학의 기본 정리.png | 미적분학의 기본 정리 | 뉴턴·라이프니츠 | 1670 | 10·10·10·9 | 배로의 『기하학 강의』에 등장, 뉴턴·라이프니츠가 체계화 |
| bell_inequality | 10.벨의 부등식.png | 벨의 부등식 | 존 스튜어트 벨 | 1964 | 10·10·8·7 | 양자 얽힘을 실험으로 검증할 길을 염 |
| shannon_entropy | 11. 세넌 엔트로피.png | 섀넌 엔트로피 | 클로드 섀넌 | 1948 | 10·10·8·8 | 「통신의 수학적 이론」, 정보 이론의 탄생 |
| standard_model | 12.표준 모형 라그랑지안.png | 표준 모형 라그랑지안 | 글래쇼·와인버그·살람 외 | 1973 | 10·10·8·8 | 전약 이론에 양자색역학이 더해져 완성 |
| poincare_conjecture | 13.푸앵카레 추측.png | 푸앵카레 추측 | 앙리 푸앵카레 | 1904 | 10·10·8·8 | 1904년 제기, 2003년 페렐만이 리치 흐름으로 증명 |
| navier_stokes | 14.나비에-스토크스 방정식.png | 나비에-스토크스 방정식 | 나비에·스토크스 | 1845 | 10·10·9·7 | 나비에(1822)의 식을 스토크스가 완성 |
| rsa | 15.RSA 암호 알고리즘.png | RSA 암호 알고리즘 | 리베스트·샤미르·애들먼 | 1977 | 8·10·8·7 | 공개키 암호를 실용화한 MIT 세 연구자 |
| gauss_bonnet | 16.가우스-보네 정리.png | 가우스-보네 정리 | 가우스·보네 | 1848 | 10·6·9·6 | 가우스의 연구를 보네가 일반 곡면으로 확장 |
| newton_gravitation | 16.뉴턴의 만유인력 법칙.png | 뉴턴의 만유인력 법칙 | 아이작 뉴턴 | 1687 | 8·7·6·7 | 『프린키피아』에서 발표 |
| euler_polyhedron | 17.오일러의 다면체 정리.png | 오일러의 다면체 정리 | 레온하르트 오일러 | 1752 | 8·7·8·6 | V−E+F=2, 위상수학의 출발점 |
| black_scholes | 18.블랙-숄즈_공식.png | 블랙-숄즈 공식 | 블랙·숄즈·머턴 | 1973 | 8·10·8·8 | 옵션 가격 모형, 1997년 노벨 경제학상 |
| pagerank | 19.페이지랭크_알고리즘.png | 페이지랭크 알고리즘 | 브린·페이지 | 1998 | 7·10·9·8 | 구글 검색의 출발이 된 스탠퍼드 논문 |
| simplex | 20.심플렉스_알고리즘.png | 심플렉스 알고리즘 | 조지 댄치그 | 1947 | 10·6·7·6 | 미 공군 보급 계획에서 태어난 선형계획법 |
| archimedes_principle | 21.아르키메데스의_원리.png | 아르키메데스의 원리 | 아르키메데스 | -250 | 7·7·6·9 | 『부체에 대하여』, "유레카"의 전설 |
| kepler_laws | 22.캐플러의 법칙.png | 케플러의 법칙 | 요하네스 케플러 | 1609 | 9·7·7·7 | 『신천문학』에서 타원 궤도 발표(제3법칙은 1619) |
| ohm_law | 23.옴의 법칙.png | 옴의 법칙 | 게오르크 옴 | 1827 | 7·6·6·7 | 『수학적으로 다룬 갈바니 회로』 |
| coulomb_law | 24.쿨롱의_법칙.png | 쿨롱의 법칙 | 샤를오귀스탱 드 쿨롱 | 1785 | 6·6·6·6 | 비틀림 저울로 전기력을 측정 |
| hooke_law | 25.훅의_법칙.png | 훅의 법칙 | 로버트 훅 | 1678 | 6·6·6·7 | 『복원력에 대하여』에서 발표 |
| pythagorean_theorem | 26.피타고라스 정리.png | 피타고라스 정리 | 피타고라스 학파 | -530 | 10·10·10·9 (그림에 지표 없음) | 고대 그리스 피타고라스 학파의 전승 |
| snell_law | 27.스넬의_법칙.png | 스넬의 법칙 | 빌레브로르트 스넬 | 1621 | 6·5·6·6 | 굴절 법칙(984년 이븐 사흘도 발견) |
| doppler_effect | 28.도플러 효과 공식.png | 도플러 효과 | 크리스티안 도플러 | 1842 | 5·5·6·6 | 쌍성의 색 변화를 설명하며 발표 |
| nash_equilibrium | 29.내시 균형.png | 내시 균형 | 존 내시 | 1950 | 9·8·8·7 | 21세 대학원생의 한 쪽짜리 논문, 1994년 노벨상 |

## 3. 페이지 구조
- 내비게이션 4칸: `I Pack Opening · II Collected Cards · III Game · IV About`. About은 지우지 말고 4번째로 옮긴다(chapter 04). Game 섹션 `data-page="game"`의 제목은 `03 Chrono Curling`이다. 모바일에서는 탭 라벨을 Pack / Cards / Game / About으로 줄이고 4열 그리드로 만든다. 넘치면 안 된다.
- `hand-tracking.js`의 `PAGE_ORDER` = ["opening","catalog","game","about"].
- 새 파일은 `game.js`(IIFE, script.js 다음에 로드)와 `game.css`. `reloadIfOutdated`의 정규식에 `game\.js|game\.css`를 추가한다.
- 게임 화면은 스크롤 없이 한 화면에 들어간다(`100svh` − 헤더). 트랙에는 `touch-action:none`.
- 데스크톱: 왼쪽 손패(5장 부채꼴과 현재 카드의 이름·발견자·배율) | 가운데 세로 트랙 | 오른쪽 점수판(5칸, 합계, BEST).
- 모바일: 상단 한 줄(`2/5 · 점수 · BEST`), 가운데 트랙, 하단 손패 5장.

## 4. 트랙 (세로, 아래가 과거)
- 위치 t는 0~1이고 0 = BC 600, 1 = 2025다. 아래 앵커 사이를 구간별 선형으로 잇는다(`yearToT`/`tToYear` 쌍):
  `[-600,0] [0,.08] [1500,.20] [1600,.27] [1700,.39] [1800,.53] [1900,.70] [2025,1]`
- 세기 눈금과 연도 숫자를 넣고, 시대 이정표를 흐리게 표시한다. 정답 힌트가 아니라 감을 잡는 용도다: 고대 그리스(-600), 로마(0), 이슬람 황금기(800), 르네상스(1450), 과학혁명(1600), 계몽의 시대(1700), 산업혁명(1780), 전기의 시대(1870), 컴퓨터 시대(1950).
- 발사대는 t = −0.08 위치(트랙 시작선 아래)에 별자리 원 문양으로 둔다.

## 5. 조작과 물리
1. 손패에서 카드를 탭하면 발사대에 올라간다(기본은 다음 카드 자동). 카드 아래에 이름과 발견자를 보여준다. **연도는 숨긴다.** 게임 중에는 카드 상세 모달을 열지 않는다.
2. 조준: 카드를 아래로 당긴다. 당긴 거리 p를 `P_MAX = min(220px, 트랙 길이의 30%)` 안으로 자르고, 10px 미만에서 놓으면 취소한다. 연출: 카드가 뒤로 기울고, 발사대와 카드 사이에 빛 끈이 생기고, 힘 링이 보라색에서 금색으로 찬다. 착지 예상 위치는 보여주지 않는다.
3. 놓으면: 목표 거리 `D = 1.1 × p/P_MAX`(트랙 비율), 감속 `A = 0.41`/s², `v0 = √(2·A·D)`로 등감속한다. 진행 중 카드 옆에 **실시간 연도**(예: `1831`, 기원전은 `BC 250`)를 매 프레임 표시한다.
4. 스윕: 카드가 미끄러지는 동안 트랙 위를 문지르면 포인터 속도에 따라 `intensity = clamp(속도/1500px·s⁻¹, 0, 1)`(부드럽게)를 구하고, 감속을 `A × (1 − 0.2·intensity)`로 줄인다. 더 보낼 수만 있다. 카드 앞에 서리 반짝이와 "SWEEP" 표시를 낸다.
5. t > 1이면 트랙 밖으로 날아가 MISS다.
- 키보드: Space를 누르고 있으면 힘이 차고, 떼면 던진다. ↑ 연타는 스윕이다. `prefers-reduced-motion`이면 연출을 짧게 한다.
- 조절값(P_MAX, A, 스윕 계수, 판정 구간)은 game.js 맨 위 상수로 둔다.

## 6. 판정과 점수
- 오차 = 트랙 거리 |t착지 − t정답|. PERFECT ≤.01 → 100, GREAT ≤.025 → 60, GOOD ≤.05 → 30, CLOSE ≤.10 → 10, 그 밖은 MISS 0.
- 카드 배율: 보유 카드는 희귀도에 따라 Bronze 1.0 / Silver 1.2 / Gold 1.4 / Platinum 1.7 / Legendary 2.0. 미보유 카드는 1.0. 점수 = 판정점수 × 배율.
- 덱: 보유 카드(중복 제외)가 10장 미만이면 미보유 카드를 무작위로 더해 10장 풀을 만든 뒤 5장을 뽑는다.
- 등급은 배율을 뺀 판정점수 평균으로 정한다: S ≥60 "시간의 지배자", A ≥35 "연대기 학자", B ≥15 "시간 여행자", 그 아래 C "길 잃은 방랑자".
- BEST는 localStorage `mathematica-chrono-best-v1`에 저장한다(기존 `safeStorageGet/Set` 사용). 기록을 깨면 NEW BEST 연출.

## 7. 공개 연출 (게임의 클라이맥스)
카드가 멈추면 0.4초 정적 → 정답 연도에 금색 핀이 빛기둥과 함께 떨어짐 → 카드와 핀을 잇는 실에 `+12년` 표시 → 판정 글자(Cinzel, PERFECT는 금빛 폭발과 `navigator.vibrate?.(30)`) → 공개 문구 한 줄(`1905 · 알베르트 아인슈타인 · 기적의 해…`) → 점수가 점수판으로 날아감 → 카드는 트랙 옆줄로 비켜나 작은 표식으로 남는다(다음 투구를 막지 않게).

## 8. 결과 화면 "나의 연대기"
트랙 위에 오버레이로 띄운다.
- 등급 칭호, 합계, BEST
- 5장을 **실제 연대순**으로 나열: 각 카드의 내 착지 연도 → 실제 연도, 판정, 점수. 미보유 카드에는 "미보유 · 팩에서 찾아보세요"를 붙인다. 카드를 탭하면 기존 `openCardModal`이 열린다.
- 트랙에는 착지점과 정답 핀을 잇는 선이 남는다.
- 버튼은 기존 `.archive-action` 장식 버튼으로 "다시 하기"와 "팩 열러 가기"(`showPage('opening')` 탭 클릭)를 둔다.

## 9. 처음 방문 안내
첫 판에만 코치 오버레이를 띄운다: 손 그림 애니메이션으로 "아래로 당기기 → 놓기 → 문질러 더 멀리". 첫 투구를 하면 사라진다(`mathematica-chrono-tutorial-v1`). 헤더의 `?` 버튼으로 다시 볼 수 있다. 다른 페이지로 갔다 오면 진행 중인 판을 이어서 한다.

## 10. 디자인 무드 (기존 사이트를 그대로 잇기)
- 남보라 밤하늘 배경과 얇게 새긴 연보라 선(`sanctum.css`의 `:root` 토큰 `--silver --lilac --quiet --etching`), 정답과 PERFECT는 기존 Legendary 금색. 새 색을 만들지 마라.
- 글꼴: 판정과 라벨은 Cinzel, 연도 숫자는 Cormorant Garamond 이탤릭(챕터 번호와 같은 느낌), UI 글자는 Inter.
- 트랙은 아스트롤라베 자처럼 가는 눈금선으로 그리고, 위로 아주 천천히 흐르는 별가루를 깐다. 발사대는 Pack Opening의 `celestial-orbit` 원 문양을 축소해 재사용한다.
- 화려함은 핀 낙하와 PERFECT 두 순간에만 쓰고, 나머지는 절제한다.

## 11. 하지 말 것
프레임워크·빌드도구·외부 라이브러리 금지(썸네일 생성용 일회성 도구는 허용). 카드끼리 충돌, 휘어 던지기, 효과음, 멀티플레이, 온라인 랭킹 금지. 팩 열기와 카탈로그 동작은 데이터 교체 외에는 건드리지 마라.

## 12. 검증과 보고
1. 로컬 미리보기는 `node .tmp-static-server.js`(http://127.0.0.1:8004)다.
2. 데스크톱 1440×900과 모바일 390×844 화면에서 확인한다:
   - 메뉴 4칸이 넘치지 않음
   - 가로 스크롤 없음
   - 콘솔 오류 0
   - 마우스와 터치로 한 판을 끝까지 진행할 수 있음
   - 스윕으로 거리가 실제로 늘어남
   - 카드 그림과 정보가 일치함(카탈로그 모달로 표본 확인)
   - 옛 v5 저장 데이터가 보이던 그림 그대로 이어짐
   - About의 QR이 4번째 페이지에 그대로 있음
3. 단계별로 로컬 커밋한다(데이터 교체 / 페이지 구조 / 게임). 배포(push)는 사용자가 "반영"을 요청할 때 하고, 배포 후 실제 사이트에 반영됐는지 확인한다.
