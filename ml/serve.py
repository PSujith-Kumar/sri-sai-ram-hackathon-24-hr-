"""Local inference service for the fine-tuned mood + severity model.

  python ml/serve.py                 # uses ml/artifacts/model-final.pt (or model-eval.pt if that is all there is)
  python ml/serve.py --port 8765

POST /classify  {"text": "..."}  ->  {mood, moodProb, moodProbs, severity, severityProb, severityProbs, model}
GET  /health                     ->  {ok, model, moods, severities}

Binds to 127.0.0.1 only. The patient's text is processed in memory and is NEVER logged or stored.
The web app reaches it through the Vite proxy at /classifier, and falls back to its built-in model when this
service is not running.
"""
import argparse
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import torch
import torch.nn.functional as F
from transformers import AutoTokenizer

sys.path.insert(0, str(Path(__file__).parent))
from finetune import ARTIFACTS, MAX_LEN, MOODS, SEVERITIES, Net  # noqa: E402

MAX_BODY = 8192
lock = threading.Lock()  # one inference at a time keeps memory use predictable


def load_model():
    for tag in ("final", "eval"):
        path = ARTIFACTS / f"model-{tag}.pt"
        if path.exists():
            model = Net()
            model.load_state_dict(torch.load(path, map_location="cpu"))
            model.eval()
            return model, tag
    raise SystemExit("No trained model found in ml/artifacts. Run: python ml/finetune.py --final")


def make_handler(model, tokenizer, tag):
    class Handler(BaseHTTPRequestHandler):
        def _send(self, code, body):
            data = json.dumps(body, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(data)

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
            self.end_headers()

        def do_GET(self):
            if self.path == "/health":
                return self._send(200, {"ok": True, "model": tag, "moods": MOODS, "severities": SEVERITIES})
            self._send(404, {"error": "not found"})

        def do_POST(self):
            if self.path != "/classify":
                return self._send(404, {"error": "not found"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if length <= 0 or length > MAX_BODY:
                    return self._send(413, {"error": "bad size"})
                text = json.loads(self.rfile.read(length)).get("text")
                if not isinstance(text, str) or not text.strip():
                    return self._send(400, {"error": "text required"})
            except (ValueError, json.JSONDecodeError):
                return self._send(400, {"error": "bad json"})
            enc = tokenizer(["query: " + text.strip()[:500]], truncation=True, max_length=MAX_LEN, return_tensors="pt")
            with lock, torch.no_grad():
                m_logits, s_logits = model(enc["input_ids"], enc["attention_mask"])
            m, s = F.softmax(m_logits, -1)[0].tolist(), F.softmax(s_logits, -1)[0].tolist()
            mi, si = max(range(len(m)), key=m.__getitem__), max(range(len(s)), key=s.__getitem__)
            self._send(200, {
                "mood": MOODS[mi], "moodProb": round(m[mi], 4), "moodProbs": [round(x, 4) for x in m],
                "severity": SEVERITIES[si], "severityProb": round(s[si], 4), "severityProbs": [round(x, 4) for x in s],
                "model": tag,
            })

        def log_message(self, *args):  # privacy: never log requests
            pass

    return Handler


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()
    tokenizer = AutoTokenizer.from_pretrained(ARTIFACTS / "tokenizer")
    model, tag = load_model()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(model, tokenizer, tag))
    print(f"Mood model '{tag}' ready on http://127.0.0.1:{args.port} (patient text is never logged)", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
