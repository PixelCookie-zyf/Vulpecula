const GEMINI_MODEL = "gemini-2.5-flash-image";
const FLUX_MODEL = "flux-2-pro";
const ARK_MODEL = "doubao-seedream-4-0-250828";
const MINIMAX_MODEL = "image-01";

const ARK_BASE_URL = "https://ark.cn-beijing.volces.com";
const MINIMAX_BASE_URL = "https://api.minimaxi.com";

const GEMINI_RATIOS = new Set(["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"]);
const GEMINI_RATIO_FALLBACK: Record<string, string> = { "4:5": "3:4" };
const MINIMAX_RATIOS = new Set(["1:1", "16:9", "4:3", "3:2", "2:3", "3:4", "9:16", "21:9"]);

type GenerateRequest = {
  model?: string;
  prompt?: string;
  aspectRatio?: string;
  width?: number;
  height?: number;
};

type Env = Record<string, string | undefined>;

async function getEnv(): Promise<Env> {
  try {
    const mod = await import("cloudflare:workers");
    return (mod.env as unknown as Env) ?? {};
  } catch {
    return (process.env ?? {}) as Env;
  }
}

function json(payload: unknown, status = 200) {
  return Response.json(payload, { status });
}

function requireKey(env: Env, name: string): string {
  const key = env[name]?.trim();
  if (!key) {
    throw new HttpError(
      503,
      `${name} is not configured. Add it to frontend/.dev.vars (local dev) or your worker secrets (deployed), then restart.`,
    );
  }
  return key;
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function outboundFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  // DEV_FORWARDER_URL routes all provider calls through scripts/dev-forwarder.mjs
  // (local dev behind a system proxy — workerd ignores HTTP(S)_PROXY).
  const env = await getEnv();
  const forwarder = env.DEV_FORWARDER_URL?.trim().replace(/\/$/, "");
  const target = forwarder ? `${forwarder}/${url}` : url;
  return fetch(target, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const response = await outboundFetch(url, init, timeoutMs);
  const text = await response.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new HttpError(502, `${new URL(url).host} returned a non-JSON response (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    const message =
      (payload as { error?: { message?: string }; message?: string; base_resp?: { status_msg?: string } })?.error?.message ??
      (payload as { message?: string })?.message ??
      (payload as { base_resp?: { status_msg?: string } })?.base_resp?.status_msg ??
      `HTTP ${response.status}`;
    throw new HttpError(response.status === 401 || response.status === 403 ? 503 : 502, message);
  }
  return payload;
}

function toDataUrl(mimeType: string, base64: string) {
  // Providers can return JPEG bytes even when no output format was requested.
  const type = base64.startsWith("/9j/") ? "image/jpeg"
    : base64.startsWith("iVBORw0KGgo") ? "image/png" : mimeType || "image/png";
  return `data:${type};base64,${base64}`;
}

async function fetchAsDataUrl(url: string, timeoutMs = 30_000): Promise<string> {
  const response = await outboundFetch(url, {}, timeoutMs);
  if (!response.ok) throw new HttpError(502, `Could not download the generated image (HTTP ${response.status}).`);
  const buffer = await response.arrayBuffer();
  const mimeType = response.headers.get("content-type")?.split(";")[0] || "image/png";
  return toDataUrl(mimeType, bufferToBase64(buffer));
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function roundTo(value: number, step: number, min: number) {
  return Math.max(min, Math.round(value / step) * step);
}

function pixelsForRatio(ratio: string, longSide: number, step: number): { width: number; height: number } {
  const [rw, rh] = ratio.split(":").map(Number);
  if (!rw || !rh) return { width: longSide, height: longSide };
  if (rw >= rh) {
    return { width: longSide, height: roundTo((longSide * rh) / rw, step, step) };
  }
  return { width: roundTo((longSide * rw) / rh, step, step), height: longSide };
}

async function generateWithGemini(prompt: string, ratio: string | undefined, env: Env): Promise<string> {
  const key = requireKey(env, "GEMINI_API_KEY");
  const model = env.GEMINI_MODEL?.trim() || GEMINI_MODEL;
  const aspectRatio = ratio && (GEMINI_RATIOS.has(ratio) ? ratio : GEMINI_RATIO_FALLBACK[ratio]);
  const payload = await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
          ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}),
        },
      }),
    },
    120_000,
  );
  const parts = (payload as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> } }> })
    ?.candidates?.[0]?.content?.parts;
  const image = parts?.find((part) => part.inlineData?.data);
  if (!image?.inlineData?.data) {
    throw new HttpError(502, "Gemini returned no image — the prompt may have been blocked by safety filters.");
  }
  return toDataUrl(image.inlineData.mimeType ?? "image/png", image.inlineData.data);
}

async function generateWithFlux(
  prompt: string,
  ratio: string | undefined,
  custom: { width?: number; height?: number },
  env: Env,
): Promise<string> {
  const key = requireKey(env, "FLUX_API_KEY");
  const model = env.FLUX_MODEL?.trim() || FLUX_MODEL;
  const size = custom.width && custom.height
    ? { width: roundTo(custom.width, 32, 64), height: roundTo(custom.height, 32, 64) }
    : pixelsForRatio(ratio ?? "1:1", 1024, 32);
  const submitted = (await fetchJson(
    `https://api.bfl.ai/v1/${model}`,
    {
      method: "POST",
      headers: { "x-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, ...size, output_format: "png" }),
    },
    30_000,
  )) as { id?: string };
  if (!submitted.id) throw new HttpError(502, "FLUX did not accept the task.");

  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_600));
    const result = (await fetchJson(
      `https://api.bfl.ai/v1/get_result?id=${encodeURIComponent(submitted.id)}`,
      { headers: { "x-key": key } },
      30_000,
    )) as { status?: string; result?: { sample?: string } };
    if (result.status === "Ready" && result.result?.sample) {
      return fetchAsDataUrl(result.result.sample);
    }
    if (result.status === "Error" || result.status === "Content Moderated") {
      throw new HttpError(502, `FLUX could not generate this image (${result.status}).`);
    }
  }
  throw new HttpError(504, "FLUX took too long — try again.");
}

async function generateWithSeedream(
  prompt: string,
  ratio: string | undefined,
  custom: { width?: number; height?: number },
  env: Env,
): Promise<string> {
  const key = requireKey(env, "ARK_API_KEY");
  const base = (env.ARK_BASE_URL?.trim() || ARK_BASE_URL).replace(/\/+$/, "");
  const model = env.ARK_MODEL?.trim() || ARK_MODEL;
  const size = custom.width && custom.height
    ? `${roundTo(custom.width, 8, 512)}x${roundTo(custom.height, 8, 512)}`
    : (() => {
        const { width, height } = pixelsForRatio(ratio ?? "1:1", 2048, 8);
        return `${width}x${height}`;
      })();
  const payload = (await fetchJson(
    `${base}/api/v3/images/generations`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, size, response_format: "b64_json", watermark: false }),
    },
    120_000,
  )) as { data?: Array<{ b64_json?: string; url?: string }> };
  const image = payload.data?.[0];
  if (image?.b64_json) return toDataUrl("image/png", image.b64_json);
  if (image?.url) return fetchAsDataUrl(image.url);
  throw new HttpError(502, "Seedream returned no image.");
}

async function generateWithMinimax(
  prompt: string,
  ratio: string | undefined,
  custom: { width?: number; height?: number },
  env: Env,
): Promise<string> {
  const key = requireKey(env, "MINIMAX_API_KEY");
  const base = (env.MINIMAX_BASE_URL?.trim() || MINIMAX_BASE_URL).replace(/\/+$/, "");
  if (prompt.length > 1500) throw new HttpError(400, "MiniMax prompts must be at most 1500 characters, including the style preset.");
  const aspectRatio = ratio && (MINIMAX_RATIOS.has(ratio) ? ratio : ratio === "4:5" ? "3:4" : undefined);
  const body: Record<string, unknown> = { model: MINIMAX_MODEL, prompt, response_format: "base64" };
  if (custom.width && custom.height) {
    body.width = Math.min(2048, Math.max(512, roundTo(custom.width, 8, 512)));
    body.height = Math.min(2048, Math.max(512, roundTo(custom.height, 8, 512)));
  } else {
    body.aspect_ratio = aspectRatio ?? "1:1";
  }
  const payload = (await fetchJson(
    `${base}/v1/image_generation`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    120_000,
  )) as { data?: { image_base64?: string[]; image_urls?: string[] }; base_resp?: { status_code?: number; status_msg?: string } };
  if (payload.base_resp?.status_code) {
    throw new HttpError(502, payload.base_resp.status_msg || "MiniMax could not generate this image.");
  }
  const base64 = payload.data?.image_base64?.[0];
  if (base64) return toDataUrl("image/png", base64);
  const url = payload.data?.image_urls?.[0];
  if (url) return fetchAsDataUrl(url);
  throw new HttpError(502, payload.base_resp?.status_msg || "MiniMax returned no image.");
}

export async function POST(request: Request) {
  let body: GenerateRequest;
  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid request body." }, 400);
  if (typeof body.prompt !== "string") return json({ error: "Prompt must be a string." }, 400);
  const prompt = body.prompt.trim();
  if (!prompt) return json({ error: "Prompt is required." }, 400);
  if (prompt.length > 4000) return json({ error: "Prompt is too long (max 4000 characters)." }, 400);
  if (body.aspectRatio !== undefined && (typeof body.aspectRatio !== "string" || !/^\d{1,2}:\d{1,2}$/.test(body.aspectRatio)
    || body.aspectRatio.split(":").some((value) => Number(value) === 0))) {
    return json({ error: "Invalid aspect ratio." }, 400);
  }
  if (body.width !== undefined || body.height !== undefined) {
    if (![body.width, body.height].every((value) => typeof value === "number" && Number.isInteger(value) && value >= 16 && value <= 4096)) {
      return json({ error: "Width and height must both be integers between 16 and 4096." }, 400);
    }
  }

  const env = await getEnv();
  const custom = { width: body.width, height: body.height };
  try {
    switch (body.model) {
      case "gemini":
        return json({ image: await generateWithGemini(prompt, body.aspectRatio, env) });
      case "flux":
        return json({ image: await generateWithFlux(prompt, body.aspectRatio, custom, env) });
      case "seedance": // Compatibility with saved preferences and older clients.
      case "seedream":
        return json({ image: await generateWithSeedream(prompt, body.aspectRatio, custom, env) });
      case "minimax":
        return json({ image: await generateWithMinimax(prompt, body.aspectRatio, custom, env) });
      default:
        return json({ error: `Unknown model "${body.model}".` }, 400);
    }
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    if (error instanceof Error && error.name === "TimeoutError") {
      return json({ error: "The provider took too long to respond. Try again." }, 504);
    }
    return json({ error: error instanceof Error ? error.message : "Generation failed." }, 500);
  }
}
