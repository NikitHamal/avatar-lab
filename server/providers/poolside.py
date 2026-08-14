"""Proxy for chat.poolside.ai/guest (Poolside Laguna S 2.1 / XS 2.1).

Guest chat needs no login, no cookies and no anti-bot tokens. The flow is:
1. POST /api/chats -> creates a chat, returns its id
2. POST /api/chat   -> submits a message, returns 202 + generationId/streamUrl
3. GET  /api/chat/{id}/stream?generationId=... -> typed SSE stream whose
   text-delta events carry the answer.
"""
import json
import logging
import uuid
from typing import Dict, Generator, List, Optional

try:
    from curl_cffi.requests import Session as CurlSession
    _USE_CURL = True
except ImportError:
    import requests as _requests
    _USE_CURL = False

logger = logging.getLogger(__name__)

BASE_URL = "https://chat.poolside.ai"
CHATS_ENDPOINT = f"{BASE_URL}/api/chats"
CHAT_ENDPOINT = f"{BASE_URL}/api/chat"
REQUEST_TIMEOUT = 300

MODELS = [
    {"id": "laguna-s-2.1", "name": "Laguna S 2.1", "reasoning": False, "vision": False, "web_search": True},
    {"id": "laguna-xs-2.1", "name": "Laguna XS 2.1", "reasoning": False, "vision": False, "web_search": True},
]

MODEL_MAP = {m["id"]: m for m in MODELS}

_BROWSER_HEADERS = {
    "accept": "application/json, text/event-stream",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    "origin": BASE_URL,
    "referer": f"{BASE_URL}/guest",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
}


def _create_session():
    if _USE_CURL:
        return CurlSession(headers=_BROWSER_HEADERS, impersonate="chrome")
    s = _requests.Session()
    s.headers.update(_BROWSER_HEADERS)
    return s


def get_models() -> List[Dict]:
    return [
        {
            "id": m["id"],
            "name": m["name"],
            "provider": "poolside",
            "capabilities": {
                "chat": True,
                "stream": True,
                "vision": m.get("vision", False),
                "thinking": m.get("reasoning", False),
                "tools": False,
                "web_search": m.get("web_search", False),
            },
        }
        for m in MODELS
    ]


def _flatten_history(messages: List[Dict[str, str]]) -> str:
    parts = []
    for message in messages:
        role = message.get("role", "user")
        content = message.get("content")
        if isinstance(content, list):
            content = "\n".join(
                str(item.get("text", "")) for item in content
                if isinstance(item, dict) and item.get("type") == "text"
            )
        if not content:
            continue
        parts.append(f"{role}: {content}")
    return "\n\n".join(parts)


def stream_chat(
    messages: List[Dict[str, str]],
    model: str = "laguna-s-2.1",
) -> Generator[Dict, None, None]:
    if model not in MODEL_MAP:
        yield {"type": "error", "error": f"Unknown model '{model}'"}
        return

    upstream_model = f"poolside/{model}"
    session = _create_session()
    try:
        try:
            resp = session.post(CHATS_ENDPOINT, json={
                "title": "Avatar Lab",
                "model": upstream_model,
                "inferenceMode": "platform",
                "incognito": False,
            }, timeout=30)
        except Exception as exc:
            yield {"type": "error", "error": f"create-chat failed: {exc}"}
            return
        if resp.status_code != 200:
            yield {"type": "error", "error": f"Poolside create-chat HTTP {resp.status_code}: {resp.text[:300]}"}
            return
        chat_id = resp.json().get("id")
        if not chat_id:
            yield {"type": "error", "error": f"Poolside create-chat missing id: {resp.text[:300]}"}
            return

        message_id = str(uuid.uuid4())
        generation_id = str(uuid.uuid4())
        payload = {
            "chatId": chat_id,
            "model": upstream_model,
            "inferenceMode": "platform",
            "options": {"webSearch": True, "slack": False, "slackWrite": False, "thinking": True},
            "id": chat_id,
            "trigger": "submit-message",
            "messageId": message_id,
            "baseMessageId": None,
            "message": {
                "messageId": message_id,
                "parts": [{"type": "text", "text": _flatten_history(messages)}],
                "id": message_id,
                "role": "user",
            },
            "generationId": generation_id,
        }
        try:
            resp = session.post(
                CHAT_ENDPOINT,
                json=payload,
                headers={"x-poolside-stream-protocol": "resumable-v1"},
                timeout=60,
            )
        except Exception as exc:
            yield {"type": "error", "error": f"send failed: {exc}"}
            return
        if resp.status_code != 202:
            body = resp.text[:300]
            try:
                body = resp.json().get("error") or body
            except Exception:
                pass
            yield {"type": "error", "error": f"Poolside send HTTP {resp.status_code}: {body}"}
            return
        try:
            stream_url = resp.json().get("streamUrl") or ""
        except Exception:
            stream_url = ""
        if not stream_url:
            yield {"type": "error", "error": f"Poolside send missing streamUrl: {resp.text[:300]}"}
            return

        try:
            stream_resp = session.get(
                f"{BASE_URL}{stream_url}",
                headers={"Accept": "text/event-stream"},
                stream=True,
                timeout=REQUEST_TIMEOUT,
            )
        except Exception as exc:
            yield {"type": "error", "error": f"stream connect failed: {exc}"}
            return

        saw_content = False
        buffer = ""
        try:
            for chunk_bytes in stream_resp.iter_content():
                if chunk_bytes is None:
                    continue
                buffer += chunk_bytes.decode("utf-8", errors="replace")
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip("\r")
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if not raw or raw == "[DONE]":
                        continue
                    try:
                        ev = json.loads(raw)
                    except (json.JSONDecodeError, ValueError):
                        continue
                    ev_type = ev.get("type")
                    if ev_type == "text-delta":
                        delta = ev.get("delta") or ""
                        if delta:
                            saw_content = True
                            yield {"type": "text", "content": delta}
                    elif ev_type == "error":
                        yield {"type": "error", "error": ev.get("error") or "upstream error"}
                        return
                    elif ev_type == "finish":
                        yield {"type": "done", "finish_reason": ev.get("finishReason") or "stop"}
                        return
        except Exception as exc:
            if saw_content:
                yield {"type": "done", "finish_reason": "stop"}
                return
            yield {"type": "error", "error": f"stream read failed: {exc}"}
            return

        yield {"type": "done", "finish_reason": "stop"}
    finally:
        try:
            session.close()
        except Exception:
            pass
