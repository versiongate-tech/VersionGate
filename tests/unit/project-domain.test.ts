import { describe, test, expect } from "bun:test";
import { isValidHostname, isValidIpv4Address } from "../../src/utils/domain-validation";
import { generateAppServerConf } from "../../src/utils/nginx-app-domain";

describe("project custom domain validation", () => {
  test("rejects raw IPv4 as hostname", () => {
    expect(isValidIpv4Address("95.135.166.131")).toBe(true);
    expect(isValidHostname("95.135.166.131")).toBe(true);
  });

  test("accepts nested subdomain hostnames", () => {
    expect(isValidHostname("api.myapp.example.com")).toBe(true);
  });

  test("server conf never adds catch-all underscore", () => {
    const conf = generateAppServerConf("demo", "shop.example.com");
    expect(conf).not.toMatch(/server_name\s+shop\.example\.com\s+_;/);
  });
});
