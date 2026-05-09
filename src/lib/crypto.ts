// Lightweight PIN hashing using Web Crypto (SHA-256).
// NOTE: This is a hackathon prototype. PINs are hashed with the user's
// auth id as salt before storage. For production use a proper KDF
// (bcrypt/argon2) executed on the server.
export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPin(pin: string, salt: string, hash: string) {
  return (await hashPin(pin, salt)) === hash;
}
