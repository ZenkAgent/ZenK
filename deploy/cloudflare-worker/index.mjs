const CONFIG_KEY = "nav-config";
const DEFAULT_GITHUB_CONFIG_PATH = "nav-config.json";
const DEFAULT_GITHUB_BRANCH = "main";
const DEFAULT_GITHUB_COMMIT_MESSAGE = "Sync nav-config.json from nav worker";

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

function encodeGitHubPath(path) {
  return String(path || DEFAULT_GITHUB_CONFIG_PATH)
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function encodeBase64Utf8(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function getGitHubSyncConfig(env) {
  const owner = env.GITHUB_REPO_OWNER && env.GITHUB_REPO_OWNER.trim();
  const repo = env.GITHUB_REPO_NAME && env.GITHUB_REPO_NAME.trim();
  if (!owner || !repo || !env.GITHUB_TOKEN) {
    return { enabled: false };
  }
  return {
    enabled: true,
    owner,
    repo,
    branch: env.GITHUB_REPO_BRANCH && env.GITHUB_REPO_BRANCH.trim() ? env.GITHUB_REPO_BRANCH.trim() : DEFAULT_GITHUB_BRANCH,
    path: env.GITHUB_CONFIG_PATH && env.GITHUB_CONFIG_PATH.trim() ? env.GITHUB_CONFIG_PATH.trim() : DEFAULT_GITHUB_CONFIG_PATH,
    message: env.GITHUB_COMMIT_MESSAGE && env.GITHUB_COMMIT_MESSAGE.trim() ? env.GITHUB_COMMIT_MESSAGE.trim() : DEFAULT_GITHUB_COMMIT_MESSAGE
  };
}

async function syncConfigToGitHub(env, config) {
  const syncConfig = getGitHubSyncConfig(env);
  if (!syncConfig.enabled) {
    return { enabled: false };
  }

  const encodedPath = encodeGitHubPath(syncConfig.path);
  const baseUrl = `https://api.github.com/repos/${encodeURIComponent(syncConfig.owner)}/${encodeURIComponent(syncConfig.repo)}/contents/${encodedPath}`;
  const readUrl = `${baseUrl}?ref=${encodeURIComponent(syncConfig.branch)}`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "zenk-nav-config-worker",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  let sha = "";
  const currentFileResponse = await fetch(readUrl, { headers });
  if (currentFileResponse.status === 200) {
    const currentFile = await currentFileResponse.json();
    sha = currentFile && currentFile.sha ? String(currentFile.sha) : "";
  } else if (currentFileResponse.status !== 404) {
    const errorText = await currentFileResponse.text();
    throw new Error(`github_read_failed:${currentFileResponse.status}:${errorText.slice(0, 160)}`);
  }

  const payload = {
    message: syncConfig.message,
    branch: syncConfig.branch,
    content: encodeBase64Utf8(`${JSON.stringify(config, null, 2)}\n`)
  };
  if (sha) payload.sha = sha;

  const writeResponse = await fetch(baseUrl, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload)
  });

  if (!writeResponse.ok) {
    const errorText = await writeResponse.text();
    throw new Error(`github_write_failed:${writeResponse.status}:${errorText.slice(0, 160)}`);
  }

  const writeResult = await writeResponse.json().catch(() => null);
  return {
    enabled: true,
    ok: true,
    branch: syncConfig.branch,
    path: syncConfig.path,
    commitSha: writeResult && writeResult.commit && writeResult.commit.sha ? String(writeResult.commit.sha) : ""
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
      let githubSync = { enabled: false };
      try {
        githubSync = await syncConfigToGitHub(env, config);
      } catch (error) {
        githubSync = {
          enabled: getGitHubSyncConfig(env).enabled,
          ok: false,
          error: error instanceof Error ? error.message : "github_sync_failed"
        };
      }
      return jsonResponse({ ok: true, config, githubSync }, env, request, { status: 200 });
    } catch (error) {
      return jsonResponse({ error: error instanceof Error ? error.message : "save_failed" }, env, request, { status: 500 });
    }
  }
};
