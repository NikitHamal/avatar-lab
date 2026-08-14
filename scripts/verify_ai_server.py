import json
import threading
import time
import urllib.request
import sys
import os

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(CURRENT_DIR, '..'))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from server.ai_server import run_server

def test():
    test_port = 8769
    t = threading.Thread(target=run_server, kwargs={'port': test_port}, daemon=True)
    t.start()
    time.sleep(1.2)

    print(f"Checking http://127.0.0.1:{test_port}/api/ai/health ...")
    with urllib.request.urlopen(f"http://127.0.0.1:{test_port}/api/ai/health") as resp:
        health = json.loads(resp.read().decode('utf-8'))
        print("Health status:", health)
        assert health["status"] == "ok"
        assert "qwen" in health["providers"]
        assert "poolside" in health["providers"]
        assert "k2think" in health["providers"]

    print(f"\nChecking http://127.0.0.1:{test_port}/api/ai/models ...")
    with urllib.request.urlopen(f"http://127.0.0.1:{test_port}/api/ai/models") as resp:
        catalog = json.loads(resp.read().decode('utf-8'))
        models = catalog.get("models", [])
        print(f"Loaded {len(models)} models:")
        for m in models:
            caps = ", ".join([k for k, v in m.get("capabilities", {}).items() if v])
            print(f"  [{m['provider'].upper()}] {m['id']} -> {m['name']} ({caps})")
        assert len(models) >= 3

    print("\nAI Proxy Server verification PASSED successfully!")

if __name__ == "__main__":
    test()
