// Credential-shaped token redaction. Stored memories are recalled into the prompt on later
// turns, so a stored credential would reach every provider again. Port of omp's
// `redactMemorySecrets`; keep the patterns and the `[REDACTED]` marker identical.

const PATTERNS = [
  /(?:AKIA|ASIA)[A-Z0-9]{16}/g,
  /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /npm_[A-Za-z0-9]{30,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /AIza[A-Za-z0-9_-]{30,}/g,
];

// Longest first, so `token_` wins over `tok` and reports the full match start.
const KEYWORDS = ["password", "secret", "token", "key", "tok", "sk", "pk", "rk"];
// A segment mixing letters and digits is credential-like at 12 characters. Letters
// alone need 16, which still catches `password-supersecretvalue` and leaves
// `authentication` and `configuration` alone.
const MIN_MIXED_SEGMENT = 12;
const MIN_LETTERS_SEGMENT = 16;
const MIN_JWT_SEGMENT = 16;

const isDelimiter = (code: number) => code === 45 || code === 95;

function isCredentialSegment(length: number, letter: boolean, digit: boolean): boolean {
  if (!letter && !digit) return false;
  if (letter && digit) return length >= MIN_MIXED_SEGMENT;
  return length >= MIN_LETTERS_SEGMENT;
}

const isTokenChar = (code: number) =>
  (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || isDelimiter(code);

function keywordStart(input: string, delimiter: number): number {
  for (const keyword of KEYWORDS) {
    const start = delimiter - keyword.length;
    if (start >= 0 && input.startsWith(keyword, start)) return start;
  }
  return -1;
}

// Redacts `secret_aB3dEfGh1JkLmN`-style runs. Each run is split into segments once and the
// credential flags are swept backwards; a regex lookahead would rescan the tail per
// candidate, which is quadratic on long `token_aaaa-token_aaaa-…` runs in a transcript.
function redactKeywordSecrets(input: string): string {
  let out = "";
  let copied = 0;
  let index = 0;
  while (index < input.length) {
    if (!isTokenChar(input.charCodeAt(index))) {
      index++;
      continue;
    }

    const runStart = index;
    const starts: number[] = [runStart];
    const credential: boolean[] = [];
    let length = 0;
    let letter = false;
    let digit = false;
    while (index < input.length && isTokenChar(input.charCodeAt(index))) {
      const current = input.charCodeAt(index);
      if (isDelimiter(current)) {
        credential.push(isCredentialSegment(length, letter, digit));
        starts.push(index + 1);
        length = 0;
        letter = false;
        digit = false;
      } else {
        length++;
        if (current >= 48 && current <= 57) digit = true;
        else letter = true;
      }
      index++;
    }
    credential.push(isCredentialSegment(length, letter, digit));
    const runEnd = index;

    // suffix[k]: does any segment from k onwards look like a credential.
    const suffix: boolean[] = Array.from({ length: credential.length + 1 }, () => false);
    for (let k = credential.length - 1; k >= 0; k--) suffix[k] = suffix[k + 1] || credential[k]!;

    for (let k = 1; k < starts.length; k++) {
      if (!suffix[k]) continue;
      const start = keywordStart(input, starts[k]! - 1);
      if (start < 0 || start < copied || start < runStart) continue;
      out += `${input.slice(copied, start)}[REDACTED]`;
      copied = runEnd;
      break;
    }
  }
  return copied === 0 ? input : out + input.slice(copied);
}

// Redacts `header.payload.signature` tokens by anchoring on dots and measuring outward,
// which avoids the quadratic rescans of a `[A-Za-z0-9_-]{16,}\.` regex on dot-free text.
function redactJwts(input: string): string {
  let out = "";
  let copied = 0;
  let dot = input.indexOf(".");
  while (dot > 0) {
    let start = dot;
    while (start > copied && isTokenChar(input.charCodeAt(start - 1))) start--;
    let middle = dot + 1;
    while (middle < input.length && isTokenChar(input.charCodeAt(middle))) middle++;
    let end = middle + 1;
    while (end < input.length && isTokenChar(input.charCodeAt(end))) end++;
    const looksLikeJwt =
      dot - start >= MIN_JWT_SEGMENT &&
      input.charCodeAt(middle) === 46 &&
      middle - dot - 1 >= MIN_JWT_SEGMENT &&
      end - middle - 1 >= MIN_JWT_SEGMENT;
    if (looksLikeJwt) {
      out += `${input.slice(copied, start)}[REDACTED]`;
      copied = end;
      dot = input.indexOf(".", end);
      continue;
    }
    dot = input.indexOf(".", dot + 1);
  }
  return copied === 0 ? input : out + input.slice(copied);
}

const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const BEARER_TOKEN = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi;

export function redactMemorySecrets(input: string): string {
  let out = input.replace(PRIVATE_KEY_BLOCK, "[REDACTED]").replace(BEARER_TOKEN, "$1[REDACTED]");
  out = redactJwts(redactKeywordSecrets(out));
  for (const pattern of PATTERNS) out = out.replace(pattern, "[REDACTED]");
  return out;
}
