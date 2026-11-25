export class FormatError extends Error {
  constructor(
    public format: string,
    message: string,
    public offset?: number,
  ) {
    super(message);
    this.name = 'FormatError';
  }
}
