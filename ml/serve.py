"""Local inference service for the fine-tuned mood + severity models.

  python ml/serve.py                      # best available: Gemma 3 270M + e5 averaged, or whichever is trained
  python ml/serve.py --backbone gemma     # Gemma 3 270M only
  python ml/serve.py --backbone e5        # multilingual-e5-small only
  python ml/serve.py --port 8765

Two models are trained on the same labelled sentences (see finetune.py and finetune_gemma.py). Gemma 3 is better at
judging how serious a situation is (fewer missed emergencies, fewer false alarms); e5 is slightly better at mood.
Averaging their probabilities is best at mood and close to Gemma 3 on severity (numbers in ml/GEMMA_REPORT_*.md).

POST /classify  {"text": "..."}  ->  {mood, moodProb, moodProbs, severity, severityProb, severityProbs, model, members}
GET  /health                     ->  {ok, model, members, moods, severities}

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

import numpy as np
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer

sys.path.insert(0, str(Path(__file__).parent))
import finetune as E5  # noqa: E402
import finetune_gemma as GM  # noqa: E402

MOODS, SEVERITIES = E5.MOODS, E5.SEVERITIES
MAX_BODY = 8192
lock = threading.Lock()  # one inference at a time keeps memory use predictable


class Member:
    """One trained model plus how to feed it a sentence."""

    def __init__(self, name, tag, model, tokenizer, max_len, prefix=""):
        self.name, self.tag, self.model, self.tokenizer, self.max_len, self.prefix = name, tag, model, tokenizer, max_len, prefix

    @torch.no_grad()
    def probabilities(self, text):
        enc = self.tokenizer([self.prefix + text], truncation=True, max_length=self.max_len, return_tensors="pt")
        mood, severity = self.model(enc["input_ids"], enc["attention_mask"])
        return F.softmax(mood, -1)[0].numpy(), F.softmax(severity, -1)[0].numpy()


def load_e5():
    for tag in ("final", "eval"):
        path = E5.ARTIFACTS / f"model-{tag}.pt"
        if path.exists():
            model = E5.Net()
            model.load_state_dict(torch.load(path, map_location="cpu"))
            model.eval()
            return Member("e5", tag, model, AutoTokenizer.from_pretrained(E5.ARTIFACTS / "tokenizer"), E5.MAX_LEN, prefix="query: ")
    return None


def load_gemma():
    for tag in ("final", "eval"):
        path = GM.ARTIFACTS / f"gemma-{tag}.pt"
        if path.exists():
            model = GM.GemmaNet()
            model.load_state_dict(torch.load(path, map_location="cpu"), strict=False)  # the frozen embeddings come from the base model
            model.eval()
            tokenizer_dir = GM.ARTIFACTS / "tokenizer"
            return Member("gemma-3-270m", tag, model, GM.make_tokenizer(tokenizer_dir if tokenizer_dir.exists() else GM.BASE), GM.MAX_LEN)
    return None


def load_members(backbone):
    wanted = {"e5": [load_e5], "gemma": [load_gemma], "both": [load_gemma, load_e5], "auto": [load_gemma, load_e5]}[backbone]
    members = [m for m in (load() for load in wanted) if m]
    if not members:
        raise SystemExit("No trained model found in ml/artifacts. Run: python ml/finetune.py --final   and/or   python ml/finetune_gemma.py --final")
    return members


def classify(members, text):
    """Averages the members' probabilities (one member: its own)."""
    parts = [m.probabilities(text) for m in members]
    mood = np.mean([p[0] for p in parts], axis=0)
    severity = np.mean([p[1] for p in parts], axis=0)
    mi, si = int(mood.argmax()), int(severity.argmax())
    return {
        "mood": MOODS[mi], "moodProb": round(float(mood[mi]), 4), "moodProbs": [round(float(x), 4) for x in mood],
        "severity": SEVERITIES[si], "severityProb": round(float(severity[si]), 4), "severityProbs": [round(float(x), 4) for x in severity],
    }


def describe(members):
    return {"model": " + ".join(f"{m.name} ({m.tag})" for m in members), "members": [m.name for m in members]}


def make_handler(members):
    info = describe(members)

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
                return self._send(200, {"ok": True, **info, "moods": MOODS, "severities": SEVERITIES})
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
            with lock:
                result = classify(members, text.strip()[:500])
            self._send(200, {**result, **info})

        def log_message(self, *args):  # privacy: never log requests
            pass

    return Handler


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--backbone", choices=["auto", "e5", "gemma", "both"], default="auto")
    args = ap.parse_args()
    members = load_members(args.backbone)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(members))
    print(f"Mood model {describe(members)['model']} ready on http://127.0.0.1:{args.port} (patient text is never logged)", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
