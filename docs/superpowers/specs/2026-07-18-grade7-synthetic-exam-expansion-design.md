# Grade 7 Synthetic Exam Expansion Design

## Goal

Expand the deterministic backend synthetic seed to contain exactly 160 realistic Grade 7 Mathematics multiple-choice assessments: 20 assessments for each of the eight existing Grade 7 Number and Algebra target topics. Each assessment contains four questions and totals 10 points. Delivery is phased so each content batch can be reviewed before the next topic is added.

The expanded seed replaces the current ten-assessment fixture set. It does not append 160 assessments to the existing ten.

## Curriculum Source Of Truth

The primary curriculum source is `CT_TOAN.doc`, the Vietnamese General Education Mathematics Curriculum issued with Circular 32/2018/TT-BGDDT. Its Grade 7 content and required outcomes define what may be assessed and the expected cognitive scope.

The repository knowledge graph remains the executable identity source for topic IDs, prerequisite relationships, and topic metadata. The authored fixture inventory targets exactly these eight existing Grade 7 topics:

1. `l7-so-huu-ti-khai-niem`
2. `l7-phep-tinh-so-huu-ti`
3. `l7-can-bac-hai`
4. `l7-so-thuc`
5. `l7-ti-le-thuc`
6. `l7-dai-luong-ti-le`
7. `l7-bieu-thuc-dai-so`
8. `l7-da-thuc-mot-bien`

Public Vietnamese education sources may be consulted to understand authentic wording, familiar contexts, and common distractor patterns. The implementation must not copy a published test verbatim. Every committed question is rewritten as an original item aligned with the official curriculum, with independently selected values, expressions, names, units, or contexts and a verified answer.

## Assessment Inventory

For each target topic, the seed creates assessments numbered 01 through 20. This produces:

- 160 completed assessments.
- 640 multiple-choice exam questions.
- 480 approved submissions for the three existing synthetic students.
- 1,920 question results, plus the existing exam snapshots, scoring audits, grading progress, and approval records required by the current model.

Every assessment is single-topic. Its title identifies Grade 7, the curriculum topic, and its sequence number. Dates are distributed deterministically across the historical window so sorting and trend views remain useful rather than placing every assessment at the same timestamp.

Each assessment has four questions worth 2.5 points each. The positions use a stable cognitive progression:

1. Recognition (`NB`).
2. Understanding (`TH`).
3. Application (`VD`).
4. Advanced application (`VDC`).

## Authored Static Question Fixtures

The assistant authors each question as an explicit static fixture. There is no runtime question generation and no bulk number-substitution script used to create the content. Code is limited to schema validation, mathematical verification, duplicate detection, and seed import.

Each authored question records:

- The curriculum outcome and cognitive level it assesses.
- A Vietnamese prompt.
- Four explicit choices and one correct choice.
- An explanation and misconception notes where the existing fixture schema supports them.
- Optional context and units.

The first delivery batch contains 40 authored questions for `l7-so-huu-ti-khai-niem` (10 assessments x 4 questions). Later batches add the remaining ten assessments for that topic, then proceed topic by topic until all 160 assessments are present. Every batch is deterministic because its content is committed, not because it is regenerated.

During phased delivery, completed authored batches coexist with the current legacy ten-assessment fixture set so existing topic coverage does not disappear while the new inventory is incomplete. Tests distinguish legacy fixtures from authored fixtures by stable key. The legacy set is removed only in the final cutover after all eight topics have 20 authored assessments, leaving exactly 160 assessments.

Validation must keep questions appropriate for Grade 7. Examples include non-zero denominators, exact or curriculum-appropriate roots, bounded arithmetic, sensible real-world quantities, valid polynomial degrees, and unambiguous ratio data. Distractors must be distinct from each other and from the correct answer.

## Realism And Quality Rules

Question wording uses natural Vietnamese and familiar school or daily-life contexts where the curriculum calls for application. Pure calculation remains acceptable when it directly assesses a required symbolic skill.

Within one topic:

- No two authored prompts may normalize to the same text.
- Consecutive assessments must not repeat the same combination of assessed skills and question structures in the same order.
- Answer positions are exactly balanced within each 40-question delivery batch: ten correct answers at each of A, B, C, and D.
- Numerical variants must remain materially different, not whitespace or formatting changes.
- Every prompt has exactly one mathematically correct choice.

The validator recalculates or independently checks each authored answer before import. Rational values should be normalized, square-root questions should respect their intended exact form, and equivalent algebraic expressions must be compared structurally or canonically so an accidental second correct answer is rejected.

## Seed Integration

The new inventory stays in `backend/internal/syntheticseed`. Existing API handlers, database models, and frontend components remain unchanged.

`historicalExamFixtures` will load the committed topic-specific fixture collections instead of a short inline list. Fixture parsing and validation complete in memory before any exam rows are inserted. Any invalid question, duplicate stable key, duplicate normalized prompt, unresolved topic, or score mismatch aborts the `ResetAndSeed` transaction.

Every authored fixture stores the related topic stable key. During seed materialization, that key must resolve to exactly one curriculum node UUID, and each persisted `ExamQuestion.TopicNodeIDsJSON` must contain a one-element array with that UUID. Database integration tests query the stored JSON and prove that all 40 questions in the first batch are tagged with `l7-so-huu-ti-khai-niem`.

All exam, question, submission, result, snapshot, approval, audit, and idempotency identifiers remain namespace-derived UUIDs. Reseeding deletes only synthetic-owned records and recreates exactly the same graph from the committed fixture revision.

To keep startup practical at this volume, database creation should use bounded batch inserts where model relationships permit it. The transaction remains atomic; batching is an insertion strategy, not partial-commit behavior.

## Synthetic Student Outcomes

All three synthetic students receive an approved submission for every assessment. Outcomes continue to express three distinct learner profiles:

- Student A: generally strong, with occasional mistakes on advanced application questions.
- Student B: mixed performance, strongest on recognition and understanding.
- Student C: developing performance, with more incorrect or unanswered application questions.

The outcome function is deterministic and depends on student profile, topic, assessment number, and cognitive level. Objective points are awarded only when the selected option equals the authored correct choice. Submission totals are derived from question results rather than inserted independently.

## Validation And Tests

Test-first implementation will add fixture-level and database integration coverage for these invariants:

- The first batch contains exactly 10 authored assessments and 40 authored questions for `l7-so-huu-ti-khai-niem`.
- Exactly eight target topics and exactly 20 assessments per topic.
- Exactly 160 assessments and 640 single-choice questions.
- Four questions and 10 total points per assessment.
- One `NB`, one `TH`, one `VD`, and one `VDC` question per assessment.
- Every question references only its assessment's target topic.
- Four distinct non-empty choices and exactly one correct choice per question.
- No duplicate normalized prompt within a topic.
- Exactly ten correct answers at each answer position in every 40-question delivery batch.
- Exactly 480 approved submissions and 1,920 derived question results.
- Stable IDs and identical content after reseeding from the same committed fixtures.
- Synthetic reset preserves unrelated real users, topics, exams, and scoring data.
- Snapshot JSON remains parseable and agrees with persisted questions and scores.
- Synthetic seed and relevant backend tests complete within a documented local time budget.

The 160-assessment and 640-question assertions apply at final cutover. Intermediate batch tests assert the exact cumulative authored count while allowing the clearly identified legacy fixtures to remain.

A content audit test will enumerate authored questions by topic, cognitive level, and required outcome. This makes coverage gaps visible while preserving manual review of every newly added batch.

## Out Of Scope

- Geometry, Measurement, Statistics, Probability, and experiential Grade 7 topics.
- Essay questions or rubrics in this 160-assessment inventory.
- Runtime web scraping or runtime AI generation during backend startup.
- Copying complete third-party assessments into the repository.
- Frontend pagination, filtering, or layout changes.
- Changes to mastery formulas, authentication, exam APIs, or scoring rules.
