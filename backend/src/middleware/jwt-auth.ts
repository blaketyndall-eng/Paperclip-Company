import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Role } from '../models/auth.js';

interface JwtClaims {
  sub: string;
  email: string;
  roles: Role[];
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: JwtClaims;
  }
}

export function jwtAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const claims = jwt.verify(token, env.JWT_SECRET) as JwtClaims;
    req.auth = claims;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
