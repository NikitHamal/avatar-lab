"""Standalone Qwen Proxy & File Upload Provider for chat.qwen.ai.

Supports:
- Model catalog (qwen3.8-max, qwen3.8-max-preview, qwen3.7-plus, qwen3.7-max, qwen3.6-plus, qwen3.5-plus, qwen3.5-flash)
- Session pooling with TLS fingerprinting, ssxmod cookies & bx-ua generation
- Multimodal Vision & Document Upload to Alibaba Cloud OSS via STS token signing
- SSE Chat streaming with Thinking deltas, web search, and tool parsing
"""
import base64
import hashlib
import hmac
import json
import logging
import mimetypes
import os
import random
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, Generator, List, Optional
from urllib.parse import quote

try:
    from curl_cffi.requests import Session as _CurlSession
    _USE_CURL_CFFI = True
except ImportError:
    import requests as _requests
    _USE_CURL_CFFI = False

import requests

logger = logging.getLogger(__name__)

QWEN_URL = "https://chat.qwen.ai"
QWEN_PROXY_URL = os.environ.get("QWEN_PROXY_URL") or None


def _check_waf_response(resp):
    if resp.status_code == 403:
        return "Access forbidden (WAF)"
    if resp.status_code in (503, 520, 521, 522, 523, 524):
        return f"WAF/CDN error (HTTP {resp.status_code})"
    if resp.status_code == 200:
        ct = resp.headers.get("content-type", "")
        if "text/html" in ct:
            try:
                text = (resp.text if hasattr(resp, "text")
                        else resp.content.decode("utf-8", "replace"))
                if any(k in text for k in ("aliyun_waf_aa", "captcha", "Challenge")):
                    return "Aliyun WAF JS challenge"
            except Exception:
                pass
    return None


# ========================= Fingerprint Generation =========================

SCREEN_PRESETS = {
    "1920x1080": "1920|1080|283|1080|158|0|1920|1080|1920|922|0|0",
    "1470x956":  "1470|956|283|797|158|0|1470|956|1470|798|0|0",
    "2560x1440": "2560|1440|283|1440|158|0|2560|1440|2560|1282|0|0",
}

PLATFORM_PRESETS = {
    "macIntel": {
        "platform": "MacIntel",
        "webglRenderer": "ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)|Google Inc. (Apple)",
        "vendor": "Google Inc.",
    },
    "macM1": {
        "platform": "MacIntel",
        "webglRenderer": "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)|Google Inc. (Apple)",
        "vendor": "Google Inc.",
    },
    "win64": {
        "platform": "Win32",
        "webglRenderer": "ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)|Google Inc. (NVIDIA)",
        "vendor": "Google Inc.",
    },
}

HASH_FIELDS = {16: "split", 17: "full", 18: "full", 31: "full", 34: "full", 36: "full"}


def _generate_device_id():
    return "".join(random.choice("0123456789abcdef") for _ in range(20))


def _generate_hash():
    return random.randint(0, 0xFFFFFFFF)


_SCREEN_LIST = list(SCREEN_PRESETS.values())


def generate_fingerprint(options=None):
    if options is None:
        options = {}
    platform_key = options.get("platform") or random.choice(["macIntel", "macM1"])
    preset = PLATFORM_PRESETS.get(platform_key, PLATFORM_PRESETS["macIntel"])

    config = {
        "deviceId": _generate_device_id(),
        "sdkVersion": "websdk-2.3.15d",
        "initTimestamp": str(int(time.time() * 1000)),
        "field3": "91",
        "field4": "1|15",
        "language": "zh-CN",
        "timezoneOffset": "-480",
        "colorDepth": "16705151|12791",
        "screenInfo": random.choice(_SCREEN_LIST),
        "field9": "5",
        "platform": preset["platform"],
        "field11": "10",
        "webglRenderer": preset["webglRenderer"],
        "field13": "30|30",
        "field14": "0",
        "field15": "28",
        "pluginCount": "5",
        "vendor": preset["vendor"],
        "field29": "8",
        "touchInfo": "-1|0|0|0|0",
        "field32": "11",
        "field35": "0",
        "mode": "P",
    }
    config.update(options.get("custom", {}))

    current_timestamp = int(time.time() * 1000)
    fields = [
        config["deviceId"], config["sdkVersion"], config["initTimestamp"],
        config["field3"], config["field4"], config["language"],
        config["timezoneOffset"], config["colorDepth"], config["screenInfo"],
        config["field9"], config["platform"], config["field11"],
        config["webglRenderer"], config["field13"], config["field14"],
        config["field15"],
        f'{config["pluginCount"]}|{_generate_hash()}',
        _generate_hash(), _generate_hash(),
        "1", "0", "1", "0", config["mode"],
        "0", "0", "0", "416",
        config["vendor"], config["field29"], config["touchInfo"],
        _generate_hash(), config["field32"], current_timestamp,
        _generate_hash(), config["field35"], random.randint(10, 100),
    ]
    return "^".join(map(str, fields))


# ========================= LZW Compression =========================

CUSTOM_BASE64_CHARS = "DGi0YA7BemWnQjCl4_bR3f8SKIF9tUz/xhr2oEOgPpac=61ZqwTudLkM5vHyNXsVJ"


def _lzw_compress(data, bits, char_func):
    if data is None:
        return ""
    dictionary = {}
    dict_to_create = {}
    c = ""
    wc = ""
    w = ""
    enlarge_in = 2
    dict_size = 3
    num_bits = 2
    result = []
    value = 0
    position = 0

    for i in range(len(data)):
        c = data[i]
        if c not in dictionary:
            dictionary[c] = dict_size
            dict_size += 1
            dict_to_create[c] = True
        wc = w + c
        if wc in dictionary:
            w = wc
        else:
            if w in dict_to_create:
                if ord(w[0]) < 256:
                    for _ in range(num_bits):
                        value = (value << 1)
                        if position == bits - 1:
                            position = 0
                            result.append(char_func(value))
                            value = 0
                        else:
                            position += 1
                    char_code = ord(w[0])
                    for _ in range(8):
                        value = (value << 1) | (char_code & 1)
                        if position == bits - 1:
                            position = 0
                            result.append(char_func(value))
                            value = 0
                        else:
                            position += 1
                        char_code >>= 1
                else:
                    char_code = 1
                    for _ in range(num_bits):
                        value = (value << 1) | char_code
                        if position == bits - 1:
                            position = 0
                            result.append(char_func(value))
                            value = 0
                        else:
                            position += 1
                        char_code = 0
                    char_code = ord(w[0])
                    for _ in range(16):
                        value = (value << 1) | (char_code & 1)
                        if position == bits - 1:
                            position = 0
                            result.append(char_func(value))
                            value = 0
                        else:
                            position += 1
                        char_code >>= 1
                enlarge_in -= 1
                if enlarge_in == 0:
                    enlarge_in = 2 ** num_bits
                    num_bits += 1
                del dict_to_create[w]
            else:
                char_code = dictionary[w]
                for _ in range(num_bits):
                    value = (value << 1) | (char_code & 1)
                    if position == bits - 1:
                        position = 0
                        result.append(char_func(value))
                        value = 0
                    else:
                        position += 1
                    char_code >>= 1
            enlarge_in -= 1
            if enlarge_in == 0:
                enlarge_in = 2 ** num_bits
                num_bits += 1
            dictionary[wc] = dict_size
            dict_size += 1
            w = c

    if w != "":
        if w in dict_to_create:
            if ord(w[0]) < 256:
                for _ in range(num_bits):
                    value = (value << 1)
                    if position == bits - 1:
                        position = 0
                        result.append(char_func(value))
                        value = 0
                    else:
                        position += 1
                char_code = ord(w[0])
                for _ in range(8):
                    value = (value << 1) | (char_code & 1)
                    if position == bits - 1:
                        position = 0
                        result.append(char_func(value))
                        value = 0
                    else:
                        position += 1
                    char_code >>= 1
            else:
                char_code = 1
                for _ in range(num_bits):
                    value = (value << 1) | char_code
                    if position == bits - 1:
                        position = 0
                        result.append(char_func(value))
                        value = 0
                    else:
                        position += 1
                    char_code = 0
                char_code = ord(w[0])
                for _ in range(16):
                    value = (value << 1) | (char_code & 1)
                    if position == bits - 1:
                        position = 0
                        result.append(char_func(value))
                        value = 0
                    else:
                        position += 1
                    char_code >>= 1
            enlarge_in -= 1
            if enlarge_in == 0:
                enlarge_in = 2 ** num_bits
                num_bits += 1
            del dict_to_create[w]
        else:
            char_code = dictionary[w]
            for _ in range(num_bits):
                value = (value << 1) | (char_code & 1)
                if position == bits - 1:
                    position = 0
                    result.append(char_func(value))
                    value = 0
                else:
                    position += 1
                char_code >>= 1
            enlarge_in -= 1
            if enlarge_in == 0:
                enlarge_in = 2 ** num_bits
                num_bits += 1

    char_code = 2
    for _ in range(num_bits):
        value = (value << 1) | (char_code & 1)
        if position == bits - 1:
            position = 0
            result.append(char_func(value))
            value = 0
        else:
            position += 1
        char_code >>= 1

    while True:
        value = (value << 1)
        if position == bits - 1:
            result.append(char_func(value))
            break
        position += 1

    return "".join(result)


def _custom_encode(data, url_safe=True):
    if data is None:
        return ""
    compressed = _lzw_compress(data, 6, lambda index: CUSTOM_BASE64_CHARS[index])
    if not url_safe:
        mod = len(compressed) % 4
        if mod == 1:
            return compressed + "==="
        if mod == 2:
            return compressed + "=="
        if mod == 3:
            return compressed + "="
    return compressed


# ========================= Cookie Generation =========================

def generate_cookies(fingerprint=None):
    if fingerprint is None:
        fingerprint = generate_fingerprint()
    fields = fingerprint.split("^")
    processed = list(fields)
    current_timestamp = int(time.time() * 1000)
    for idx, typ in HASH_FIELDS.items():
        if idx >= len(processed):
            continue
        if typ == "split":
            val = str(processed[idx])
            parts = val.split("|")
            if len(parts) == 2:
                processed[idx] = f"{parts[0]}|{_generate_hash()}"
        elif typ == "full":
            if idx == 36:
                processed[idx] = random.randint(10, 100)
            else:
                processed[idx] = _generate_hash()
    if 33 < len(processed):
        processed[33] = current_timestamp

    ssxmod_itna_data = "^".join(map(str, processed))
    ssxmod_itna = "1-" + _custom_encode(ssxmod_itna_data, True)

    ssxmod_itna2_data = "^".join(map(str, [
        processed[0], processed[1], processed[23],
        0, "", 0, "", "", 0, 0,
        processed[32], processed[33],
        0, 0, 0, 0, 0
    ]))
    ssxmod_itna2 = "1-" + _custom_encode(ssxmod_itna2_data, True)

    return {
        "ssxmod_itna": ssxmod_itna,
        "ssxmod_itna2": ssxmod_itna2,
        "rawData": ssxmod_itna_data,
        "timestamp": current_timestamp,
    }


# ========================= bx-ua Generation =========================

def generate_bx_ua(fingerprint):
    if not fingerprint:
        return ""
    try:
        version = "231"
        timestamp = int(time.time() * 1000)
        fields = fingerprint.split("^")
        payload = {
            "v": version,
            "ts": timestamp,
            "fp": fingerprint,
            "d": {
                "deviceId": fields[0] if len(fields) > 0 else "",
                "sdkVer": fields[1] if len(fields) > 1 else "",
                "lang": fields[5] if len(fields) > 5 else "",
                "tz": fields[6] if len(fields) > 6 else "",
                "platform": fields[10] if len(fields) > 10 else "",
                "renderer": fields[12] if len(fields) > 12 else "",
                "mode": fields[23] if len(fields) > 23 else "",
                "vendor": fields[28] if len(fields) > 28 else "",
            },
            "rnd": random.randint(1000, 9999),
            "seq": 1,
        }
        checksum_str = f"{fingerprint}{timestamp}{payload['rnd']}"
        payload["cs"] = hashlib.md5(checksum_str.encode()).hexdigest()[:8]
        payload_json = json.dumps(payload, separators=(',', ':'))
        seed_hash = hashlib.sha256(fingerprint.encode()).digest()
        key = seed_hash[:16]
        iv = seed_hash[16:32]
        from Crypto.Cipher import AES
        from Crypto.Util.Padding import pad
        cipher = AES.new(key, AES.MODE_CBC, iv)
        encrypted = cipher.encrypt(pad(payload_json.encode(), AES.block_size))
        encrypted_b64 = base64.b64encode(encrypted).decode()
        return f"{version}!{encrypted_b64}"
    except Exception as e:
        logger.warning(f"Failed to generate bx-ua: {e}")
        return ""


# ========================= Session Headers =========================

def build_session_headers(bx_ua=""):
    headers = {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.9",
        "content-type": "application/json",
        "origin": QWEN_URL,
        "referer": f"{QWEN_URL}/",
        "sec-ch-ua": '"Google Chrome";v="138", "Chromium";v="138", "Not.A/Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Linux"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        "x-requested-with": "XMLHttpRequest",
        "source": "web",
        "version": "0.2.63",
        "X-Accel-Buffering": "no",
    }
    if bx_ua:
        headers["bx-ua"] = bx_ua
    return headers


# ========================= Midtoken =========================

_midtoken_cache = {"token": None, "uses": 0}


def get_midtoken(session, force_refresh=False):
    token = _midtoken_cache["token"]
    uses = _midtoken_cache["uses"]
    if token and uses < 50 and not force_refresh:
        _midtoken_cache["uses"] = uses + 1
        return token
    try:
        resp = session.get("https://sg-wum.alibaba.com/w/wu.json", timeout=10)
        resp.encoding = "utf-8"
        if resp.status_code == 200:
            match = re.search(r"(?:umx\.wu|__fycb)\('([^']+)'\)", resp.text)
            if match:
                _midtoken_cache["token"] = match.group(1)
                _midtoken_cache["uses"] = 1
                return match.group(1)
    except Exception as e:
        logger.warning(f"Error fetching midtoken: {e}")
    return None


# ========================= Session Management (Pool) =========================

_session_pool = []
_pool_lock = threading.Lock()

POOL_TARGET_SIZE = 4
SESSION_MSG_LIMIT = 14
SESSION_TTL = 900
_POOL_REFILL_INTERVAL = 120
_pool_refill_thread_started = False


def _create_fresh_session():
    cookies_data = generate_cookies()
    bx_ua = generate_bx_ua(cookies_data.get("rawData", ""))
    headers = build_session_headers(bx_ua)

    if _USE_CURL_CFFI:
        session = _CurlSession(impersonate="chrome", headers=headers, proxies={"https": QWEN_PROXY_URL, "http": QWEN_PROXY_URL} if QWEN_PROXY_URL else {})
    else:
        session = requests.Session()
        session.headers.update(headers)

    cookie_dict = {
        "ssxmod_itna": cookies_data["ssxmod_itna"],
        "ssxmod_itna2": cookies_data["ssxmod_itna2"],
    }
    for k, v in cookie_dict.items():
        session.cookies.set(k, v, domain="chat.qwen.ai")

    midtoken_session = requests.Session()
    midtoken_session.headers.update(headers)
    midtoken = get_midtoken(midtoken_session)
    if midtoken:
        session.headers["bx-umidtoken"] = midtoken
        session.headers["bx-v"] = "2.5.36"
    session.headers["x-request-id"] = str(uuid.uuid4())

    try:
        session.get(f"{QWEN_URL}/", timeout=15, allow_redirects=True)
    except Exception as e:
        logger.debug(f"Qwen warmup: {e}")

    return session, cookies_data


def _add_pool_entry():
    session, cookies = _create_fresh_session()
    entry = {
        'session': session,
        'cookies': cookies,
        'created_at': time.time(),
        'msg_count': 0,
    }
    _session_pool.append(entry)
    return entry


def _prune_pool():
    now = time.time()
    _session_pool[:] = [
        e for e in _session_pool
        if e['msg_count'] < SESSION_MSG_LIMIT
        and (now - e['created_at']) < SESSION_TTL
    ]


def _pool_refill_loop():
    while True:
        time.sleep(_POOL_REFILL_INTERVAL + random.uniform(0, 30))
        try:
            with _pool_lock:
                _prune_pool()
                need = POOL_TARGET_SIZE - len(_session_pool)
            for _ in range(need):
                try:
                    with _pool_lock:
                        _add_pool_entry()
                except Exception as e:
                    logger.debug(f"Pool refill failed: {e}")
                    break
        except Exception as e:
            logger.debug(f"Pool refill error: {e}")


def _start_refill_thread():
    global _pool_refill_thread_started
    if _pool_refill_thread_started:
        return
    _pool_refill_thread_started = True
    t = threading.Thread(target=_pool_refill_loop, daemon=True, name='qwen-pool-refill')
    t.start()


def _get_session():
    with _pool_lock:
        _prune_pool()
        if not _session_pool:
            _add_pool_entry()
        _session_pool.sort(key=lambda e: e['msg_count'])
        winner = _session_pool[0]
        return winner['session'], winner['cookies']


def _mark_failed(session):
    with _pool_lock:
        _session_pool[:] = [e for e in _session_pool if e['session'] is not session]


def _mark_used(session):
    with _pool_lock:
        for entry in _session_pool:
            if entry['session'] is session:
                entry['msg_count'] += 1
                break


_start_refill_thread()


# ========================= Model Catalog =========================

FALLBACK_MODELS = [
    {
        "id": "qwen3.8-max",
        "name": "Qwen3.8-Max",
        "provider": "qwen",
        "capabilities": {"vision": True, "document": True, "video": True, "audio": True, "thinking": True, "search": True},
        "max_context_length": 1000000,
        "is_active": True,
    },
    {
        "id": "qwen3.8-max-preview",
        "name": "Qwen3.8-Max-Preview",
        "provider": "qwen",
        "capabilities": {"vision": True, "document": True, "video": True, "audio": True, "thinking": True, "search": True},
        "max_context_length": 1000000,
        "is_active": True,
    },
    {
        "id": "qwen3.7-plus",
        "name": "Qwen3.7-Plus",
        "provider": "qwen",
        "capabilities": {"vision": True, "document": True, "video": True, "audio": True, "thinking": True, "search": True},
        "max_context_length": 1000000,
        "is_active": True,
    },
    {
        "id": "qwen3.7-max",
        "name": "Qwen3.7-Max",
        "provider": "qwen",
        "capabilities": {"vision": False, "document": True, "video": False, "audio": False, "thinking": True, "search": False},
        "max_context_length": 1000000,
        "is_active": True,
    },
    {
        "id": "qwen3.6-plus",
        "name": "Qwen3.6-Plus",
        "provider": "qwen",
        "capabilities": {"vision": True, "document": True, "video": True, "audio": True, "thinking": True, "search": True},
        "max_context_length": 1000000,
        "is_active": True,
    },
    {
        "id": "qwen3.5-plus",
        "name": "Qwen3.5-Plus",
        "provider": "qwen",
        "capabilities": {"vision": True, "document": True, "video": True, "audio": True, "thinking": True, "search": True},
        "max_context_length": 1000000,
        "is_active": True,
    },
    {
        "id": "qwen3.5-flash",
        "name": "Qwen3.5-Flash",
        "provider": "qwen",
        "capabilities": {"vision": True, "document": True, "video": True, "audio": True, "thinking": True, "search": True},
        "max_context_length": 1000000,
        "is_active": True,
    },
]

_models_cache = {"models": None, "timestamp": 0}


def fetch_models(force_refresh=False):
    now = time.time()
    if not force_refresh and _models_cache["models"] and (now - _models_cache["timestamp"] < 300):
        return _models_cache["models"]

    try:
        session, _ = _get_session()
        resp = session.get(f"{QWEN_URL}/api/v2/models/", timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("success"):
                raw_models = data.get("data", {}).get("data", [])
                models = []
                for raw in raw_models:
                    info = raw.get("info") or {}
                    meta = info.get("meta") or {}
                    caps = meta.get("capabilities") or {}
                    models.append({
                        "id": raw.get("id"),
                        "name": meta.get("name") or raw.get("name") or info.get("name"),
                        "provider": "qwen",
                        "capabilities": {
                            "vision": bool(caps.get("vision", False)),
                            "document": bool(caps.get("document", False)),
                            "thinking": bool(caps.get("thinking", False)),
                            "search": bool(caps.get("search", False)),
                        },
                        "max_context_length": meta.get("max_context_length", 131072),
                        "is_active": bool(raw.get("is_active", True)),
                    })
                if models:
                    _models_cache["models"] = models
                    _models_cache["timestamp"] = now
                    return models
    except Exception as e:
        logger.debug(f"Live models fetch failed: {e}")

    _models_cache["models"] = FALLBACK_MODELS
    _models_cache["timestamp"] = now
    return FALLBACK_MODELS


# ========================= STS File Upload =========================

_FILE_TYPE_MAP = {
    ".png": ("image", "image", "vision"),
    ".jpg": ("image", "image", "vision"),
    ".jpeg": ("image", "image", "vision"),
    ".gif": ("image", "image", "vision"),
    ".webp": ("image", "image", "vision"),
    ".svg": ("image", "image", "vision"),
    ".pdf": ("document", "file", "document"),
    ".txt": ("document", "file", "document"),
}


def classify_file(file_name: str, mime_type: str):
    ext = os.path.splitext(file_name)[1].lower()
    if ext in _FILE_TYPE_MAP:
        return _FILE_TYPE_MAP[ext]
    return (mime_type, "file", "document")


def build_oss_headers(method: str, date_str: str, sts_data: dict, content_type: str) -> dict:
    bucket_name = sts_data.get("bucketname", "qwen-webui-prod")
    file_path = sts_data.get("file_path", "")
    access_key_id = sts_data.get("access_key_id")
    access_key_secret = sts_data.get("access_key_secret")
    security_token = sts_data.get("security_token")

    headers = {
        "Content-Type": content_type,
        "x-oss-content-sha256": "UNSIGNED-PAYLOAD",
        "x-oss-date": date_str,
        "x-oss-security-token": security_token,
        "x-oss-user-agent": "aliyun-sdk-js/6.23.0 Chrome 132.0.0.0 on Windows 10 64-bit",
    }

    headers_lower = {k.lower(): v for k, v in headers.items()}
    canonical_headers_list = []
    required_headers = [
        "content-md5", "content-type", "x-oss-content-sha256",
        "x-oss-date", "x-oss-security-token", "x-oss-user-agent",
    ]

    for header_name in sorted(required_headers):
        if header_name in headers_lower:
            canonical_headers_list.append(f"{header_name}:{headers_lower[header_name]}")

    canonical_headers = "\n".join(canonical_headers_list) + "\n"
    canonical_uri = f"/{bucket_name}/{quote(file_path, safe='/')}"
    canonical_request = f"{method}\n{canonical_uri}\n\n{canonical_headers}\n\nUNSIGNED-PAYLOAD"

    date_parts = date_str.split("T")
    date_scope = f"{date_parts[0]}/ap-southeast-1/oss/aliyun_v4_request"
    string_to_sign = (
        f"OSS4-HMAC-SHA256\n{date_str}\n{date_scope}\n"
        f"{hashlib.sha256(canonical_request.encode()).hexdigest()}"
    )

    def sign(key, msg):
        return hmac.new(key, msg.encode() if isinstance(msg, str) else msg, hashlib.sha256).digest()

    date_key = sign(f"aliyun_v4{access_key_secret}".encode(), date_parts[0])
    region_key = sign(date_key, "ap-southeast-1")
    service_key = sign(region_key, "oss")
    signing_key = sign(service_key, "aliyun_v4_request")
    signature = hmac.new(signing_key, string_to_sign.encode(), hashlib.sha256).hexdigest()

    headers["authorization"] = (
        f"OSS4-HMAC-SHA256 Credential={access_key_id}/{date_scope},Signature={signature}"
    )
    return headers


def upload_file_bytes(file_bytes: bytes, file_name: str, mime_type: str = "image/png"):
    session, pool_s = _get_session()
    file_size = len(file_bytes)
    file_type, show_type, file_class = classify_file(file_name, mime_type)

    sts_resp = session.post(
        f"{QWEN_URL}/api/v2/files/getstsToken",
        json={
            "filename": file_name,
            "filesize": file_size,
            "filetype": mime_type,
        },
        timeout=30,
    )
    if sts_resp.status_code != 200:
        raise RuntimeError(f"STS token failed ({sts_resp.status_code}): {sts_resp.text[:200]}")

    sts_json = sts_resp.json()
    if not sts_json.get("success"):
        raise RuntimeError(f"STS token error: {sts_json}")

    data = sts_json.get("data", {})
    file_url = data.get("file_url", "")
    file_id = data.get("file_id", "")

    date_str = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    oss_headers = build_oss_headers("PUT", date_str, data, mime_type)

    upload_resp = requests.put(
        file_url.split("?")[0],
        data=file_bytes,
        headers=oss_headers,
        timeout=60,
    )
    if upload_resp.status_code not in (200, 204):
        raise RuntimeError(f"OSS upload failed ({upload_resp.status_code}): {upload_resp.text[:200]}")

    now_ms = int(time.time() * 1000)
    meta_dict = {
        "name": file_name,
        "size": file_size,
        "content_type": mime_type,
    }

    file_obj = {
        "type": show_type,
        "file": {
            "created_at": now_ms,
            "data": {},
            "filename": file_name,
            "hash": None,
            "id": file_id,
            "meta": meta_dict,
            "update_at": now_ms,
            "type": mime_type,
        },
        "id": file_id,
        "url": file_url,
        "name": file_name,
        "collection_name": "",
        "progress": 0,
        "status": "uploaded",
        "greenNet": "success",
        "size": file_size,
        "error": "",
        "itemId": str(uuid.uuid4()),
        "file_type": mime_type,
        "showType": show_type,
        "file_class": file_class,
        "uploadTaskId": str(uuid.uuid4()),
    }
    return file_obj


# ========================= Chat & Streaming =========================

def create_chat(session, model="qwen3.8-max", _pool_session=None):
    now = int(time.time() * 1000)
    payload = {
        "title": "Avatar Lab Chat",
        "models": [model],
        "chat_mode": "normal",
        "chat_type": "t2t",
        "timestamp": now,
        "project_id": "",
    }
    try:
        resp = session.post(f"{QWEN_URL}/api/v2/chats/new", json=payload, timeout=20)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("success"):
                return data["data"]["id"]
    except Exception as e:
        logger.debug(f"create_chat exception: {e}")
    return None


def _build_msg_payload(
    chat_id: str,
    full_prompt: str,
    model: str,
    parent_id: Optional[str] = None,
    uploaded_files: Optional[List[dict]] = None,
    chat_type: str = "t2t",
    thinking_mode: str = "auto",
    stream: bool = True,
) -> Dict[str, Any]:
    msg_id = str(uuid.uuid4())
    now = int(time.time() * 1000)

    use_thinking = True
    if thinking_mode == "fast":
        use_thinking = False
    elif thinking_mode == "thinking":
        use_thinking = True

    feature_config = {
        "thinking_enabled": use_thinking,
        "thinking_mode": "Auto" if use_thinking else "Fast",
        "auto_thinking": use_thinking,
        "output_schema": "phase",
        "research_mode": "normal",
        "auto_search": False,
        "thinking_budget": 81920,
    }

    return {
        "stream": stream,
        "incremental_output": stream,
        "version": "2.1",
        "timestamp": now,
        "chat_id": chat_id,
        "chat_mode": "normal",
        "model": model,
        "parent_id": parent_id,
        "messages": [
            {
                "fid": msg_id,
                "parentId": parent_id,
                "childrenIds": [],
                "role": "user",
                "content": full_prompt,
                "user_action": "chat",
                "files": uploaded_files or [],
                "models": [model],
                "chat_type": chat_type,
                "feature_config": feature_config,
                "sub_chat_type": chat_type,
                "timestamp": now,
                "safety": {
                    "has_safety_risk": False,
                    "risk_type": 0,
                    "risk_level": 0,
                },
            }
        ],
    }


def stream_chat(
    messages: List[Dict],
    model: str = "qwen3.8-max",
    uploaded_files: Optional[List[dict]] = None,
    system_prompt: Optional[str] = None,
    thinking_mode: str = "auto",
) -> Generator[Dict, None, None]:
    session, pool_s = _get_session()
    chat_id = create_chat(session, model=model, _pool_session=pool_s)
    if not chat_id:
        yield {"type": "error", "error": "Failed to create Qwen chat session"}
        return

    # Extract user message and history
    last_user_text = ""
    history_lines = []
    if system_prompt:
        history_lines.append(f"SYSTEM INSTRUCTIONS:\n{system_prompt}")

    for m in messages:
        role = m.get("role", "user")
        content = m.get("content", "")
        if isinstance(content, list):
            content = "\n".join(str(item.get("text", "")) for item in content if isinstance(item, dict))
        if role == "user":
            last_user_text = content
        history_lines.append(f"{role.upper()}: {content}")

    # Build prompt with history
    full_prompt = "\n\n".join(history_lines) if len(messages) > 1 or system_prompt else last_user_text
    payload = _build_msg_payload(
        chat_id=chat_id,
        full_prompt=full_prompt,
        model=model,
        uploaded_files=uploaded_files,
        thinking_mode=thinking_mode,
        stream=True,
    )

    try:
        resp = session.post(
            f"{QWEN_URL}/api/v2/chat/completions?chat_id={chat_id}",
            json=payload,
            stream=True,
            timeout=180,
        )
        if resp.status_code != 200:
            yield {"type": "error", "error": f"Qwen HTTP {resp.status_code}: {resp.text[:200]}"}
            if pool_s:
                _mark_failed(pool_s)
            return

        saw_content = False

        for line in resp.iter_lines():
            if not line:
                continue
            if isinstance(line, bytes):
                line_str = line.decode("utf-8", errors="replace").strip()
            else:
                line_str = line.strip()

            if not line_str or line_str.startswith(":"):
                continue
            if not line_str.startswith("data:"):
                continue

            raw = line_str[5:].strip()
            if not raw or raw == "[DONE]":
                break

            try:
                data = json.loads(raw)
            except Exception:
                continue

            if "error" in data:
                err_text = str(data["error"])
                logger.error(f"Qwen stream error: {err_text}")
                yield {"type": "error", "error": err_text}
                if pool_s:
                    _mark_failed(pool_s)
                return

            choices = data.get("choices") or []
            if not choices:
                continue

            choice = choices[0]
            delta = choice.get("delta") or {}
            content = delta.get("content")
            phase = delta.get("phase")
            finish_reason = choice.get("finish_reason")

            if content:
                saw_content = True
                if phase == "think" or phase == "web_search":
                    yield {"type": "thought", "content": content}
                else:
                    yield {"type": "text", "content": content}

            if finish_reason:
                yield {"type": "done", "finish_reason": finish_reason}
                if pool_s:
                    _mark_used(pool_s)
                return

        if saw_content:
            yield {"type": "done", "finish_reason": "stop"}
            if pool_s:
                _mark_used(pool_s)
        else:
            yield {"type": "error", "error": "Empty response from Qwen"}
            if pool_s:
                _mark_failed(pool_s)
    except Exception as e:
        logger.exception(f"Qwen stream exception: {e}")
        yield {"type": "error", "error": f"Qwen stream exception: {e}"}
        if pool_s:
            _mark_failed(pool_s)
