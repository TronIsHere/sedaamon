/** Kept apart from http.ts, which needs Next's request context and so can't load in the standalone server process. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
