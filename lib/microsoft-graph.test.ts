import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GraphClient,
  MicrosoftGraphClient,
  type MicrosoftGraphClientOptions,
} from "./microsoft-graph.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function client(
  responses: Response[],
  options: Omit<MicrosoftGraphClientOptions, "fetcher"> = {},
) {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    const response = responses.shift();
    if (!response) throw new Error("No mocked Microsoft response remains.");
    return response;
  });
  return {
    client: new MicrosoftGraphClient({ ...options, fetcher }),
    requests,
    fetcher,
  };
}

function json(status: number, value: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("MicrosoftGraphClient", () => {
  it("reads the mailbox identity without exposing the access token in the URL", async () => {
    const kit = client([json(200, { mail: "rep@example.com", extra: "ignored" })]);

    const result = await kit.client.me("secret-token");

    expect(result).toEqual({
      outcome: "ok",
      data: { mail: "rep@example.com" },
    });
    expect(kit.requests[0]?.url).toBe(
      "https://graph.microsoft.com/v1.0/me?%24select=mail%2CuserPrincipalName",
    );
    expect(kit.requests[0]?.url).not.toContain("secret-token");
    expect(kit.requests[0]?.init?.headers).toEqual({
      Accept: "application/json",
      authorization: "Bearer secret-token",
    });
  });

  it("builds a forward-only Outlook message query", async () => {
    const kit = client([json(200, { value: [], "@odata.nextLink": null })]);
    const after = new Date("2026-08-25T12:00:00.000Z");

    const result = await kit.client.listMessages("token", { after, top: 50 });

    expect(result).toEqual({
      outcome: "ok",
      data: { value: [], "@odata.nextLink": null },
    });
    const url = new URL(kit.requests[0]!.url);
    expect(url.pathname).toBe("/v1.0/me/messages");
    expect(url.searchParams.get("$filter")).toBe(
      "receivedDateTime gt 2026-08-25T12:00:00.000Z and isDraft eq false",
    );
    expect(url.searchParams.get("$orderby")).toBe("receivedDateTime asc");
    expect(url.searchParams.get("$top")).toBe("50");
    expect(url.searchParams.get("$select")).toContain("internetMessageHeaders");
  });

  it("maps Graph failures to reconnect, cursor, rate, and retry outcomes", async () => {
    const unauthorized = client([json(401, { error: { code: "InvalidAuthenticationToken", message: "Expired" } })]);
    expect((await unauthorized.client.me("token")).outcome).toBe("unauthorized");

    const missing = client([json(404, { error: { message: "Folder not found" } })]);
    expect((await missing.client.folder("token", "junkemail")).outcome).toBe("cursor-invalid");

    const limited = client([json(429, { error: { message: "Too many requests" } }, { "retry-after": "2" })]);
    const limitedResult = await limited.client.me("token");
    expect(limitedResult).toMatchObject({ outcome: "rate-limited", retryAfterMs: 30_000 });

    const forbidden = client([json(403, { error: { message: "Insufficient privileges" } })]);
    expect(await forbidden.client.me("token")).toEqual({
      outcome: "failed",
      reason: "Insufficient privileges",
      retryable: false,
    });

    const server = client([json(503, { error: { message: "Service unavailable" } })]);
    expect(await server.client.me("token")).toEqual({
      outcome: "failed",
      reason: "Service unavailable",
      retryable: true,
    });
  });

  it("rejects malformed payloads and unsafe continuation links", async () => {
    const malformed = client([json(200, { value: [{ id: 7 }] })]);
    expect(await malformed.client.listMessages("token", {
      after: new Date("2026-08-25T12:00:00.000Z"),
      top: 50,
    })).toEqual({
      outcome: "failed",
      reason: "Microsoft returned an invalid Graph response.",
      retryable: false,
    });

    const unsafe = client([]);
    expect(await unsafe.client.nextPage("token", "https://evil.example/v1.0/me/messages")).toEqual({
      outcome: "failed",
      reason: "Microsoft Graph returned an unsafe next page URL.",
      retryable: false,
    });
    expect(unsafe.requests).toHaveLength(0);
  });

  it("rejects invalid tokens, credential-bearing continuation links, and oversized responses", async () => {
    const invalid = client([]);
    await expect(invalid.client.me("  ")).resolves.toEqual({
      outcome: "failed",
      reason: "A Microsoft access token is required.",
      retryable: false,
    });
    expect(invalid.requests).toHaveLength(0);

    const credentialLink = client([]);
    await expect(
      credentialLink.client.nextPage(
        "token",
        "https://graph.microsoft.com/v1.0/me/messages?access_token=leaked",
      ),
    ).resolves.toEqual({
      outcome: "failed",
      reason: "Microsoft Graph returned an unsafe next page URL.",
      retryable: false,
    });
    expect(credentialLink.requests).toHaveLength(0);

    const oversized = client(
      [
        new Response("x".repeat(1_100), {
          status: 200,
          headers: { "content-length": "1100" },
        }),
      ],
      { maxResponseBytes: 1_024 },
    );
    await expect(oversized.client.me("token")).resolves.toEqual({
      outcome: "failed",
      reason: "Microsoft returned a response larger than the configured safety limit.",
      retryable: false,
    });
  });

  it("stops a request at the configured timeout", async () => {
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
    );
    const graph = new GraphClient({ fetcher, timeoutMs: 5 });

    await expect(graph.me("token")).resolves.toEqual({
      outcome: "failed",
      reason: "Timed out after 5ms.",
      retryable: true,
    });
  });

  it("distinguishes caller cancellation from a timeout", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
        controller.abort();
      }),
    );
    const graph = new GraphClient({ fetcher, timeoutMs: 5_000 });

    await expect(graph.me("token", controller.signal)).resolves.toEqual({
      outcome: "failed",
      reason: "The Microsoft Graph request was cancelled.",
      retryable: false,
    });
  });
});
