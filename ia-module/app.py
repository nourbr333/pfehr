"""Microservice Flask — Module IA Prédictif HR Analytics.

Charge les modèles disponibles au démarrage et expose des endpoints de
prédiction. P1 Absentéisme et P3 OKR. P2 Burnout répond 503 tant que son
modèle n'est pas entraîné.

Chaque modèle est un Pipeline auto-contenu (StandardScaler + RF) :
on lui envoie le vecteur de features BRUT, le scaling est interne.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import joblib
import pandas as pd
from flask import Flask, jsonify, request

# Console Windows : UTF-8
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = Path(os.getenv("MODEL_DIR", BASE_DIR / "models"))

app = Flask(__name__)

# ── Ordre des features (DOIT correspondre à l'entraînement et au backend) ──
ABSENTEISME_FEATURES = [
    "taux_absence_30j",
    "taux_absence_90j",
    "nb_retards_30j",
    "overtime_moyen_30j",
    "nb_maladie_12m",
    "nb_approuves_12m",
    "nb_refus_12m",
    "dept_taux_absence",
    "anciennete",
    "age",
]

OKR_FEATURES = [
    "progress_actuel",
    "jours_restants_ratio",
    "taux_absence_equipe_30j",
    "nb_absents_auj",
    "delta_progress_30j",
    "nb_updates_30j",
    "nb_membres",
    "has_action_plan",
    "nb_dependances",
    "manager_taux_presence",
]

# ── Chargement des modèles ────────────────────────────────────────────────
MODELS: dict[str, object] = {}
TOP_FEATURES: dict[str, list[dict]] = {}


def _load(name: str, filename: str, feature_names: list[str]) -> None:
    path = MODEL_DIR / filename
    if not path.exists():
        print(f"[FLASK] Modèle absent ({name}) : {path} — endpoint indisponible.")
        return
    model = joblib.load(path)
    MODELS[name] = model
    try:
        clf = model.named_steps["clf"] if hasattr(model, "named_steps") else model
        importances = getattr(clf, "feature_importances_", None)
        if importances is not None:
            pairs = sorted(
                ({"name": n, "importance": round(float(i), 4)}
                 for n, i in zip(feature_names, importances)),
                key=lambda d: d["importance"],
                reverse=True,
            )
            TOP_FEATURES[name] = pairs
    except Exception:  # noqa: BLE001
        TOP_FEATURES[name] = []
    print(f"[FLASK] Modèle chargé : {name} ({filename})")


_load("absenteisme", "model_absenteisme.pkl", ABSENTEISME_FEATURES)
_load("okr",         "model_okr.pkl",         OKR_FEATURES)

# ── Seuils de risque (cohérents avec l'affichage) ─────────────────────────
THRESHOLD_HIGH = 0.65
THRESHOLD_MEDIUM = 0.35

_LABELS_FR = {"HIGH": "Risque Élevé", "MEDIUM": "Risque Moyen", "LOW": "Risque Faible"}


def risk_level(proba: float) -> str:
    if proba >= THRESHOLD_HIGH:
        return "HIGH"
    if proba >= THRESHOLD_MEDIUM:
        return "MEDIUM"
    return "LOW"


def _predict(model_name: str, label_prefix: str, feature_names: list[str],
             subject_key: str = "employee_id"):
    if model_name not in MODELS:
        return jsonify({"error": f"Modèle '{model_name}' non disponible."}), 503

    data = request.get_json(silent=True)
    if not data or "features" not in data:
        return jsonify({"error": "Payload invalide : clé 'features' manquante."}), 400

    features = data["features"]
    if not isinstance(features, list) or len(features) != len(feature_names):
        return jsonify({
            "error": f"'features' doit être une liste de {len(feature_names)} valeurs.",
            "received": len(features) if isinstance(features, list) else None,
        }), 400

    try:
        X = pd.DataFrame([features], columns=feature_names)
        proba = float(MODELS[model_name].predict_proba(X)[0][1])
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Erreur de prédiction : {exc}"}), 500

    level = risk_level(proba)
    return jsonify({
        "prediction": model_name,
        subject_key: data.get(subject_key),
        "risk_proba": round(proba, 3),
        "risk_level": level,
        "risk_label": f"{label_prefix} — {_LABELS_FR[level]}",
        "top_features": TOP_FEATURES.get(model_name, []),
        "thresholds": {"high": THRESHOLD_HIGH, "medium": THRESHOLD_MEDIUM},
    })


@app.get("/health")
def health():
    return jsonify({
        "status": "UP",
        "models_loaded": sorted(MODELS.keys()),
        "model_dir": str(MODEL_DIR),
    })


@app.post("/predict/absenteisme")
def predict_absenteisme():
    return _predict("absenteisme", "Risque Absentéisme", ABSENTEISME_FEATURES, "employee_id")


@app.post("/predict/burnout")
def predict_burnout():
    return jsonify({"error": "Modèle 'burnout' non encore entraîné (P2)."}), 503


@app.post("/predict/okr")
def predict_okr():
    return _predict("okr", "Risque Non-Atteinte OKR", OKR_FEATURES, "objective_id")


if __name__ == "__main__":
    port = int(os.getenv("IA_PORT", "5001"))
    print(f"[FLASK] Démarrage sur le port {port} | modèles : {sorted(MODELS.keys())}")
    app.run(host="0.0.0.0", port=port, debug=False)
