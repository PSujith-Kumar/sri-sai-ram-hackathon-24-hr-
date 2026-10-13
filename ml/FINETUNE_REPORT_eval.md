# Fine-tuned encoder report (eval)

Base model `intfloat/multilingual-e5-small`, 4 epochs, lr 5e-05, batch 32. Trained on 7599 sentences.

## After epoch 4

```
held-out       n=2036 mood=0.916 (F1 0.914) severity=0.898 (F1 0.818) serious-recall=0.821 false-alarm=0.029
gold (all)     n= 102 mood=0.941 (F1 0.935) severity=0.902 (F1 0.891) serious-recall=0.939 false-alarm=0.038
gold-a         n=  46 mood=0.935 (F1 0.942) severity=0.913 (F1 0.924) serious-recall=0.933 false-alarm=0.043
gold-b         n=  20 mood=0.950 (F1 0.905) severity=0.850 (F1 0.841) serious-recall=1.000 false-alarm=0.125
gold-c         n=  20 mood=0.900 (F1 0.882) severity=0.950 (F1 0.900) serious-recall=1.000 false-alarm=0.000
gold-d hi/ta   n=  16 mood=1.000 (F1 1.000) severity=0.875 (F1 0.873) serious-recall=0.750 false-alarm=0.000
```
