# Presales FinOps Assessment Engine (V1)

A buildable starter for AWS invoice-based presales assessments:

- Ingestion/normalization contract for billing JSON
- Deterministic FinOps rule engine
- Weighted confidence scoring model
- Report output suitable for LLM narrative layering
- Multi-PDF invoice upload and Excel report export
- Cost Explorer CSV upload for deeper optimization insights

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## API endpoints

- `GET /api/health`
- `GET /api/schema` returns sample canonical ingestion payload
- `POST /api/normalize` normalize raw invoice summary into canonical schema
- `POST /api/analyze` full pipeline output:
  - `normalized_data`
  - `rule_findings`
  - `confidence_model`
  - `report`
- `POST /api/assess` backward-compatible report-only response
- `POST /api/invoices/analyze` upload data via `multipart/form-data`:
  - `invoices`: multiple PDF invoices
  - `costExplorer` (or `cost_explorer`): multiple Cost Explorer CSV files
- `GET /api/invoices/export/:reportId` download Excel output for analyzed upload

## Confidence model (100-point, advanced)

Weighted score:

- Data quality: 20%
- Usage visibility: 15%
- Optimization signals: 25%
- Commitment coverage: 15%
- Historical stability: 10%
- Heuristic reliability: 15%

Labels:

- `80-100`: High
- `60-79.99`: Medium
- `<60`: Low

## Notes

- Savings are conservative and capped to avoid aggressive overestimation.
- This is designed for presales-stage analysis from billing data only.
- Add an LLM layer after `POST /api/analyze` for executive narrative generation.
- PDF parsing is heuristic-based for v1. For production, consider AWS CUR ingestion for higher precision.
- Savings apply confidence dampening:
  - `adjusted = estimated * (confidence_score / 100)`
  - if `confidence_score < 60`, an additional `20%` reduction is applied
- Accuracy band:
  - `min = estimated * 0.7`
  - `max = estimated * 1.2`
- Excel export includes a dedicated **Deep Insights** tab for:
  - EBS volumes with older generation
  - Unused EBS Volumes
  - Provisioned IOPS EBS
  - Old EBS Snapshots
  - Unused EIP
  - Previous Generation EC2
  - Idle Ec2 Instances
  - EC2 rightsizing
  - Unused/Idle Load balancers
  - Commitment
  - RDS Manual Snapshot Deletion
  - S3 Teiring
- Deep Insights now includes trend-aware columns from Cost Explorer where available:
  - Previous period vs current period cost
  - Change %
  - Trend direction (increasing/decreasing/stable)
  - Opportunity signal (High/Medium/Low)
