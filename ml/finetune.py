"""Fine-tunes a multilingual sentence encoder into one two-headed classifier: mood + situation severity.

  python ml/generate_dataset.py          # build the data
  python ml/finetune.py                  # train on train.jsonl, evaluate on held-out + gold sets
  python ml/finetune.py --final          # train on train+test (for export), gold sets stay unseen

Why: the TF-IDF model in train.py counts words, so it cannot generalise to wording it has not seen.
A pretrained multilingual encoder (multilingual-e5-small, ~100 languages incl. Hindi and Tamil) already
understands meaning, and fine-tuning it on our labels is far more accurate on new phrasings.
Output goes to ml/artifacts/ (git-ignored: it is a few hundred MB) plus ml/FINETUNE_REPORT.md.
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
import train as T  # noqa: E402  (reuses the data loader and the severity safety metrics)

BASE = "intfloat/multilingual-e5-small"
ROOT = Path(__file__).resolve().parent
ARTIFACTS = ROOT / "artifacts"
MOODS = ["angry", "anxious", "distressed", "happy", "low", "neutral", "tired"]
SEVERITIES = ["none", "watch", "urgent", "critical"]
MAX_LEN = 48


class Net(nn.Module):
    def __init__(self):
        super().__init__()
        self.encoder = AutoModel.from_pretrained(BASE)
        hidden = self.encoder.config.hidden_size
        self.dropout = nn.Dropout(0.1)
        self.mood = nn.Linear(hidden, len(MOODS))
        self.severity = nn.Linear(hidden, len(SEVERITIES))

    def forward(self, input_ids, attention_mask):
        hidden = self.encoder(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        mask = attention_mask.unsqueeze(-1).float()
        pooled = self.dropout((hidden * mask).sum(1) / mask.sum(1))
        return self.mood(pooled), self.severity(pooled)


def encode(tokenizer, rows):
    return tokenizer(["query: " + r["text"] for r in rows], padding=True, truncation=True, max_length=MAX_LEN, return_tensors="pt")


def class_weights(labels, classes):
    counts = np.array([max(1, sum(1 for l in labels if l == c)) for c in classes], dtype=float)
    return torch.tensor(len(labels) / (len(classes) * counts), dtype=torch.float)


@torch.no_grad()
def predict(model, tokenizer, rows, batch=128):
    model.eval()
    mood_p, sev_p = [], []
    for i in range(0, len(rows), batch):
        enc = encode(tokenizer, rows[i:i + batch])
        m, s = model(enc["input_ids"], enc["attention_mask"])
        mood_p.append(F.softmax(m, -1).numpy())
        sev_p.append(F.softmax(s, -1).numpy())
    return np.vstack(mood_p), np.vstack(sev_p)


def evaluate(model, tokenizer, rows):
    mood_p, sev_p = predict(model, tokenizer, rows)
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
    ap.add_argument("--epochs", type=int, default=4)
    ap.add_argument("--lr", type=float, default=5e-5)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--final", action="store_true", help="train on train+test (gold sets stay unseen)")
    args = ap.parse_args()

    random.seed(7); np.random.seed(7); torch.manual_seed(7)
    torch.set_num_threads(os.cpu_count() or 4)
    train, test, gold = T.load("train.jsonl"), T.load("test.jsonl"), T.load("gold.jsonl")
    fit_rows = train + test if args.final else train
    slices = {"held-out": test, "gold (all)": gold, "gold-a": gold[:46], "gold-b": gold[46:66], "gold-c": gold[66:86], "gold-d hi/ta": gold[86:]}

    tokenizer = AutoTokenizer.from_pretrained(BASE)
    model = Net()
    mood_w, sev_w = class_weights([r["mood"] for r in fit_rows], MOODS), class_weights([r["severity"] for r in fit_rows], SEVERITIES)
    mood_y = torch.tensor([MOODS.index(r["mood"]) for r in fit_rows])
    sev_y = torch.tensor([SEVERITIES.index(r["severity"]) for r in fit_rows])

    encoder_params = list(model.encoder.parameters())
    head_params = list(model.mood.parameters()) + list(model.severity.parameters())
    optim = torch.optim.AdamW([{"params": encoder_params, "lr": args.lr}, {"params": head_params, "lr": args.lr * 20}], weight_decay=0.01)
    steps_per_epoch = (len(fit_rows) + args.batch - 1) // args.batch
    total = steps_per_epoch * args.epochs
    sched = torch.optim.lr_scheduler.LambdaLR(optim, lambda s: min(1.0, (s + 1) / (0.06 * total)) * max(0.0, (total - s) / total))
    log = []
    step, t0 = 0, time.time()
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
            optim.step(); sched.step(); step += 1
            running += loss.item()
            if (b + 1) % 40 == 0:
                print(f"epoch {epoch} step {b + 1}/{steps_per_epoch} loss {running / (b + 1):.3f} elapsed {int(time.time() - t0)}s", flush=True)
        results = {name: evaluate(model, tokenizer, rows) for name, rows in slices.items()}
        print(f"--- after epoch {epoch} ({int(time.time() - t0)}s)", flush=True)
        for name, r in results.items():
            print(fmt(name, r), flush=True)
        log.append((epoch, results))

    ARTIFACTS.mkdir(exist_ok=True)
    tag = "final" if args.final else "eval"
    # Save the probabilities on the sets the model never trained on, so the JavaScript tests can measure the
    # real combined system (keyword safety rules + this model) without needing Python.
    dump = {}
    for name, rows in slices.items():
        if args.final and name == "held-out":
            continue  # held-out was part of the final training data
        mood_p, sev_p = predict(model, tokenizer, rows)
        dump[name] = [{"text": r["text"], "trueMood": r["mood"], "trueSeverity": r["severity"],
                       "moodProbs": [round(float(x), 4) for x in mp], "severityProbs": [round(float(x), 4) for x in sp]}
                      for r, mp, sp in zip(rows, mood_p, sev_p)]
    (ROOT / "data" / f"ft_predictions_{tag}.json").write_text(json.dumps({"moods": MOODS, "severities": SEVERITIES, "sets": dump}, ensure_ascii=False), encoding="utf-8")
    torch.save(model.state_dict(), ARTIFACTS / f"model-{tag}.pt")
    tokenizer.save_pretrained(ARTIFACTS / "tokenizer")
    (ARTIFACTS / "labels.json").write_text(json.dumps({"base": BASE, "moods": MOODS, "severities": SEVERITIES, "max_len": MAX_LEN}), encoding="utf-8")
    lines = [f"# Fine-tuned encoder report ({tag})", "", f"Base model `{BASE}`, {args.epochs} epochs, lr {args.lr}, batch {args.batch}. Trained on {len(fit_rows)} sentences.", ""]
    for epoch, results in log[-1:]:
        lines += [f"## After epoch {epoch}", "", "```"] + [fmt(n, r) for n, r in results.items()] + ["```", ""]
    (ROOT / f"FINETUNE_REPORT_{tag}.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
