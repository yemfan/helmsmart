# ML Model Training Guide — Home Value AVM

This guide covers how to train, evaluate, and deploy the XGBoost/LightGBM
valuation model that serves as a third blending signal in the home value
estimate pipeline.

> **Note (2026):** RentCast has been removed. Where this guide says "Rentcast
> AVM" (Signal 1, and the `api_estimate` feature), read it as the AI-grounded
> AVM — Claude reasoning over live web search of recent comparable sales and
> public listing data. RentCast is no longer a live or required data source.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  Estimate Pipeline                       │
│                                                         │
│  Signal 1: Rentcast AVM (75-85% weight)                │
│  Signal 2: Comp-based PPSF × sqft (15-25% weight)     │
│  Signal 3: ML Model prediction (15% weight, optional)  │
│                                                         │
│  + 11 multiplicative adjustments:                       │
│    property type, beds/baths, age, lot, condition,      │
│    renovation, market trend, walk score, flood zone,    │
│    seasonal, school rating                              │
└─────────────────────────────────────────────────────────┘
```

The ML model is **optional** — if it's not trained or Python isn't available,
the pipeline uses Signals 1 + 2 only. No user impact.

---

## Prerequisites

### Python environment

```bash
cd apps/propertytoolsai/ml/valuation

# Create a virtual environment (recommended)
python3 -m venv .venv
source .venv/bin/activate        # macOS/Linux
# .venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt

# Install XGBoost (recommended) or LightGBM
pip install xgboost
# pip install lightgbm           # alternative, slightly better accuracy

# Optional: ONNX export for future Node.js native inference
# pip install skl2onnx onnxruntime
```

### Database access

The training data export script needs access to your Supabase database.
Make sure these environment variables are set:

```bash
export NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

---

## Step 1: Check Data Readiness

The model needs rows in `valuation_runs` with **actual sale prices**.
Run this query in Supabase SQL Editor:

```sql
SELECT
  count(*) AS total_rows,
  count(*) FILTER (WHERE actual_sale_price IS NOT NULL AND actual_sale_price > 0) AS labeled_rows,
  min(created_at) AS earliest,
  max(created_at) AS latest
FROM valuation_runs;
```

| Labeled rows | Ready to train? | Expected accuracy |
|-------------|-----------------|-------------------|
| < 100       | No              | —                 |
| 100–500     | Experimental    | MAPE 15-25%       |
| 500–2,000   | Yes             | MAPE 8-15%        |
| 2,000–10,000| Good            | MAPE 5-10%        |
| 10,000+     | Excellent       | MAPE 3-7%         |

**If you have fewer than 100 labeled rows**, stop here. The model won't
help yet. Focus on accumulating data — every estimate you run that later
results in a sale adds a training row.

---

## Step 2: Export Training Data

```bash
# From the monorepo root
pnpm smoke:valuation-training-exports -w propertytoolsai
```

This exports data to:
```
apps/propertytoolsai/ml/valuation/data/valuation_training_data.csv
```

### What the export includes (20+ columns)

**Target variable:**
- `actual_sale_price` — the ground truth sale price

**Subject property features:**
- `beds`, `baths`, `sqft`, `lot_size`, `year_built`
- `city`, `state`, `zip`, `property_type`, `condition`

**Pipeline outputs (model can learn from its own estimates):**
- `api_estimate` — Rentcast AVM value
- `comps_estimate` — comp-based PPSF × sqft
- `final_estimate` — blended pipeline output
- `confidence_score`, `comparable_count`, `weighted_ppsf`

**Derived stability features:**
- `api_vs_comps_diff_pct` — divergence between AVM and comps
- `months_from_estimate_to_sale` — time lag

---

## Step 3: Train the Model

```bash
cd apps/propertytoolsai/ml/valuation

python train.py \
  --csv data/valuation_training_data.csv \
  --out-dir artifacts/valuation_model \
  --test-size 0.2 \
  --min-rows 30
```

### What happens during training

1. **Feature engineering** — normalizes columns, derives stability features
2. **Column pruning** — drops entirely-null numeric and all-unknown categorical columns
3. **Backend selection** — tries LightGBM → XGBoost → sklearn (auto-fallback)
4. **Preprocessing** — median imputation for numerics, one-hot encoding for categoricals
5. **Training** — 80/20 train/test split, 500 estimators, learning rate 0.03
6. **Evaluation** — MAE, median AE, RMSE, MAPE, R² on test set
7. **Export** — saves joblib model, schema.json, metrics.json, and optionally ONNX

### Output files

```
artifacts/valuation_model/
├── valuation_model.joblib   # Trained sklearn pipeline (required)
├── schema.json              # Feature names and types
├── metrics.json             # Test set evaluation metrics
└── valuation_model.onnx     # Optional ONNX export
```

### Reading the metrics output

```json
{
  "backend": "xgboost",
  "train_rows": 4000,
  "test_rows": 1000,
  "mae": 28500,          // Mean Absolute Error ($)
  "median_ae": 19200,    // Median Absolute Error ($)
  "rmse": 45000,         // Root Mean Squared Error ($)
  "mape": 0.068,         // Mean Absolute Percentage Error (6.8%)
  "r2": 0.92             // R-squared (higher = better)
}
```

**Good benchmarks:**
| Metric | Good | Great | Excellent |
|--------|------|-------|-----------|
| MAPE   | < 12% | < 8% | < 5% |
| R²     | > 0.85 | > 0.90 | > 0.95 |
| MAE    | < $50K | < $30K | < $15K |

---

## Step 4: Verify the Model Works

### Quick prediction test

```bash
cd apps/propertytoolsai/ml/valuation

# Create a test input
cat > /tmp/test_input.json << 'JSON'
[{
  "beds": 3,
  "baths": 2,
  "sqft": 1800,
  "lot_size": 6000,
  "year_built": 1990,
  "city": "Alhambra",
  "state": "CA",
  "zip": "91803",
  "property_type": "single family",
  "condition": "good",
  "api_estimate": 850000,
  "comps_estimate": 820000,
  "final_estimate": 840000,
  "low_estimate": 790000,
  "high_estimate": 890000,
  "confidence_score": 72,
  "comparable_count": 5,
  "weighted_ppsf": 455
}]
JSON

python predict.py \
  --model-dir artifacts/valuation_model \
  --input-json /tmp/test_input.json
```

Expected output:
```json
{
  "predictions": [842500.0]
}
```

### Evaluate on full dataset

```bash
python evaluate.py \
  --model-dir artifacts/valuation_model \
  --csv data/valuation_training_data.csv
```

---

## Step 5: Deploy (Automatic)

**No deployment step needed.** The Node.js inference service
(`lib/homeValue/mlInference.ts`) automatically detects the trained model
in `artifacts/valuation_model/` and uses it on the next estimate request.

The pipeline logs will show:
```
[mlInference] ML prediction: $842,500
[estimate] ML model: $842,500 (divergence: 0.3%, blended: $840,375)
```

If the model isn't available:
```
[estimate] ML model skipped: Model not trained yet
```

### How the ML prediction is blended

- ML gets **15% weight** on the final estimate
- When ML agrees (within 10% of current estimate) → range band tightens 10%
- When ML disagrees (>20% divergence) → range band widens 15%
- When ML unavailable → pipeline uses Signals 1 + 2 only (no impact)

---

## Step 6: Register in Model Registry (Optional)

For tracking model versions and A/B testing:

```sql
INSERT INTO ml_models (
  model_key, model_version, status, backend,
  artifact_path, schema_path, metrics_json,
  rows_used, is_active, trained_at
) VALUES (
  'valuation_avm',
  'v2.1',
  'active',
  'xgboost',
  'ml/valuation/artifacts/valuation_model/valuation_model.joblib',
  'ml/valuation/artifacts/valuation_model/schema.json',
  '{"mae": 28500, "mape": 0.068, "r2": 0.92}',
  5000,
  true,
  now()
);
```

---

## Retraining Schedule

| Phase | Data size | Frequency | Trigger |
|-------|-----------|-----------|---------|
| Early | < 1K rows | Don't train | Wait for more data |
| First train | 1K–5K | Once | Validate model beats heuristic |
| Growing | 5K–20K | Monthly | New sales data improves accuracy |
| Mature | 20K+ | Quarterly | Diminishing returns per batch |
| Ad-hoc | Any | As needed | Market shift, feature change, MAPE > 12% |

### Signs you need to retrain

- **MAPE climbed above 12%** — model is going stale
- **Added new features** (walk score, school ratings, etc.) — retrain to learn them
- **Market shift** — interest rate changes, seasonal transition
- **New geography** — model hasn't seen properties in a new market

### How to check current model performance

```bash
# Re-evaluate against latest data
python evaluate.py \
  --model-dir artifacts/valuation_model \
  --csv data/valuation_training_data.csv
```

Compare MAPE to your last training run. If it's 2%+ worse, retrain.

---

## Troubleshooting

### "Model not trained yet"
The model artifact doesn't exist. Run Step 3 (train.py).

### "Python not found"
The Node.js inference service can't find `python3` or `python` in PATH.
Ensure Python is installed and accessible from the shell that runs Next.js.

### "Not enough labeled rows to train"
You need at least 30 rows with `actual_sale_price` filled in (default
`--min-rows 30`). Check Step 1 to see how many you have.

### "Prediction timed out (5s)"
The Python process took too long. This can happen on cold start when
joblib loads the model into memory. Subsequent predictions are faster.
Consider increasing the timeout in `mlInference.ts` if this persists.

### MAPE is very high (> 20%)
- Check for data quality issues in your training CSV
- Ensure `actual_sale_price` values are accurate (not estimates)
- Try increasing `--min-rows` to filter out sparse data
- Check if outlier properties are skewing metrics

### Model makes predictions but they're way off
The model may be overfitting to a small dataset. Wait for more data
and retrain. In the meantime, the 15% blend weight limits the impact
of bad predictions.

---

## File Reference

```
apps/propertytoolsai/
├── ml/valuation/
│   ├── train.py              # Training script
│   ├── predict.py            # Inference script (called by Node.js)
│   ├── evaluate.py           # Evaluation script
│   ├── feature_builder.py    # Feature engineering
│   ├── requirements.txt      # Python dependencies
│   ├── data/
│   │   └── valuation_training_data.csv  # Exported training data
│   └── artifacts/
│       └── valuation_model/
│           ├── valuation_model.joblib    # Trained model
│           ├── schema.json              # Feature schema
│           ├── metrics.json             # Training metrics
│           └── valuation_model.onnx     # Optional ONNX export
├── lib/homeValue/
│   └── mlInference.ts        # Node.js → Python bridge
├── lib/ml-registry/
│   ├── service.ts            # Model registry CRUD
│   └── types.ts              # Registry types
└── scripts/
    └── export-valuation-training-data.ts  # Data export
```
