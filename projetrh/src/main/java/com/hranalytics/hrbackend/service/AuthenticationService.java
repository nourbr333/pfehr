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

    public Optional<AppUser> authenticateWithPassword(String email, String rawPassword) {
        String login = email == null ? "" : email.trim();
        Optional<AppUser> byAccountEmail = appUserRepository.findByEmailIgnoreCaseAndIsActiveTrue(login)
                .filter(user -> passwordEncoder.matches(rawPassword, user.getPasswordHash()));
        if (byAccountEmail.isPresent()) {
            return byAccountEmail;
        }
        return appUserRepository.findActiveByLinkedEmployeeEmail(login)
                .filter(user -> passwordEncoder.matches(rawPassword, user.getPasswordHash()));
    }

    public Optional<AppUser> findProvisionedUser(String loginIdentifier) {
        String normalized = normalize(loginIdentifier);
        if (normalized.isBlank()) {
            return Optional.empty();
        }

        Optional<AppUser> exactEmail = appUserRepository.findByEmailIgnoreCaseAndIsActiveTrue(normalized);
        if (exactEmail.isPresent()) {
            return exactEmail;
        }

        if (normalized.contains("@")) {
            Optional<AppUser> byEmployeeEmail = appUserRepository.findActiveByLinkedEmployeeEmail(normalized);
            if (byEmployeeEmail.isPresent()) {
                return byEmployeeEmail;
            }
        }

        return appUserRepository.findByIsActiveTrue()
                .stream()
                .filter(user -> localPart(user.getEmail()).equals(normalized))
                .findFirst();
    }

    public void markSuccessfulLogin(AppUser user) {
        user.setLastLoginAt(LocalDateTime.now());
        appUserRepository.save(user);
    }

    public void changePassword(AppUser user, String currentPassword, String newPassword) {
        // Vérifier que l'ancien mot de passe est correct
        if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
            throw new IllegalArgumentException("Mot de passe actuel incorrect.");
        }

        // Encoder et sauvegarder le nouveau mot de passe
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        appUserRepository.save(user);
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
