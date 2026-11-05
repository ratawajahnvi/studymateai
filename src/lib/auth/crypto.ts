import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const STUDENT_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Generates a cryptographically random, non-guessable Student ID in the format SM-XXXX-XXXX.
 */
export function generateStudentId(): string {
  const bytes = randomBytes(8);
  let part1 = "";
  let part2 = "";
  for (let i = 0; i < 4; i++) {
    const b1 = bytes[i] ?? 0;
    const b2 = bytes[i + 4] ?? 0;
    part1 += STUDENT_ID_ALPHABET[b1 % STUDENT_ID_ALPHABET.length];
    part2 += STUDENT_ID_ALPHABET[b2 % STUDENT_ID_ALPHABET.length];
  }
  return `SM-${part1}-${part2}`;
}

/**
 * Generates a deterministic UUID from a stable identifier (such as a normalized Google email)
 * so the user's profile ID never changes across serverless cold starts.
 */
export function deterministicUuidFromString(seed: string): string {
  const hash = createHash("sha256")
    .update(`studymate-profile-uuid:${seed.trim().toLowerCase()}`)
    .digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `a${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

/**
 * Generates a deterministic SM-XXXX-XXXX Student ID for a given Google email
 * so the user always retains the same Student ID.
 */
export function deterministicStudentIdFromEmail(email: string): string {
  const bytes = createHash("sha256")
    .update(`studymate-student-id:${email.trim().toLowerCase()}`)
    .digest();
  let part1 = "";
  let part2 = "";
  for (let i = 0; i < 4; i++) {
    const b1 = bytes[i] ?? 0;
    const b2 = bytes[i + 4] ?? 0;
    part1 += STUDENT_ID_ALPHABET[b1 % STUDENT_ID_ALPHABET.length];
    part2 += STUDENT_ID_ALPHABET[b2 % STUDENT_ID_ALPHABET.length];
  }
  return `SM-${part1}-${part2}`;
}

export interface HashedPin {
  hash: string;
  salt: string;
}

/**
 * Hashes a student PIN using scrypt with a unique 16-byte cryptographic salt.
 */
export function hashPin(pin: string, providedSalt?: string): HashedPin {
  const salt = providedSalt ?? randomBytes(16).toString("hex");
  const derivedKey = scryptSync(pin, salt, 64);
  return {
    hash: derivedKey.toString("hex"),
    salt,
  };
}

/**
 * Verifies a plaintext PIN against a stored scrypt hash and salt using constant-time comparison.
 */
export function verifyPin(pin: string, storedHash: string, storedSalt: string): boolean {
  try {
    const { hash } = hashPin(pin, storedSalt);
    const bufA = Buffer.from(hash, "hex");
    const bufB = Buffer.from(storedHash, "hex");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Constant-time string comparison for admin credentials.
 */
export function safeCompareStrings(input: string, expected: string): boolean {
  const hashA = createHmac("sha256", "studymate-constant-compare").update(input).digest();
  const hashB = createHmac("sha256", "studymate-constant-compare").update(expected).digest();
  return timingSafeEqual(hashA, hashB);
}

export interface SessionPayload {
  sub: string; // profile UUID
  identifier: string; // SM-XXXX-XXXX or adminId
  email?: string; // Google Account email
  displayName: string;
  role: "student" | "admin" | "superadmin";
  iat: number;
  exp: number;
  jti: string;
}

const revokedTokenJtis = new Set<string>();

export function revokeSessionTokenJti(jti: string): void {
  revokedTokenJtis.add(jti);
}

export function isTokenJtiRevoked(jti: string): boolean {
  return revokedTokenJtis.has(jti);
}

/**
 * Creates an HMAC-SHA256 signed session token.
 */
export function createSessionToken(
  payload: Omit<SessionPayload, "iat" | "exp" | "jti">,
  secret: string,
  ttlSeconds = 60 * 60 * 24 * 7 // 7 days default
): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const fullPayload: SessionPayload = {
    ...payload,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    jti: randomBytes(12).toString("hex"),
  };

  const encodedPayload = Buffer.from(JSON.stringify(fullPayload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies an HMAC-SHA256 signed session token and checks expiration and revocation.
 */
export function verifySessionToken(token: string, secret: string): SessionPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [encodedPayload, providedSignature] = parts;
    if (!encodedPayload || !providedSignature) return null;

    const expectedSignature = createHmac("sha256", secret)
      .update(encodedPayload)
      .digest("base64url");

    const sigBufA = Buffer.from(providedSignature, "utf8");
    const sigBufB = Buffer.from(expectedSignature, "utf8");
    if (sigBufA.length !== sigBufB.length || !timingSafeEqual(sigBufA, sigBufB)) {
      return null;
    }

    const decodedJson = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const parsed = JSON.parse(decodedJson) as SessionPayload;

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (typeof parsed.exp !== "number" || parsed.exp <= nowSeconds) {
      return null;
    }
    if (
      parsed.role !== "student" &&
      parsed.role !== "admin" &&
      parsed.role !== "superadmin"
    ) {
      return null;
    }
    if (!parsed.jti || isTokenJtiRevoked(parsed.jti)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitBucket>();

/**
 * Deterministic server-side rate limiter to prevent brute-force PIN and ID attacks.
 */
export function checkRateLimit(
  key: string,
  maxAttempts = 5,
  windowMs = 60_000
): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
  const now = Date.now();
  const existing = rateLimitStore.get(key);

  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= maxAttempts) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  existing.count += 1;
  rateLimitStore.set(key, existing);
  return {
    allowed: true,
    remaining: Math.max(0, maxAttempts - existing.count),
    retryAfterSeconds: 0,
  };
}

export function resetRateLimitForTest(key?: string): void {
  if (key) {
    rateLimitStore.delete(key);
  } else {
    rateLimitStore.clear();
  }
}
