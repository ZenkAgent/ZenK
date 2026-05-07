const CONFIG_KEY = "nav-config";

const DEFAULT_CONFIG = {
  version: 1,
  updatedAt: "2026-05-07T00:00:00+08:00",
  items: [
    { id: "concept", name: "产品概念", url: "#concept", parentId: "", order: 10 },
    { id: "domains", name: "产品域", url: "#domains", parentId: "", order: 20 },
    { id: "mindmap", name: "能力导图", url: "#mindmap", parentId: "", order: 30 },
    { id: "modules", name: "研发模块", url: "#modules", parentId: "", order: 40 },
    { id: "milestones", name: "月度里程碑", url: "#milestones", parentId: "", order: 50 },
    { id: "delivery", name: "执行方式", url: "#delivery", parentId: "", order: 60 },
    { id: "product-form", name: "产品形态", url: "#product-form", parentId: "", order: 70 },
    { id: "scenarios", name: "典型场景", url: "#scenarios", parentId: "", order: 80 },
    { id: "cases", name: "预期效果", url: "#cases", parentId: "", order: 90 }
  ]
};

function withCorsHeaders(env, request) {
  const requestOrigin = request.headers.get("Origin");
  const allowedOrigin = env.ALLOWED_ORIGIN && env.ALLOWED_ORIGIN.trim() ? env.ALLOWED_ORIGIN.trim() : "*";
  const origin = allowedOrigin === "*" ? "*" : requestOrigin === allowedOrigin ? allowedOrigin : allowedOrigin;
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Admin-Password",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store"
  };
}

function jsonResponse(payload, env, request, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", "application/json; charset=utf-8");
  const corsHeaders = withCorsHeaders(env, request);
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(JSON.stringify(payload), { ...init, headers });
}

function sanitizeItem(item, index) {
  const rawItem = item && typeof item === "object" ? item : {};
  const rawOrder = Number.isFinite(Number(rawItem.order)) ? Number(rawItem.order) : (index + 1) * 10;
  return {
    id: String(rawItem.id || `nav-${index + 1}`),
    name: String(rawItem.name || "未命名导航").trim(),
    url: String(rawItem.url || "#").trim(),
    parentId: String(rawItem.parentId || "").trim(),
    order: rawOrder
  };
}

function normalizeConfig(payload) {
  const rawItems = Array.isArray(payload && payload.items) ? payload.items : DEFAULT_CONFIG.items;
  const items = rawItems.map((item, index) => sanitizeItem(item, index));
  const idMap = new Map(items.map((item) => [item.id, item]));
  const validItems = items
    .map((item) => {
      if (!item.name || !item.url) return null;
      if (item.parentId === item.id || !idMap.has(item.parentId)) item.parentId = "";
      else if (item.parentId && idMap.get(item.parentId)?.parentId) item.parentId = "";
      return item;
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "zh-CN"));
  return {
    version: 1,
    updatedAt: payload && payload.updatedAt ? String(payload.updatedAt) : new Date().toISOString(),
    items: validItems
  };
}

async function loadConfig(env) {
  if (!env.NAV_CONFIG_KV) return DEFAULT_CONFIG;
  const stored = await env.NAV_CONFIG_KV.get(CONFIG_KEY, "json");
  return normalizeConfig(stored || DEFAULT_CONFIG);
}

async function saveConfig(env, payload) {
  if (!env.NAV_CONFIG_KV) {
    throw new Error("missing_kv_binding");
  }
  const config = normalizeConfig(payload);
  await env.NAV_CONFIG_KV.put(CONFIG_KEY, JSON.stringify(config));
  return config;
}

async function readBody(request) {
  try {
    const payload = await request.json();
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return null;
  }
}

function isAuthorized(env, request) {
  return env.NAV_ADMIN_PASSWORD && request.headers.get("X-Admin-Password") === env.NAV_ADMIN_PASSWORD;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return jsonResponse({ ok: true }, env, request, { status: 200 });
    }

    if (url.pathname === "/healthz") {
      return jsonResponse({ ok: true, service: "zenk-nav-config-worker" }, env, request, { status: 200 });
    }

    if (url.pathname !== "/api/nav-config") {
      return jsonResponse({ error: "not_found" }, env, request, { status: 404 });
    }

    if (request.method === "GET") {
      const config = await loadConfig(env);
      return jsonResponse(config, env, request, { status: 200 });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, env, request, { status: 405 });
    }

    if (!env.NAV_ADMIN_PASSWORD) {
      return jsonResponse({ error: "admin_password_not_configured" }, env, request, { status: 503 });
    }

    if (!isAuthorized(env, request)) {
      return jsonResponse({ error: "forbidden" }, env, request, { status: 403 });
    }

    const payload = await readBody(request);
    if (!payload) {
      return jsonResponse({ error: "invalid_json" }, env, request, { status: 400 });
    }

    if (payload.verifyOnly === true) {
      return jsonResponse({ ok: true }, env, request, { status: 200 });
    }

    try {
      const config = await saveConfig(env, payload);
      return jsonResponse({ ok: true, config }, env, request, { status: 200 });
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : "save_failed" }, env, request, { status: 500 });
    }
  }
};
