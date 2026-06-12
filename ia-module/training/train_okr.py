"""P3 — Entraînement du modèle de risque de Non-Atteinte des OKR.

Compare Régression Logistique et Random Forest (AUC + cross-validation),
génère la courbe ROC et les feature importances, puis sauvegarde le modèle
de production sous forme de Pipeline auto-contenu (scaler + modèle).

Note : jalons/milestones exclus volontairement du périmètre.
Si le dataset contient peu de lignes (< 20), le modèle s'entraîne quand même
avec un avertissement — acceptable pour un contexte PFE avec données réelles.
"""
from __future__ import annotations

import json
import sys

import joblib
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, roc_auc_score, roc_curve
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

import config
from extract_okr import extract

FEATS = config.OKR_FEATURES
TARGET = config.OKR_TARGET


def load_dataset() -> pd.DataFrame:
    if config.OKR_DATASET_CSV.exists():
        print(f"[TRAIN-OKR] Chargement du dataset : {config.OKR_DATASET_CSV}")
        return pd.read_csv(config.OKR_DATASET_CSV)
    print("[TRAIN-OKR] CSV absent — extraction directe depuis la base...")
    return extract()


def build_models() -> dict[str, Pipeline]:
    lr = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42)),
    ])
    rf = Pipeline([
        ("scaler", StandardScaler()),
        ("clf", RandomForestClassifier(
            n_estimators=300,
            max_depth=5,
            min_samples_leaf=2,
            class_weight="balanced",
            random_state=42,
        )),
    ])
    return {"Régression Logistique": lr, "Random Forest": rf}


def main() -> int:
    df = load_dataset()

    if df.empty:
        print("[TRAIN-OKR] Dataset vide. Abandon.")
        return 1

    n = len(df)
    print("─" * 60)
    print(f"[TRAIN-OKR] Dataset : {n} lignes | features : {len(FEATS)}")

    if n < 10:
        print(f"[TRAIN-OKR] ATTENTION : seulement {n} lignes — résultats très limités.")
        print("  Conseil : ajoutez des objectifs avec des échéances passées dans l'app.")

    X = df[FEATS]
    y = df[TARGET].astype(int)

    classes = y.value_counts()
    print(f"[TRAIN-OKR] Répartition target : {classes.to_dict()}")

    if classes.nunique() < 2:
        print("[TRAIN-OKR] ERREUR : une seule classe présente — modèle impossible à entraîner.")
        print("  Conseil : vérifiez que certains objectifs passés ont progress_percent < 70.")
        return 1

    if classes.min() < 2:
        print("[TRAIN-OKR] ATTENTION : classe minoritaire < 2 — stratification désactivée.")

    stratify = y if classes.min() >= 2 else None
    test_size = 0.25 if n >= 20 else 0.20
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=test_size, random_state=42, stratify=stratify
    )

    models = build_models()
    n_splits = min(5, classes.min())
    cv = StratifiedKFold(n_splits=max(2, n_splits), shuffle=True, random_state=42)
    results: dict[str, dict] = {}

    plt.figure(figsize=(7, 6))
    for name, model in models.items():
        model.fit(X_tr, y_tr)
        proba_te = model.predict_proba(X_te)[:, 1]

        try:
            auc_te = roc_auc_score(y_te, proba_te)
        except Exception:
            auc_te = float("nan")

        try:
            cv_auc = cross_val_score(model, X, y, cv=cv, scoring="roc_auc")
            cv_mean, cv_std = float(cv_auc.mean()), float(cv_auc.std())
        except Exception:
            cv_mean, cv_std = float("nan"), float("nan")

        results[name] = {"auc_test": auc_te, "cv_auc_mean": cv_mean, "cv_auc_std": cv_std}
        print(f"\n[{name}]")
        print(f"  AUC (test)       : {auc_te:.3f}" if not np.isnan(auc_te) else "  AUC (test)       : n/a")
        print(f"  AUC (CV 5-fold)  : {cv_mean:.3f} ± {cv_std:.3f}" if not np.isnan(cv_mean) else "  AUC (CV)         : n/a")
        print(classification_report(y_te, model.predict(X_te), zero_division=0))

        if not np.isnan(auc_te):
            fpr, tpr, _ = roc_curve(y_te, proba_te)
            plt.plot(fpr, tpr, label=f"{name} (AUC={auc_te:.2f})")

    plt.plot([0, 1], [0, 1], "k--", alpha=0.6)
    plt.xlabel("Taux de faux positifs")
    plt.ylabel("Taux de vrais positifs")
    plt.title("Courbe ROC — Risque de Non-Atteinte OKR")
    plt.legend(loc="lower right")
    roc_path = config.REPORTS_DIR / "roc_okr.png"
    plt.tight_layout()
    plt.savefig(roc_path, dpi=150)
    plt.close()
    print(f"\n[TRAIN-OKR] Courbe ROC sauvée : {roc_path}")

    best = models["Random Forest"]
    rf_clf = best.named_steps["clf"]
    importances = pd.Series(rf_clf.feature_importances_, index=FEATS).sort_values()

    plt.figure(figsize=(8, 5))
    importances.plot(kind="barh", color="purple")
    plt.title("Feature Importances — Non-Atteinte OKR (Random Forest)")
    plt.xlabel("Importance")
    fi_path = config.REPORTS_DIR / "feat_imp_okr.png"
    plt.tight_layout()
    plt.savefig(fi_path, dpi=150)
    plt.close()
    print(f"[TRAIN-OKR] Feature importances sauvées : {fi_path}")
    print("\nImportances :")
    print(importances.sort_values(ascending=False).to_string())

    model_path = config.MODELS_DIR / "model_okr.pkl"
    joblib.dump(best, model_path)
    print(f"\n[TRAIN-OKR] Modèle de production sauvé : {model_path}")

    metrics = {
        "n_rows": int(n),
        "n_features": len(FEATS),
        "features": FEATS,
        "failure_threshold": config.OKR_FAILURE_THRESHOLD,
        "target_distribution": {str(k): int(v) for k, v in classes.to_dict().items()},
        "models": results,
        "production_model": "Random Forest (Pipeline scaler+RF)",
        "feature_importances": importances.sort_values(ascending=False).round(4).to_dict(),
    }
    metrics_path = config.REPORTS_DIR / "metrics_okr.json"
    metrics_path.write_text(json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[TRAIN-OKR] Métriques sauvées : {metrics_path}")
    print("─" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
