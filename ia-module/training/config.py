"""Configuration partagée du module IA (connexion BDD, chemins, features)."""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Console Windows : forcer l'UTF-8 pour les accents et caractères spéciaux
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass

BASE_DIR = Path(__file__).resolve().parent.parent  # ia-module/
load_dotenv(BASE_DIR / ".env")

# ── Connexion BDD ────────────────────────────────────────────────────────
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "0000")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "hr_database")

# Driver psycopg3 via SQLAlchemy
DB_URL = os.getenv(
    "DB_URL",
    f"postgresql+psycopg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}",
)

# ── Chemins ──────────────────────────────────────────────────────────────
MODELS_DIR = BASE_DIR / "models"
REPORTS_DIR = BASE_DIR / "reports"
DATA_DIR = BASE_DIR / "data"
for _d in (MODELS_DIR, REPORTS_DIR, DATA_DIR):
    _d.mkdir(exist_ok=True)

# ── Paramètres dataset Absentéisme (P1) ──────────────────────────────────
SNAPSHOT_INTERVAL_DAYS = int(os.getenv("SNAPSHOT_INTERVAL_DAYS", "14"))
TARGET_HORIZON_DAYS = int(os.getenv("TARGET_HORIZON_DAYS", "30"))
FEATURE_HISTORY_DAYS = int(os.getenv("FEATURE_HISTORY_DAYS", "30"))

ABSENTEISME_DATASET_CSV = DATA_DIR / "dataset_absenteisme.csv"

# Ordre des features — DOIT rester synchronisé avec le service Spring/Flask
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

ABSENTEISME_TARGET = "target_absence"

# ── Paramètres dataset OKR (P3) ───────────────────────────────────────────
# Snapshots tous les 14j à l'intérieur de la durée de vie de chaque objectif
OKR_SNAPSHOT_INTERVAL_DAYS = int(os.getenv("OKR_SNAPSHOT_INTERVAL_DAYS", "14"))
# Seuil d'échec OKR (progress_percent < seuil → target = 1)
OKR_FAILURE_THRESHOLD = float(os.getenv("OKR_FAILURE_THRESHOLD", "70"))

OKR_DATASET_CSV = DATA_DIR / "dataset_okr.csv"

# Ordre des features — DOIT rester synchronisé avec le service Spring/Flask
# Note : pas de jalons/milestones (exclus volontairement)
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

OKR_TARGET = "target_non_atteint"
