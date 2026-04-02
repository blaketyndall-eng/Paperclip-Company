import { NextFunction, Request, Response } from 'express';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
}
