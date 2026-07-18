from typing import Annotated
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import FileResponse

from .auth import teacher_id
from .schemas import (
    AddBankQuestion,
    DocxExportCreate,
    ExamCreate,
    ExamPatch,
    ManualQuestionCreate,
    ReorderQuestions,
    ReorderRubricItems,
    RubricItemCreate,
    RubricItemPatch,
    QuestionPatch,
    FirstSubmissionEvent,
    GradingCompletedEvent,
    VersionRequest,
)
from .services import ExamService


router = APIRouter(prefix="/api")
internal_router = APIRouter(prefix="/internal")


def service(request: Request) -> ExamService:
    return request.app.state.exam_service


@router.post("/exams", status_code=201)
def create_exam(
    payload: ExamCreate,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    return exams.create(actor, payload)


@router.get("/exams")
def list_exams(
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
    status: str | None = None,
    search: str | None = None,
):
    return exams.list(actor, status, search)


@router.get("/exams/{exam_id}")
def get_exam(
    exam_id: str,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    return exams.get(actor, exam_id)


@router.get("/exams/{exam_id}/audit")
def get_audit(
    exam_id: str,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    return exams.audit(actor, exam_id)


@router.patch("/exams/{exam_id}")
def patch_exam(
    exam_id: str,
    payload: ExamPatch,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    return exams.patch(actor, exam_id, payload)


@router.delete("/exams/{exam_id}", status_code=204)
def delete_exam(
    exam_id: str,
    expected_version: int,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    exams.delete_exam(actor, exam_id, expected_version)


@router.get("/question-bank/questions")
def question_bank(
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
    subject_id: str | None = None,
    grade_level: int | None = None,
    question_type: str | None = None,
    topic_id: str | None = None,
    search: str | None = None,
):
    return exams.list_bank(subject_id, grade_level, question_type, topic_id, search)


@router.get("/question-bank/questions/{question_id}")
def question_bank_detail(
    question_id: str,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    return exams.get_bank_question(question_id)


@router.get("/topics")
def topics(
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
    subject_id: str | None = None,
    grade_level: int | None = None,
):
    return exams.list_topics(subject_id, grade_level)


@router.post("/exams/{exam_id}/questions/from-bank", status_code=201)
def add_bank_question(
    exam_id: str,
    payload: AddBankQuestion,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    return exams.add_bank_question(actor, exam_id, payload)


@router.post("/exams/{exam_id}/questions/manual", status_code=201)
def add_manual_question(
    exam_id: str,
    payload: ManualQuestionCreate,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    return exams.add_manual_question(actor, exam_id, payload)


@router.put("/exams/{exam_id}/questions/reorder")
def reorder_questions(
    exam_id: str,
    payload: ReorderQuestions,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    return exams.reorder_questions(actor, exam_id, payload)


@router.post(
    "/exams/{exam_id}/questions/{question_id}/rubric-items",
    status_code=201,
)
def add_rubric(
    exam_id: str,
    question_id: str,
    payload: RubricItemCreate,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    return exams.add_rubric(actor, exam_id, question_id, payload)


@router.put("/exams/{exam_id}/questions/{question_id}/rubric-items/reorder")
def reorder_rubrics(
    exam_id: str,
    question_id: str,
    payload: ReorderRubricItems,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    return exams.reorder_rubrics(actor, exam_id, question_id, payload)


@router.delete(
    "/exams/{exam_id}/questions/{question_id}/rubric-items/{rubric_id}",
    status_code=204,
)
def delete_rubric(
    exam_id: str,
    question_id: str,
    rubric_id: str,
    expected_version: int,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    exams.delete_rubric(actor, exam_id, question_id, rubric_id, expected_version)


@router.patch("/exams/{exam_id}/questions/{question_id}/rubric-items/{rubric_id}")
def patch_rubric(
    exam_id: str,
    question_id: str,
    rubric_id: str,
    payload: RubricItemPatch,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    return exams.patch_rubric(actor, exam_id, question_id, rubric_id, payload)


@router.patch("/exams/{exam_id}/questions/{question_id}")
def patch_question(
    exam_id: str,
    question_id: str,
    payload: QuestionPatch,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    return exams.patch_question(actor, exam_id, question_id, payload)


@router.delete("/exams/{exam_id}/questions/{question_id}", status_code=204)
def delete_question(
    exam_id: str,
    question_id: str,
    expected_version: int,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    exams.delete_question(actor, exam_id, question_id, expected_version)


@router.post("/exams/{exam_id}/validate")
def validate_exam(
    exam_id: str,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    return exams.validate(actor, exam_id)


@router.post("/exams/{exam_id}/prepare")
def prepare_exam(
    exam_id: str,
    payload: VersionRequest,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    return exams.transition(actor, exam_id, payload, "preparing_exam")


@router.post("/exams/{exam_id}/return-to-draft")
def return_to_draft(
    exam_id: str,
    payload: VersionRequest,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    return exams.transition(actor, exam_id, payload, "drafting")


def internal_key(
    request: Request,
    x_internal_token: Annotated[str | None, Header()] = None,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> str:
    expected = request.app.state.settings.internal_token
    if not x_internal_token or not secrets.compare_digest(x_internal_token, expected):
        raise HTTPException(401, "Invalid internal token")
    if not idempotency_key or len(idempotency_key) > 200:
        raise HTTPException(400, "A valid Idempotency-Key is required")
    return idempotency_key


@internal_router.post("/exams/{exam_id}/first-submission")
def first_submission(
    exam_id: str,
    payload: FirstSubmissionEvent,
    key: Annotated[str, Depends(internal_key)],
    exams: Annotated[ExamService, Depends(service)],
):
    return exams.first_submission(exam_id, key, payload)


@internal_router.post("/exams/{exam_id}/grading-completed")
def grading_completed(
    exam_id: str,
    payload: GradingCompletedEvent,
    key: Annotated[str, Depends(internal_key)],
    exams: Annotated[ExamService, Depends(service)],
):
    return exams.grading_completed(exam_id, key, payload)


@router.post("/exams/{exam_id}/exports/docx", status_code=201)
def export_docx(
    exam_id: str,
    payload: DocxExportCreate,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    return exams.export_docx(actor, exam_id, payload)


@router.get("/exams/{exam_id}/exports")
def list_exports(
    exam_id: str,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    return exams.list_exports(actor, exam_id)


@router.get("/exams/{exam_id}/exports/{export_id}/download")
def download_export(
    exam_id: str,
    export_id: str,
    actor: Annotated[str, Depends(teacher_id)],
    exams: Annotated[ExamService, Depends(service)],
):
    path, file_name = exams.export_file(actor, exam_id, export_id)
    return FileResponse(
        path,
        filename=file_name,
        media_type=(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ),
    )
