-- Authentification locale: table users + comptes applicatifs initiaux.
--
-- Si vous voyez "la transaction est annulée..." : une commande a echoue au debut
-- du script (souvent CREATE EXTENSION sans droits). Dans ce fichier il n'y a plus
-- d'extension PostgreSQL : les mots de passe sont des hashes BCrypt (Spring
-- BCryptPasswordEncoder, strength 12), comme en base de prod.
--
-- Prerequis: la table employees doit exister (FK employee_id optionnel).
-- Si employee_id est renseigne, la reponse /api/auth/login|sso utilise employees.first_name/last_name pour displayName (profil UI).
-- En cas d'erreur dans un client SQL: executez ROLLBACK; puis relisez le PREMIER message d'erreur.

CREATE TABLE IF NOT EXISTS users (
    user_id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('ADMIN', 'RESPONSABLE_RH', 'MANAGER')),
    portal_route VARCHAR(100) NOT NULL,
    employee_id INTEGER NULL REFERENCES employees(employee_id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO users (email, password_hash, first_name, last_name, role, portal_route, employee_id, is_active)
VALUES
    (
        'admin@rh.com',
        '$2b$10$5/vMeda01JH/HiMTLvn.0upL6X0R9n9JjlsfiZXxXDnEWsZUyseKu',
        'Nour',
        'Ben Romdhane',
        'ADMIN',
        '/admin/dashboard',
        NULL,
        TRUE
    ),
    (
        'resp@rh.com',
        '$2b$10$LuRBDcifRVYH2zsTTRqzqOnr1tP.Uo5ZmTSrD.i98dz9rIwdagnUa',
        'Nour',
        'Ben Moussa',
        'RESPONSABLE_RH',
        '/accueil-resp',
        NULL,
        TRUE
    ),
    (
        'manager@rh.com',
        '$2b$10$efIhPhr4gMegv8UQsZ7DBeS2qW6YmpayJhTzwQi6h7uOHRDGuYoMC',
        'Meriem',
        'Ben Romdhane',
        'MANAGER',
        '/accueil-manager',
        NULL,
        TRUE
    )
ON CONFLICT (email) DO UPDATE
SET
    password_hash = EXCLUDED.password_hash,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    role = EXCLUDED.role,
    portal_route = EXCLUDED.portal_route,
    employee_id = EXCLUDED.employee_id,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();
