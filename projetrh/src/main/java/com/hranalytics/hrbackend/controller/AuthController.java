package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.AuthLoginResponse;
import com.hranalytics.hrbackend.dto.ChangePasswordRequest;
import com.hranalytics.hrbackend.dto.PasswordLoginRequest;
import com.hranalytics.hrbackend.dto.SsoLoginRequest;
import com.hranalytics.hrbackend.entity.AppUser;
import com.hranalytics.hrbackend.entity.Employee;
import com.hranalytics.hrbackend.repository.AppUserRepository;
import com.hranalytics.hrbackend.security.JwtUtil;
import com.hranalytics.hrbackend.security.SecurityUtils;
import com.hranalytics.hrbackend.service.AdminPortalService;
import com.hranalytics.hrbackend.service.AuthenticationService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.ldap.authentication.ad.ActiveDirectoryLdapAuthenticationProvider;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.logging.Logger;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class AuthController {

    private static final Logger logger = Logger.getLogger(AuthController.class.getName());

    private final ActiveDirectoryLdapAuthenticationProvider adProvider;
    private final JwtUtil jwtUtil;
    private final AuthenticationService authenticationService;
    private final AdminPortalService adminPortalService;
    private final AppUserRepository appUserRepository;

    public AuthController(ActiveDirectoryLdapAuthenticationProvider adProvider,
                          JwtUtil jwtUtil,
                          AuthenticationService authenticationService,
                          AdminPortalService adminPortalService,
                          AppUserRepository appUserRepository) {
        this.adProvider = adProvider;
        this.jwtUtil = jwtUtil;
        this.authenticationService = authenticationService;
        this.adminPortalService = adminPortalService;
        this.appUserRepository = appUserRepository;
    }

    /**
     * POST /api/auth/login
     * Authentification locale via la table users (mot de passe hashé BCrypt).
     */
    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody PasswordLoginRequest request) {
        if (request.email() == null || request.email().isBlank()
                || request.password() == null || request.password().isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Email et mot de passe requis."));
        }

        AppUser authenticatedUser = authenticationService.authenticateWithPassword(request.email(), request.password())
                .orElse(null);
        if (authenticatedUser == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Email ou mot de passe invalide."));
        }
        authenticationService.markSuccessfulLogin(authenticatedUser);
        adminPortalService.registerConnection(authenticatedUser, resolveDisplayName(authenticatedUser, null));
        return ResponseEntity.ok(buildResponse(authenticatedUser));
    }

    /**
     * POST /api/auth/sso
     * Authenticates a user against the EMEAAD Active Directory domain.
     * Returns a JWT on success for users provisioned in the users table.
     */
    @PostMapping("/sso")
    public ResponseEntity<?> ssoLogin(@Valid @RequestBody SsoLoginRequest request) {
        if (request.username() == null || request.username().isBlank()
                || request.password() == null || request.password().isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "Nom d'utilisateur et mot de passe requis."));
        }

        try {
            UsernamePasswordAuthenticationToken authToken =
                    new UsernamePasswordAuthenticationToken(
                            request.username().trim(),
                            request.password()
                    );
            Authentication auth = adProvider.authenticate(authToken);

            String username = auth.getName();
            return authenticationService.findProvisionedUser(username)
                    .<ResponseEntity<?>>map(user -> {
                        String displayName = resolveDisplayName(auth);
                        authenticationService.markSuccessfulLogin(user);
                        adminPortalService.registerConnection(user, displayName);
                        return ResponseEntity.ok(buildResponse(user, displayName));
                    })
                    .orElseGet(() -> ResponseEntity.status(HttpStatus.FORBIDDEN)
                            .body(Map.of("error", "Utilisateur AD authentifié mais non autorisé dans l'application.")));

        } catch (BadCredentialsException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Identifiants AD invalides. Vérifiez votre nom d'utilisateur et mot de passe."));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Impossible de joindre le contrôleur de domaine EMEAAD. Contactez votre administrateur."));
        }
    }

    /**
     * DEPRECATED: Cette route a été déplacée à /api/users/change-password
     * car elle nécessite l'authentification JWT.
     * L'interceptor frontend exclut les routes /api/auth/, donc le JWT n'était pas envoyé.
     */
    @PostMapping("/change-password") @Deprecated
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

    private AuthLoginResponse buildResponse(AppUser user) {
        return buildResponse(user, null);
    }

    /**
     * {@code ldapDisplayName} is used for SSO only; when an HR employee record is linked,
     * its name takes precedence so the UI matches team/org data.
     */
    private AuthLoginResponse buildResponse(AppUser user, String ldapDisplayName) {
        String role = user.getRole();
        Integer employeeId = user.getEmployee() == null ? null : user.getEmployee().getEmployeeId();
        String token = jwtUtil.generateToken(
                user.getEmail(),
                role,
                user.getUserId(),
                employeeId
        );
        String route = resolveRoute(user);

        return new AuthLoginResponse(
                token,
                resolveEmailForClient(user),
                resolveDisplayName(user, ldapDisplayName),
                role,
                route,
                employeeId,
                user.getUserId()
        );
    }

    /** Email affiché et stocké côté UI : métier (employees) si présent, sinon compte applicatif (users). */
    private String resolveEmailForClient(AppUser user) {
        Employee employee = user.getEmployee();
        if (employee != null && employee.getEmail() != null && !employee.getEmail().isBlank()) {
            return employee.getEmail().trim();
        }
        return user.getEmail();
    }

    private String resolveRoute(AppUser user) {
        String route = user.getPortalRoute();
        if (route != null && !route.isBlank()) {
            return route;
        }
        return switch (user.getRole()) {
            case "ADMIN" -> "/admin/dashboard";
            case "MANAGER" -> "/accueil-manager";
            default -> "/accueil-resp";
        };
    }

    private String resolveDisplayName(AppUser user, String ldapDisplayName) {
        String fromEmployee = formatEmployeeFullName(user.getEmployee());
        if (fromEmployee != null && !fromEmployee.isBlank()) {
            return fromEmployee;
        }
        if (ldapDisplayName != null && !ldapDisplayName.isBlank()) {
            return ldapDisplayName;
        }
        return formatAccountFullName(user);
    }

    private String formatEmployeeFullName(Employee employee) {
        if (employee == null) {
            return null;
        }
        String firstName = employee.getFirstName() == null ? "" : employee.getFirstName().trim();
        String lastName = employee.getLastName() == null ? "" : employee.getLastName().trim();
        String fullName = (firstName + " " + lastName).trim();
        return fullName.isBlank() ? null : fullName;
    }

    private String formatAccountFullName(AppUser user) {
        String firstName = user.getFirstName() == null ? "" : user.getFirstName().trim();
        String lastName = user.getLastName() == null ? "" : user.getLastName().trim();
        String fullName = (firstName + " " + lastName).trim();
        return fullName.isBlank() ? user.getEmail() : fullName;
    }

    private String resolveDisplayName(Authentication auth) {
        // Try to get display name from LDAP attributes if available, fall back to username
        if (auth.getPrincipal() instanceof org.springframework.ldap.core.DirContextOperations ctx) {
            String cn = ctx.getStringAttribute("displayName");
            if (cn != null && !cn.isBlank()) return cn;
            cn = ctx.getStringAttribute("cn");
            if (cn != null && !cn.isBlank()) return cn;
        }
        return auth.getName();
    }
}
