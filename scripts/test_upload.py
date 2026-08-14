import sys
import os
import time
import uuid
import hashlib
import hmac
import mimetypes
from urllib.parse import quote
from datetime import datetime, timezone
import requests

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, '..'))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from server.providers import qwen

def classify_file(file_name: str, mime_type: str):
    ext = os.path.splitext(file_name)[1].lower()
    if ext in ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'):
        return ('image', 'image', 'vision')
    if ext in ('.pdf', '.txt', '.doc', '.docx'):
        return ('document', 'file', 'document')
    return (mime_type, 'file', 'document')

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

def upload_bytes(file_name: str, file_data: bytes, mime_type: str = "image/png"):
    session, pool_s = qwen._get_session()
    file_size = len(file_data)
    file_type, show_type, file_class = classify_file(file_name, mime_type)

    sts_resp = session.post(
        "https://chat.qwen.ai/api/v2/files/getstsToken",
        json={
            "filename": file_name,
            "filesize": file_size,
            "filetype": mime_type,
        },
        timeout=30,
    )
    print("STS status:", sts_resp.status_code)
    sts_json = sts_resp.json()
    if not sts_json.get("success"):
        print("STS failed:", sts_json)
        return None

    data = sts_json.get("data", {})
    file_url = data.get("file_url", "")
    file_id = data.get("file_id", "")

    date_str = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    oss_headers = build_oss_headers("PUT", date_str, data, mime_type)

    upload_resp = requests.put(
        file_url.split("?")[0],
        data=file_data,
        headers=oss_headers,
        timeout=60,
    )
    print("OSS PUT status:", upload_resp.status_code)
    if upload_resp.status_code not in (200, 204):
        print("OSS upload error:", upload_resp.text)
        return None

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

def main():
    fake_png = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
    file_obj = upload_bytes("fox_avatar.png", fake_png, "image/png")
    print("Upload result:", file_obj)

    if file_obj:
        print("\nStreaming chat with image to Qwen 3.8 Max...")
        stream = qwen.stream_chat(
            messages=[{"role": "user", "content": "I attached an image. Describe what you see in it."}],
            model="qwen3.8-max",
            uploaded_files=[file_obj],
        )
        for chunk in stream:
            if chunk.get("type") == "text":
                print(chunk.get("content", ""), end="", flush=True)
            elif chunk.get("type") == "error":
                print("\nError:", chunk)
        print("\nDone streaming!")

if __name__ == "__main__":
    main()
