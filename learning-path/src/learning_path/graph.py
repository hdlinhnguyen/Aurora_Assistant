"""Lắp pipeline LangGraph — addendum mục 2, luồng end-to-end spec mục 14.

    ingest_evidence → update_mastery_bkt
        → [Send fan-out theo học sinh] process_student (diagnose → rank → plan)
        → [fan-in] compute_class_insight
        → await_teacher_approval   ← interrupt(): dừng giữ state chờ giáo viên duyệt
        → apply_overrides_and_finalize → END

Mọi node là hàm thuần tất định (đã test riêng); không node nào gọi LLM.
Tái lập kế hoạch = invoke lại cùng thread_id với evidence mới, không loop trong run.
"""

from __future__ import annotations

import operator
from datetime import datetime
from typing import Annotated, TypedDict

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send, interrupt
from pydantic import BaseModel

from learning_path.adapters import CurriculumGraph
from learning_path.bkt import BKTParams, ConfidenceConfig, knowledge_state
from learning_path.class_insight import compute_class_insight
from learning_path.diagnosis import Diagnosis, diagnose
from learning_path.evidence import EvidenceStore, calibrate_paper, calibrate_quiz
from learning_path.planner import plan_path
from learning_path.ranking import RootCauseRanking, rank_root_causes
from learning_path.schemas import (
    CalibratedMasteryEvidence,
    ClassLearningInsight,
    LearningPathRequest,
    PersonalizedLearningPath,
    RawPaperEvidence,
    RawQuizEvidence,
    StudentTopicKnowledgeState,
)


class StudentResult(BaseModel):
    """Kết quả nhánh fan-out của một học sinh; path=None khi thiếu evidence kết luận
    (đề xuất chẩn đoán thêm nằm trong ranking.needs_diagnosis — mục 4.4)."""

    student_id: str
    diagnosis: Diagnosis
    ranking: RootCauseRanking
    path: PersonalizedLearningPath | None = None


class PipelineState(TypedDict, total=False):
    request: LearningPathRequest
    raw_quiz: list[RawQuizEvidence]
    raw_paper: list[RawPaperEvidence]
    as_of: datetime
    calibrated: list[CalibratedMasteryEvidence]
    states_by_student: dict[str, dict[str, StudentTopicKnowledgeState]]
    student_results: Annotated[list[StudentResult], operator.add]
    class_insight: ClassLearningInsight | None
    paths: dict[str, PersonalizedLearningPath]
    teacher_decision: dict
    path_version: int  # tăng mỗi lần re-plan trên cùng thread (spec mục 11, 15)


def build_pipeline(
    curriculum: CurriculumGraph,
    *,
    bkt_params: BKTParams | None = None,
    confidence_config: ConfidenceConfig | None = None,
    checkpointer: BaseCheckpointSaver | None = None,
):
    params = bkt_params or BKTParams()
    conf = confidence_config or ConfidenceConfig()

    def ingest_evidence(state: PipelineState) -> dict:
        as_of = state["as_of"]
        calibrated = [calibrate_quiz(e, as_of=as_of) for e in state.get("raw_quiz", [])]
        calibrated += [calibrate_paper(e, as_of=as_of) for e in state.get("raw_paper", [])]
        return {"calibrated": calibrated}

    def update_mastery_bkt(state: PipelineState) -> dict:
        store = EvidenceStore()
        store.ingest(state["calibrated"])  # dedup theo evidence_id — idempotent
        states_by_student: dict[str, dict[str, StudentTopicKnowledgeState]] = {}
        for sid in state["request"].student_ids:
            states_by_student[sid] = {
                tid: knowledge_state(sid, tid, evs, params=params, config=conf)
                for tid, evs in store.active_by_topic(sid).items()
            }
        return {"states_by_student": states_by_student}

    def fan_out(state: PipelineState) -> list[Send]:
        return [
            Send(
                "process_student",
                {
                    "student_id": sid,
                    "request": state["request"],
                    "states": state["states_by_student"].get(sid, {}),
                    "as_of": state["as_of"],
                    "path_version": state.get("path_version", 1),
                },
            )
            for sid in state["request"].student_ids
        ]

    def process_student(payload: dict) -> dict:
        sid: str = payload["student_id"]
        request: LearningPathRequest = payload["request"]
        states: dict[str, StudentTopicKnowledgeState] = payload["states"]
        targets = request.targets_for(sid)
        student_request = request.model_copy(update={"target_topic_ids": targets})
        d = diagnose(curriculum, states, targets)
        r = rank_root_causes(d, curriculum)
        path = None
        if d.error is None and r.candidates:
            path = plan_path(
                student_request,
                d,
                r,
                curriculum,
                states,
                student_id=sid,
                generated_at=payload["as_of"],
                version=payload.get("path_version", 1),
            )
        return {"student_results": [StudentResult(student_id=sid, diagnosis=d, ranking=r, path=path)]}

    def class_insight_node(state: PipelineState) -> dict:
        results = state["student_results"]
        insight = compute_class_insight(
            state["request"],
            {r.student_id: r.diagnosis for r in results},
            {r.student_id: r.ranking for r in results},
            state["states_by_student"],
            curriculum,
        )
        paths = {r.student_id: r.path for r in results if r.path is not None}
        return {"class_insight": insight, "paths": paths}

    def await_teacher_approval(state: PipelineState) -> dict:
        insight = state.get("class_insight")
        decision = interrupt(
            {
                "class_id": state["request"].class_id,
                "num_draft_paths": len(state.get("paths", {})),
                "suggested_reteach_topics": insight.suggested_reteach_topics if insight else [],
                "insufficient_evidence_students": (
                    insight.insufficient_evidence_students if insight else []
                ),
            }
        )
        return {"teacher_decision": decision}

    def apply_overrides_and_finalize(state: PipelineState) -> dict:
        decision = state.get("teacher_decision") or {}
        paths = state.get("paths", {})
        if decision.get("approve"):
            paths = {
                sid: p.model_copy(update={"status": "Approved"}) for sid, p in paths.items()
            }
        return {"paths": paths}

    g = StateGraph(PipelineState)
    g.add_node("ingest_evidence", ingest_evidence)
    g.add_node("update_mastery_bkt", update_mastery_bkt)
    g.add_node("process_student", process_student)
    g.add_node("compute_class_insight", class_insight_node)
    g.add_node("await_teacher_approval", await_teacher_approval)
    g.add_node("apply_overrides_and_finalize", apply_overrides_and_finalize)

    g.add_edge(START, "ingest_evidence")
    g.add_edge("ingest_evidence", "update_mastery_bkt")
    g.add_conditional_edges("update_mastery_bkt", fan_out, ["process_student"])
    g.add_edge("process_student", "compute_class_insight")  # fan-in barrier
    g.add_edge("compute_class_insight", "await_teacher_approval")
    g.add_edge("await_teacher_approval", "apply_overrides_and_finalize")
    g.add_edge("apply_overrides_and_finalize", END)

    return g.compile(checkpointer=checkpointer or InMemorySaver())
