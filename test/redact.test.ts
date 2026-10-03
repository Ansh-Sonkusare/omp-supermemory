import { describe, expect, test } from "bun:test";
import { redactMemorySecrets } from "../src/redact";

const JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6.eyJzdWIiOiIxMjM0NTY3ODkwIiwi.SflKxwRJSMeKKF2QT4fwpMeJf36P";

describe("redactMemorySecrets", () => {
  test.each([
    ["GitHub token", "push with ghp_abcdefghijklmnopqrstuvwxyz0123456789 now", "push with [REDACTED] now"],
    ["sk- API key", "use sk-proj1234567890abcdef now", "use [REDACTED] now"],
    ["AWS access key", "aws AKIAIOSFODNN7EXAMPLE end", "aws [REDACTED] end"],
    ["Slack token", "hook xoxb-1234567890-abcdef done", "hook [REDACTED] done"],
    ["Google API key", "g AIzaSyA1234567890abcdefghijklmnopqrstuv end", "g [REDACTED] end"],
    ["keyword-prefixed secret", "password_Xk9mP2qL7vN4 ok", "[REDACTED] ok"],
    ["JWT", `Bearer ${JWT}`, "Bearer [REDACTED]"],
  ])("%s", (_name, input, expected) => {
    expect(redactMemorySecrets(input)).toBe(expected);
  });

  test("redacts a PEM private key block whole", () => {
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAx3\nabcDEF123+/=\n-----END RSA PRIVATE KEY-----";
    expect(redactMemorySecrets(`key:\n${pem}\nafter`)).toBe("key:\n[REDACTED]\nafter");
    expect(redactMemorySecrets("-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----")).toBe("[REDACTED]");
  });

  test("redacts Bearer tokens but keeps the prefix", () => {
    expect(redactMemorySecrets("Authorization: Bearer abcDEF123456789xyz_-.~+/=")).toBe("Authorization: Bearer [REDACTED]");
    expect(redactMemorySecrets("curl -H 'Bearer a1b2c3d4e5f6g7h8i9' x")).toBe("curl -H 'Bearer [REDACTED]' x");
    expect(redactMemorySecrets("the Bearer scheme is short: Bearer abc")).toBe("the Bearer scheme is short: Bearer abc");
  });

  test("redacts every occurrence", () => {
    expect(redactMemorySecrets("AKIAIOSFODNN7EXAMPLE and ASIAIOSFODNN7EXAMPLE")).toBe("[REDACTED] and [REDACTED]");
  });

  test("leaves ordinary text unchanged", () => {
    const text = "The configuration and authentication work; see src/index.ts and the key-value store.";
    expect(redactMemorySecrets(text)).toBe(text);
  });
});
