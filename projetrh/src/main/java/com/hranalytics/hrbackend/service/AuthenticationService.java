package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.UserProfileResponse;
import com.hranalytics.hrbackend.entity.AppUser;
import com.hranalytics.hrbackend.entity.Employee;
import com.hranalytics.hrbackend.repository.AppUserRepository;
import com.hranalytics.hrbackend.repository.EmployeeRepository;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthenticationService {

    private final AppUserRepository appUserRepository;
    private final EmployeeRepository employeeRepository;
    private final PasswordEncoder passwordEncoder;

    public AuthenticationService(AppUserRepository appUserRepository,
                                  EmployeeRepository employeeRepository,
                                  PasswordEncoder passwordEncoder) {
        this.appUserRepository = appUserRepository;
        this.employeeRepository = employeeRepository;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * @throws ResponseStatusException(FORBIDDEN) si les identifiants sont corrects mais que le
     *         compte est désactivé, ou encore en attente de validation par un administrateur.
     */
    public Optional<AppUser> authenticateWithPassword(String email, String rawPassword) {
        String login = email == null ? "" : email.trim();
        AppUser user = appUserRepository.findByEmailIgnoreCase(login)
                .filter(u -> passwordEncoder.matches(rawPassword, u.getPasswordHash()))
                .or(() -> appUserRepository.findByLinkedEmployeeEmail(login)
                        .filter(u -> passwordEncoder.matches(rawPassword, u.getPasswordHash())))
                .orElse(null);

        if (user == null) {
            return Optional.empty();
        }
        requireActive(user);
        requireValidated(user);
        return Optional.of(user);
    }

    /**
     * @throws ResponseStatusException(FORBIDDEN) si l'utilisateur AD est provisionné mais que
     *         son compte est désactivé, ou encore en attente de validation par un administrateur.
     */
    public Optional<AppUser> findProvisionedUser(String loginIdentifier) {
        String normalized = normalize(loginIdentifier);
        if (normalized.isBlank()) {
            return Optional.empty();
        }

        AppUser user = appUserRepository.findByEmailIgnoreCase(normalized)
                .or(() -> normalized.contains("@")
                        ? appUserRepository.findByLinkedEmployeeEmail(normalized)
                        : Optional.empty())
                .or(() -> appUserRepository.findAllByOrderByUserIdDesc()
                        .stream()
                        .filter(u -> localPart(u.getEmail()).equals(normalized))
                        .findFirst())
                .orElse(null);

        if (user == null) {
            return Optional.empty();
        }
        requireActive(user);
        requireValidated(user);
        return Optional.of(user);
    }

    private void requireActive(AppUser user) {
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Compte désactivé. Contactez votre administrateur.");
        }
    }

    private void requireValidated(AppUser user) {
        if (!Boolean.TRUE.equals(user.getValidated())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Compte en attente de validation par un administrateur.");
        }
    }

    public void markSuccessfulLogin(AppUser user) {
        user.setLastLoginAt(LocalDateTime.now());
        appUserRepository.save(user);
    }

    /**
     * Valide et applique un changement de mot de passe pour l'utilisateur authentifié.
     * Point d'entrée unique pour cette règle métier — évite toute duplication entre
     * les contrôleurs qui exposent cette fonctionnalité.
     *
     * @throws ResponseStatusException(BAD_REQUEST) si une règle de validation échoue.
     */
    @Transactional
    public void changePassword(AppUser user, String currentPassword, String newPassword, String confirmPassword) {
        if (isBlank(currentPassword) || isBlank(newPassword) || isBlank(confirmPassword)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tous les champs sont requis.");
        }
        if (!newPassword.equals(confirmPassword)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Les mots de passe ne correspondent pas.");
        }
        if (newPassword.equals(currentPassword)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Le nouveau mot de passe doit être différent du mot de passe actuel.");
        }
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mot de passe actuel incorrect.");
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        appUserRepository.save(user);
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    /**
     * Met à jour le prénom, nom et email affichés pour l'utilisateur authentifié.
     * Si un employé RH est lié au compte, ses champs métier (affichés en priorité
     * dans l'UI et à la connexion) sont mis à jour ; sinon, on met à jour le compte
     * applicatif directement.
     */
    @Transactional
    public UserProfileResponse updateProfile(Long userId, String firstName, String lastName, String email) {
        AppUser user = appUserRepository.findByUserId(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Utilisateur non trouvé."));

        String normalizedFirstName = firstName.trim();
        String normalizedLastName = lastName.trim();
        String normalizedEmail = email.trim();
        Employee employee = user.getEmployee();

        if (employee != null) {
            boolean emailChanged = !normalizedEmail.equalsIgnoreCase(employee.getEmail());
            if (emailChanged && employeeRepository.existsByEmployeeIdNotAndEmailIgnoreCase(employee.getEmployeeId(), normalizedEmail)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cet email est déjà utilisé.");
            }
            employee.setFirstName(normalizedFirstName);
            employee.setLastName(normalizedLastName);
            employee.setEmail(normalizedEmail);
            employeeRepository.save(employee);
        } else {
            boolean emailChanged = !normalizedEmail.equalsIgnoreCase(user.getEmail());
            if (emailChanged && appUserRepository.existsByEmailIgnoreCaseAndUserIdNot(normalizedEmail, user.getUserId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cet email est déjà utilisé.");
            }
            user.setFirstName(normalizedFirstName);
            user.setLastName(normalizedLastName);
            user.setEmail(normalizedEmail);
            appUserRepository.save(user);
        }

        return new UserProfileResponse(normalizedEmail, normalizedFirstName, normalizedLastName);
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private String localPart(String email) {
        String normalized = normalize(email);
        int at = normalized.indexOf('@');
        return at >= 0 ? normalized.substring(0, at) : normalized;
    }
}
