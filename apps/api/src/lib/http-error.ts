export class HttpError extends Error {
  status: number;
  code?: string;
  extra?: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    code?: string,
    extra?: Record<string, unknown>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
