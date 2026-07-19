export function resolveTeacherSubject(
  subjects: string[],
  explicitlyRequestedSubject?: string,
): string {
  if (explicitlyRequestedSubject && subjects.includes(explicitlyRequestedSubject)) {
    return explicitlyRequestedSubject;
  }

  return "";
}
