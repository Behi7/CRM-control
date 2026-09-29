export interface JwtPayload {
  sub?: number;
  role?: string;
  accountId?: number | null;
  exp?: number;
  iat?: number;
  [key: string]: any;
}

/**
 * Safely decodes a Base64URL JWT payload in the browser without throwing DOMException.
 * Handles `-`, `_`, missing padding, and multi-byte UTF-8 characters.
 */
export function decodeJwt<T = JwtPayload>(token: string | null | undefined): T | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

