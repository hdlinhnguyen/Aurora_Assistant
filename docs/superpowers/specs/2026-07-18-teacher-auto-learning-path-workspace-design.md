# Teacher Auto Learning Path Workspace

## Goal

Redesign the teacher **Lap lo trinh ca nhan** tab into an automatic-first workspace. The current subject selected in Teacher Hub is the only subject in scope; the tab does not ask the teacher to choose a subject again.

When the tab opens, the system identifies student-topic pairs with reliable evidence of a serious knowledge gap, generates draft learning paths automatically, and presents them for teacher review. The teacher can approve all drafts, approve one student at a time, edit or skip a draft, and create additional paths manually by selecting students and topics from the current subject.

## Confirmed Product Rules

- Automatic candidates require `mastery < 0.40` and `confidence > 0.60`.
- Students or topics with insufficient confidence are shown as **Can them du lieu** and do not receive an automatic draft.
- The teacher can approve all eligible drafts or approve an individual student's draft.
- Manual creation remains available and is not restricted by the automatic weakness threshold.
- Manual creation requires at least one student and at least one topic from the current subject.
- The existing approved-path progress thresholds remain unchanged: a learning-path step completes at mastery `>= 0.80` and confidence `>= 0.60`.

## Scope

### Included

- Use the current Teacher Hub subject automatically.
- Analyze mastery/confidence for students in the teacher's classroom and the current subject.
- Generate idempotent automatic draft paths on entry to the tab.
- Show why each student was selected, including weak topics, mastery, confidence, and root cause where available.
- Separate reliable recommendations from insufficient-evidence cases.
- Approve all drafts or an individual student's draft without discarding remaining drafts.
- Edit step order and remove steps before approval.
- Skip an unwanted automatic draft.
- Create additional manual drafts by selecting students and topics.
- Preserve the existing learning-path progress initialization after approval.
- Add focused backend, learning-path service, frontend, and browser tests.

### Not Included

- Automatically sending assignments without teacher approval.
- Automatically creating paths for mastery exactly `0.40` or confidence exactly `0.60`.
- Choosing a different subject inside the learning-path tab.
- Cross-classroom recommendations.
- Scheduling deadlines, notifications, XP, streaks, or teacher alerts.
- A general-purpose learning-path template builder.

## Recommended Experience

Use one automatic-first workspace rather than a wizard or two isolated sub-tabs. Recommendations are the primary content. Manual creation is a secondary panel opened from a persistent **Tu tao lo trinh** action.

The page follows the existing Teacher Hub visual language. It should not introduce a new global theme or typography system. Its distinctive element is a compact **intervention queue**: each student draft reads like a teacher decision card, with evidence on the left, the proposed learning sequence in the center, and approval controls on the right.

## Page Structure

### Header

The header contains:

- `Lo trinh ca nhan hoa`.
- A subject chip such as `Synthetic - Toan dai so`, sourced from `selectedSubject`.
- Last analysis time.
- **Phan tich lai** and **Tu tao lo trinh** actions.

There is no subject selector in this tab. If no current subject exists, use the Teacher Hub's existing subject-selection empty state rather than rendering the workspace.

### Summary Strip

Show four operational counts:

- students with reliable severe gaps;
- automatic drafts awaiting review;
- students needing more evidence;
- drafts already approved during the current workspace session.

These counts explain workload and are not decorative analytics.

### Automatic Draft Queue

Each reliable candidate has one card containing:

- student name and email;
- the weakest topic and any prerequisite root cause;
- mastery and confidence percentages;
- a concise recommendation reason;
- ordered draft steps with target mastery;
- source badge `He thong de xuat`;
- actions: **Duyet**, **Chinh sua**, and **Bo qua**.

Cards are ordered by severity: lower mastery first, then higher confidence, then student name. The bulk action **Duyet tat ca** applies only to visible, non-skipped automatic drafts.

Approving one card removes it from the pending queue and marks it approved without affecting other drafts in the same generation batch.

### Insufficient Evidence

This section contains students/topics that fail the confidence rule. It shows the current confidence and a plain explanation that the system will not create a path until more evidence exists. Where the existing exam/diagnostic workflow supports it, provide a navigation action to create or assign diagnostic evidence. This section never labels the student as weak.

### Manual Creation Panel

The **Tu tao lo trinh** action opens a right-side panel on desktop and a full-screen sheet on mobile.

The panel contains:

1. searchable multi-select of students in the teacher's classroom;
2. searchable topic list restricted to non-root nodes in the current subject;
3. selected student and topic summaries;
4. **Tao ban nhap** action.

The selected topic set applies to every selected student in that manual creation action. Teachers who need different topic sets create separate batches. Manual drafts receive the source badge `Giao vien tao` and enter the same review queue, so editing and approval remain consistent.

## Data Source and Candidate Selection

The Go backend is the authorization and orchestration boundary. Candidate selection reads the persisted student topic mastery profile rather than inferring weakness directly from raw activity logs.

For the authenticated teacher:

1. Resolve the owned classroom using the existing classroom ownership rule.
2. Resolve students belonging to that classroom.
3. Resolve topic IDs belonging to the requested current subject.
4. Read each student's latest mastery state for only those topic IDs.
5. Classify a student-topic pair as reliable severe weakness only when mastery is strictly below `0.40` and confidence is strictly above `0.60`.
6. Classify low-mastery pairs with confidence at or below `0.60` as insufficient evidence.
7. Do not include topics from other subjects, root/container nodes, deleted nodes, or students outside the classroom.

If one student has multiple reliable weak topics, send the student's topic-specific targets to the planner. Do not create a cross-product that assigns every class-wide weak topic to every selected student.

## Draft Generation Contract

### Automatic Analysis

Add an authenticated endpoint:

`POST /api/teacher/learning-path/auto-drafts`

Request:

```json
{
  "subject": "Synthetic - Toan dai so"
}
```

The backend derives teacher, classroom, students, eligible topics, thresholds, and evidence. The client cannot override the automatic threshold.

Response:

```json
{
  "analysisId": "uuid-or-stable-id",
  "subject": "Synthetic - Toan dai so",
  "analyzedAt": "2026-07-18T00:00:00Z",
  "summary": {
    "reliableStudentCount": 2,
    "draftCount": 2,
    "insufficientEvidenceCount": 1
  },
  "drafts": {
    "student-uuid": {
      "source": "automatic",
      "weakTopics": [],
      "ordered_steps": []
    }
  },
  "insufficientEvidence": []
}
```

Automatic generation is idempotent for the same teacher, classroom, subject, and mastery evidence snapshot. Reopening the tab or React development double effects must reuse the current draft batch rather than duplicate database rows or planner threads. **Phan tich lai** explicitly requests a new snapshot and supersedes only unapproved automatic drafts from the previous analysis.

### Manual Drafts

Extend the current create request to require the subject and support explicit per-student targets internally:

```json
{
  "subject": "Synthetic - Toan dai so",
  "studentIds": ["student-uuid"],
  "targetTopicIds": ["topic-uuid"]
}
```

The backend verifies every selected student belongs to the resolved classroom and every target topic belongs to the current subject. Manual creation does not use the automatic mastery/confidence eligibility rule.

The planner payload should support `target_topic_ids_by_student`. The legacy shared `target_topic_ids` field remains accepted for compatibility, but automatic generation uses the per-student mapping so unrelated weak topics are not assigned across students.

## Draft Persistence

Continue using one `LearningPath` draft row per student, but add or persist enough metadata to distinguish:

- `automatic` versus `manual` source;
- subject;
- analysis/generation batch;
- pending, skipped, approved, rejected, or superseded review state.

If adding columns to `LearningPath` would make compatibility unclear, use a focused draft metadata model keyed by learning path ID. The implementation plan should choose the smallest migration consistent with current model conventions.

Approved paths continue to initialize `LearningPathStepProgress` exactly as in the existing progress MVP.

## Partial and Bulk Approval

Extend approval to accept an optional student subset:

```json
{
  "approve": true,
  "studentIds": ["student-uuid"],
  "note": "Approved by teacher",
  "custom_paths": {
    "student-uuid": {}
  }
}
```

- Missing `studentIds` means approve every remaining draft in the batch.
- A non-empty subset approves only matching draft rows owned by the authenticated teacher.
- Remaining drafts stay editable and pending.
- The backend activates approved paths and initializes step progress immediately; it must not wait for the whole batch.
- The planning service thread is finalized only when no reviewable drafts remain, or its approval contract is extended to support partial approval explicitly.
- Retried approval is idempotent and cannot create duplicate approved paths or progress rows.
- Bulk approval is transactional for the selected subset: either every selected draft activates or none does.

Skipping a draft changes only its review state. It does not approve, delete, or alter another student's draft.

## Frontend State and Data Flow

`TeacherDashboard` remains the owner of `selectedSubject`. Extract the learning-path workspace data fetching and mutations from the already large page into focused API helpers and, if useful, a hook.

On entry to the learning-path tab:

1. Require `selectedSubject`.
2. Call the automatic draft endpoint with that subject.
3. Render cached/current drafts immediately if returned.
4. Allow individual or bulk review actions.
5. Keep manual panel state independent from automatic recommendations.
6. Reset the workspace when `selectedSubject` changes; never display drafts from the previous subject.

The frontend must not derive candidate weakness independently. It renders backend classification and uses backend IDs for approval.

## Editing Rules

- Teachers may reorder or remove proposed steps before approval.
- A path must retain at least one valid topic step to be approved.
- Editing does not change the measured mastery/confidence evidence shown on the card.
- Topic additions during edit are restricted to the current subject.
- Prerequisite validation runs before approval. Invalid order or missing prerequisites returns an actionable conflict and leaves the draft editable.

## Error and Empty States

Distinguish these cases:

- **No severe reliable gaps:** explain that no student currently meets mastery `< 40%` and confidence `> 60%`; keep manual creation available.
- **Insufficient evidence only:** show the evidence queue and recommend diagnostic activity.
- **Planner unavailable:** preserve the analysis results when possible, show that drafts could not be generated, and offer retry.
- **Subject changed during request:** discard the stale response using request cancellation or a subject identity check.
- **Membership/topic validation failure:** show the specific student or topic validation message without clearing other drafts.
- **Partial approval failure:** leave every selected draft pending and allow retry.

Raw backend/Python error payloads are not shown as the primary teacher message. A collapsible technical detail may remain for diagnostics.

## Telemetry

Add or reuse events for:

- automatic analysis started/completed/failed;
- automatic draft generated;
- manual draft generated;
- individual draft approved;
- bulk drafts approved;
- draft edited;
- draft skipped;
- insufficient-evidence recommendation viewed.

Properties include subject identifier/name, analysis ID, counts, source, and stable reason codes. Do not include student names, emails, free-form teacher notes, or question content.

## Testing Strategy

### Backend and Mastery Tests

- Candidate selection uses only the current subject.
- Mastery `0.399` with confidence `0.601` qualifies.
- Mastery exactly `0.40` does not qualify.
- Confidence exactly `0.60` does not qualify.
- Low mastery with insufficient confidence enters the evidence queue.
- Topics and students outside the teacher's classroom/subject are rejected.
- Multiple weak topics remain mapped to the correct student rather than becoming a cross-product.
- Automatic draft generation is idempotent for the same evidence snapshot.
- Explicit re-analysis supersedes only unapproved automatic drafts.
- Manual creation bypasses automatic eligibility but enforces ownership and subject membership.
- Individual approval leaves sibling drafts pending.
- Bulk approval activates all selected drafts transactionally.
- Approval retries do not duplicate approved paths or progress rows.

### Planner Tests

- Per-student target topic maps are validated and used.
- Legacy shared target topics remain compatible.
- Generated steps remain prerequisite ordered.
- An empty eligible candidate set returns a successful empty result.

### Frontend Tests

- Current subject is displayed and no subject selector is rendered.
- Entering the tab triggers automatic analysis once for a subject.
- Subject changes reset and reload the workspace.
- Reliable and insufficient-evidence groups render separately.
- Draft cards show mastery, confidence, reason, source, and ordered steps.
- Individual approval updates only one card.
- Bulk approval selects only pending, non-skipped drafts.
- Manual panel requires students and topics and submits the current subject.
- Empty and retry states remain actionable.
- Desktop and mobile layouts preserve all primary actions and keyboard focus.

### End-to-End Verification

Using synthetic teacher/student data:

1. Select a subject in Teacher Hub and open the learning-path tab.
2. Confirm automatic drafts appear without choosing the subject or students again.
3. Confirm only mastery `< 40%` and confidence `> 60%` candidates receive drafts.
4. Approve one student and verify another draft remains pending.
5. Approve the remaining drafts in bulk.
6. Confirm approved paths appear in the matching student accounts with step progress initialized.
7. Create a manual draft for selected students/topics and approve it.
8. Change subject and confirm no old-subject draft remains visible.
9. Verify browser console, failed responses, database rows, and telemetry.

## Acceptance Criteria

1. The learning-path tab always uses the current Teacher Hub subject and contains no duplicate subject selector.
2. Opening the tab automatically creates or reuses draft paths for reliable severe gaps.
3. Automatic eligibility is strictly mastery `< 0.40` and confidence `> 0.60`.
4. Insufficient-confidence cases are shown separately and receive no automatic path.
5. Automatic targets are student-specific and subject-specific.
6. Teachers can approve one draft, approve all remaining drafts, edit, or skip.
7. Individual approval does not finalize or remove sibling drafts.
8. Teachers can create additional manual drafts by selecting students and current-subject topics.
9. Approved paths initialize the existing step-progress workflow.
10. Relevant backend, planner, frontend, build, and end-to-end checks pass.
