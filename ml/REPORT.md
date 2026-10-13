# Mood + situation model report

Training sentences: 7357, held-out (unseen phrasings): 1987, hand-written gold: 102. Vocabulary: 8091 features.

Train/test are split by phrasing and by sentence structure, so the held-out set is *unseen wordings of known situations*. The gold set is
hand-written and never used for training. The first 46 gold sentences guided one round of error analysis and gold-b (next 20) guided
threshold tuning, so neither is fully independent; gold-c (last 20) was written before the final fixes and never tuned against. All sets are small and partly synthetic: treat the numbers as a development check, not a clinical
accuracy claim. Real patient conversations (with consent) are needed before trusting this in care.

### Held-out phrasings (model fitted on train only)

| head | accuracy | macro-F1 |
|---|---|---|
| mood | 0.796 | 0.818 |
| severity | 0.829 | 0.744 |

- Serious (urgent/critical) recall: **0.730**, critical recall: **0.745**
- Dangerous misses (serious predicted none/watch): **0.270**, false alarms on calm sentences: **0.074**

Per-class report, mood:
```
              precision    recall  f1-score   support

       angry       0.98      0.95      0.96        96
     anxious       0.84      0.97      0.90       172
  distressed       0.81      0.84      0.82       616
       happy       0.74      0.81      0.77       310
         low       0.77      0.85      0.81       260
     neutral       0.73      0.56      0.64       373
       tired       0.84      0.79      0.82       160

    accuracy                           0.80      1987
   macro avg       0.82      0.82      0.82      1987
weighted avg       0.79      0.80      0.79      1987

```

Per-class report, severity:
```
              precision    recall  f1-score   support

    critical       0.77      0.75      0.76       322
        none       0.88      0.91      0.89      1289
      urgent       0.68      0.64      0.66       189
       watch       0.73      0.61      0.67       187

    accuracy                           0.83      1987
   macro avg       0.76      0.73      0.74      1987
weighted avg       0.83      0.83      0.83      1987

```

### Alert threshold trade-off (held-out sentences)

The companion alerts the family when P(urgent)+P(critical) is at least the threshold.

| threshold | serious sentences alerted | calm sentences falsely alerted |
|---|---|---|
| 0.25 | 0.890 | 0.175 |
| 0.40 | 0.824 | 0.119 |
| 0.50 | 0.746 | 0.071 |
| 0.60 | 0.663 | 0.030 |
| 0.70 | 0.611 | 0.007 |
| 0.80 | 0.434 | 0.004 |
| 0.85 | 0.295 | 0.004 |

### Gold set (hand-written, exported model)

| head | accuracy | macro-F1 |
|---|---|---|
| mood | 0.873 | 0.856 |
| severity | 0.843 | 0.814 |

- Serious (urgent/critical) recall: **0.879**, critical recall: **0.905**
- Dangerous misses (serious predicted none/watch): **0.121**, false alarms on calm sentences: **0.077**

Per-class report, mood:
```
              precision    recall  f1-score   support

       angry       1.00      0.57      0.73         7
     anxious       1.00      0.90      0.95        10
  distressed       0.91      0.91      0.91        35
       happy       0.91      0.91      0.91        11
         low       0.76      0.93      0.84        14
     neutral       0.76      0.87      0.81        15
       tired       0.89      0.80      0.84        10

    accuracy                           0.87       102
   macro avg       0.89      0.84      0.86       102
weighted avg       0.88      0.87      0.87       102

```

Per-class report, severity:
```
              precision    recall  f1-score   support

    critical       0.83      0.90      0.86        21
        none       0.87      0.88      0.88        52
      urgent       0.80      0.67      0.73        12
       watch       0.81      0.76      0.79        17

    accuracy                           0.84       102
   macro avg       0.83      0.81      0.81       102
weighted avg       0.84      0.84      0.84       102

```

### Gold-b: 20 sentences written after the first error analysis (then used to tune thresholds, so optimistic)

| head | accuracy | macro-F1 |
|---|---|---|
| mood | 0.750 | 0.746 |
| severity | 0.700 | 0.697 |

- Serious (urgent/critical) recall: **0.778**, critical recall: **0.600**
- Dangerous misses (serious predicted none/watch): **0.222**, false alarms on calm sentences: **0.125**

Per-class report, mood:
```
              precision    recall  f1-score   support

       angry       1.00      1.00      1.00         1
     anxious       1.00      1.00      1.00         1
  distressed       0.89      0.89      0.89         9
       happy       1.00      0.50      0.67         2
         low       1.00      0.50      0.67         2
     neutral       0.40      0.67      0.50         3
       tired       0.50      0.50      0.50         2

    accuracy                           0.75        20
   macro avg       0.83      0.72      0.75        20
weighted avg       0.81      0.75      0.76        20

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

### Gold-c: 20 sentences written before the final fixes, never tuned against (fairest English number)

| head | accuracy | macro-F1 |
|---|---|---|
| mood | 0.750 | 0.703 |
| severity | 0.750 | 0.584 |

- Serious (urgent/critical) recall: **0.800**, critical recall: **1.000**
- Dangerous misses (serious predicted none/watch): **0.200**, false alarms on calm sentences: **0.231**

Per-class report, mood:
```
              precision    recall  f1-score   support

       angry       0.00      0.00      0.00         2
     anxious       1.00      1.00      1.00         2
  distressed       0.80      0.67      0.73         6
       happy       0.75      1.00      0.86         3
         low       0.50      1.00      0.67         2
     neutral       0.67      0.67      0.67         3
       tired       1.00      1.00      1.00         2

    accuracy                           0.75        20
   macro avg       0.67      0.76      0.70        20
weighted avg       0.70      0.75      0.71        20

```

Per-class report, severity:
```
              precision    recall  f1-score   support

    critical       0.50      1.00      0.67         3
        none       1.00      0.77      0.87        13
      urgent       0.00      0.00      0.00         2
       watch       0.67      1.00      0.80         2

    accuracy                           0.75        20
   macro avg       0.54      0.69      0.58        20
weighted avg       0.79      0.75      0.75        20

```

### Gold-d: 16 fresh Hindi and Tamil sentences, never trained on (small sample: multilingual accuracy is lower than English)

| head | accuracy | macro-F1 |
|---|---|---|
| mood | 0.938 | 0.932 |
| severity | 0.875 | 0.687 |

- Serious (urgent/critical) recall: **0.750**, critical recall: **1.000**
- Dangerous misses (serious predicted none/watch): **0.250**, false alarms on calm sentences: **0.000**

Per-class report, mood:
```
              precision    recall  f1-score   support

       angry       1.00      1.00      1.00         1
     anxious       1.00      1.00      1.00         2
  distressed       1.00      1.00      1.00         4
       happy       1.00      1.00      1.00         2
         low       0.75      1.00      0.86         3
     neutral       1.00      1.00      1.00         2
       tired       1.00      0.50      0.67         2

    accuracy                           0.94        16
   macro avg       0.96      0.93      0.93        16
weighted avg       0.95      0.94      0.93        16

```

Per-class report, severity:
```
              precision    recall  f1-score   support

    critical       1.00      1.00      1.00         3
        none       0.80      1.00      0.89         8
      urgent       0.00      0.00      0.00         1
       watch       1.00      0.75      0.86         4

    accuracy                           0.88        16
   macro avg       0.70      0.69      0.69        16
weighted avg       0.84      0.88      0.85        16

```
