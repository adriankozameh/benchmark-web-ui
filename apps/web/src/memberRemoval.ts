import type { BenchmarkApi } from '@benchmark/api';

const REQUEST_TIMEOUT_MS = 15_000;

async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Member removal timed out. Please refresh the member list before trying again.'));
          controller.abort();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Reconcile an uncertain DELETE response without sending a second DELETE. */
export async function removeMemberAndConfirm(
  api: Pick<BenchmarkApi, 'removeMember' | 'listMembers'>,
  organizationId: string,
  userId: string,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<void> {
  try {
    await withTimeout(signal => api.removeMember(organizationId, userId, signal), timeoutMs);
    return;
  } catch (removalError) {
    const status = removalError && typeof removalError === 'object' && 'status' in removalError
      ? removalError.status : undefined;
    if (status === 401 || status === 403) throw removalError;

    // A committed deletion can outlive a lost or timed-out HTTP response.
    let members;
    try {
      members = await withTimeout(signal => api.listMembers(organizationId, signal), timeoutMs);
    } catch {
      throw new Error('Could not confirm member removal. Please refresh the member list before trying again.');
    }
    if (members.some(member => member.userId === userId)) throw removalError;
  }
}
