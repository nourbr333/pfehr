-- Aligne le manager applicatif par defaut (manager@rh.com) avec l'employe #9.
-- Executer ce script une fois sur hr_database.

UPDATE employees
SET manager_id = NULL
WHERE employee_id = 9;

-- Verifications rapides
-- 1) Le manager #9 doit etre autonome (pas de manager au-dessus)
SELECT employee_id, first_name, last_name, manager_id
FROM employees
WHERE employee_id = 9;

-- 2) Les membres de l'equipe de Nour Ben Romdhane
SELECT employee_id, first_name, last_name, manager_id, department_id, job_title
FROM employees
WHERE manager_id = 9
ORDER BY employee_id;

#non 