export function isPrivateUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const hostname = u.hostname;
    const privatePatterns = [
      /^localhost$/i,
      /^127\./,
      /^10\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^192\.168\./,
      /^169\.254\./,
      /^0\./,
      /^::1$/,
      /^fe80:/i,
      /^fc00:/i,
      /^fd/i,
    ];
    if (privatePatterns.some(p => p.test(hostname))) return true;
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return true;
    return false;
  } catch {
    return true;
  }
}
