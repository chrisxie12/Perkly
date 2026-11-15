import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { initializeTransaction, isValidWebhookSignature, verifyTransaction, PaystackError } = await import("@/lib/payments/paystack");

const KEY = "sk_test_" + "a".repeat(40);
const REF = "PQ-0123456789abcdef0123456789abcdef";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("Paystack webhook signature", () => {
  const body = JSON.stringify({ event: "charge.success", data: { reference: REF } });
  const good = createHmac("sha512", KEY).update(body).digest("hex");

  it("accepts Paystack's signature", () => {
    expect(isValidWebhookSignature(KEY, body, good)).toBe(true);
  });
  it("rejects a missing, wrong or tampered signature", () => {
    expect(isValidWebhookSignature(KEY, body, null)).toBe(false);
    expect(isValidWebhookSignature(KEY, body, "0".repeat(128))).toBe(false);
    expect(isValidWebhookSignature(KEY, body.replace("success", "failed"), good)).toBe(false);
    expect(isValidWebhookSignature("sk_test_" + "b".repeat(40), body, good)).toBe(false);
  });
});

describe("Paystack API calls", () => {
  it("starts a GHS checkout for mobile money and card", async () => {
    const fetchMock = mockFetch(200, { status: true, data: { authorization_url: "https://checkout.paystack.com/abc", reference: REF } });
    const tx = await initializeTransaction(KEY, {
      email: "owner@shop.example",
      amountPesewas: 5000,
      reference: REF,
      callbackUrl: "https://perqly.online/merchant/billing/return",
      merchantId: "3f2b8c1e-7a4d-4e1b-9c2a-5d6e7f8a9b0c",
    });
    expect(tx.authorization_url).toBe("https://checkout.paystack.com/abc");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.paystack.co/transaction/initialize");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const sent = JSON.parse(String(init.body));
    expect(sent).toMatchObject({ amount: 5000, currency: "GHS", reference: REF, channels: ["mobile_money", "card"] });
  });

  it("reads a verified transaction", async () => {
    mockFetch(200, {
      status: true,
      data: { status: "success", reference: REF, amount: 5000, currency: "GHS", id: 123, channel: "mobile_money" },
    });
    await expect(verifyTransaction(KEY, REF)).resolves.toMatchObject({ status: "success", amount: 5000, id: "123" });
  });

  it("refuses references that aren't Perqly's, without calling Paystack", async () => {
    const fetchMock = mockFetch(200, {});
    await expect(verifyTransaction(KEY, "../transfer")).rejects.toBeInstanceOf(PaystackError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a Paystack error as a failure", async () => {
    mockFetch(400, { status: false, message: "Invalid key" });
    await expect(verifyTransaction(KEY, REF)).rejects.toBeInstanceOf(PaystackError);
  });
});
