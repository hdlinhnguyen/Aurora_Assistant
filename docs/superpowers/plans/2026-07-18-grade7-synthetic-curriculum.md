# Grade 7 Synthetic Mathematics Curriculum Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the complete Grade 7 Number and Algebra topic graph, seed its prerequisite closure, and create ten historical Grade 7 assessments with thirty approved synthetic results.

**Architecture:** Extend the canonical knowledge-graph JSON first, then introduce a focused backend curriculum catalog that uses the same canonical IDs as node StableKeys and resolves a transitive prerequisite closure. Refactor historical exam fixtures to look up Grade 7 topics by StableKey and generate results for any question count without changing existing UI or API handlers.

**Tech Stack:** TypeScript/Node.js validation scripts, JSON curriculum data, Go, GORM, PostgreSQL, testify, existing exam/scoring models.

## Global Constraints

- Include exactly the eight Grade 7 Number and Algebra target topics from the approved design.
- Include both internal Grade 7 prerequisite edges and cross-grade prerequisite closure from Grades 4-6.
- Exclude Geometry, Statistics, Probability, and Experiential Activities from the synthetic curriculum.
- Add ten Grade 7 historical exams: seven single-choice and three essay.
- Create one approved result per exam for each of the three synthetic students, totaling thirty submissions.
- Every exam question must reference one of the eight Grade 7 target topics by StableKey lookup.
- Derive essay scores from rubric rows and submission totals from question rows.
- Preserve stable namespace-derived IDs across reseeding.
- Keep all synthetic database writes inside the existing reset-and-seed transaction.
- Do not modify frontend, API handlers, mastery formulas, admin metrics, telemetry, or unrelated worktree files.

## File Structure

- Modify `knowledge-graph/data/graph.json`: add the missing Grade 7 proportional-quantities node.
- Modify `knowledge-graph/data/edges-approved.json`: add its two approved prerequisite edges.
- Modify `knowledge-graph/scripts/check-graph.ts`: enforce the eight-topic Grade 7 target set and edge invariants.
- Create `backend/internal/syntheticseed/curriculum.go`: canonical seed catalog, target keys, closure validation, deterministic node layout, and edge construction.
- Create `backend/internal/syntheticseed/curriculum_test.go`: pure catalog/closure tests.
- Modify `backend/internal/syntheticseed/service.go`: replace four generic nodes with curriculum closure and use StableKey lookup for questions, activities, and exams.
- Modify `backend/internal/syntheticseed/service_test.go`: assert persisted closure, non-dangling edges, Grade 7 targets, and idempotent reseeding.
- Modify `backend/internal/syntheticseed/exam_history.go`: define ten curriculum-specific fixtures and generic deterministic outcome generation.
- Modify `backend/internal/syntheticseed/exam_history_test.go`: assert the 7/3 split, topic coverage, and variable-count scoring.

---

### Task 1: Complete and validate the canonical Grade 7 graph

**Files:**
- Modify: `knowledge-graph/data/graph.json`
- Modify: `knowledge-graph/data/edges-approved.json`
- Modify: `knowledge-graph/scripts/check-graph.ts`

**Interfaces:**
- Consumes: `KnowledgeGraphSchema`, existing `tienQuyet` IDs, and Grade 7 curriculum outcomes from `knowledge_base/lop-7/toan/README.md`.
- Produces: canonical node `l7-dai-luong-ti-le` and approved edges from `l7-ti-le-thuc` and `l7-phep-tinh-so-huu-ti`.

- [ ] **Step 1: Add failing Grade 7 assertions to the graph checker**

Add after the unique-ID check:

```ts
const grade7NumberAlgebraIds = [
  "l7-so-huu-ti-khai-niem",
  "l7-phep-tinh-so-huu-ti",
  "l7-can-bac-hai",
  "l7-so-thuc",
  "l7-ti-le-thuc",
  "l7-dai-luong-ti-le",
  "l7-bieu-thuc-dai-so",
  "l7-da-thuc-mot-bien",
];
const grade7NumberAlgebra = nodes.filter(
  (node) => node.lop === 7 && node.mach === "Số và Đại số",
);
check(
  "grade 7: complete Number and Algebra target set",
  grade7NumberAlgebraIds.every((id) => byId.has(id)) &&
    grade7NumberAlgebra.length === grade7NumberAlgebraIds.length,
  grade7NumberAlgebra.map((node) => node.id).join(", "),
);
const proportional = byId.get("l7-dai-luong-ti-le");
check(
  "grade 7: proportional quantities has approved prerequisites",
  proportional?.tienQuyet.includes("l7-ti-le-thuc") === true &&
    proportional?.tienQuyet.includes("l7-phep-tinh-so-huu-ti") === true,
);
```

- [ ] **Step 2: Run the checker and verify RED**

Run: `cd knowledge-graph && npx tsx scripts/check-graph.ts`

Expected: FAIL for the complete Grade 7 target set and proportional-quantity prerequisite checks.

- [ ] **Step 3: Add the missing canonical node**

Insert this node after `l7-ti-le-thuc` in `graph.json`:

```json
{
  "id": "l7-dai-luong-ti-le",
  "ten": "Giải toán về đại lượng tỉ lệ",
  "lop": 7,
  "cap": "THCS",
  "mach": "Số và Đại số",
  "chuDe": "Số thực",
  "chuDeCon": "Giải toán về đại lượng tỉ lệ",
  "yccd": [
    "Giải được một số bài toán đơn giản về đại lượng tỉ lệ thuận.",
    "Giải được một số bài toán đơn giản về đại lượng tỉ lệ nghịch."
  ],
  "tienQuyet": [
    "l7-ti-le-thuc",
    "l7-phep-tinh-so-huu-ti"
  ],
  "mo": false,
  "x": 460,
  "y": 690
}
```

- [ ] **Step 4: Add the two approved edge records**

Append entries with these exact endpoints:

```json
{
  "tienQuyet": "l7-ti-le-thuc",
  "node": "l7-dai-luong-ti-le",
  "canCu": "Tính chất của tỉ lệ thức và dãy tỉ số bằng nhau được vận dụng trực tiếp khi giải các bài toán đại lượng tỉ lệ.",
  "lyDo": "Học sinh cần thiết lập và biến đổi tỉ lệ thức trước khi giải bài toán tỉ lệ thuận hoặc tỉ lệ nghịch."
},
{
  "tienQuyet": "l7-phep-tinh-so-huu-ti",
  "node": "l7-dai-luong-ti-le",
  "canCu": "Các bài toán đại lượng tỉ lệ yêu cầu thực hiện phép nhân, chia và biến đổi trên các số hữu tỉ.",
  "lyDo": "Kĩ năng tính toán với số hữu tỉ là điều kiện để tính hệ số tỉ lệ và đại lượng chưa biết."
}
```

- [ ] **Step 5: Run canonical graph validation and verify GREEN**

Run: `cd knowledge-graph && npx tsx scripts/check-graph.ts`

Expected: all checks PASS, including schema, edge references, grade direction, and DAG validation.

- [ ] **Step 6: Commit canonical graph data**

```bash
git add knowledge-graph/data/graph.json knowledge-graph/data/edges-approved.json knowledge-graph/scripts/check-graph.ts
git commit -m "feat: complete grade 7 number algebra graph"
```

---

### Task 2: Define the synthetic curriculum catalog and prerequisite closure

**Files:**
- Create: `backend/internal/syntheticseed/curriculum.go`
- Create: `backend/internal/syntheticseed/curriculum_test.go`

**Interfaces:**
- Produces: `grade7TargetKeys() []string`, `syntheticCurriculumCatalog() []curriculumTopic`, and `resolveCurriculumClosure(catalog []curriculumTopic, targets []string) (curriculumClosure, error)`.
- Consumed by Task 3 through `curriculumClosure.Topics`, `curriculumClosure.Edges`, and `curriculumClosure.ByStableKey`.

- [ ] **Step 1: Write failing catalog and closure tests**

```go
func TestGrade7TargetsContainCompleteNumberAndAlgebraSet(t *testing.T) {
	require.ElementsMatch(t, []string{
		"l7-so-huu-ti-khai-niem", "l7-phep-tinh-so-huu-ti",
		"l7-can-bac-hai", "l7-so-thuc", "l7-ti-le-thuc",
		"l7-dai-luong-ti-le", "l7-bieu-thuc-dai-so", "l7-da-thuc-mot-bien",
	}, grade7TargetKeys())
}

func TestCurriculumClosureIncludesCrossGradePrerequisitesWithoutDanglingEdges(t *testing.T) {
	closure, err := resolveCurriculumClosure(syntheticCurriculumCatalog(), grade7TargetKeys())
	require.NoError(t, err)
	require.Len(t, closure.Targets, 8)
	require.Greater(t, len(closure.Topics), len(closure.Targets))
	for _, edge := range closure.Edges {
		require.Contains(t, closure.ByStableKey, edge.SourceKey)
		require.Contains(t, closure.ByStableKey, edge.TargetKey)
		require.NotEqual(t, edge.SourceKey, edge.TargetKey)
	}
	for _, topic := range closure.Topics {
		require.NotContains(t, strings.ToLower(topic.Strand), "hình học")
	}
}
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cd backend && go test ./internal/syntheticseed -run 'TestGrade7Targets|TestCurriculumClosure' -count=1`

Expected: FAIL because the catalog types and functions do not exist.

- [ ] **Step 3: Implement focused curriculum types**

```go
type curriculumTopic struct {
	StableKey    string
	Name         string
	Theory       string
	GradeLevel   int
	Strand       string
	Prerequisites []string
}

type curriculumEdge struct {
	SourceKey string
	TargetKey string
}

type curriculumClosure struct {
	Topics      []curriculumTopic
	Targets     []curriculumTopic
	Edges       []curriculumEdge
	ByStableKey map[string]curriculumTopic
}
```

The catalog must include the eight Grade 7 targets plus this exact prerequisite closure from canonical `graph.json`:

```text
l4-bieu-thuc-chu
l4-khai-niem-phan-so
l4-nhan-chia-so-tu-nhien
l4-phep-tinh-phan-so
l4-so-sanh-phan-so
l4-tinh-chat-phan-so
l5-phep-tinh-so-thap-phan
l5-quy-dong-phan-so
l5-so-thap-phan
l5-ti-so-phan-tram
l6-khai-niem-so-nguyen
l6-luy-thua
l6-phan-so-tinh-chat
l6-phep-tinh-phan-so
l6-phep-tinh-so-nguyen
l6-uoc-boi
l7-so-huu-ti-khai-niem
l7-phep-tinh-so-huu-ti
l7-can-bac-hai
l7-so-thuc
l7-ti-le-thuc
l7-dai-luong-ti-le
l7-bieu-thuc-dai-so
l7-da-thuc-mot-bien
```

Use each canonical ID as `StableKey`; do not include Geometry, Statistics, or Probability entries.

- [ ] **Step 4: Implement closure validation**

`resolveCurriculumClosure` must:

1. Reject duplicate or blank StableKeys.
2. Reject a missing target or prerequisite.
3. Traverse prerequisites recursively from all eight targets.
4. Detect a cycle using a visiting/visited depth-first traversal.
5. Return topics in deterministic grade/key order.
6. Return one deduplicated edge per prerequisite relationship, with `SourceKey` as prerequisite and `TargetKey` as dependent topic.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `cd backend && go test ./internal/syntheticseed -run 'TestGrade7Targets|TestCurriculumClosure' -count=1`

Expected: PASS.

- [ ] **Step 6: Commit the curriculum catalog**

```bash
git add backend/internal/syntheticseed/curriculum.go backend/internal/syntheticseed/curriculum_test.go
git commit -m "feat: define grade 7 synthetic curriculum closure"
```

---

### Task 3: Persist curriculum nodes and prerequisite edges

**Files:**
- Modify: `backend/internal/syntheticseed/curriculum.go`
- Modify: `backend/internal/syntheticseed/service.go`
- Modify: `backend/internal/syntheticseed/service_test.go`

**Interfaces:**
- Consumes: `resolveCurriculumClosure` from Task 2.
- Produces: `createSyntheticCurriculum(tx *gorm.DB, config Config, teacher model.User) (seededCurriculum, error)` where `seededCurriculum` exposes `Root`, `Topics`, `Targets`, and `ByStableKey map[string]model.Node`.

- [ ] **Step 1: Write the failing database integration assertions**

After `ResetAndSeed`, assert:

```go
var grade7Targets []model.Node
require.NoError(t, service.db.Where(
	"subject = ? AND stable_key IN ?", result.Subject, grade7TargetKeys(),
).Find(&grade7Targets).Error)
require.Len(t, grade7Targets, 8)

var nodes []model.Node
require.NoError(t, service.db.Where("subject = ?", result.Subject).Find(&nodes).Error)
nodeIDs := make(map[uuid.UUID]struct{}, len(nodes))
for _, node := range nodes {
	nodeIDs[node.ID] = struct{}{}
	require.NotContains(t, strings.ToLower(node.Name), "hình")
}
var edges []model.Edge
require.NoError(t, service.db.Where("subject = ?", result.Subject).Find(&edges).Error)
for _, edge := range edges {
	require.Contains(t, nodeIDs, edge.SourceID)
	require.Contains(t, nodeIDs, edge.TargetID)
	require.NotEqual(t, edge.SourceID, edge.TargetID)
}
```

- [ ] **Step 2: Run the database test and verify RED**

Run: `cd backend; $env:DB_PORT='5436'; go test ./internal/syntheticseed -run TestResetAndSeed -count=1`

Expected: FAIL because the current seed creates only four generic non-root topics.

- [ ] **Step 3: Implement deterministic curriculum persistence**

`createSyntheticCurriculum` must:

- Create one root node with StableKey `synthetic-grade7-number-algebra-root`.
- Resolve the curriculum closure before any insert.
- Create one node per closure topic with stable UUID `stableSyntheticUUID("curriculum", topic.StableKey)`, canonical name, canonical grade in `Theory`, and deterministic coordinates grouped by grade.
- Create one edge per closure edge using stable UUID `stableSyntheticUUID("curriculum-edge", sourceKey, targetKey)`.
- Connect the synthetic root to closure topics that have no prerequisite within the closure.
- Create teacher `Topic` rows with `GradeLevel` equal to the canonical numeric grade string.
- Return target-node lookups keyed by canonical StableKey.

- [ ] **Step 4: Refactor synthetic questions and activity evidence to StableKeys**

Replace `nodes[1:]`, `nodes[1:4]`, and positional topic indexing with deterministic selections from `seededCurriculum.Targets`. Create three bank questions per Grade 7 target node, set `GradeLevel: "7"`, and generate answer evidence across at least three distinct Grade 7 target topics per student.

Pass `seededCurriculum.ByStableKey` into historical exam creation instead of a UUID slice.

- [ ] **Step 5: Run package tests and verify GREEN**

Run: `cd backend; $env:DB_PORT='5436'; go test ./internal/syntheticseed -count=1`

Expected: PASS with persisted target, edge-integrity, real-data preservation, and idempotency assertions.

- [ ] **Step 6: Commit curriculum persistence**

```bash
git add backend/internal/syntheticseed/curriculum.go backend/internal/syntheticseed/service.go backend/internal/syntheticseed/service_test.go
git commit -m "feat: seed grade 7 prerequisite graph"
```

---

### Task 4: Expand historical assessments to ten curriculum-specific fixtures

**Files:**
- Modify: `backend/internal/syntheticseed/exam_history.go`
- Modify: `backend/internal/syntheticseed/exam_history_test.go`
- Modify: `backend/internal/syntheticseed/service_test.go`

**Interfaces:**
- Changes `historicalExamFixtures(config Config, nodeByStableKey map[string]uuid.UUID) []historicalExamFixture`.
- Keeps `createHistoricalExamData` as the persistence boundary and consumes the target-node StableKey map from Task 3.

- [ ] **Step 1: Write failing fixture-count, format, and topic-coverage tests**

```go
func TestHistoricalExamFixturesContainTenGrade7Assessments(t *testing.T) {
	nodes := make(map[string]uuid.UUID)
	for _, key := range grade7TargetKeys() {
		nodes[key] = uuid.New()
	}
	fixtures := historicalExamFixtures(DefaultConfig(), nodes)
	require.Len(t, fixtures, 10)
	objectiveExams, essayExams := 0, 0
	objectiveQuestions, essayQuestions := 0, 0
	covered := map[uuid.UUID]struct{}{}
	for _, fixture := range fixtures {
		require.Equal(t, "7", fixture.GradeLevel)
		if fixture.Questions[0].QuestionType == "single_choice" {
			objectiveExams++
		} else {
			essayExams++
		}
		for _, question := range fixture.Questions {
			covered[question.TopicNodeID] = struct{}{}
			if question.QuestionType == "single_choice" {
				objectiveQuestions++
			} else {
				essayQuestions++
			}
		}
	}
	require.Equal(t, 7, objectiveExams)
	require.Equal(t, 3, essayExams)
	require.Equal(t, 28, objectiveQuestions)
	require.Equal(t, 6, essayQuestions)
	require.Len(t, covered, 8)
}
```

- [ ] **Step 2: Run fixture tests and verify RED**

Run: `cd backend && go test ./internal/syntheticseed -run TestHistoricalExamFixturesContainTenGrade7Assessments -count=1`

Expected: FAIL because only two fixtures exist and the function accepts a UUID slice.

- [ ] **Step 3: Define ten deterministic Grade 7 fixtures**

Add `GradeLevel string` to `historicalExamFixture` and define:

- Seven four-question objective exams, aged 10, 18, 26, 34, 42, 50, and 58 days.
- Three two-question essay exams, aged 22, 46, and 70 days.
- Every exam totals 10 points.
- Questions use only the eight canonical Grade 7 StableKeys.
- The combined catalog covers every target at least once.

Use curriculum-specific Vietnamese titles and content for rational numbers, rational operations, square roots, real numbers, proportions, proportional quantities, algebraic expressions, and univariate polynomials.

- [ ] **Step 4: Replace fixed outcome matrices with count-independent generation**

Implement deterministic rotation over each fixture's questions/rubrics:

- Student A receives approximately 75-100% of available criteria.
- Student B receives approximately 50%.
- Student C receives approximately 25%, with at least one unanswered objective result when the fixture contains objective questions.
- The number of correct criteria is computed from the actual question/rubric count, so no index assumes four questions or two essay questions.

Keep `validateHistoricalOutcome` as the score-integrity gate.

- [ ] **Step 5: Update database expectations and verify GREEN**

Change integration assertions to:

```go
require.Equal(t, 10, result.ExamCount)
require.Equal(t, 30, result.ApprovedSubmissionCount)
```

Also assert every persisted exam has `GradeLevel == "7"`, every question topic JSON resolves to a seeded Grade 7 target node, essay rubric totals equal their question totals, and each submission total equals its question-result sum.

Run: `cd backend; $env:DB_PORT='5436'; go test ./internal/syntheticseed -count=1`

Expected: PASS.

- [ ] **Step 6: Commit expanded assessments**

```bash
git add backend/internal/syntheticseed/exam_history.go backend/internal/syntheticseed/exam_history_test.go backend/internal/syntheticseed/service_test.go
git commit -m "feat: seed ten grade 7 historical assessments"
```

---

### Task 5: Final verification and runtime smoke test

**Files:**
- Verify only; no production file changes expected.

**Interfaces:**
- Verifies canonical graph data, backend seed persistence, and existing API compatibility.

- [ ] **Step 1: Run graph validation**

Run: `cd knowledge-graph && npx tsx scripts/check-graph.ts`

Expected: all checks PASS.

- [ ] **Step 2: Run focused backend tests**

Run: `cd backend; $env:DB_PORT='5436'; go test ./internal/syntheticseed -count=1`

Expected: PASS.

- [ ] **Step 3: Run the full backend suite**

Run: `cd backend; $env:DB_PORT='5436'; go test ./... -count=1`

Expected: PASS. If unrelated concurrent files fail compilation, record the exact external file/error and confirm the same suite passes in the isolated feature worktree.

- [ ] **Step 4: Check formatting and scope**

Run:

```bash
cd backend
gofmt -w internal/syntheticseed/curriculum.go internal/syntheticseed/curriculum_test.go internal/syntheticseed/service.go internal/syntheticseed/service_test.go internal/syntheticseed/exam_history.go internal/syntheticseed/exam_history_test.go
cd ..
git diff --check
git status --short
```

Expected: no whitespace errors and no modified files outside the knowledge-graph and syntheticseed scope.

- [ ] **Step 5: Runtime API smoke test**

Restart the Go backend with synthetic data enabled and authenticate as `synthetic.teacher@aurora.local`. Verify:

```text
GET /api/teacher/exams?status=preparing_exam -> 10 Grade 7 exams
GET /api/teacher/grading-batches -> 30 completed batches
GET /api/teacher/scoring-submissions/:id -> derived question/rubric results
GET /api/teacher/scoring-submissions/:id/history -> one approval snapshot
teacher mastery/tree endpoints -> 8 Grade 7 targets plus prerequisite closure, no Geometry
```

- [ ] **Step 6: Commit any verification-only test adjustments**

If Task 5 required test-only corrections within the approved files, commit them with:

```bash
git add knowledge-graph/scripts/check-graph.ts backend/internal/syntheticseed
git commit -m "test: verify grade 7 synthetic curriculum"
```
