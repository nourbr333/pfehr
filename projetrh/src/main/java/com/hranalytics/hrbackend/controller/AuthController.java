package com.hranalytics.hrbackend.controller;

import com.hranalytics.hrbackend.dto.AuthLoginResponse;
import com.hranalytics.hrbackend.dto.PasswordLoginRequest;
import com.hranalytics.hrbackend.dto.SsoLoginRequest;
import com.hranalytics.hrbackend.entity.AppUser;
import com.hranalytics.hrbackend.entity.Employee;
import com.hranalytics.hrbackend.security.JwtUtil;
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
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(originPatterns = {"http://localhost:*", "http://127.0.0.1:*"})
public class AuthController {

    private final ActiveDirectoryLdapAuthenticationProvider adProvider;
    private final JwtUtil jwtUtil;
    private final AuthenticationService authenticationService;
    private final AdminPortalService adminPortalService;

    public AuthController(ActiveDirectoryLdapAuthenticationProvider adProvider,
                          JwtUtil jwtUtil,
                          AuthenticationService authenticationService,
                          AdminPortalService adminPortalService) {
        this.adProvider = adProvider;
        this.jwtUtil = jwtUtil;
        this.authenticationService = authenticationService;
        this.adminPortalService = adminPortalService;
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

        try {
            AppUser authenticatedUser = authenticationService.authenticateWithPassword(request.email(), request.password())
                    .orElse(null);
            if (authenticatedUser == null) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("error", "Email ou mot de passe invalide."));
            }
            authenticationService.markSuccessfulLogin(authenticatedUser);
            adminPortalService.registerConnection(authenticatedUser, resolveDisplayName(authenticatedUser, null));
            return ResponseEntity.ok(buildResponse(authenticatedUser));
        } catch (ResponseStatusException e) {
            return ResponseEntity.status(e.getStatusCode())
                    .body(Map.of("error", e.getReason()));
        }
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
        } catch (ResponseStatusException e) {
            return ResponseEntity.status(e.getStatusCode())
                    .body(Map.of("error", e.getReason()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "Impossible de joindre le contrôleur de domaine EMEAAD. Contactez votre administrateur."));
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
