/** Galat aplikasi yang membawa kode HTTP, agar route tidak perlu menebak statusnya. */
export class AppError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
  }
}

export const notFound = (what: string) => new AppError(404, `${what} tidak ditemukan`);
export const badRequest = (message: string) => new AppError(400, message);
export const conflict = (message: string) => new AppError(409, message);
export const unauthorized = (message = "Tidak terautentikasi") => new AppError(401, message);
