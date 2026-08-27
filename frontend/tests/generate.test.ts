import assert from "node:assert/strict";
import { beforeEach, test, type TestContext } from "node:test";
import { POST } from "../app/api/generate/route.ts";

beforeEach((context) => {
  const t = context as TestContext;
  const names = ["GEMINI_API_KEY", "FLUX_API_KEY", "ARK_API_KEY", "MINIMAX_API_KEY", "ARK_BASE_URL", "MINIMAX_BASE_URL", "ARK_MODEL", "DEV_FORWARDER_URL"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  names.forEach((name) => { delete process.env[name]; });
  t.after(() => names.forEach((name) => {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }));
  t.mock.method(globalThis, "fetch", () => { throw new Error("Unexpected external request in test"); });
});

function request(body: unknown) {
  return new Request("http://localhost/api/generate", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

test("invalid JSON is rejected before contacting a provider", async () => {
  const response = await POST(new Request("http://localhost/api/generate", { method: "POST", body: "{" }));
  assert.equal(response.status, 400);
});

for (const body of [null, [], { prompt: 123 }, { prompt: " " }, { prompt: "ok", width: 1 }, { prompt: "ok", width: "512", height: 512 }, { prompt: "ok", aspectRatio: 123 }, { prompt: "ok", aspectRatio: "0:1" }]) {
  test(`malformed generation request returns 400: ${JSON.stringify(body)}`, async () => {
    assert.equal((await POST(request(body))).status, 400);
  });
}

test("missing provider key returns a configuration error", async () => {
  const response = await POST(request({ model: "seedream", prompt: "Copper hotpot" }));
  assert.equal(response.status, 503);
  assert.match((await response.json() as { error: string }).error, /ARK_API_KEY is not configured/);
});

for (const model of ["seedream", "seedance"]) {
  test(`${model} routes to the domestic Ark image endpoint`, async (t) => {
    process.env.ARK_API_KEY = "test-key";
    t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
      assert.equal(url, "https://ark.cn-beijing.volces.com/api/v3/images/generations");
      const body = JSON.parse(init!.body as string);
      assert.equal(body.model, "doubao-seedream-4-0-250828");
      assert.equal(body.size, "2048x1536");
      assert.equal(body.prompt, "Copper hotpot");
      return Response.json({ data: [{ b64_json: "iVBORw0KGgo-test" }] });
    });
    const response = await POST(request({ model, prompt: "Copper hotpot", aspectRatio: "4:3" }));
    assert.equal(response.status, 200);
    assert.match((await response.json() as { image: string }).image, /^data:image\/png;base64,/);
  });
}

test("MiniMax uses the domestic domain and labels JPEG output correctly", async (t) => {
  process.env.MINIMAX_API_KEY = "test-key";
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    assert.equal(url, "https://api.minimaxi.com/v1/image_generation");
    return Response.json({ base_resp: { status_code: 0 }, data: { image_base64: ["/9j/test"] } });
  });
  const response = await POST(request({ model: "minimax", prompt: "Copper hotpot" }));
  assert.equal(response.status, 200);
  assert.match((await response.json() as { image: string }).image, /^data:image\/jpeg;base64,/);
});

test("MiniMax account errors are surfaced, never treated as a generated image", async (t) => {
  process.env.MINIMAX_API_KEY = "test-key";
  t.mock.method(globalThis, "fetch", async () => Response.json({ base_resp: { status_code: 1008, status_msg: "insufficient balance" } }));
  const response = await POST(request({ model: "minimax", prompt: "Copper hotpot" }));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "insufficient balance" });
});

test("MiniMax international override trims trailing slashes", async (t) => {
  process.env.MINIMAX_API_KEY = "test-key";
  process.env.MINIMAX_BASE_URL = "https://api.minimax.io/";
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    assert.equal(url, "https://api.minimax.io/v1/image_generation");
    return Response.json({ data: { image_base64: ["iVBORw0KGgo-test"] } });
  });
  assert.equal((await POST(request({ model: "minimax", prompt: "Copper hotpot" }))).status, 200);
});
