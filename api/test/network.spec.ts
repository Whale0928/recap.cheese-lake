import { cidrMatcher, corsOrigins } from "../src/runtime/network.config.js";

describe("Internal API network boundary", () => {
  const allowed = cidrMatcher("127.0.0.1/32,::1/128,10.42.4.0/24");
  it.each(["127.0.0.1", "::1", "::ffff:127.0.0.1", "10.42.4.1", "10.42.4.255"])("accepts %s", address => expect(allowed(address)).toBe(true));
  it.each(["8.8.8.8", "10.42.5.1", "192.168.1.1", "127.0.0.2", "invalid", undefined])("rejects %s", address => expect(allowed(address)).toBe(false));
  it.each(["", "127.0.0.1", "10.42.4.0/33", "::1/129", "invalid/24"])("rejects invalid configuration %s", value => expect(() => cidrMatcher(value)).toThrow());
  it("does not accept lookalike origins or wildcard configuration", () => {
    expect(corsOrigins("https://recap.cheese-lake.com,http://localhost:5273")).toEqual(["https://recap.cheese-lake.com", "http://localhost:5273"]);
    expect(() => corsOrigins("*")).toThrow();
    expect(() => corsOrigins("https://recap.cheese-lake.com/path")).toThrow();
  });
});
