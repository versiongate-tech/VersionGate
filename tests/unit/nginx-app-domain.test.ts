import { describe, test, expect } from "bun:test";
import {
  appUpstreamName,
  appServerConfPath,
  generateAppUpstreamConf,
  generateAppServerConf,
} from "../../src/utils/nginx-app-domain";

describe("nginx-app-domain", () => {
  test("generateAppUpstreamConf uses live port when provided", () => {
    const conf = generateAppUpstreamConf("my-app", 3100);
    expect(conf).toContain("upstream vg_app_my_app");
    expect(conf).toContain("server 127.0.0.1:3100;");
  });

  test("generateAppUpstreamConf uses down marker when no port", () => {
    const conf = generateAppUpstreamConf("my-app", null);
    expect(conf).toContain("server 127.0.0.1:9 down;");
  });

  test("generateAppServerConf uses exact server_name without catch-all", () => {
    const conf = generateAppServerConf("my-app", "api.example.com");
    expect(conf).toContain("server_name api.example.com;");
    expect(conf).not.toContain("server_name api.example.com _");
    expect(conf).toContain("proxy_pass http://vg_app_my_app;");
    expect(conf).toContain("/.well-known/acme-challenge/");
  });

  test("appServerConfPath isolates hostnames for certbot", () => {
    expect(appServerConfPath("my-app", "api.example.com")).toContain("api_example_com");
    expect(appUpstreamName("my-app")).toBe("vg_app_my_app");
  });
});
