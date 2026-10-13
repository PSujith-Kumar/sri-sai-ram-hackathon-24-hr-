# Fine-tuned encoder report (final)

Base model `intfloat/multilingual-e5-small`, 4 epochs, lr 5e-05, batch 32. Trained on 9635 sentences.

## After epoch 4

```
held-out       (not a valid score: this final model was trained on these sentences. Use the gold lines below.)
gold (all)     n= 102 mood=0.922 (F1 0.892) severity=0.931 (F1 0.915) serious-recall=0.970 false-alarm=0.019
gold-a         n=  46 mood=0.935 (F1 0.912) severity=0.978 (F1 0.980) serious-recall=1.000 false-alarm=0.000
gold-b         n=  20 mood=0.850 (F1 0.801) severity=0.800 (F1 0.806) serious-recall=0.889 false-alarm=0.125
gold-c         n=  20 mood=0.900 (F1 0.800) severity=0.950 (F1 0.900) serious-recall=1.000 false-alarm=0.000
gold-d hi/ta   n=  16 mood=1.000 (F1 1.000) severity=0.938 (F1 0.950) serious-recall=1.000 false-alarm=0.000
```
