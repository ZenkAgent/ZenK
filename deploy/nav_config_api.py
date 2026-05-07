#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import tempfile
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


BASE_DIR = Path(__file__).resolve().parents[1]
CONFIG_PATH = Path(os.environ.get("ZENK_NAV_CONFIG_PATH", BASE_DIR / "nav-config.json")).expanduser()
HOST = os.environ.get("ZENK_NAV_API_HOST", "127.0.0.1")
PORT = int(os.environ.get("ZENK_NAV_API_PORT", "8787"))
ADMIN_PASSWORD = os.environ.get("ZENK_NAV_ADMIN_PASSWORD", "")

DEFAULT_CONFIG = {
    "version": 1,
    "updatedAt": "2026-05-07T00:00:00+08:00",
    "items": [
        {"id": "concept", "name": "产品概念", "url": "#concept", "parentId": "", "order": 10},
        {"id": "domains", "name": "产品域", "url": "#domains", "parentId": "", "order": 20},
        {"id": "mindmap", "name": "能力导图", "url": "#mindmap", "parentId": "", "order": 30},
        {"id": "modules", "name": "研发模块", "url": "#modules", "parentId": "", "order": 40},
        {"id": "milestones", "name": "月度里程碑", "url": "#milestones", "parentId": "", "order": 50},
        {"id": "delivery", "name": "执行方式", "url": "#delivery", "parentId": "", "order": 60},
        {"id": "product-form", "name": "产品形态", "url": "#product-form", "parentId": "", "order": 70},
        {"id": "scenarios", "name": "典型场景", "url": "#scenarios", "parentId": "", "order": 80},
        {"id": "cases", "name": "预期效果", "url": "#cases", "parentId": "", "order": 90},
    ],
}


def sort_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(items, key=lambda item: (int(item.get("order", 0)), str(item.get("name", ""))))


def sanitize_item(item: dict[str, Any], index: int) -> dict[str, Any]:
    raw_id = str(item.get("id") or f"nav-{index + 1}")
    raw_name = str(item.get("name") or "未命名导航").strip()
    raw_url = str(item.get("url") or "#").strip()
    raw_parent = str(item.get("parentId") or "").strip()
    raw_order = item.get("order", (index + 1) * 10)
    try:
        raw_order = int(raw_order)
    except (TypeError, ValueError):
        raw_order = (index + 1) * 10
    return {
        "id": raw_id,
        "name": raw_name,
        "url": raw_url,
        "parentId": raw_parent,
        "order": raw_order,
    }


def normalize_config(payload: dict[str, Any]) -> dict[str, Any]:
    items = payload.get("items")
    if not isinstance(items, list):
        raise ValueError("items must be a list")

    normalized = [sanitize_item(item if isinstance(item, dict) else {}, index) for index, item in enumerate(items)]
    id_map = {item["id"]: item for item in normalized}
    valid_items: list[dict[str, Any]] = []

    for item in normalized:
        if not item["name"] or not item["url"]:
            continue
        parent_id = item["parentId"]
        if parent_id == item["id"] or parent_id not in id_map:
            item["parentId"] = ""
        elif id_map[parent_id].get("parentId"):
            item["parentId"] = ""
        valid_items.append(item)

    return {
        "version": 1,
        "updatedAt": str(payload.get("updatedAt") or DEFAULT_CONFIG["updatedAt"]),
        "items": sort_items(valid_items),
    }


def load_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        return DEFAULT_CONFIG
    try:
        return normalize_config(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
    except (json.JSONDecodeError, OSError, ValueError):
        return DEFAULT_CONFIG


def save_config(payload: dict[str, Any]) -> dict[str, Any]:
    config = normalize_config(payload)
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False, dir=str(CONFIG_PATH.parent)) as temp_file:
        json.dump(config, temp_file, ensure_ascii=False, indent=2)
        temp_file.write("\n")
        temp_path = Path(temp_file.name)
    temp_path.replace(CONFIG_PATH)
    return config


class NavConfigHandler(BaseHTTPRequestHandler):
    server_version = "ZenkNavConfigAPI/1.0"

    def do_GET(self) -> None:
        if not self._is_nav_config_path():
            self._write_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return
        self._write_json(HTTPStatus.OK, load_config())

    def do_POST(self) -> None:
        if not self._is_nav_config_path():
            self._write_json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return
        if not ADMIN_PASSWORD:
            self._write_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "admin_password_not_configured"})
            return
        if self.headers.get("X-Admin-Password", "") != ADMIN_PASSWORD:
            self._write_json(HTTPStatus.FORBIDDEN, {"error": "forbidden"})
            return

        payload = self._read_json_body()
        if payload is None:
            return
        if payload.get("verifyOnly") is True:
            self._write_json(HTTPStatus.OK, {"ok": True})
            return

        try:
            config = save_config(payload)
        except ValueError as error:
            self._write_json(HTTPStatus.BAD_REQUEST, {"error": "invalid_payload", "message": str(error)})
            return

        self._write_json(HTTPStatus.OK, {"ok": True, "config": config})

    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def _is_nav_config_path(self) -> bool:
        return urlparse(self.path).path == "/api/nav-config"

    def _read_json_body(self) -> dict[str, Any] | None:
        length_header = self.headers.get("Content-Length", "0")
        try:
            content_length = int(length_header)
        except ValueError:
            content_length = 0
        raw_body = self.rfile.read(content_length) if content_length > 0 else b"{}"
        try:
            payload = json.loads(raw_body.decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._write_json(HTTPStatus.BAD_REQUEST, {"error": "invalid_json"})
            return None
        if not isinstance(payload, dict):
            self._write_json(HTTPStatus.BAD_REQUEST, {"error": "invalid_payload"})
            return None
        return payload

    def _write_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), NavConfigHandler)
    print(f"Serving nav config API on http://{HOST}:{PORT}/api/nav-config")
    print(f"Config file: {CONFIG_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    main()
