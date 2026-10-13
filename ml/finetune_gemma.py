"""Fine-tunes Google's Gemma 3 (270M) into the same two-headed classifier as finetune.py: mood + situation severity.

  python ml/finetune_gemma.py --bench      # time a few steps, then exit
  python ml/finetune_gemma.py              # train on train.jsonl, evaluate on held-out + gold sets
  python ml/finetune_gemma.py --final      # train on train+test (for export); gold sets stay unseen

Gemma 3 270M is a text model with a 262k-word multilingual vocabulary (Hindi and Tamil included). Its token
embeddings are frozen (they are most of its size); the transformer layers and two small linear heads are trained
on our labelled sentences. The sentence is read as: mean of all token states + the last token's state.
Weights come from the public mirror `unsloth/gemma-3-270m-it` (Gemma terms of use apply).

Output goes to ml/artifacts/gemma/ (git-ignored, a few hundred MB) plus ml/GEMMA_REPORT_<tag>.md.
"""
import argparse
import json
import os
import random
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from sklearn.metrics import accuracy_score, f1_score
from transformers import AutoModel, AutoTokenizer

sys.path.insert(0, str(Path(__file__).parent))
import train as T  # noqa: E402  (data loader and the severity safety metrics)
from finetune import MOODS, SEVERITIES, class_weights  # noqa: E402  (same label order as the e5 model)

BASE = "unsloth/gemma-3-270m-it"
ROOT = Path(__file__).resolve().parent
ARTIFACTS = ROOT / "artifacts" / "gemma"
MAX_LEN = 64


class GemmaNet(nn.Module):
    def __init__(self, base=BASE):
        super().__init__()
        self.encoder = AutoModel.from_pretrained(base, torch_dtype=torch.float32)
        self.encoder.get_input_embeddings().weight.requires_grad_(False)
        hidden = self.encoder.config.hidden_size
        self.norm = nn.LayerNorm(hidden * 2)
        self.dropout = nn.Dropout(0.1)
        self.mood = nn.Linear(hidden * 2, len(MOODS))
        self.severity = nn.Linear(hidden * 2, len(SEVERITIES))

    def forward(self, input_ids, attention_mask):
        states = self.encoder(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        mask = attention_mask.unsqueeze(-1).float()
        mean = (states * mask).sum(1) / mask.sum(1)
        last_index = attention_mask.sum(1).long() - 1  # right padding: the last real token
        last = states[torch.arange(states.size(0)), last_index]
        pooled = self.dropout(self.norm(torch.cat([mean, last], dim=-1)))
        return self.mood(pooled), self.severity(pooled)

    def trainable_state(self):
        """Everything except the frozen embeddings (they are re-loaded from the base model)."""
        return {k: v for k, v in self.state_dict().items() if "embed_tokens" not in k}


def make_tokenizer(base=BASE):
    tokenizer = AutoTokenizer.from_pretrained(base)
    tokenizer.padding_side = "right"
    return tokenizer


def encode(tokenizer, rows):
    return tokenizer([r["text"] for r in rows], padding=True, truncation=True, max_length=MAX_LEN, return_tensors="pt")


@torch.no_grad()
def predict(model, tokenizer, rows, batch=64):
    model.eval()
    mood_p, sev_p = [], []
    for i in range(0, len(rows), batch):
        enc = encode(tokenizer, rows[i:i + batch])
        m, s = model(enc["input_ids"], enc["attention_mask"])
        mood_p.append(F.softmax(m, -1).numpy())
        sev_p.append(F.softmax(s, -1).numpy())
    return np.vstack(mood_p), np.vstack(sev_p)


def score(rows, mood_p, sev_p):
    mood_pred = [MOODS[i] for i in mood_p.argmax(1)]
    sev_pred = [SEVERITIES[i] for i in sev_p.argmax(1)]
    mood_true, sev_true = [r["mood"] for r in rows], [r["severity"] for r in rows]
    return {
        "mood": accuracy_score(mood_true, mood_pred), "mood_f1": f1_score(mood_true, mood_pred, average="macro"),
        "severity": accuracy_score(sev_true, sev_pred), "severity_f1": f1_score(sev_true, sev_pred, average="macro"),
        "safety": T.severity_safety(sev_true, sev_pred), "n": len(rows),
    }


def fmt(name, r):
    s = r["safety"]
    return (f"{name:14s} n={r['n']:4d} mood={r['mood']:.3f} (F1 {r['mood_f1']:.3f}) severity={r['severity']:.3f} (F1 {r['severity_f1']:.3f}) "
            f"serious-recall={s['serious_recall']:.3f} false-alarm={s['false_alarm']:.3f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--lr", type=float, default=4e-5)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--final", action="store_true", help="train on train+test (gold sets stay unseen)")
    ap.add_argument("--bench", action="store_true", help="time a few steps and exit")
    args = ap.parse_args()

    random.seed(7); np.random.seed(7); torch.manual_seed(7)
    torch.set_num_threads(max(1, (os.cpu_count() or 8) - 2))
    train, test, gold = T.load("train.jsonl"), T.load("test.jsonl"), T.load("gold.jsonl")
    fit_rows = train + test if args.final else train
    slices = {"held-out": test, "gold (all)": gold, "gold-a": gold[:46], "gold-b": gold[46:66], "gold-c": gold[66:86], "gold-d hi/ta": gold[86:]}

    tokenizer = make_tokenizer()
    model = GemmaNet()
    mood_w, sev_w = class_weights([r["mood"] for r in fit_rows], MOODS), class_weights([r["severity"] for r in fit_rows], SEVERITIES)
    mood_y = torch.tensor([MOODS.index(r["mood"]) for r in fit_rows])
    sev_y = torch.tensor([SEVERITIES.index(r["severity"]) for r in fit_rows])

    body = [p for p in model.encoder.parameters() if p.requires_grad]
    heads = list(model.norm.parameters()) + list(model.mood.parameters()) + list(model.severity.parameters())
    optim = torch.optim.AdamW([{"params": body, "lr": args.lr}, {"params": heads, "lr": args.lr * 20}], weight_decay=0.01)
    steps_per_epoch = (len(fit_rows) + args.batch - 1) // args.batch
    total = steps_per_epoch * args.epochs
    sched = torch.optim.lr_scheduler.LambdaLR(optim, lambda s: min(1.0, (s + 1) / (0.06 * total)) * max(0.0, (total - s) / total))
    print(f"{len(fit_rows)} sentences, {steps_per_epoch} steps/epoch, {sum(p.numel() for p in body) / 1e6:.0f}M trainable body params", flush=True)

    log, t0 = [], time.time()
    for epoch in range(1, args.epochs + 1):
        model.train()
        order = list(range(len(fit_rows)))
        random.shuffle(order)
        running = 0.0
        for b in range(steps_per_epoch):
            idx = order[b * args.batch:(b + 1) * args.batch]
            enc = encode(tokenizer, [fit_rows[i] for i in idx])
            m_logits, s_logits = model(enc["input_ids"], enc["attention_mask"])
            loss = F.cross_entropy(m_logits, mood_y[idx], weight=mood_w, label_smoothing=0.05) + F.cross_entropy(s_logits, sev_y[idx], weight=sev_w, label_smoothing=0.05)
            optim.zero_grad(); loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optim.step(); sched.step()
            running += loss.item()
            if args.bench and b + 1 == 6:
                print(f"bench: {(time.time() - t0) / 6:.2f}s per step of {args.batch} -> about {(time.time() - t0) / 6 * steps_per_epoch / 60:.0f} min per epoch", flush=True)
                return
            if (b + 1) % 20 == 0:
                print(f"epoch {epoch} step {b + 1}/{steps_per_epoch} loss {running / (b + 1):.3f} elapsed {int(time.time() - t0)}s", flush=True)
        results = {}
        for name, rows in slices.items():
            if args.final and name == "held-out":
                continue  # held-out is part of the final training data
            results[name] = score(rows, *predict(model, tokenizer, rows))
        print(f"--- after epoch {epoch} ({int(time.time() - t0)}s)", flush=True)
        for name, r in results.items():
            print(fmt(name, r), flush=True)
        log.append((epoch, results))
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        torch.save(model.trainable_state(), ARTIFACTS / f"gemma-{'final' if args.final else 'eval'}.pt")  # keep the latest epoch safe

    tag = "final" if args.final else "eval"
    dump = {}
    for name, rows in slices.items():
        if args.final and name == "held-out":
            continue
        mood_p, sev_p = predict(model, tokenizer, rows)
        dump[name] = [{"text": r["text"], "trueMood": r["mood"], "trueSeverity": r["severity"],
                       "moodProbs": [round(float(x), 4) for x in mp], "severityProbs": [round(float(x), 4) for x in sp]}
                      for r, mp, sp in zip(rows, mood_p, sev_p)]
    (ROOT / "data" / f"gemma_predictions_{tag}.json").write_text(json.dumps({"moods": MOODS, "severities": SEVERITIES, "sets": dump}, ensure_ascii=False), encoding="utf-8")
    tokenizer.save_pretrained(ARTIFACTS / "tokenizer")
    (ARTIFACTS / "labels.json").write_text(json.dumps({"base": BASE, "moods": MOODS, "severities": SEVERITIES, "max_len": MAX_LEN}), encoding="utf-8")
    lines = [f"# Fine-tuned Gemma 3 270M report ({tag})", "", f"Base model `{BASE}`, {args.epochs} epochs, lr {args.lr}, batch {args.batch}. Trained on {len(fit_rows)} sentences.", ""]
    for epoch, results in log[-1:]:
        lines += [f"## After epoch {epoch}", "", "```"] + [fmt(n, r) for n, r in results.items()] + ["```", ""]
    (ROOT / f"GEMMA_REPORT_{tag}.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
