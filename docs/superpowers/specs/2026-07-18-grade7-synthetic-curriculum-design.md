# Grade 7 Synthetic Mathematics Curriculum Design

## Goal

Expand the canonical knowledge graph and backend synthetic fixtures so the test classroom contains the complete Grade 7 Number and Algebra curriculum, all prerequisite relationships required by those topics, and ten historical assessments with approved results.

## Source Of Truth

The curriculum content is taken from:

- `knowledge-graph/knowledge_base/lop-7/toan/README.md`
- Existing Grade 4-7 nodes and prerequisite IDs in `knowledge-graph/data/graph.json`

The referenced `3. CT_Toan.doc` is not available in the workspace, so the repository curriculum extract is the executable source of truth. The provided topic list matches that extract. Geometry, Statistics, Probability, and Experiential Activities are excluded from this feature.

## Grade 7 Target Topics

The target set contains exactly these eight Number and Algebra topics:

1. `l7-so-huu-ti-khai-niem` - rational numbers, their set, and ordering.
2. `l7-phep-tinh-so-huu-ti` - operations with rational numbers.
3. `l7-can-bac-hai` - arithmetic square roots.
4. `l7-so-thuc` - irrational and real numbers.
5. `l7-ti-le-thuc` - proportions and equal-ratio sequences.
6. `l7-dai-luong-ti-le` - direct and inverse proportion problems.
7. `l7-bieu-thuc-dai-so` - algebraic expressions.
8. `l7-da-thuc-mot-bien` - univariate polynomials.

`l7-dai-luong-ti-le` is currently absent from `graph.json`. It will be added with the curriculum outcomes from the Grade 7 README and direct prerequisites `l7-ti-le-thuc` and `l7-phep-tinh-so-huu-ti`.

## Canonical Graph Changes

`knowledge-graph/data/graph.json` will gain the missing Grade 7 node. Its `mach`, `chuDe`, `chuDeCon`, grade, school level, outcomes, and coordinates will follow the existing schema and neighboring Grade 7 nodes.

`knowledge-graph/data/edges-approved.json` will gain the two approved prerequisite edges for the new node. Each edge includes evidence and rationale based on the curriculum outcomes: solving direct and inverse proportion problems requires both proportion properties and rational-number calculations.

The graph must satisfy these invariants:

- All eight Grade 7 target IDs exist exactly once.
- Every prerequisite ID resolves to an existing node.
- No duplicate edges or self-edges exist.
- The prerequisite graph remains acyclic.
- No Geometry node is introduced or selected by the synthetic curriculum.

## Synthetic Curriculum Closure

The backend seed will stop using the current four generic synthetic mathematics nodes. It will define curriculum nodes by canonical ID/StableKey and seed the transitive prerequisite closure of the eight Grade 7 targets.

The closure is resolved from the curated seed catalog and includes the required Grade 4-6 Number and Algebra foundations. A seed edge is created for every prerequisite relationship whose source and target belong to that closure. This guarantees both internal Grade 7 edges and cross-grade edges without dangling references.

The synthetic graph has one synthetic subject root plus the curriculum closure. Target topics and prerequisite topics retain their canonical Grade level, title, theory/outcome summary, and StableKey. Coordinates may be synthetic-layout coordinates but must be deterministic.

Questions, activity logs, mastery evidence, and exams reference nodes by StableKey lookup rather than slice position. Missing or duplicate required StableKeys abort the seed transaction.

## Historical Assessments

The synthetic teacher owns ten completed historical assessment fixtures for Grade 7:

- Seven single-choice assessments, each with four questions totaling 10 points.
- Three essay assessments, each with two questions totaling 10 points and two rubric items per question.
- Assessment dates span approximately 10 to 70 days before seed time.
- Every assessment contains only Grade 7 target topic IDs.
- The ten assessments collectively cover all eight target topics.

Titles and question content are deterministic and curriculum-specific. They cover rational numbers, rational operations, square roots, real numbers, proportions, proportional quantities, algebraic expressions, and univariate polynomials.

## Student Results

Each of the three synthetic students has an approved submission for every assessment, producing 30 approved submissions.

Outcomes vary by exam while preserving distinct learner profiles:

- Student A generally performs strongly.
- Student B has mixed correct, incorrect, and partial-credit outcomes.
- Student C performs less strongly and includes unanswered or missed criteria.

The outcome generator must support any fixture question count. It cannot index fixed four-question or two-question status matrices. Objective points are awarded only for correct answers. Essay question points are derived from rubric results, and submission totals are derived from question results.

All historical graph IDs remain stable across backend restarts through namespace-derived UUIDs.

## Reset And Transaction Behavior

The existing synthetic reset remains authoritative: data owned by synthetic users and the configured synthetic subject is disposable and restored to the canonical sample state on startup.

Knowledge nodes, edges, exams, submissions, results, approvals, audits, activities, and mastery evidence are created inside the existing `ResetAndSeed` transaction. Any missing curriculum dependency, invalid score, duplicate StableKey, or database error rolls back the entire synthetic scenario.

Real users and subjects outside the synthetic namespace remain untouched.

## Existing API And UI Behavior

No frontend component, route, or API handler changes are required. The current teacher scoring workspace must list all ten assessments and open the three approved student results for each assessment.

The mastery and knowledge-tree APIs receive the expanded synthetic graph through existing database queries. The new data is not hardcoded in API responses or frontend files.

## Testing

Implementation follows test-first development:

- A graph-data test fails until the eighth Grade 7 node and its approved prerequisite edges exist.
- Knowledge-graph validation verifies referential integrity, edge uniqueness, and acyclicity.
- A seed-catalog test verifies exactly eight Grade 7 target topics and excludes Geometry.
- A closure test verifies every seeded prerequisite edge resolves to a seeded node, including cross-grade dependencies.
- Assessment fixture tests verify exactly ten assessments with a 7 objective / 3 essay split and complete coverage of all eight target topics.
- Database integration tests verify ten exams, thirty approved submissions, stable IDs after reseeding, snapshot parseability, and derived rubric/question/submission totals.
- Existing real-data preservation, answer-evidence, mastery, exam, scoring, and backend tests remain green.

## Out Of Scope

- Geometry and Measurement topics.
- Statistics and Probability topics.
- Runtime parsing of `.doc` files.
- New UI pages or filters.
- Changes to authentication, scoring APIs, or mastery formulas.
- Randomly generated curriculum content.
