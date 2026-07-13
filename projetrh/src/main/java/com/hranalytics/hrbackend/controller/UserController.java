package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.ChangePasswordRequest;
import com.hranalytics.hrbackend.dto.UpdateProfileRequest;
import com.hranalytics.hrbackend.entity.AppUser;
import com.hranalytics.hrbackend.repository.AppUserRepository;
import com.hranalytics.hrbackend.security.SecurityUtils;
import com.hranalytics.hrbackend.service.AdminPortalService;
import com.hranalytics.hrbackend.service.AuthenticationService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.logging.Logger;

@RestController
@RequestMapping("/api/users")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class UserController {

    private static final Logger logger = Logger.getLogger(UserController.class.getName());

    private final AuthenticationService authenticationService;
    private final AppUserRepository appUserRepository;
    private final AdminPortalService adminPortalService;

    public UserController(AuthenticationService authenticationService,
                         AppUserRepository appUserRepository,
                         AdminPortalService adminPortalService) {
        this.authenticationService = authenticationService;
        this.appUserRepository = appUserRepository;
        this.adminPortalService = adminPortalService;
    }

    /**
     * POST /api/users/change-password
     * Permet à un utilisateur authentifié de changer son propre mot de passe.
     * Requiert de connaître le mot de passe actuel pour des raisons de sécurité.
     */
    @PostMapping("/change-password")
    public ResponseEntity<?> changePassword(@Valid @RequestBody ChangePasswordRequest request) {
        // Validations basiques
        if (request.currentPassword() == null || request.currentPassword().isBlank()
                || request.newPassword() == null || request.newPassword().isBlank()
                || request.confirmPassword() == null || request.confirmPassword().isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Tous les champs sont requis."));
        }

        // Vérifier que newPassword et confirmPassword matchent
        if (!request.newPassword().equals(request.confirmPassword())) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Les mots de passe ne correspondent pas."));
        }

        // Vérifier que le nouveau mot de passe est différent de l'ancien
        if (request.newPassword().equals(request.currentPassword())) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Le nouveau mot de passe doit être différent du mot de passe actuel."));
        }

        try {
            // Récupérer l'utilisateur authentifié via son userId (plus fiable qu'email)
            var authenticatedUser = SecurityUtils.requireAuthenticated();
            logger.info("Authenticated user: " + authenticatedUser.getEmail() + ", userId: " + authenticatedUser.getUserId());

            if (authenticatedUser.getUserId() == null) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "UserId non disponible dans l'authentification."));
            }

            AppUser user = appUserRepository.findById(authenticatedUser.getUserId())
                    .orElseThrow(() -> new IllegalArgumentException("Utilisateur non trouvé avec ID: " + authenticatedUser.getUserId()));

            logger.info("User found: " + user.getEmail());

            // Changer le mot de passe (vérifiera l'ancien mot de passe)
            authenticationService.changePassword(user, request.currentPassword(), request.newPassword());

            logger.info("Password changed successfully for: " + user.getEmail());
            
            // Logger l'action
            adminPortalService.logPasswordChange(user);
            
            return ResponseEntity.ok(Map.of("message", "Mot de passe mis à jour avec succès."));

        } catch (IllegalArgumentException e) {
            logger.warning("IllegalArgumentException: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", e.getMessage()));
        } catch (Exception e) {
            logger.severe("Exception in changePassword: " + e.getMessage());
            e.printStackTrace();
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Erreur lors de la modification du mot de passe: " + e.getMessage()));
        }
    }

    /**
     * PUT /api/users/me
     * Permet à un utilisateur authentifié de mettre à jour son prénom, nom et email.
     * Si un employé RH est lié au compte, les champs métier (employees) sont mis à
     * jour en priorité, car c'est ce qui est affiché dans l'application et à la connexion.
     */
    @PutMapping("/me")
    public ResponseEntity<?> updateProfile(@Valid @RequestBody UpdateProfileRequest request) {
        try {
            var authenticatedUser = SecurityUtils.requireAuthenticated();
            if (authenticatedUser.getUserId() == null) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "UserId non disponible dans l'authentification."));
            }

            var profile = authenticationService.updateProfile(
                    authenticatedUser.getUserId(),
                    request.firstName(),
                    request.lastName(),
                    request.email());

            return ResponseEntity.ok(profile);

        } catch (ResponseStatusException e) {
            return ResponseEntity.status(e.getStatusCode())
                    .body(Map.of("error", e.getReason()));
        } catch (Exception e) {
            logger.severe("Exception in updateProfile: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Erreur lors de la mise à jour du profil."));
        }
    }
}
