package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.entity.AppUser;
import com.hranalytics.hrbackend.repository.AppUserRepository;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.Optional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthenticationService {

    private final AppUserRepository appUserRepository;
    private final PasswordEncoder passwordEncoder;

    public AuthenticationService(AppUserRepository appUserRepository, PasswordEncoder passwordEncoder) {
        this.appUserRepository = appUserRepository;
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

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private String localPart(String email) {
        String normalized = normalize(email);
        int at = normalized.indexOf('@');
        return at >= 0 ? normalized.substring(0, at) : normalized;
    }
}
