# Fine-tuned Gemma 3 270M report (eval)

Base model `unsloth/gemma-3-270m-it`, 3 epochs, lr 4e-05, batch 32. Trained on 7599 sentences.

## After epoch 3

```
held-out       n=2036 mood=0.884 (F1 0.894) severity=0.926 (F1 0.865) serious-recall=0.912 false-alarm=0.015
gold (all)     n= 102 mood=0.912 (F1 0.899) severity=0.912 (F1 0.888) serious-recall=0.939 false-alarm=0.038
gold-a         n=  46 mood=0.913 (F1 0.897) severity=0.935 (F1 0.936) serious-recall=0.933 false-alarm=0.087
gold-b         n=  20 mood=0.900 (F1 0.781) severity=0.950 (F1 0.942) serious-recall=1.000 false-alarm=0.000
gold-c         n=  20 mood=0.850 (F1 0.852) severity=0.850 (F1 0.716) serious-recall=0.800 false-alarm=0.000
gold-d hi/ta   n=  16 mood=1.000 (F1 1.000) severity=0.875 (F1 0.816) serious-recall=1.000 false-alarm=0.000
```
