"""Trains the CareBridge mood + situation models and exports them for the browser.

  python ml/generate_dataset.py     # build the data
  python ml/train.py                # train, evaluate, export

Two multinomial logistic-regression heads share one TF-IDF feature space
(word unigrams + bigrams + character trigrams, so typos and mixed languages still help).
Output: src/companion/mood-model.json (loaded by src/companion/mood.js) and ml/REPORT.md.
The feature code below is mirrored exactly in mood.js; tests/mood.test.js checks they agree.
"""
import json
import math
import re
from collections import Counter
from pathlib import Path

import numpy as np
from scipy import sparse
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, f1_score

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
MODEL_PATH = ROOT.parent / "src" / "companion" / "mood-model.json"
MIN_DF = 3
SEVERITY_ORDER = ["none", "watch", "urgent", "critical"]


def tokenize(text):
    text = text.lower().replace("'", "").replace("’", "")
    return re.sub(r"[^a-z0-9ऀ-ॿ஀-௿]+", " ", text).split()


# Filler words carry no mood or severity signal and let the model latch onto template artefacts.
# Negations (no, not, never, cant, dont) are deliberately kept. Mirrored in src/companion/mood.js.
STOP = {"the", "a", "an", "is", "are", "was", "were", "am", "i", "im", "ive", "my", "me", "to", "and", "of", "it", "its", "in", "on", "at", "for",
        "with", "that", "this", "so", "be", "been", "have", "has", "had", "do", "does", "did", "just", "very", "really", "keep", "keeps"}


def features(text):
    words = [w for w in tokenize(text) if w not in STOP]
    out = ["w:" + w for w in words]
    out += ["b:" + a + "_" + b for a, b in zip(words, words[1:])]
    for w in words:
        if len(w) >= 4:
            padded = "<" + w + ">"
            out += ["c:" + padded[i:i + 3] for i in range(len(padded) - 2)]
    return out


def load(name):
    with open(DATA / name, encoding="utf-8") as f:
        return [json.loads(line) for line in f]


def build_vocab(rows):
    df = Counter()
    for row in rows:
        df.update(set(features(row["text"])))
    vocab = {f: i for i, f in enumerate(sorted(f for f, c in df.items() if c >= MIN_DF))}
    n = len(rows)
    idf = np.zeros(len(vocab))
    for f, i in vocab.items():
        idf[i] = math.log((1 + n) / (1 + df[f])) + 1
    return vocab, idf


def vectorize(rows, vocab, idf):
    data, indices, indptr = [], [], [0]
    for row in rows:
        counts = Counter(f for f in features(row["text"]) if f in vocab)
        vals = {vocab[f]: (1 + math.log(c)) * idf[vocab[f]] for f, c in counts.items()}
        norm = math.sqrt(sum(v * v for v in vals.values())) or 1.0
        for i in sorted(vals):
            indices.append(i)
            data.append(vals[i] / norm)
        indptr.append(len(indices))
    return sparse.csr_matrix((data, indices, indptr), shape=(len(rows), len(vocab)))


def fit(X, y):
    return LogisticRegression(C=3, max_iter=4000, class_weight="balanced").fit(X, y)


def severity_safety(y_true, y_pred):
    """The costs that matter for care: missed emergencies and false alarms."""
    t = np.array([SEVERITY_ORDER.index(s) for s in y_true])
    p = np.array([SEVERITY_ORDER.index(s) for s in y_pred])
    serious = t >= 2
    calm = t == 0
    return {
        "serious_recall": float(((p >= 2) & serious).sum() / max(1, serious.sum())),
        "critical_recall": float(((p == 3) & (t == 3)).sum() / max(1, (t == 3).sum())),
        "dangerous_miss": float(((p <= 1) & serious).sum() / max(1, serious.sum())),
        "false_alarm": float(((p >= 2) & calm).sum() / max(1, calm.sum())),
    }


def evaluate(models, vocab, idf, rows):
    X = vectorize(rows, vocab, idf)
    res = {}
    for head in ("mood", "severity"):
        pred = models[head].predict(X)
        true = [r[head] for r in rows]
        res[head] = {"acc": accuracy_score(true, pred), "f1": f1_score(true, pred, average="macro"), "pred": list(pred), "true": true}
    res["safety"] = severity_safety(res["severity"]["true"], res["severity"]["pred"])
    return res


def section(title, res):
    lines = [f"### {title}", "", "| head | accuracy | macro-F1 |", "|---|---|---|"]
    for head in ("mood", "severity"):
        lines.append(f"| {head} | {res[head]['acc']:.3f} | {res[head]['f1']:.3f} |")
    s = res["safety"]
    lines += ["", f"- Serious (urgent/critical) recall: **{s['serious_recall']:.3f}**, critical recall: **{s['critical_recall']:.3f}**",
              f"- Dangerous misses (serious predicted none/watch): **{s['dangerous_miss']:.3f}**, false alarms on calm sentences: **{s['false_alarm']:.3f}**", ""]
    for head in ("mood", "severity"):
        lines += [f"Per-class report, {head}:", "```", classification_report(res[head]["true"], res[head]["pred"], zero_division=0), "```", ""]
    return lines


def threshold_table(model, vocab, idf, rows):
    """Alert threshold trade-off on held-out data: P(urgent)+P(critical) >= t."""
    probs = model.predict_proba(vectorize(rows, vocab, idf))
    classes = list(model.classes_)
    mass = probs[:, classes.index("urgent")] + probs[:, classes.index("critical")]
    severity = np.array([r["severity"] for r in rows])
    serious, calm = np.isin(severity, ["urgent", "critical"]), severity == "none"
    lines = ["### Alert threshold trade-off (held-out sentences)", "", "The companion alerts the family when P(urgent)+P(critical) is at least the threshold.", "",
             "| threshold | serious sentences alerted | calm sentences falsely alerted |", "|---|---|---|"]
    for t in (0.25, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85):
        lines.append(f"| {t:.2f} | {(mass[serious] >= t).mean():.3f} | {(mass[calm] >= t).mean():.3f} |")
    return lines + [""]


def export(models, vocab, idf):
    MODEL_PATH.write_text(json.dumps({
        "version": 1,
        "moods": [str(c) for c in models["mood"].classes_],
        "severities": [str(c) for c in models["severity"].classes_],
        "vocab": vocab,
        "idf": [round(float(v), 4) for v in idf],
        "mood": {"coef": np.round(models["mood"].coef_, 3).tolist(), "intercept": np.round(models["mood"].intercept_, 3).tolist()},
        "severity": {"coef": np.round(models["severity"].coef_, 3).tolist(), "intercept": np.round(models["severity"].intercept_, 3).tolist()},
    }, separators=(",", ":")), encoding="utf-8")


def softmax_rows(models, head, X):
    return models[head].predict_proba(X)


def main():
    train, test, gold = load("train.jsonl"), load("test.jsonl"), load("gold.jsonl")

    # 1) honest evaluation: fit on train only
    vocab, idf = build_vocab(train)
    models = {h: fit(vectorize(train, vocab, idf), [r[h] for r in train]) for h in ("mood", "severity")}
    held_out = evaluate(models, vocab, idf, test)
    gold_res = evaluate(models, vocab, idf, gold)
    table = threshold_table(models["severity"], vocab, idf, test)

    # 2) final model: fit on train + test, export (gold stays unseen)
    allrows = train + test
    vocab, idf = build_vocab(allrows)
    final = {h: fit(vectorize(allrows, vocab, idf), [r[h] for r in allrows]) for h in ("mood", "severity")}
    export(final, vocab, idf)

    # parity fixtures so the JavaScript implementation can be checked against this one
    sample = gold[:30] + test[:10]
    Xs = vectorize(sample, vocab, idf)
    parity = [{"text": r["text"], "mood": [round(float(p), 4) for p in pm], "severity": [round(float(p), 4) for p in ps]}
              for r, pm, ps in zip(sample, final["mood"].predict_proba(Xs), final["severity"].predict_proba(Xs))]
    (DATA / "parity.json").write_text(json.dumps(parity, ensure_ascii=False), encoding="utf-8")

    final_gold = evaluate(final, vocab, idf, gold)
    gold_b = evaluate(final, vocab, idf, gold[46:66])  # written after the first error analysis (later used for tuning)
    fresh = evaluate(final, vocab, idf, gold[66:86])   # gold-c: written before the final fixes, never tuned against
    gold_d = evaluate(final, vocab, idf, gold[86:])    # gold-d: Hindi and Tamil, written fresh, never trained on
    lines = ["# Mood + situation model report", "",
             f"Training sentences: {len(train)}, held-out (unseen phrasings): {len(test)}, hand-written gold: {len(gold)}. Vocabulary: {len(vocab)} features.", "",
             "Train/test are split by phrasing and by sentence structure, so the held-out set is *unseen wordings of known situations*. The gold set is",
             "hand-written and never used for training. The first 46 gold sentences guided one round of error analysis and gold-b (next 20) guided",
             "threshold tuning, so neither is fully independent; gold-c (last 20) was written before the final fixes and never tuned against. All sets are small and partly synthetic: treat the numbers as a development check, not a clinical",
             "accuracy claim. Real patient conversations (with consent) are needed before trusting this in care.", ""]
    lines += section("Held-out phrasings (model fitted on train only)", held_out)
    lines += table
    lines += section("Gold set (hand-written, exported model)", final_gold)
    lines += section("Gold-b: 20 sentences written after the first error analysis (then used to tune thresholds, so optimistic)", gold_b)
    lines += section("Gold-c: 20 sentences written before the final fixes, never tuned against (fairest English number)", fresh)
    lines += section("Gold-d: 16 fresh Hindi and Tamil sentences, never trained on (small sample: multilingual accuracy is lower than English)", gold_d)
    (ROOT / "REPORT.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"vocab={len(vocab)}  model={MODEL_PATH.stat().st_size // 1024} KB")
    for name, res in (("held-out", held_out), ("gold", final_gold), ("gold-c", fresh), ("gold-d hi/ta", gold_d)):
        s = res["safety"]
        print(f"{name:9s} mood acc={res['mood']['acc']:.3f} f1={res['mood']['f1']:.3f} | severity acc={res['severity']['acc']:.3f} f1={res['severity']['f1']:.3f} "
              f"| serious recall={s['serious_recall']:.3f} dangerous miss={s['dangerous_miss']:.3f} false alarm={s['false_alarm']:.3f}")


if __name__ == "__main__":
    main()
