"""
SmartFocus ML Model Server (FastAPI Edition)
===========================================
High-performance ML server for the Study Monitor Chrome extension.
Uses FastAPI for asynchronous, rapid classification.
"""

import os
import re
import math
import logging
import joblib
import numpy as np
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger("smartfocus")

# ── FastAPI App Setup ─────────────────────────────────────────────────────────
app = FastAPI(title="SmartFocus ML Server")

# Configure CORS for Chrome Extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Extension IDs vary, so allow all origins for local use
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ── Load model and vectorizer ─────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "website_model.pkl")
VECTORIZER_PATH = os.path.join(BASE_DIR, "vectorizer.pkl")

model = None
vectorizer = None
model_loaded = False
load_error = ""

try:
    log.info("Loading model from: %s", MODEL_PATH)
    model = joblib.load(MODEL_PATH)
    log.info("Loading vectorizer from: %s", VECTORIZER_PATH)
    vectorizer = joblib.load(VECTORIZER_PATH)
    model_loaded = True
    log.info("✅ Model loaded | classes: %s", list(model.classes_))
except Exception as e:
    load_error = str(e)
    log.error("❌ Failed to load model: %s", e)

# ── Domain Preprocessing (Mirrors Colab logic) ────────────────────────────────

def clean_domain(domain: str) -> str:
    domain = str(domain).lower().strip()
    # Remove protocol
    domain = re.sub(r'^https?://', '', domain)
    # Remove www
    domain = re.sub(r'^www\.', '', domain)
    # Remove mobile prefix
    domain = re.sub(r'^m\.', '', domain)
    # Remove everything after first slash
    domain = domain.split('/')[0]
    # Remove port numbers
    domain = domain.split(':')[0]
    return domain

# ── Label Mapping ────────────────────────────────────────────────────────────
# 0 -> educational, 1 -> distracting, 2 -> neutral
_LABEL_MAP = {
    0: "educational",
    1: "distracting",
    2: "neutral",
    "0": "educational",
    "1": "distracting",
    "2": "neutral",
    0.0: "educational",
    1.0: "distracting",
    2.0: "neutral",
}

def map_label(raw) -> str:
    return _LABEL_MAP.get(raw, str(raw))

# ── Confidence mapping ────────────────────────────────────────────────────────

def decision_to_confidence(decision_scores, predicted_label, label_order: list) -> int:
    try:
        classes = list(label_order)
        n_classes = len(classes)
        score = 0.0

        if n_classes == 2:
            raw = float(np.ravel(decision_scores)[0])
            if predicted_label == classes[1]:
                score = raw
            else:
                score = -raw
        else:
            scores_arr = np.ravel(decision_scores)
            if len(scores_arr) == n_classes:
                idx = classes.index(predicted_label)
                score = float(scores_arr[idx])
            else:
                score = float(scores_arr[0])

        confidence = int(50 + 45 * (2 / (1 + math.exp(-score)) - 1))
        return max(40, min(98, confidence))
    except Exception as exc:
        log.warning("Confidence computation failed (%s) — using default 75", exc)
        return 75

# ── Models ────────────────────────────────────────────────────────────────────

class PredictRequest(BaseModel):
    url: str

# ── API endpoints ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": model_loaded,
        "error": load_error if not model_loaded else None,
        "classes": list(model.classes_) if model_loaded else []
    }

@app.post("/predict")
async def predict(request: PredictRequest):
    if not model_loaded:
        raise HTTPException(status_code=503, detail=f"Model not loaded: {load_error}")

    url = request.url
    if not url:
        raise HTTPException(status_code=400, detail="Missing 'url' field")

    # Extract domain using the Colab logic
    domain = clean_domain(url)
    log.info("predict | url=%s -> domain=%s", url, domain)

    if not domain:
        raise HTTPException(status_code=400, detail="Could not extract domain from URL")

    try:
        # Predict using the domain string
        X = vectorizer.transform([domain])
        raw_label = model.predict(X)[0]
        
        # Confidence
        try:
            scores = model.decision_function(X)[0]
            label_order = list(model.classes_)
            confidence = decision_to_confidence(scores, raw_label, label_order)
        except Exception:
            confidence = 75

        label = map_label(raw_label)
        log.info("result | raw=%s -> label=%s (conf: %d)", raw_label, label, confidence)

        return {
            "label": label,
            "confidence": confidence,
            "domain_used": domain
        }
    except Exception as exc:
        log.error("Prediction error: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))

if __name__ == "__main__":
    import uvicorn
    print("-" * 50)
    print("  SmartFocus ML Server | Powered by FastAPI")
    print(f"  Model Loaded: {model_loaded}")
    print("-" * 50)
    uvicorn.run(app, host="127.0.0.1", port=5000)
