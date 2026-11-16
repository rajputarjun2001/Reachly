import { describe, expect, it } from "vitest";
import { parseProxyUrl, proxyDisplayHost, proxyToUrl } from "../utils/proxy";
import { AppError } from "../utils/errors";

describe("parseProxyUrl", () => {
  it("parses a URL with credentials", () => {
    expect(parseProxyUrl("http://user:p%40ss@gate.example.com:7000")).toEqual({
      server: "http://gate.example.com:7000",
      username: "user",
      password: "p@ss",
    });
  });

  it("parses host:port and defaults to http", () => {
    expect(parseProxyUrl(" 10.0.0.5:8080 ")).toEqual({ server: "http://10.0.0.5:8080" });
  });

  it("parses the host:port:user:pass format providers show", () => {
    expect(parseProxyUrl("gate.example.com:7000:user-country-in-session-ab12:se:cret")).toEqual({
      server: "http://gate.example.com:7000",
      username: "user-country-in-session-ab12",
      password: "se:cret",
    });
  });

  it("parses user:pass@host:port without a scheme", () => {
    expect(parseProxyUrl("user:pass@gate.example.com:7000")).toEqual({
      server: "http://gate.example.com:7000",
      username: "user",
      password: "pass",
    });
  });

  it("accepts socks5 without credentials and rejects it with credentials", () => {
    expect(parseProxyUrl("socks5://10.0.0.5:1080")).toEqual({ server: "socks5://10.0.0.5:1080" });
    expect(() => parseProxyUrl("socks5://user:pass@10.0.0.5:1080")).toThrow(AppError);
  });

  it("rejects input that has no usable host and port", () => {
    for (const bad of ["", "gate.example.com", "http://gate.example.com", "ftp://gate.example.com:21", "host:99999"]) {
      expect(() => parseProxyUrl(bad), bad).toThrow(AppError);
    }
  });
});

describe("proxy storage helpers", () => {
  it("round-trips credentials through the stored URL", () => {
    const proxy = parseProxyUrl("gate.example.com:7000:us/er:p@ss:word");
    expect(parseProxyUrl(proxyToUrl(proxy))).toEqual(proxy);
  });

  it("never includes credentials in the display host", () => {
    expect(proxyDisplayHost(parseProxyUrl("http://user:secret@gate.example.com:7000"))).toBe("gate.example.com:7000");
  });
});
