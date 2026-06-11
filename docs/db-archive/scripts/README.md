# Archive des scripts SQL historiques (V001–V038)

> **Emplacement :** `docs/db-archive/scripts/` (déplacé hors du classpath Spring — non exécuté au démarrage de l'app).

Ces 35 scripts ont été appliqués manuellement sur la base `hr_database` avant l'introduction de Flyway.
Ils restent archivés ici à titre de documentation et pour les nouvelles installations manuelles.

**Ne pas les ré-exécuter** sur une base déjà peuplée.

Pour une nouvelle base vierge, exécuter les scripts dans l'ordre logique suivant :

1. `001_create_leave_requests.sql` → `005_indexes_and_views.sql`
2. `002_create_leave_balances.sql`, `003_create_leave_policies.sql`, `004_seed_default_policies.sql`
3. Scripts `create-*` (users, notifications, evaluations, etc.)
4. Scripts `add-*` et `alter-*`
5. Scripts `migrate-*` et `backfill_*`

Les scripts destructifs ou de maintenance sont dans `manual/`.
