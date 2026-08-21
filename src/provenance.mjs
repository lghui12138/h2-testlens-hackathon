export async function sha256Hex(text, cryptoImpl = globalThis.crypto) {
  if (!cryptoImpl?.subtle || typeof TextEncoder === 'undefined') return null;
  const digest = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(String(text)));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}
