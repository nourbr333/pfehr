"""P1 — Entraînement du modèle de risque d'Absentéisme.

Compare Régression Logistique et Random Forest (AUC + cross-validation),
génère la courbe ROC et les feature importances, puis sauvegarde le modèle
de production sous forme de Pipeline auto-contenu (scaler + modèle).

Le Pipeline évite tout décalage train/serve : le service backend envoie le
vecteur de features BRUT, le scaling est appliqué à l'intérieur du modèle.
"""
from __future__ import annotations

import json
import sys

import joblib
import matplotlib

matplotlib.use("Agg")  # pas d'affichage, on sauvegarde en PNG
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
from extract_absenteisme import extract

FEATS = config.ABSENTEISME_FEATURES
TARGET = config.ABSENTEISME_TARGET


def load_dataset() -> pd.DataFrame:
    if config.ABSENTEISME_DATASET_CSV.exists():
        print(f"[TRAIN] Chargement du dataset : {config.ABSENTEISME_DATASET_CSV}")
        return pd.read_csv(config.ABSENTEISME_DATASET_CSV)
    print("[TRAIN] CSV absent — extraction directe depuis la base...")
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
            max_depth=6,
            min_samples_leaf=3,
            class_weight="balanced",
            random_state=42,
        )),
    ])
    return {"Régression Logistique": lr, "Random Forest": rf}


def main() -> int:
    df = load_dataset()
    if df.empty or len(df) < 20:
        print(f"[TRAIN] Dataset insuffisant ({len(df)} lignes). Abandon.")
        return 1

    X = df[FEATS]
    y = df[TARGET].astype(int)

    classes = y.value_counts()
    print("─" * 60)
    print(f"[TRAIN] Dataset : {len(df)} lignes | features : {len(FEATS)}")
    print(f"[TRAIN] Répartition target : {classes.to_dict()}")
    if classes.min() < 5:
        print("[TRAIN] ATTENTION : classe minoritaire très faible, résultats à interpréter avec prudence.")

    stratify = y if classes.min() >= 2 else None
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.25, random_state=42, stratify=stratify
    )

    models = build_models()
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    results: dict[str, dict] = {}

    plt.figure(figsize=(7, 6))
    for name, model in models.items():
        model.fit(X_tr, y_tr)
        proba_te = model.predict_proba(X_te)[:, 1]
        auc_te = roc_auc_score(y_te, proba_te)
        try:
            cv_auc = cross_val_score(model, X, y, cv=cv, scoring="roc_auc")
            cv_mean, cv_std = float(cv_auc.mean()), float(cv_auc.std())
        except Exception:  # noqa: BLE001
            cv_mean, cv_std = float("nan"), float("nan")

        results[name] = {"auc_test": float(auc_te), "cv_auc_mean": cv_mean, "cv_auc_std": cv_std}
        print(f"\n[{name}]")
        print(f"  AUC (test)       : {auc_te:.3f}")
        print(f"  AUC (CV 5-fold)  : {cv_mean:.3f} ± {cv_std:.3f}")
        print(classification_report(y_te, model.predict(X_te), zero_division=0))

        fpr, tpr, _ = roc_curve(y_te, proba_te)
        plt.plot(fpr, tpr, label=f"{name} (AUC={auc_te:.2f})")

    plt.plot([0, 1], [0, 1], "k--", alpha=0.6)
    plt.xlabel("Taux de faux positifs")
    plt.ylabel("Taux de vrais positifs")
    plt.title("Courbe ROC — Risque d'Absentéisme")
    plt.legend(loc="lower right")
    roc_path = config.REPORTS_DIR / "roc_absenteisme.png"
    plt.tight_layout()
    plt.savefig(roc_path, dpi=150)
    plt.close()
    print(f"\n[TRAIN] Courbe ROC sauvée : {roc_path}")

    # Modèle de production : Random Forest (robuste + feature importances)
    best = models["Random Forest"]
    rf_clf = best.named_steps["clf"]
    importances = pd.Series(rf_clf.feature_importances_, index=FEATS).sort_values()

    plt.figure(figsize=(8, 5))
    importances.plot(kind="barh", color="crimson")
    plt.title("Feature Importances — Absentéisme (Random Forest)")
    plt.xlabel("Importance")
    fi_path = config.REPORTS_DIR / "feat_imp_absenteisme.png"
    plt.tight_layout()
    plt.savefig(fi_path, dpi=150)
    plt.close()
    print(f"[TRAIN] Feature importances sauvées : {fi_path}")
    print("\nImportances :")
    print(importances.sort_values(ascending=False).to_string())

    model_path = config.MODELS_DIR / "model_absenteisme.pkl"
    joblib.dump(best, model_path)
    print(f"\n[TRAIN] Modèle de production sauvé : {model_path}")

    metrics = {
        "n_rows": int(len(df)),
        "n_features": len(FEATS),
        "features": FEATS,
        "target_distribution": {str(k): int(v) for k, v in classes.to_dict().items()},
        "models": results,
        "production_model": "Random Forest (Pipeline scaler+RF)",
        "feature_importances": importances.sort_values(ascending=False).round(4).to_dict(),
    }
    metrics_path = config.REPORTS_DIR / "metrics_absenteisme.json"
    metrics_path.write_text(json.dumps(metrics, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"[TRAIN] Métriques sauvées : {metrics_path}")
    print("─" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
