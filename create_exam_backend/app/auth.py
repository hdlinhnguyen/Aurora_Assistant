from typing import Annotated

from fastapi import Header, HTTPException


def teacher_id(
    x_teacher_id: Annotated[str | None, Header()] = None,
    x_role: Annotated[str | None, Header()] = None,
) -> str:
    if not x_teacher_id or not x_teacher_id.strip():
        raise HTTPException(401, "X-Teacher-Id is required")
    if x_role != "teacher":
        raise HTTPException(403, "Teacher role is required")
    return x_teacher_id.strip()
