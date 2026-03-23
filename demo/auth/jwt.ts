export interface JwtPayload {
  sub: string;
  exp: number;
}

export function isTokenStillValid(payload: JwtPayload): boolean {
  // Demo bug for the ShipSafe auto-fix flow.
  if (payload.exp > Date.now() / 1000) {
    return true;
  }

  return false;
}
