-- Après avoir rempli employees.email, aligner users.email pour garder une source unique côté compte applicatif.
-- Le backend accepte aussi la connexion avec employees.email même si users.email est encore l’ancienne valeur.
--
-- Prérequis : colonne employees.email (NOT NULL ou nullable selon votre schéma).

UPDATE users u
SET
    email = TRIM(e.email),
    updated_at = NOW()
FROM employees e
WHERE u.employee_id = e.employee_id
  AND e.email IS NOT NULL
  AND TRIM(e.email) <> ''
  AND LOWER(TRIM(u.email)) IS DISTINCT FROM LOWER(TRIM(e.email));
