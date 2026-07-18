export function buildLearningPathRequest(subject: string, studentIds: string[], targetTopicIds: string[]) {
  return { subject, studentIds, targetTopicIds };
}
