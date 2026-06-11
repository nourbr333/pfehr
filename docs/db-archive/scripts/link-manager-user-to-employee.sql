-- Lie le compte applicatif manager@rh.com à l'employé manager #9.
-- Requis pour les notifications ciblées (validation, congé, relance éval…).
-- Exécuter une fois sur hr_database.

UPDATE users
SET employee_id = 9,
    updated_at  = NOW()
WHERE email = 'manager@rh.com'
  AND (employee_id IS NULL OR employee_id <> 9);

-- Vérification
SELECT user_id, email, role, employee_id
FROM users
WHERE email IN ('manager@rh.com', 'resp@rh.com', 'admin@rh.com');
