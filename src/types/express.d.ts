/**
 * Declaration merging para colgar el usuario autenticado de `req`.
 * Lo rellena AuthMiddleware tras verificar el access token.
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

export {};
