// Local mock transport returns detached records, matching an HTTP response boundary.
export async function mockResponse<T>(read: () => T, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  await Promise.resolve();
  signal?.throwIfAborted();
  return structuredClone(read());
}
