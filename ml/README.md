# Mood and situation model

The companion reads a patient's sentence and decides two things: **mood** (happy, neutral, low, anxious, tired,
angry, distressed) and **severity** (none, watch, urgent, critical). Three layers work together, safest first:

1. **Keyword safety rules** (`src/companion/brain.js`): fixed, tested, English / Hindi / Tamil. They always win.
2. **A model** that understands wording the rules do not know. It can only *raise* concern, never lower it.
   - **Fine-tuned encoder (recommended):** `multilingual-e5-small` fine-tuned on our data, served locally.
   - **Built-in TF-IDF model:** small, runs inside the browser, used when the service below is not running.
3. **Gemma 3** (optional, see the app's settings card) writes the conversation and gives a second opinion.

## Data
`python ml/generate_dataset.py` builds `ml/data/{train,test,gold}.jsonl`.
It is **synthetic plus hand-written**, so measured accuracy is optimistic. To improve the model for real use, add
real, consented, de-identified patient sentences labelled by clinicians to `ml/handwritten*.py` (or a new source) and retrain.

* `gold` sets are hand-written and never trained on. Gold-a/b guided some tuning; gold-c and gold-d did not.
* Held-out = sentences whose *wording / structure* the model never saw.

## Train
```bash
pip install torch transformers scikit-learn numpy scipy
python ml/generate_dataset.py
python ml/train.py              # built-in TF-IDF model -> src/companion/mood-model.json
python ml/finetune.py           # fine-tune + honest evaluation (train only)  -> ml/FINETUNE_REPORT_eval.md
python ml/finetune.py --final   # final model on train+test (gold stays unseen) -> ml/artifacts/ (git-ignored)
```
Fine-tuning takes about 25 minutes on a laptop CPU and downloads the base model (~470 MB) once.

## Serve the fine-tuned model to the app
```bash
python ml/serve.py              # http://127.0.0.1:8765 , patient text is never logged
npm run dev                     # the app reaches it through the /classifier proxy
```
The "Gemma 3 language model" card in AI Companion shows whether the fine-tuned model is running. If it is not,
the app silently uses the built-in model.

## Privacy
The service binds to 127.0.0.1 only and never logs or stores the text it receives.
