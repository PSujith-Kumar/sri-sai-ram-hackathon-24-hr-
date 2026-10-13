# Mood + situation model report

Training sentences: 6757, held-out (unseen phrasings): 1846, hand-written gold: 86. Vocabulary: 5906 features.

Train/test are split by phrasing and by sentence structure, so the held-out set is *unseen wordings of known situations*. The gold set is
hand-written and never used for training. The first 46 gold sentences guided one round of error analysis and gold-b (next 20) guided
threshold tuning, so neither is fully independent; gold-c (last 20) was written before the final fixes and never tuned against. All sets are small and partly synthetic: treat the numbers as a development check, not a clinical
accuracy claim. Real patient conversations (with consent) are needed before trusting this in care.

### Held-out phrasings (model fitted on train only)

| head | accuracy | macro-F1 |
|---|---|---|
| mood | 0.814 | 0.832 |
| severity | 0.835 | 0.755 |

- Serious (urgent/critical) recall: **0.760**, critical recall: **0.759**
- Dangerous misses (serious predicted none/watch): **0.240**, false alarms on calm sentences: **0.079**

Per-class report, mood:
```
              precision    recall  f1-score   support

       angry       0.99      0.95      0.97        96
     anxious       0.85      0.94      0.89       172
  distressed       0.82      0.86      0.84       583
       happy       0.75      0.78      0.77       283
         low       0.75      0.81      0.78       250
     neutral       0.79      0.63      0.70       316
       tired       0.90      0.85      0.87       146

    accuracy                           0.81      1846
   macro avg       0.84      0.83      0.83      1846
weighted avg       0.81      0.81      0.81      1846

```

Per-class report, severity:
```
              precision    recall  f1-score   support

    critical       0.79      0.76      0.77       303
        none       0.89      0.90      0.90      1191
      urgent       0.67      0.71      0.69       181
       watch       0.70      0.63      0.66       171

    accuracy                           0.83      1846
   macro avg       0.76      0.75      0.75      1846
weighted avg       0.83      0.83      0.83      1846

```

### Alert threshold trade-off (held-out sentences)

The companion alerts the family when P(urgent)+P(critical) is at least the threshold.

| threshold | serious sentences alerted | calm sentences falsely alerted |
|---|---|---|
| 0.25 | 0.909 | 0.180 |
| 0.40 | 0.839 | 0.125 |
| 0.50 | 0.773 | 0.069 |
| 0.60 | 0.692 | 0.022 |
| 0.70 | 0.605 | 0.003 |
| 0.80 | 0.432 | 0.001 |
| 0.85 | 0.308 | 0.001 |

### Gold set (hand-written, exported model)

| head | accuracy | macro-F1 |
|---|---|---|
| mood | 0.849 | 0.840 |
| severity | 0.860 | 0.844 |

- Serious (urgent/critical) recall: **0.897**, critical recall: **0.889**
- Dangerous misses (serious predicted none/watch): **0.103**, false alarms on calm sentences: **0.068**

Per-class report, mood:
```
              precision    recall  f1-score   support

       angry       1.00      0.67      0.80         6
     anxious       0.78      0.88      0.82         8
  distressed       0.88      0.90      0.89        31
       happy       1.00      0.78      0.88         9
         low       0.77      0.91      0.83        11
     neutral       0.75      0.69      0.72        13
       tired       0.89      1.00      0.94         8

    accuracy                           0.85        86
   macro avg       0.87      0.83      0.84        86
weighted avg       0.86      0.85      0.85        86

```

Per-class report, severity:
```
              precision    recall  f1-score   support

    critical       0.84      0.89      0.86        18
        none       0.89      0.89      0.89        44
      urgent       0.90      0.82      0.86        11
       watch       0.77      0.77      0.77        13

    accuracy                           0.86        86
   macro avg       0.85      0.84      0.84        86
weighted avg       0.86      0.86      0.86        86

```

### Gold-b: 20 sentences written after the first error analysis (then used to tune thresholds, so optimistic)

| head | accuracy | macro-F1 |
|---|---|---|
| mood | 0.750 | 0.717 |
| severity | 0.700 | 0.697 |

- Serious (urgent/critical) recall: **0.778**, critical recall: **0.600**
- Dangerous misses (serious predicted none/watch): **0.222**, false alarms on calm sentences: **0.125**

Per-class report, mood:
```
              precision    recall  f1-score   support

       angry       1.00      1.00      1.00         1
     anxious       0.50      1.00      0.67         1
  distressed       0.89      0.89      0.89         9
       happy       1.00      0.50      0.67         2
         low       1.00      0.50      0.67         2
     neutral       0.33      0.33      0.33         3
       tired       0.67      1.00      0.80         2

    accuracy                           0.75        20
   macro avg       0.77      0.75      0.72        20
weighted avg       0.79      0.75      0.75        20

```

Per-class report, severity:
```
              precision    recall  f1-score   support

    critical       0.75      0.60      0.67         5
        none       0.67      0.75      0.71         8
      urgent       0.75      0.75      0.75         4
       watch       0.67      0.67      0.67         3

    accuracy                           0.70        20
   macro avg       0.71      0.69      0.70        20
weighted avg       0.70      0.70      0.70        20

```

### Gold-c: the last 20 gold sentences (written before the final fixes, never tuned against: the fairest number)

| head | accuracy | macro-F1 |
|---|---|---|
| mood | 0.700 | 0.714 |
| severity | 0.850 | 0.783 |

- Serious (urgent/critical) recall: **0.800**, critical recall: **1.000**
- Dangerous misses (serious predicted none/watch): **0.200**, false alarms on calm sentences: **0.154**

Per-class report, mood:
```
              precision    recall  f1-score   support

       angry       1.00      0.50      0.67         2
     anxious       0.67      1.00      0.80         2
  distressed       0.67      0.67      0.67         6
       happy       1.00      0.67      0.80         3
         low       0.50      1.00      0.67         2
     neutral       0.50      0.33      0.40         3
       tired       1.00      1.00      1.00         2

    accuracy                           0.70        20
   macro avg       0.76      0.74      0.71        20
weighted avg       0.74      0.70      0.69        20

```

Per-class report, severity:
```
              precision    recall  f1-score   support

    critical       0.60      1.00      0.75         3
        none       1.00      0.85      0.92        13
      urgent       1.00      0.50      0.67         2
       watch       0.67      1.00      0.80         2

    accuracy                           0.85        20
   macro avg       0.82      0.84      0.78        20
weighted avg       0.91      0.85      0.86        20

```
