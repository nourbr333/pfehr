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
     * Toute la validation métier (champs requis, correspondance, mot de passe actuel)
     * est centralisée dans {@link AuthenticationService#changePassword}.
     */
    @PostMapping("/change-password")
    public ResponseEntity<?> changePassword(@Valid @RequestBody ChangePasswordRequest request) {
        try {
            // Récupérer l'utilisateur authentifié via son userId (plus fiable qu'email)
            var authenticatedUser = SecurityUtils.requireAuthenticated();

            if (authenticatedUser.getUserId() == null) {
                return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                        .body(Map.of("error", "UserId non disponible dans l'authentification."));
            }

            AppUser user = appUserRepository.findById(authenticatedUser.getUserId())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Utilisateur non trouvé."));

            authenticationService.changePassword(
                    user, request.currentPassword(), request.newPassword(), request.confirmPassword());

            adminPortalService.logPasswordChange(user);

            return ResponseEntity.ok(Map.of("message", "Mot de passe mis à jour avec succès."));

        } catch (ResponseStatusException e) {
            return ResponseEntity.status(e.getStatusCode())
                    .body(Map.of("error", e.getReason()));
        } catch (Exception e) {
            logger.severe("Exception in changePassword: " + e.getMessage());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Erreur lors de la modification du mot de passe."));
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
