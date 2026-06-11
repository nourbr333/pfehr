# Scripts SQL manuels (hors Flyway)

Ces scripts ne sont **pas** exécutés automatiquement par l'application.
À lancer manuellement via `psql` ou un client SQL, après lecture et validation.

| Fichier | Risque | Description |
|---------|--------|-------------|
| `truncate-attendance.sql` | **Destructif** | Supprime toutes les données de présence |
| `rollback-leaves-to-legacy-model.sql` | **Destructif** | Rollback du modèle congés typé |
| `fix-attendance-sequence.sql` | Maintenance | Réparation ponctuelle de séquence |

## Migrations versionnées (Flyway)

Les évolutions de schéma à partir de la version 39 doivent être ajoutées dans :

`src/main/resources/db/migration/V039__description.sql`

La base existante est baselinée à la version **38** (scripts historiques dans `docs/db-archive/scripts/`).
