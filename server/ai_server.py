"""Standalone AI Proxy Server for Avatar Lab.

Exposes:
- GET  /api/ai/health   -> Check server health
- GET  /api/ai/models   -> List all models from Qwen, Poolside (Laguna), and K2Think
- POST /api/ai/upload   -> Upload images/files for Qwen vision
- POST /api/ai/chat     -> SSE streaming chat completions with thinking & tool deltas
"""
import argparse
import base64
import email
import json
import logging
import os
import sys
import time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

# Ensure server module path is resolvable
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from providers import qwen, poolside, k2think

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ai_server")

MAX_UPLOAD_BYTES = int(os.environ.get("AVATAR_LAB_MAX_UPLOAD_BYTES", str(12 * 1024 * 1024)))
MAX_CHAT_BYTES = int(os.environ.get("AVATAR_LAB_MAX_CHAT_BYTES", str(2 * 1024 * 1024)))
ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.environ.get("AVATAR_LAB_ALLOWED_ORIGINS", "*").split(",")
    if origin.strip()
}


class AIServerHandler(BaseHTTPRequestHandler):
    server_version = "AvatarLabAI/1.0"
    sys_version = ""

    def _send_cors_headers(self):
        origin = self.headers.get("Origin", "")
        allowed_origin = "*" if "*" in ALLOWED_ORIGINS else (origin if origin in ALLOWED_ORIGINS else "")
        if allowed_origin:
            self.send_header("Access-Control-Allow-Origin", allowed_origin)
            if allowed_origin != "*":
                self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

    def _send_json(self, status_code: int, data: dict):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/api/ai/health" or path == "/health":
            resp = {
                "status": "ok",
                "service": "Avatar Lab Nebians AI Proxy",
                "providers": ["qwen", "poolside", "k2think"],
                "timestamp": int(time.time()),
            }
            self._send_json(200, resp)
            return

        if path == "/api/ai/models":
            models = []
            try:
                models.extend(qwen.fetch_models())
            except Exception as e:
                logger.warning(f"Error fetching Qwen models: {e}")
                models.extend(qwen.FALLBACK_MODELS)

            try:
                models.extend(poolside.get_models())
            except Exception as e:
                logger.warning(f"Error fetching Poolside models: {e}")

            try:
                models.extend(k2think.get_models())
            except Exception as e:
                logger.warning(f"Error fetching K2Think models: {e}")

            self._send_json(200, {"models": models, "success": True})
            return

        self._send_json(404, {"error": "Not Found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/")

        if path == "/api/ai/upload":
            self._handle_upload()
            return

        if path == "/api/ai/chat":
            self._handle_chat_stream()
            return

        self._send_json(404, {"error": "Not Found"})

    def _handle_upload(self):
        content_type = self.headers.get("Content-Type", "")
        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            self._send_json(400, {"error": "Invalid Content-Length"})
            return
        if content_length > MAX_UPLOAD_BYTES:
            self._send_json(413, {"error": f"Upload exceeds {MAX_UPLOAD_BYTES} byte limit"})
            return

        file_bytes = b""
        filename = "upload.png"
        mime_type = "image/png"

        try:
            body_bytes = self.rfile.read(content_length) if content_length > 0 else b""

            if "multipart/form-data" in content_type:
                raw_headers = f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8")
                msg = email.message_from_bytes(raw_headers + body_bytes)
                if msg.is_multipart():
                    for part in msg.get_payload():
                        cd = str(part.get("Content-Disposition", ""))
                        fn = part.get_filename()
                        if fn or 'name="file"' in cd or 'filename=' in cd:
                            filename = fn or "upload.png"
                            mime_type = part.get_content_type() or "image/png"
                            payload = part.get_payload(decode=True)
                            if payload:
                                file_bytes = payload
                                break
            elif "application/json" in content_type:
                data = json.loads(body_bytes.decode("utf-8"))
                b64_data = data.get("data") or data.get("base64") or ""
                if "," in b64_data:
                    b64_data = b64_data.split(",", 1)[1]
                file_bytes = base64.b64decode(b64_data)
                filename = data.get("filename") or "upload.png"
                mime_type = data.get("mime_type") or "image/png"
            else:
                file_bytes = body_bytes

            if not file_bytes:
                self._send_json(400, {"error": "No file content received"})
                return

            logger.info(f"Uploading file '{filename}' ({len(file_bytes)} bytes, mime: {mime_type}) to Qwen OSS...")
            file_obj = qwen.upload_file_bytes(file_bytes, filename, mime_type)
            logger.info(f"File uploaded successfully to Qwen OSS: id={file_obj.get('id')}")

            self._send_json(200, {"success": True, "file": file_obj})
        except Exception as e:
            logger.exception(f"Upload error: {e}")
            self._send_json(500, {"error": "Upload failed"})

    def _handle_chat_stream(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            self._send_json(400, {"error": "Invalid Content-Length"})
            return
        if content_length <= 0 or content_length > MAX_CHAT_BYTES:
            self._send_json(413 if content_length > MAX_CHAT_BYTES else 400, {"error": "Invalid chat payload size"})
            return
        body = self.rfile.read(content_length)
        try:
            payload = json.loads(body.decode("utf-8"))
        except Exception as e:
            self._send_json(400, {"error": f"Invalid JSON: {e}"})
            return

        provider = payload.get("provider") or "qwen"
        model = payload.get("model") or "qwen3.8-max"
        messages = payload.get("messages") or []
        if not isinstance(messages, list) or len(messages) > 200:
            self._send_json(400, {"error": "messages must be an array with at most 200 items"})
            return
        if any(not isinstance(message, dict) for message in messages):
            self._send_json(400, {"error": "every message must be an object"})
            return
        uploaded_files = payload.get("uploaded_files") or []
        if not isinstance(uploaded_files, list) or len(uploaded_files) > 24:
            self._send_json(400, {"error": "uploaded_files must be an array with at most 24 items"})
            return
        system_prompt = payload.get("system_prompt")
        if system_prompt is not None and not isinstance(system_prompt, str):
            self._send_json(400, {"error": "system_prompt must be a string"})
            return

        # Auto-detect provider if model name belongs to a known provider
        if model.startswith("laguna"):
            provider = "poolside"
        elif "K2-Think" in model or model == "k2think":
            provider = "k2think"
        elif model.startswith("qwen"):
            provider = "qwen"

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self._send_cors_headers()
        self.end_headers()

        def emit_event(ev_data: dict):
            msg = f"data: {json.dumps(ev_data)}\n\n"
            try:
                self.wfile.write(msg.encode("utf-8"))
                self.wfile.flush()
                return True
            except Exception:
                return False

        try:
            if provider == "poolside":
                for chunk in poolside.stream_chat(messages, model=model):
                    if not emit_event(chunk):
                        break
            elif provider == "k2think":
                for chunk in k2think.stream_chat(messages, model=model):
                    if not emit_event(chunk):
                        break
            else:  # default qwen
                for chunk in qwen.stream_chat(messages, model=model, uploaded_files=uploaded_files, system_prompt=system_prompt):
                    if not emit_event(chunk):
                        break
        except Exception as exc:
            logger.exception(f"Chat streaming error: {exc}")
            emit_event({"type": "error", "error": "The AI provider request failed"})

        emit_event({"type": "done"})


def run_server(host="127.0.0.1", port=8765):
    server_address = (host, port)
    httpd = ThreadingHTTPServer(server_address, AIServerHandler)
    logger.info(f"Avatar Lab AI Proxy Server running at http://{host}:{port}/")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Avatar Lab Nebians AI Proxy Server")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind to")
    args = parser.parse_args()
    run_server(host=args.host, port=args.port)
