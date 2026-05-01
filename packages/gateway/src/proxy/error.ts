export class GatewayProxyError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'GatewayProxyError';
    this.code = code;
    this.status = status;
  }
}
