"""Deterministic classroom suggestions for the teacher learning-path tab."""

from __future__ import annotations

from datetime import datetime

import networkx as nx

from learning_path.adapters import CurriculumGraph
from learning_path.diagnosis import diagnose
from learning_path.planner import plan_path
from learning_path.ranking import rank_root_causes
from learning_path.schemas import (
    LearningPathRequest,
    LearningPathSuggestionRequest,
    LearningPathSuggestionResponse,
    PersonalizedLearningPath,
    StudentTopicKnowledgeState,
    SuggestedStudent,
    SuggestedTopic,
)


def _topic_candidates(
    request: LearningPathSuggestionRequest,
    states_by_student: dict[str, dict[str, StudentTopicKnowledgeState]],
    curriculum: CurriculumGraph,
) -> list[SuggestedTopic]:
    graph = curriculum.to_networkx()
    total_topics = max(1, len(curriculum.topics))
    candidates: list[SuggestedTopic] = []
    for topic_id in sorted(curriculum.topics):
        confident = {
            sid: states[topic_id]
            for sid, states in states_by_student.items()
            if topic_id in states
            and states[topic_id].confidence_score >= request.minimum_confidence_threshold
        }
        gap_states = {
            sid: state
            for sid, state in confident.items()
            if state.mastery_status == "confirmed_gap"
        }
        if not gap_states:
            continue
        gap_rate = len(gap_states) / len(confident)
        deficit = sum(1 - state.mastery_probability for state in gap_states.values()) / len(
            gap_states
        )
        confidence = sum(state.confidence_score for state in gap_states.values()) / len(gap_states)
        downstream = (1 + len(nx.descendants(graph, topic_id))) / (1 + total_topics)
        candidates.append(
            SuggestedTopic(
                topic_id=topic_id,
                suggestion_score=gap_rate * deficit * confidence * downstream,
                confirmed_gap_rate=gap_rate,
                gap_student_ids=sorted(gap_states),
            )
        )

    candidates.sort(key=lambda item: (-item.suggestion_score, item.topic_id))
    selected: list[SuggestedTopic] = []
    for candidate in candidates:
        replace_indexes: list[int] = []
        redundant = False
        for index, existing in enumerate(selected):
            overlap = set(candidate.gap_student_ids) & set(existing.gap_student_ids)
            union = set(candidate.gap_student_ids) | set(existing.gap_student_ids)
            if not union or len(overlap) / len(union) < 0.8:
                continue
            if existing.topic_id in nx.ancestors(graph, candidate.topic_id):
                replace_indexes.append(index)
            elif candidate.topic_id in nx.ancestors(graph, existing.topic_id):
                redundant = True
                break
        if redundant:
            continue
        for index in reversed(replace_indexes):
            selected.pop(index)
        selected.append(candidate)
        if len(selected) == request.max_topics:
            break
    return selected


def suggest_from_states(
    request: LearningPathSuggestionRequest,
    states_by_student: dict[str, dict[str, StudentTopicKnowledgeState]],
    curriculum: CurriculumGraph,
    generated_at: datetime,
) -> LearningPathSuggestionResponse:
    graph = curriculum.to_networkx()
    if not nx.is_directed_acyclic_graph(graph):
        raise ValueError("graph_validation_error")

    topics = _topic_candidates(request, states_by_student, curriculum)
    target_ids = [item.topic_id for item in topics]
    insufficient: list[str] = []
    ranked: list[tuple[SuggestedStudent, PersonalizedLearningPath]] = []
    for student_id in sorted(request.student_ids):
        states = states_by_student.get(student_id, {})
        learning_request = LearningPathRequest(
            class_id=request.class_id,
            student_ids=[student_id],
            target_topic_ids=target_ids,
            teacher_id=request.teacher_id,
            target_mastery_threshold=request.target_mastery_threshold,
            minimum_confidence_threshold=request.minimum_confidence_threshold,
        )
        diagnosis = diagnose(curriculum, states, target_ids)
        ranking = rank_root_causes(diagnosis, curriculum)
        if diagnosis.error is not None:
            raise ValueError(diagnosis.error.code)
        if not ranking.candidates:
            if not states or ranking.needs_diagnosis:
                insufficient.append(student_id)
            continue
        path = plan_path(
            learning_request,
            diagnosis,
            ranking,
            curriculum,
            states,
            student_id=student_id,
            generated_at=generated_at,
        )
        root = ranking.candidates[0]
        ranked.append(
            (
                SuggestedStudent(
                    student_id=student_id,
                    help_priority=root.gap_score,
                    root_cause_topic_id=root.topic_id,
                    reason=root.reason,
                    blocked_target_count=len(path.blocked_target_topics),
                ),
                path,
            )
        )

    ranked.sort(
        key=lambda item: (
            -item[0].help_priority,
            -item[0].blocked_target_count,
            item[0].student_id,
        )
    )
    selected = ranked[: request.max_students]
    return LearningPathSuggestionResponse(
        class_id=request.class_id,
        suggested_topics=topics,
        suggested_students=[item[0] for item in selected],
        insufficient_evidence_students=sorted(set(insufficient)),
        preview_paths={item[0].student_id: item[1] for item in selected},
    )
