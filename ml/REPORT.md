# Mood + situation model report

Training sentences: 7106, held-out (unseen phrasings): 1914, hand-written gold: 102. Vocabulary: 7557 features.

Train/test are split by phrasing and by sentence structure, so the held-out set is *unseen wordings of known situations*. The gold set is
hand-written and never used for training. The first 46 gold sentences guided one round of error analysis and gold-b (next 20) guided
threshold tuning, so neither is fully independent; gold-c (last 20) was written before the final fixes and never tuned against. All sets are small and partly synthetic: treat the numbers as a development check, not a clinical
accuracy claim. Real patient conversations (with consent) are needed before trusting this in care.

### Held-out phrasings (model fitted on train only)

| head | accuracy | macro-F1 |
|---|---|---|
| mood | 0.827 | 0.835 |
| severity | 0.838 | 0.757 |

- Serious (urgent/critical) recall: **0.759**, critical recall: **0.748**
- Dangerous misses (serious predicted none/watch): **0.241**, false alarms on calm sentences: **0.067**

Per-class report, mood:
```
              precision    recall  f1-score   support

       angry       0.97      0.95      0.96        96
     anxious       0.85      0.95      0.90       172
  distressed       0.87      0.87      0.87       615
       happy       0.76      0.80      0.78       292
         low       0.79      0.85      0.82       259
     neutral       0.79      0.67      0.73       322
       tired       0.80      0.80      0.80       158

    accuracy                           0.83      1914
   macro avg       0.83      0.84      0.84      1914
weighted avg       0.83      0.83      0.83      1914

```

Per-class report, severity:
```
              precision    recall  f1-score   support

    critical       0.80      0.75      0.77       321
        none       0.88      0.92      0.90      1218
      urgent       0.68      0.70      0.69       189
       watch       0.73      0.61      0.66       186

    accuracy                           0.84      1914
   macro avg       0.77      0.74      0.76      1914
weighted avg       0.83      0.84      0.84      1914

```

### Alert threshold trade-off (held-out sentences)

The companion alerts the family when P(urgent)+P(critical) is at least the threshold.

| threshold | serious sentences alerted | calm sentences falsely alerted |
|---|---|---|
| 0.25 | 0.894 | 0.177 |
| 0.40 | 0.831 | 0.117 |
| 0.50 | 0.765 | 0.063 |
| 0.60 | 0.702 | 0.024 |
| 0.70 | 0.610 | 0.007 |
| 0.80 | 0.433 | 0.001 |
| 0.85 | 0.282 | 0.001 |

### Gold set (hand-written, exported model)

| head | accuracy | macro-F1 |
|---|---|---|
| mood | 0.863 | 0.856 |
| severity | 0.853 | 0.821 |

- Serious (urgent/critical) recall: **0.879**, critical recall: **0.905**
- Dangerous misses (serious predicted none/watch): **0.121**, false alarms on calm sentences: **0.058**

Per-class report, mood:
```
              precision    recall  f1-score   support

       angry       1.00      0.71      0.83         7
     anxious       0.82      0.90      0.86        10
  distressed       0.89      0.91      0.90        35
       happy       1.00      0.82      0.90        11
         low       0.76      0.93      0.84        14
     neutral       0.79      0.73      0.76        15
       tired       0.90      0.90      0.90        10

    accuracy                           0.86       102
   macro avg       0.88      0.84      0.86       102
weighted avg       0.87      0.86      0.86       102

```

Per-class report, severity:
```
              precision    recall  f1-score   support

    critical       0.86      0.90      0.88        21
        none       0.87      0.90      0.89        52
      urgent       0.80      0.67      0.73        12
       watch       0.81      0.76      0.79        17

    accuracy                           0.85       102
   macro avg       0.84      0.81      0.82       102
weighted avg       0.85      0.85      0.85       102

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

### Gold-c: 20 sentences written before the final fixes, never tuned against (fairest English number)

| head | accuracy | macro-F1 |
|---|---|---|
| mood | 0.700 | 0.714 |
| severity | 0.800 | 0.617 |

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
      urgent       0.00      0.00      0.00         2
       watch       0.67      1.00      0.80         2

    accuracy                           0.80        20
   macro avg       0.57      0.71      0.62        20
weighted avg       0.81      0.80      0.79        20

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
