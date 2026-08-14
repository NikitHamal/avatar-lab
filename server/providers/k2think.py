"""Proxy for www.k2think.ai/guest (MBZUAI K2 Think V2 reasoning model).

Guest mode needs no login, no cookies and no anti-bot tokens: a plain OpenAI-
style POST to ``/api/guest/chat/completions`` returns an SSE stream. The
reasoning model emits cumulative content events wrapped in
``<details type="reasoning">`` tags; the final answer follows the closing tag.
"""
import json
import logging
import re
from typing import Dict, Generator, List, Optional

try:
    from curl_cffi.requests import Session as CurlSession
    _USE_CURL = True
except ImportError:
    import requests as _requests
    _USE_CURL = False

logger = logging.getLogger(__name__)

K2THINK_URL = "https://www.k2think.ai"
CHAT_ENDPOINT = f"{K2THINK_URL}/api/guest/chat/completions"
REQUEST_TIMEOUT = 300

MODELS = [
    {"id": "MBZUAI-IFM/K2-Think-v2", "name": "K2 Think V2", "reasoning": True, "vision": False, "web_search": False},
]

MODEL_MAP = {m["id"]: m for m in MODELS}

_BROWSER_HEADERS = {
    "accept": "text/event-stream, application/json",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    "origin": K2THINK_URL,
    "referer": f"{K2THINK_URL}/guest",
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
            "provider": "k2think",
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


def _strip_markup(delta: str) -> str:
    delta = re.sub(r"<details\b[^>]*>", "", delta)
    delta = re.sub(r"<summary\b[^>]*>.*?</summary>", "", delta, flags=re.DOTALL)
    delta = delta.replace("</details>", "")
    return delta.strip()


def _parse_content(content: str):
    idx = content.rfind("</details>")
    if idx == -1:
        return _strip_markup(content), ""
    reasoning = _strip_markup(content[:idx])
    return reasoning, content[idx + len("</details>"):].lstrip("\n")


def stream_chat(
    messages: List[Dict[str, str]],
    model: str = "MBZUAI-IFM/K2-Think-v2",
) -> Generator[Dict, None, None]:
    if model not in MODEL_MAP:
        yield {"type": "error", "error": f"Unknown model '{model}'"}
        return

    payload = {
        "stream": True,
        "model": model,
        "messages": messages,
        "params": {},
        "features": {"web_search": False},
    }

    session = _create_session()
    try:
        resp = session.post(CHAT_ENDPOINT, json=payload, stream=True, timeout=REQUEST_TIMEOUT)
        if resp.status_code != 200:
            body = resp.text[:300]
            yield {"type": "error", "error": f"K2Think HTTP {resp.status_code}: {body}"}
            return

        prev_reasoning = ""
        prev_answer = ""
        saw_any = False
        buffer = ""
        try:
            for chunk_bytes in resp.iter_content():
                if chunk_bytes is None:
                    continue
                buffer += chunk_bytes.decode("utf-8", errors="replace")
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip("\r")
                    if not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if not raw:
                        continue
                    try:
                        ev = json.loads(raw)
                    except (json.JSONDecodeError, ValueError):
                        continue
                    if "task_id" in ev:
                        continue
                    if "content" in ev:
                        saw_any = True
                        reasoning, answer = _parse_content(ev.get("content") or "")
                        if reasoning.startswith(prev_reasoning):
                            r_delta = reasoning[len(prev_reasoning):]
                        else:
                            r_delta = ""
                        prev_reasoning = reasoning
                        if r_delta.strip():
                            yield {"type": "thought", "content": r_delta}
                        if answer.startswith(prev_answer):
                            a_delta = answer[len(prev_answer):]
                        else:
                            a_delta = answer
                        prev_answer = answer
                        if a_delta.strip():
                            yield {"type": "text", "content": a_delta}
        except Exception as exc:
            # The upstream closes the stream uncleanly after the final event.
            if saw_any:
                logger.warning("K2Think stream ended after content: %s", exc)
                yield {"type": "done", "finish_reason": "stop"}
                return
            yield {"type": "error", "error": f"stream failed: {exc}"}
            return

        if not saw_any:
            yield {"type": "error", "error": "stream ended without content"}
            return
        yield {"type": "done", "finish_reason": "stop"}
    finally:
        try:
            session.close()
        except Exception:
            pass
