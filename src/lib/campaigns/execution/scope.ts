/** Ensures related identifiers share the same workspace (application-layer guard). */
export function assertMatchingWorkspace(
  expectedWorkspaceId: string,
  refs: { label: string; workspaceId: string }[],
): void {
  for (const ref of refs) {
    if (ref.workspaceId !== expectedWorkspaceId) {
      throw new Error(`${ref.label} workspace mismatch`);
    }
  }
}

export function canBindJobToEnrollment(
  job: { workspace_id: string; campaign_id: string; enrollment_id: string },
  enrollment: { workspace_id: string; campaign_id: string; id: string },
): boolean {
  return (
    job.workspace_id === enrollment.workspace_id &&
    job.campaign_id === enrollment.campaign_id &&
    job.enrollment_id === enrollment.id
  );
}
