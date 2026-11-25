# 탭 일정 임시 저장 검증

| 동작 | 보장 |
| --- | --- |
| 저장 | 입력이 유효하고 브라우저가 쓰기를 허용했을 때만 이전 일정을 교체한다. |
| 복원 | 읽기가 가능하고 레코드가 현재 버전이며 내용이 유효할 때만 일정을 반환한다. |
| 초기화 | 삭제 성공 시 저장소가 비고, 삭제가 거절되면 이전 값이 유지된다. |

`lean/Model/Draft.lean`은 `session-plan.js`의 한 탭, 한 키를 대상으로 한다. 일정의 상세 내용을 구별하는 데는 자연수 식별자를 사용한다. JSON 파싱·날짜 유효성 판정은 자바스크립트 테스트로 검사한다. 성공한 저장소 조작은 원자적으로 적용되고, 실패한 조작은 저장된 값을 그대로 둔다는 가정이 있다.

Lean 4.34.1로 세 속성을 모든 모델 입력에 대해 증명했다. 49개 선언의 공리 감사와 커널 재검사를 통과했다. 속성에는 별도 전제 조건이 없다. 속성의 독립 리뷰는 수행하지 않았다.

모델 복사본에서 무효 입력이 이전 일정을 삭제하도록 바꾸기, 거부된 쓰기를 성공으로 처리하기, 이전 버전 복원하기, 초기화 무시하기를 각각 시도했다. 기존 증명은 네 변이를 모두 감지했다.

빈 값, 손상 값, 이전 버전 값, 현재 버전 값과 접근 허용·거부 조합에서 복원, 초기화, 유효·무효 저장을 검사했다. 모델의 40개 결과가 실제 JS 함수와 일치했다. JS 테스트는 윤년, 정수 범위, 잘못된 JSON, 약속 이름 제외, 다른 키 보존과 탭 새로고침도 다룬다.

## 재실행

프로젝트 루트에서 아래 명령을 실행한다. `FV`는 설치된 formal-verify 스킬 경로다. 현재 Windows 환경에서는 [프로젝트 검증 기록](README.md)의 Git Bash 및 어댑터 설정을 적용한다.

```bash
project="$PWD/verification/lean"
log_path="${TMPDIR:-/tmp}/nagal-draft.log"
bash "$FV/scripts/setup.sh" lean "$project"
bash "$FV/scripts/lean-check.sh" "$project" Model/Draft.lean > "$log_path"
python3 "$FV/scripts/mutate.py" "$project/Model/Draft.mutations"
NAGAL_DRAFT_VECTORS="$log_path" node --test tests/session-plan.test.cjs
```

## 저장한 일정

브라우저의 IndexedDB에 약속 날짜·시각과 준비·이동·여유 시간을 저장한다. 새 일정은 고유 ID를 받으며, 기존 일정의 편집과 삭제는 같은 읽기·쓰기 트랜잭션에서 목록을 열었을 때의 버전과 현재 버전을 비교한다. 다른 탭에서 먼저 변경한 기록은 오래된 버전으로 덮어쓰지 않는다. **초기화**는 현재 입력과 탭 초안을 비운다.

TLC의 `tla/SavedPlans.matrix`는 두 탭의 동시 생성, 버전 충돌, 실패한 트랜잭션의 보존 및 탭 초안의 독립성을 검사한다. `node verification/test-saved-plans-browser.cjs`는 Chrome을 다시 시작한 뒤 목록이 유지되고, 편집·삭제·충돌 처리·오프라인 조회가 실제 화면에서 동작하는지 검사한다.
