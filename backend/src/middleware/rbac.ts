import { NextFunction, Request, Response } from 'express';
import { Role } from '../models/auth.js';

export function requireRoles(requiredRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRoles = req.auth?.roles ?? [];
    const allowed = requiredRoles.some((role) => userRoles.includes(role));

    if (!allowed) {
      res.status(403).json({ error: 'Insufficient role permissions' });
      return;
    }

    next();
  };
}
