# Archive base de données

Scripts SQL historiques et de maintenance, **hors du classpath Spring Boot**.

| Dossier | Contenu |
|---------|---------|
| [`scripts/`](scripts/README.md) | Schéma V001–V038 (appliqué manuellement avant Flyway) |
| [`scripts/manual/`](scripts/manual/README.md) | Scripts destructifs ou de maintenance ponctuelle |

Les migrations Flyway (V039+) vont dans `projetrh/src/main/resources/db/migration/`.
