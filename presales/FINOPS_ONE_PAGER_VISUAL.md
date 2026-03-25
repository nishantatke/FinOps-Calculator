# FinOps Cost Optimization Engine: One-Page Visual

## Architecture View

```mermaid
flowchart LR
  A[Client / Presales Team] --> B[Upload Portal<br/>PDF Invoices + Cost Explorer CSV]
  B --> C[/Analyze API/]

  C --> D[Invoice Parser]
  C --> E[Cost Explorer Parser]
  D --> F[Normalization Layer]
  E --> F

  F --> G[Deterministic Rule Engine]
  G --> H[Advanced Confidence Model]
  G --> I[Savings Estimator]
  H --> J[Confidence Dampening + Accuracy Band]
  I --> J

  E --> K[12-Area Deep Insight Engine]
  J --> L[Report Composer]
  K --> L

  L --> M[(Runtime Report Cache)]
  M --> N[/Export API/]
  N --> O[Excel Report Pack]

  O --> P[Executive Summary]
  O --> Q[Deep Insights]
  O --> R[Scoring Matrix]
```

---

## Algorithm View

```mermaid
flowchart TD
  S[Input Data] --> T[Extract Bill + Service Signals]
  T --> U[Run 12 Optimization Heuristics]
  U --> V[Compute Confidence Score]

  V --> V1[Data Quality 20%]
  V --> V2[Usage Visibility 15%]
  V --> V3[Optimization Signals 25%]
  V --> V4[Commitment Coverage 15%]
  V --> V5[Historical Stability 10%]
  V --> V6[Heuristic Reliability 15%]

  V6 --> W[Raw Savings Estimate]
  W --> X[Apply Confidence Dampening]
  X --> Y{Confidence < 60?}
  Y -- Yes --> Z[Extra 20% Reduction]
  Y -- No --> AA[No Extra Reduction]
  Z --> AB[Final Savings]
  AA --> AB
  AB --> AC[Min-Max Range<br/>Min=Raw*0.7, Max=Raw*1.2]
  AC --> AD[Excel Output + Presales Narrative]
```

---

## Prioritization Lens

```mermaid
quadrantChart
    title FinOps Action Prioritization (Impact vs Ease)
    x-axis Low Ease --> High Ease
    y-axis Low Impact --> High Impact
    quadrant-1 Quick Wins
    quadrant-2 Strategic Bets
    quadrant-3 Backlog
    quadrant-4 Planned Improvements
    Idle EC2: [0.86, 0.92]
    Unused EBS: [0.84, 0.88]
    Unused EIP: [0.93, 0.40]
    Old Snapshots: [0.90, 0.68]
    EC2 Rightsizing: [0.58, 0.88]
    Commitment (SP/RI): [0.50, 0.94]
    S3 Tiering: [0.78, 0.72]
```

---

## Executive Formula Strip

```text
Confidence =
(DataQuality*0.20) + (Visibility*0.15) + (Signals*0.25) +
(Commitment*0.15) + (Historical*0.10) + (Heuristic*0.15)

AdjustedSavings = RawEstimatedSavings * (Confidence/100)
If Confidence < 60 => AdjustedSavings = AdjustedSavings * 0.80
Range: Min = Raw*0.70 | Max = Raw*1.20
```

