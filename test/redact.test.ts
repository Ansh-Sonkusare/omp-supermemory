import { describe, expect, test } from "bun:test";
import { redactMemorySecrets } from "../src/redact";

const fake = (...parts: string[]) => parts.join("");
const JWT = fake("ey", "JhbGciOiJIUzI1NiIsInR5cCI6.", "ey", "JzdWIiOiIxMjM0NTY3ODkwIiwi.SflKxwRJSMeKKF2QT4fwpMeJf36P");
const GH = fake("gh", "p_", "abcdefghijklmnopqrstuvwxyz0123456789");
const SK = fake("s", "k-", "proj1234567890abcdef");
const AKIA = fake("AK", "IA", "IOSFODNN7EXAMPLE");
const ASIA = fake("AS", "IA", "IOSFODNN7EXAMPLE");
const SLACK = fake("xo", "xb-", "1234567890-abcdef");
const GOOGLE = fake("AI", "za", "SyA1234567890abcdefghijklmnopqrstuv");
const pemHeader = (kind: string) => fake("-----BEGIN ", kind, "PRIVATE", " KEY-----");
const pemFooter = (kind: string) => fake("-----END ", kind, "PRIVATE", " KEY-----");

describe("redactMemorySecrets", () => {
  test.each([
    ["GitHub token", `push with ${GH} now`, "push with [REDACTED] now"],
    ["sk- API key", `use ${SK} now`, "use [REDACTED] now"],
    ["AWS access key", `aws ${AKIA} end`, "aws [REDACTED] end"],
    ["Slack token", `hook ${SLACK} done`, "hook [REDACTED] done"],
    ["Google API key", `g ${GOOGLE} end`, "g [REDACTED] end"],
    ["keyword-prefixed secret", "password_Xk9mP2qL7vN4 ok", "[REDACTED] ok"],
    ["JWT", `Bearer ${JWT}`, "Bearer [REDACTED]"],
  ])("%s", (_name, input, expected) => {
    expect(redactMemorySecrets(input)).toBe(expected);
  });

  test("redacts a PEM private key block whole", () => {
    const pem = `${pemHeader("RSA ")}\nMIIEowIBAAKCAQEAx3\nabcDEF123+/=\n${pemFooter("RSA ")}`;
    expect(redactMemorySecrets(`key:\n${pem}\nafter`)).toBe("key:\n[REDACTED]\nafter");
    expect(redactMemorySecrets(`${pemHeader("")}\nAAAA\n${pemFooter("")}`)).toBe("[REDACTED]");
  });

  test("redacts Bearer tokens but keeps the prefix", () => {
    expect(redactMemorySecrets("Authorization: Bearer abcDEF123456789xyz_-.~+/=")).toBe("Authorization: Bearer [REDACTED]");
    expect(redactMemorySecrets("curl -H 'Bearer a1b2c3d4e5f6g7h8i9' x")).toBe("curl -H 'Bearer [REDACTED]' x");
    expect(redactMemorySecrets("the Bearer scheme is short: Bearer abc")).toBe("the Bearer scheme is short: Bearer abc");
  });

  test("redacts every occurrence", () => {
    expect(redactMemorySecrets(`${AKIA} and ${ASIA}`)).toBe("[REDACTED] and [REDACTED]");
  });

  test("leaves ordinary text unchanged", () => {
    const text = "The configuration and authentication work; see src/index.ts and the key-value store.";
    expect(redactMemorySecrets(text)).toBe(text);
  });
});
