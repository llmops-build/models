interface Env {
  MODELS_BUCKET: R2Bucket;
}

const CORS_HEADERS: HeadersInit = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
      ...CORS_HEADERS,
    },
  });
}

async function handleModelConfig(
  env: Env,
  category: "pricing" | "general",
  provider: string,
  model: string
): Promise<Response> {
  if (!/^[a-z0-9_-]+$/i.test(provider)) {
    return jsonResponse({ error: "Invalid provider" }, 400);
  }

  const objectKey = `${category}/${provider}.json`;
  const object = await env.MODELS_BUCKET.get(objectKey);

  if (!object) {
    return jsonResponse({ error: "Provider not found" }, 404);
  }

  const data = await object.json<Record<string, any>>();
  const decodedModel = decodeURIComponent(model);

  if (!(decodedModel in data)) {
    return jsonResponse({ error: "Model not found" }, 404);
  }

  const modelData = data[decodedModel];

  if (category === "pricing") {
    return jsonResponse(modelData.pricing_config ?? null);
  }

  return jsonResponse(modelData);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // Route: /model-configs/(pricing|general)/{provider}/{model}
    // Model names can contain slashes, so .+ captures the rest
    const match = path.match(
      /^\/model-configs\/(pricing|general)\/([^/]+)\/(.+)$/
    );

    if (match) {
      const [, category, provider, model] = match;
      return handleModelConfig(
        env,
        category as "pricing" | "general",
        provider,
        model
      );
    }

    if (path === "/" || path === "/health") {
      return jsonResponse({ status: "ok" });
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
};
