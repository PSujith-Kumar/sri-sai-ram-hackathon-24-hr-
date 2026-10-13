# Mood + situation model report

Training sentences: 7599, held-out (unseen phrasings): 2036, hand-written gold: 102. Vocabulary: 9333 features.

Train/test are split by phrasing and by sentence structure, so the held-out set is *unseen wordings of known situations*. The gold set is
hand-written and never used for training. The first 46 gold sentences guided one round of error analysis and gold-b (next 20) guided
threshold tuning, so neither is fully independent; gold-c (last 20) was written before the final fixes and never tuned against. All sets are small and partly synthetic: treat the numbers as a development check, not a clinical
accuracy claim. Real patient conversations (with consent) are needed before trusting this in care.

### Held-out phrasings (model fitted on train only)

| head | accuracy | macro-F1 |
|---|---|---|
| mood | 0.793 | 0.811 |
| severity | 0.810 | 0.723 |

- Serious (urgent/critical) recall: **0.748**, critical recall: **0.734**
- Dangerous misses (serious predicted none/watch): **0.252**, false alarms on calm sentences: **0.093**

Per-class report, mood:
```
              precision    recall  f1-score   support

       angry       0.95      0.92      0.93        99
     anxious       0.86      0.92      0.89       181
  distressed       0.80      0.84      0.82       636
       happy       0.74      0.80      0.77       310
         low       0.79      0.87      0.83       271
     neutral       0.74      0.56      0.64       379
       tired       0.81      0.79      0.80       160

    accuracy                           0.79      2036
   macro avg       0.81      0.81      0.81      2036
weighted avg       0.79      0.79      0.79      2036

```

Per-class report, severity:
```
              precision    recall  f1-score   support

    critical       0.73      0.73      0.73       331
        none       0.87      0.89      0.88      1307
      urgent       0.59      0.65      0.62       193
       watch       0.74      0.59      0.66       205

    accuracy                           0.81      2036
   macro avg       0.74      0.72      0.72      2036
weighted avg       0.81      0.81      0.81      2036

```

### Alert threshold trade-off (held-out sentences)

The companion alerts the family when P(urgent)+P(critical) is at least the threshold.

| threshold | serious sentences alerted | calm sentences falsely alerted |
|---|---|---|
| 0.25 | 0.908 | 0.189 |
| 0.40 | 0.832 | 0.123 |
| 0.50 | 0.767 | 0.090 |
| 0.60 | 0.683 | 0.039 |
| 0.70 | 0.615 | 0.011 |
| 0.80 | 0.445 | 0.004 |
| 0.85 | 0.284 | 0.004 |

### Gold set (hand-written, exported model)

| head | accuracy | macro-F1 |
|---|---|---|
| mood | 0.882 | 0.868 |
| severity | 0.824 | 0.792 |

- Serious (urgent/critical) recall: **0.909**, critical recall: **0.857**
- Dangerous misses (serious predicted none/watch): **0.091**, false alarms on calm sentences: **0.077**

Per-class report, mood:
```
              precision    recall  f1-score   support

       angry       1.00      0.57      0.73         7
     anxious       1.00      0.90      0.95        10
  distressed       0.91      0.91      0.91        35
       happy       0.91      0.91      0.91        11
         low       0.81      0.93      0.87        14
     neutral       0.76      0.87      0.81        15
       tired       0.90      0.90      0.90        10

    accuracy                           0.88       102
   macro avg       0.90      0.86      0.87       102
weighted avg       0.89      0.88      0.88       102

```

Per-class report, severity:
```
              precision    recall  f1-score   support

    critical       0.78      0.86      0.82        21
        none       0.88      0.87      0.87        52
      urgent       0.75      0.75      0.75        12
       watch       0.75      0.71      0.73        17

    accuracy                           0.82       102
   macro avg       0.79      0.79      0.79       102
weighted avg       0.82      0.82      0.82       102

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
| severity | 0.750 | 0.567 |

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

    critical       0.43      1.00      0.60         3
        none       1.00      0.77      0.87        13
      urgent       0.00      0.00      0.00         2
       watch       0.67      1.00      0.80         2

    accuracy                           0.75        20
   macro avg       0.52      0.69      0.57        20
weighted avg       0.78      0.75      0.74        20

```

### Gold-d: 16 fresh Hindi and Tamil sentences, never trained on (small sample: multilingual accuracy is lower than English)

| head | accuracy | macro-F1 |
|---|---|---|
| mood | 1.000 | 1.000 |
| severity | 0.812 | 0.727 |

- Serious (urgent/critical) recall: **1.000**, critical recall: **0.667**
- Dangerous misses (serious predicted none/watch): **0.000**, false alarms on calm sentences: **0.000**

Per-class report, mood:
```
              precision    recall  f1-score   support

       angry       1.00      1.00      1.00         1
     anxious       1.00      1.00      1.00         2
  distressed       1.00      1.00      1.00         4
       happy       1.00      1.00      1.00         2
         low       1.00      1.00      1.00         3
     neutral       1.00      1.00      1.00         2
       tired       1.00      1.00      1.00         2

    accuracy                           1.00        16
   macro avg       1.00      1.00      1.00        16
weighted avg       1.00      1.00      1.00        16

```

Per-class report, severity:
```
              precision    recall  f1-score   support

    critical       1.00      0.67      0.80         3
        none       0.89      1.00      0.94         8
      urgent       0.33      1.00      0.50         1
       watch       1.00      0.50      0.67         4

    accuracy                           0.81        16
   macro avg       0.81      0.79      0.73        16
weighted avg       0.90      0.81      0.82        16

```
