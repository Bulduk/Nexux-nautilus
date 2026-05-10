import { type Request, type Response, type NextFunction } from "express";
import { getAccessToken, verifyAccessToken, type JwtPayload } from "../lib/auth";

// Augment Express Request with our JWT payload
declare global {
  namespace Express {
    interface Request {
      jwtUser?: JwtPayload;
      isAuthenticated(): this is Request & { jwtUser: JwtPayload };
    }
  }
}

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  req.isAuthenticated = function (this: Request) {
    return this.jwtUser != null;
  } as Request["isAuthenticated"];

  const token = getAccessToken(req);
  if (!token) {
    next();
    return;
  }

  const payload = verifyAccessToken(token);
  if (!payload) {
    next();
    return;
  }

  req.jwtUser = payload;
  next();
}
