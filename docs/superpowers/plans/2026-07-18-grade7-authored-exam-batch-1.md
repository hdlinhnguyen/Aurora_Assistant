# Grade 7 Authored Exam Batch 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first 40 manually authored Grade 7 rational-number questions as ten synthetic historical assessments, with every persisted question tagged to `l7-so-huu-ti-khai-niem`.

**Architecture:** Store authored content in a committed JSON fixture and embed it into the Go synthetic-seed package. A focused loader validates the static data, resolves its topic stable key to the seeded node UUID, and converts it to the existing `historicalExamFixture` model; the existing historical exam/scoring pipeline persists exams, topic tags, submissions, results, snapshots, and approvals.

**Tech Stack:** Go 1.26.3, `go:embed`, `encoding/json`, GORM, PostgreSQL test database, Testify.

## Global Constraints

- The assistant authors every question explicitly; no runtime generator and no bulk number-substitution script may create question content.
- `CT_TOAN.doc` is the primary curriculum source; public sources may inform style but no published assessment may be copied verbatim.
- Batch 1 contains exactly 10 assessments and 40 questions for `l7-so-huu-ti-khai-niem`.
- Every assessment has four single-choice questions worth 2.50 points each, ordered `NB`, `TH`, `VD`, `VDC`.
- Every question has four distinct choices, exactly one correct choice, and a non-empty rationale.
- Correct-answer positions are exactly balanced: ten each at A, B, C, and D.
- Each persisted `ExamQuestion.TopicNodeIDsJSON` contains exactly the UUID resolved from `l7-so-huu-ti-khai-niem`.
- The existing ten legacy fixtures remain during this batch, producing 20 total seeded exams and 60 approved submissions.
- Preserve the acknowledged `3. CT_Toan.doc` deletion/rename state; do not stage or revert it.

---

## File Structure

- Create `backend/internal/syntheticseed/authored_exam_fixtures.go`: embedded JSON schema, parsing, validation, and conversion to historical fixtures.
- Create `backend/internal/syntheticseed/authored_exam_fixtures_test.go`: unit tests for schema rejection, counts, cognitive order, answer balance, duplicate detection, and topic resolution.
- Create `backend/internal/syntheticseed/fixtures/grade7_rational_basics_batch1.json`: the 40 manually authored questions listed in the content matrix below.
- Create `backend/internal/syntheticseed/fixtures/README.md`: rules for future manually authored batches.
- Modify `backend/internal/syntheticseed/exam_history.go`: keep legacy fixtures, append validated authored fixtures, and propagate loader errors.
- Modify `backend/internal/syntheticseed/exam_history_test.go`: update callers for the error-returning fixture API and assert legacy/authored separation.
- Modify `backend/internal/syntheticseed/service_test.go`: assert 20 exams, 60 approved submissions, and database topic tags on all 40 authored questions.

### Task 1: Define And Validate The Static Fixture Boundary

**Files:**
- Create: `backend/internal/syntheticseed/authored_exam_fixtures.go`
- Create: `backend/internal/syntheticseed/authored_exam_fixtures_test.go`

**Interfaces:**
- Consumes: `historicalExamFixture`, `historicalQuestionFixture`, `historicalChoiceFixture`, `model.MustScore`, and a `map[string]uuid.UUID` of curriculum nodes.
- Produces: `parseAuthoredExamFixtures(data []byte, nodes map[string]uuid.UUID) ([]historicalExamFixture, error)` and `validateAuthoredExamDocument(document authoredExamDocument) error`.

- [ ] **Step 1: Write failing parser and validation tests**

Add table-driven tests that call `parseAuthoredExamFixtures` with JSON marshaled from a valid test-only document. Cover valid conversion and exact errors for a missing topic, duplicate exam key, duplicate normalized prompt, invalid cognitive order, non-four-choice question, duplicate choice content, invalid correct choice, blank rationale, and unbalanced answer positions.

```go
func TestParseAuthoredExamFixturesResolvesSingleTopic(t *testing.T) {
	topicID := uuid.New()
	payload, err := json.Marshal(validAuthoredExamDocument())
	require.NoError(t, err)

	fixtures, err := parseAuthoredExamFixtures(payload, map[string]uuid.UUID{"l7-so-huu-ti-khai-niem": topicID})
	require.NoError(t, err)
	require.Len(t, fixtures, 10)
	for _, fixture := range fixtures {
		for _, question := range fixture.Questions {
			require.Equal(t, topicID, question.TopicNodeID)
		}
	}
}

func validAuthoredExamDocument() authoredExamDocument {
	levels := []string{"NB", "TH", "VD", "VDC"}
	letters := []string{"a", "b", "c", "d"}
	document := authoredExamDocument{BatchKey: "test-batch", TopicKey: "l7-so-huu-ti-khai-niem"}
	for examIndex := 0; examIndex < 10; examIndex++ {
		exam := authoredExamData{
			Key: fmt.Sprintf("exam-%02d", examIndex+1), Title: fmt.Sprintf("Đề %02d", examIndex+1),
			AgeDays: 80 - examIndex*4, DurationMinutes: 25,
		}
		for questionIndex, level := range levels {
			exam.Questions = append(exam.Questions, authoredQuestionData{
				Key: fmt.Sprintf("exam-%02d-q%d", examIndex+1, questionIndex+1), Level: level,
				Content: fmt.Sprintf("Test prompt %d %d", examIndex, questionIndex),
				Choices: []string{"A1", "B2", "C3", "D4"},
				CorrectChoice: letters[(examIndex+questionIndex)%4], Rationale: "Verified test rationale.",
			})
		}
		document.Exams = append(document.Exams, exam)
	}
	return document
}
```

Use a helper that builds a full ten-exam document for batch-wide balance tests; mutate one field per test so failures identify a single invariant.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `cd backend && go test ./internal/syntheticseed -run 'Test(Parse|Validate)AuthoredExamFixtures' -count=1`

Expected: FAIL because the authored fixture types and parsing functions do not exist.

- [ ] **Step 3: Implement the schema, parser, and validator**

Create these exact data boundaries and keep them private to `syntheticseed`:

```go
type authoredExamDocument struct {
	BatchKey string             `json:"batchKey"`
	TopicKey string             `json:"topicKey"`
	Exams    []authoredExamData `json:"exams"`
}

type authoredExamData struct {
	Key             string                 `json:"key"`
	Title           string                 `json:"title"`
	AgeDays         int                    `json:"ageDays"`
	DurationMinutes int                    `json:"durationMinutes"`
	Questions       []authoredQuestionData `json:"questions"`
}

type authoredQuestionData struct {
	Key           string   `json:"key"`
	Level         string   `json:"level"`
	Content       string   `json:"content"`
	Choices       []string `json:"choices"`
	CorrectChoice string   `json:"correctChoice"`
	Rationale     string   `json:"rationale"`
}
```

Parse with `json.Decoder.DisallowUnknownFields()`, require EOF, trim all human text, and return errors prefixed with the batch/exam/question key. Normalize prompts for duplicate detection with `strings.ToLower(strings.Join(strings.Fields(content), " "))`.

Conversion rules:

```go
choices := make([]historicalChoiceFixture, 4)
for index, content := range source.Choices {
	choices[index] = historicalChoiceFixture{ID: string(rune('a' + index)), Content: content}
}
question := historicalQuestionFixture{
	Key: source.Key, QuestionType: "single_choice", Content: source.Content,
	Points: model.MustScore("2.50"), TopicNodeID: topicID,
	Choices: choices, CorrectChoiceID: source.CorrectChoice,
}
```

Require ten exams, four questions per exam, levels exactly `NB`, `TH`, `VD`, `VDC`, correct choices `a` through `d`, and batch totals of ten correct answers per letter. Require positive, distinct `AgeDays` and `DurationMinutes == 25`.

- [ ] **Step 4: Run parser tests and confirm they pass**

Run: `cd backend && go test ./internal/syntheticseed -run 'Test(Parse|Validate)AuthoredExamFixtures' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit the fixture boundary**

```bash
git add backend/internal/syntheticseed/authored_exam_fixtures.go backend/internal/syntheticseed/authored_exam_fixtures_test.go
git commit -m "feat: validate authored synthetic exam fixtures"
```

### Task 2: Author The First Forty Rational-Number Questions

**Files:**
- Create: `backend/internal/syntheticseed/fixtures/grade7_rational_basics_batch1.json`
- Create: `backend/internal/syntheticseed/fixtures/README.md`
- Modify: `backend/internal/syntheticseed/authored_exam_fixtures_test.go`

**Interfaces:**
- Consumes: the JSON schema and loader from Task 1.
- Produces: `loadAuthoredExamFixtures(nodes map[string]uuid.UUID) ([]historicalExamFixture, error)` and ten exam records keyed `authored-rational-01` through `authored-rational-10`, with questions keyed `<exam-key>-q1` through `<exam-key>-q4`.

- [ ] **Step 1: Add the content audit test before the fixture content**

Assert exact batch counts, exact topic mapping, unique normalized prompts, unique choices, cognitive order, and correct answer contents for all 40 keys. The audit map must use the `Correct` column in the matrix below rather than repeating only choice letters.

```go
func TestAuthoredRationalBatchOneContentAudit(t *testing.T) {
	topicID := uuid.New()
	fixtures, err := loadAuthoredExamFixtures(map[string]uuid.UUID{"l7-so-huu-ti-khai-niem": topicID})
	require.NoError(t, err)
	require.Len(t, fixtures, 10)

	questions := make(map[string]historicalQuestionFixture, 40)
	for _, exam := range fixtures {
		require.Len(t, exam.Questions, 4)
		for _, question := range exam.Questions {
			require.Equal(t, topicID, question.TopicNodeID)
			questions[question.Key] = question
		}
	}
	require.Len(t, questions, 40)
	for key, expectedContent := range expectedAuthoredRationalAnswers() {
		question := questions[key]
		require.Equal(t, expectedContent, choiceContent(question.Choices, question.CorrectChoiceID), key)
	}
}
```

- [ ] **Step 2: Run the content audit and confirm it fails**

Run: `cd backend && go test ./internal/syntheticseed -run TestAuthoredRationalBatchOneContentAudit -count=1`

Expected: FAIL because the embedded fixture file is absent or empty.

- [ ] **Step 3: Write the static JSON using this exact authored content matrix**

Use Vietnamese punctuation and JSON-escaped Unicode normally; do not transform these rows with a script. Each exam uses the listed question order (`NB`, `TH`, `VD`, `VDC`) and the rationale text after the semicolon.

After creating the JSON file, add the embed boundary to `authored_exam_fixtures.go`:

```go
import _ "embed"

//go:embed fixtures/grade7_rational_basics_batch1.json
var grade7RationalBasicsBatch1JSON []byte

func loadAuthoredExamFixtures(nodes map[string]uuid.UUID) ([]historicalExamFixture, error) {
	return parseAuthoredExamFixtures(grade7RationalBasicsBatch1JSON, nodes)
}
```

| Key | Prompt | A | B | C | D | Correct | Rationale |
|---|---|---|---|---|---|---|---|
| authored-rational-01-q1 | Số nào sau đây là số hữu tỉ? | `-7/12` | `√5` | `π` | `√11` | `-7/12` | `-7/12` là thương của hai số nguyên, mẫu khác 0. |
| authored-rational-01-q2 | Số đối của `5/8` là số nào? | `5/8` | `-5/8` | `8/5` | `-8/5` | `-5/8` | Hai số đối nhau có tổng bằng 0. |
| authored-rational-01-q3 | Số lớn nhất trong các số `-3/4; -2/3; -0,6; -0,8` là số nào? | `-3/4` | `-2/3` | `-0,6` | `-0,8` | `-0,6` | Trong các số âm, số gần 0 hơn thì lớn hơn. |
| authored-rational-01-q4 | Số hữu tỉ nào nằm giữa `-1/2` và `0` trên trục số? | `-3/4` | `1/4` | `-2/3` | `-1/4` | `-1/4` | Ta có `-1/2 < -1/4 < 0`. |
| authored-rational-02-q1 | Trong các số sau, số nào có dạng thập phân hữu hạn nên là số hữu tỉ? | `√2` | `0,125` | `π` | `√7` | `0,125` | `0,125 = 1/8`, nên là số hữu tỉ. |
| authored-rational-02-q2 | Điểm biểu diễn số đối của `-1,5` có tọa độ nào? | `-1,5` | `-2/3` | `1,5` | `2/3` | `1,5` | Số đối của `-1,5` là `1,5`. |
| authored-rational-02-q3 | Cách sắp xếp nào đúng theo thứ tự tăng dần? | `-1/4; -2/3; 0; 1/2` | `0; -1/4; -2/3; 1/2` | `-2/3; 0; -1/4; 1/2` | `-2/3; -1/4; 0; 1/2` | `-2/3; -1/4; 0; 1/2` | Các điểm lần lượt nằm từ trái sang phải theo thứ tự đó. |
| authored-rational-02-q4 | Cho `x = -11/15` và `y = -7/10`. Khẳng định nào đúng? | `x < y` | `x = y` | `x > y` | `x = -y` | `x < y` | Quy đồng được `x=-22/30`, `y=-21/30`, nên `x<y`. |
| authored-rational-03-q1 | Số nguyên nào dưới đây đồng thời là số hữu tỉ? | `√2` | `π` | `-9` | `√7` | `-9` | Mọi số nguyên đều viết được dưới dạng phân số có mẫu 1. |
| authored-rational-03-q2 | Phân số nào biểu diễn đúng số thập phân `-0,75`? | `3/4` | `-7/5` | `-75/10` | `-3/4` | `-3/4` | `-0,75=-75/100=-3/4`. |
| authored-rational-03-q3 | Số nào gần `0` nhất? | `2/9` | `-5/6` | `-1/4` | `3/10` | `2/9` | `|2/9|` nhỏ hơn `1/4`, `3/10` và `5/6`. |
| authored-rational-03-q4 | Trên trục số, `A=-7/6`, `B=-1`, `C=-5/6`. Thứ tự các điểm từ trái sang phải là gì? | `C, B, A` | `A, B, C` | `B, A, C` | `A, C, B` | `A, B, C` | `-7/6 < -1 < -5/6`. |
| authored-rational-04-q1 | Số nào sau đây không phải là số hữu tỉ? | `-13/7` | `0` | `2,45` | `√13` | `√13` | `13` không phải số chính phương nên `√13` là số vô tỉ. |
| authored-rational-04-q2 | Nếu `x` là một số hữu tỉ âm thì số đối `-x` có tính chất nào? | `Là số dương` | `Là số âm` | `Bằng 0` | `Bằng x` | `Là số dương` | Số đối của một số âm là một số dương. |
| authored-rational-04-q3 | So sánh `-17/20` và `-4/5`. | `-17/20 > -4/5` | `-17/20 < -4/5` | `-17/20 = -4/5` | Không so sánh được | `-17/20 < -4/5` | `-4/5=-16/20`, nên `-17/20<-16/20`. |
| authored-rational-04-q4 | Số nguyên `k` nào thỏa mãn `-3/2 < k/4 < -1`? | `-6` | `-4` | `-5` | `-3` | `-5` | Nhân với 4 được `-6<k<-4`, nên `k=-5`. |
| authored-rational-05-q1 | Số `2,4` được viết dưới dạng phân số tối giản nào? | `12/5` | `24/5` | `6/5` | `24/100` | `12/5` | `2,4=24/10=12/5`. |
| authored-rational-05-q2 | Số hữu tỉ nào là số đối của chính nó? | `1` | `0` | `-1` | Không có số nào | `0` | Chỉ có `0+0=0`, nên 0 là số đối của chính nó. |
| authored-rational-05-q3 | Dãy nào được sắp xếp theo thứ tự giảm dần? | `5/6; 7/8; 0,82; -1/2` | `0,82; 5/6; 7/8; -1/2` | `7/8; 5/6; 0,82; -1/2` | `7/8; 0,82; 5/6; -1/2` | `7/8; 5/6; 0,82; -1/2` | `0,875>0,833...>0,82>-0,5`. |
| authored-rational-05-q4 | Điểm `M` biểu diễn `-5/6`. Điểm `N` đối xứng với `M` qua gốc `O` biểu diễn số nào? | `-6/5` | `-5/6` | `6/5` | `5/6` | `5/6` | Hai điểm đối xứng qua gốc biểu diễn hai số đối nhau. |
| authored-rational-06-q1 | Phát biểu nào mô tả đúng số hữu tỉ? | Mọi căn bậc hai đều là số hữu tỉ | Số viết được dạng `a/b`, với `a,b` nguyên và `b≠0` | Chỉ số nguyên mới là số hữu tỉ | Mọi số thập phân vô hạn đều vô tỉ | Số viết được dạng `a/b`, với `a,b` nguyên và `b≠0` | Đây là định nghĩa của số hữu tỉ. |
| authored-rational-06-q2 | Hỗn số `-2 1/3` bằng phân số nào? | `-5/3` | `5/3` | `-7/3` | `7/3` | `-7/3` | `-2 1/3=-(2+1/3)=-7/3`. |
| authored-rational-06-q3 | Số `-9/7` nằm trong khoảng nào? | `(0;1)` | `(-1;0)` | `(-3;-2)` | `(-2;-1)` | `(-2;-1)` | `-2=-14/7<-9/7<-7/7=-1`. |
| authored-rational-06-q4 | Cho `a=-13/18`, `b=-17/24`. Khẳng định nào đúng? | `a < b` | `a > b` | `a = b` | `a = -b` | `a < b` | Quy đồng mẫu 72: `a=-52/72`, `b=-51/72`. |
| authored-rational-07-q1 | Số nào sau đây thuộc tập hợp số hữu tỉ? | `√6` | `π` | `0` | `√15` | `0` | `0=0/1` nên là số hữu tỉ. |
| authored-rational-07-q2 | Số đối của `-4/9` là số nào? | `-9/4` | `9/4` | `-4/9` | `4/9` | `4/9` | `-4/9+4/9=0`. |
| authored-rational-07-q3 | Số nào có thể điền vào `-5/8 < ... < -1/2`? | `-9/16` | `-2/3` | `-3/7` | `-7/10` | `-9/16` | `-5/8=-10/16<-9/16<-8/16=-1/2`. |
| authored-rational-07-q4 | Các điểm có tọa độ `A=-1,2`, `B=-21/20`, `C=-9/8`, `D=-1,15`. Điểm nào gần gốc `O` nhất? | `A` | `B` | `C` | `D` | `B` | Giá trị tuyệt đối của `-21/20=-1,05` là nhỏ nhất. |
| authored-rational-08-q1 | Số nào sau đây là số vô tỉ, do đó không thuộc tập hợp số hữu tỉ? | `√49` | `-11/3` | `0,(12)` | `√10` | `√10` | `10` không phải số chính phương nên `√10` là số vô tỉ. |
| authored-rational-08-q2 | So sánh hai số dương `11/15` và `11/17`. | `11/15 > 11/17` | `11/15 < 11/17` | Hai số bằng nhau | Không so sánh được | `11/15 > 11/17` | Hai phân số dương cùng tử, mẫu nhỏ hơn thì phân số lớn hơn. |
| authored-rational-08-q3 | Điểm chính giữa hai điểm biểu diễn `-1` và `0` có tọa độ nào? | `1/2` | `-1/2` | `-1` | `0` | `-1/2` | Trung điểm của `-1` và `0` là `(-1+0)/2=-1/2`. |
| authored-rational-08-q4 | Cho `x=-a/b`, trong đó `a<0` và `b>0`. Khẳng định nào đúng về `x`? | `x<0` | `x=0` | `x>0` | Không xác định được dấu | `x>0` | `-a>0` và `b>0`, nên `x>0`. |
| authored-rational-09-q1 | Số thập phân vô hạn tuần hoàn nào sau đây là số hữu tỉ? | `0,(27)` | `√2` | `π` | `√5` | `0,(27)` | Mọi số thập phân vô hạn tuần hoàn đều biểu diễn được bằng phân số. |
| authored-rational-09-q2 | Phân số `14/(-21)` bằng số nào? | `2/3` | `-2/3` | `-3/2` | `3/2` | `-2/3` | `14/(-21)=-14/21=-2/3`. |
| authored-rational-09-q3 | Thứ tự tăng dần đúng của `-1,05; -11/10; -1; -19/20` là gì? | `-1,05; -11/10; -1; -19/20` | `-19/20; -1; -1,05; -11/10` | `-11/10; -1,05; -1; -19/20` | `-11/10; -1; -1,05; -19/20` | `-11/10; -1,05; -1; -19/20` | Đổi về thập phân: `-1,1<-1,05<-1<-0,95`. |
| authored-rational-09-q4 | Có bao nhiêu số nguyên `k` thỏa mãn `-7/3 < k/3 ≤ 4/3`? | `9` | `10` | `12` | `11` | `11` | Nhân với 3 được `-7<k≤4`; các giá trị từ `-6` đến `4` có 11 số. |
| authored-rational-10-q1 | Số nào dưới đây là số hữu tỉ? | `√3` | `√16` | `π` | `√6` | `√16` | `√16=4`, mà 4 là số hữu tỉ. |
| authored-rational-10-q2 | Khoảng cách từ điểm biểu diễn `-13/10` đến gốc `O` bằng bao nhiêu? | `-13/10` | `10/13` | `13/10` | `3/10` | `13/10` | Khoảng cách đến gốc bằng giá trị tuyệt đối của tọa độ. |
| authored-rational-10-q3 | Trên trục số, `7/4` nằm giữa hai số nguyên liên tiếp nào? | `-2 và -1` | `0 và 1` | `2 và 3` | `1 và 2` | `1 và 2` | `1=4/4<7/4<8/4=2`. |
| authored-rational-10-q4 | Cho `a/b < c/d`, với `b>0`, `d>0`. Khẳng định nào luôn đúng? | `ad < bc` | `ad > bc` | `ac < bd` | `ab < cd` | `ad < bc` | Nhân bất đẳng thức với số dương `bd` giữ nguyên chiều, được `ad<bc`. |

Set ages to distinct values `80, 76, 72, 68, 64, 60, 56, 52, 48, 44`. Titles follow `Toán 7 - Số hữu tỉ - Đề 01` through `Đề 10`. Each JSON question includes the matrix rationale verbatim.

- [ ] **Step 4: Document future batch authoring rules**

In `fixtures/README.md`, record the schema, topic-stable-key requirement, manual authorship rule, answer-balance rule, unique-key convention, curriculum-source requirement, and the commands used to audit a batch. State explicitly that scripts may validate but may not generate or mutate prompts, numbers, choices, or answers.

- [ ] **Step 5: Run content tests and confirm they pass**

Run: `cd backend && go test ./internal/syntheticseed -run 'TestAuthoredRationalBatchOne|Test(Parse|Validate)AuthoredExamFixtures' -count=1`

Expected: PASS with 10 exams, 40 questions, and ten correct answers at each letter.

- [ ] **Step 6: Commit the authored content**

```bash
git add backend/internal/syntheticseed/fixtures/grade7_rational_basics_batch1.json backend/internal/syntheticseed/fixtures/README.md backend/internal/syntheticseed/authored_exam_fixtures_test.go
git commit -m "data: add forty authored grade 7 rational questions"
```

### Task 3: Append Authored Fixtures To The Existing Historical Seed

**Files:**
- Modify: `backend/internal/syntheticseed/exam_history.go:59`
- Modify: `backend/internal/syntheticseed/exam_history_test.go`
- Modify: `backend/internal/syntheticseed/service_test.go:35`

**Interfaces:**
- Consumes: `loadAuthoredExamFixtures(nodes map[string]uuid.UUID) ([]historicalExamFixture, error)` from Task 1.
- Produces: `historicalExamFixtures(config Config, nodes map[string]uuid.UUID) ([]historicalExamFixture, error)` returning ten legacy plus ten authored fixtures.

- [ ] **Step 1: Update fixture and integration tests to expect the appended batch**

Change fixture callers to handle errors. Keep the legacy assertions scoped to fixtures whose keys do not start with `authored-rational-`, then assert the authored split by key prefix:

```go
fixtures, err := historicalExamFixtures(DefaultConfig(), nodes)
require.NoError(t, err)
require.Len(t, fixtures, 20)

legacy, authored := 0, 0
for _, fixture := range fixtures {
	if strings.HasPrefix(fixture.Key, "authored-rational-") {
		authored++
		require.Len(t, fixture.Questions, 4)
		for _, question := range fixture.Questions {
			require.Equal(t, nodes["l7-so-huu-ti-khai-niem"], question.TopicNodeID)
		}
	} else {
		legacy++
	}
}
require.Equal(t, 10, legacy)
require.Equal(t, 10, authored)
```

Keep the existing legacy objective/essay assertions against the ten non-authored fixtures. Add a separate assertion that every authored fixture is single-choice and has four questions.

In `service_test.go`, expect `result.ExamCount == 20`, `result.ApprovedSubmissionCount == 60`, 20 teacher exams, and 20 submissions per student. Query authored exams by stable UUIDs or title prefix, load their 40 questions, unmarshal each `TopicNodeIDsJSON`, and require the single UUID to equal the database node whose stable key is `l7-so-huu-ti-khai-niem`.

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `cd backend && go test ./internal/syntheticseed -run 'TestHistoricalExamFixtures|TestResetAndSeedCreatesApprovedHistoricalResultsForEveryStudent' -count=1`

Expected: FAIL because `historicalExamFixtures` still returns only the legacy ten fixtures and has no error return.

- [ ] **Step 3: Refactor legacy fixtures and append the authored batch**

Rename the existing body to `legacyHistoricalExamFixtures`. Add the error-returning composition function:

```go
func historicalExamFixtures(config Config, nodes map[string]uuid.UUID) ([]historicalExamFixture, error) {
	legacy := legacyHistoricalExamFixtures(config, nodes)
	authored, err := loadAuthoredExamFixtures(nodes)
	if err != nil {
		return nil, fmt.Errorf("load authored historical exams: %w", err)
	}
	return append(legacy, authored...), nil
}
```

Update `createHistoricalExamData`:

```go
fixtures, err := historicalExamFixtures(config, targetNodes)
if err != nil {
	return nil, 0, err
}
```

Do not alter the persistence loop: its existing `json.Marshal([]uuid.UUID{questionFixture.TopicNodeID})` is the authoritative topic-tag write path.

- [ ] **Step 4: Run focused tests and confirm they pass**

Run: `cd backend && go test ./internal/syntheticseed -run 'TestHistoricalExamFixtures|TestHistoricalOutcomes|TestResetAndSeedCreatesApprovedHistoricalResultsForEveryStudent' -count=1`

Expected: PASS with 20 exams, 60 approvals, and all 40 authored question topic arrays equal to the rational-number topic UUID.

- [ ] **Step 5: Commit seed integration**

```bash
git add backend/internal/syntheticseed/exam_history.go backend/internal/syntheticseed/exam_history_test.go backend/internal/syntheticseed/service_test.go
git commit -m "feat: seed authored grade 7 rational exams"
```

### Task 4: Verify Reseeding, Formatting, And Full Backend Safety

**Files:**
- Modify if required by failures: only files already listed in Tasks 1-3.

**Interfaces:**
- Consumes: the complete Batch 1 fixture and seed integration.
- Produces: evidence that the authored fixtures are deterministic, tagged, parseable, and compatible with the backend.

- [ ] **Step 1: Add a reseed stability assertion for authored question IDs and content**

Extend the existing reseed test to capture the 40 authored rows as `(ID, ExamID, Content, ChoicesJSON, CorrectChoiceID, TopicNodeIDsJSON)`, call `ResetAndSeed` again, reload them ordered by ID, and require exact equality. Identify authored exam IDs with `stableSyntheticUUID("exam", fmt.Sprintf("authored-rational-%02d", index))` for indices 1 through 10.

- [ ] **Step 2: Run the reseed test**

Run: `cd backend && go test ./internal/syntheticseed -run 'TestResetAndSeed.*Stable|TestResetAndSeedCreatesApprovedHistoricalResultsForEveryStudent' -count=1`

Expected: PASS and identical authored question/topic data after reseeding.

- [ ] **Step 3: Format Go files**

Run:

```bash
cd backend
gofmt -w internal/syntheticseed/authored_exam_fixtures.go internal/syntheticseed/authored_exam_fixtures_test.go internal/syntheticseed/exam_history.go internal/syntheticseed/exam_history_test.go internal/syntheticseed/service_test.go
```

Expected: command exits 0.

- [ ] **Step 4: Run the complete synthetic seed suite**

Run: `cd backend && go test ./internal/syntheticseed -count=1`

Expected: PASS.

- [ ] **Step 5: Run backend regression tests**

Run: `cd backend && go test ./... -count=1`

Expected: PASS.

- [ ] **Step 6: Validate repository diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only Batch 1 implementation files plus the acknowledged document rename/deletion state appear.

- [ ] **Step 7: Commit verification-only adjustments if any were required**

```bash
git add backend/internal/syntheticseed
git commit -m "test: verify authored rational exam reseeding"
```

Skip this commit if Step 2-6 required no file changes.
