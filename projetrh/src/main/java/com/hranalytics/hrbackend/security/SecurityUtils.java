package com.hranalytics.hrbackend.security;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

/**
 * Vérifications d'accès basées sur le rôle applicatif.
 *
 * <p>Le diagramme de cas d'utilisation UML du projet modélise l'Admin comme héritant des
 * acteurs Responsable RH et Manager (il peut réaliser toutes leurs actions). Il n'existe pas
 * de table de permissions dynamique : cet héritage est matérialisé directement par
 * {@link #isAdmin(AuthenticatedUser)}, qui court-circuite systématiquement les vérifications
 * de portée RH ({@code /api/hr/**}, {@code /api/leave-requests/**}, ...) et manager
 * ({@link #requireManagerAccess}). Voir aussi {@code role-capabilities.ts} côté frontend.
 */
public final class SecurityUtils {

    private SecurityUtils() {
    }

    public static AuthenticatedUser requireAuthenticated() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AuthenticatedUser user)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentification requise.");
        }
        return user;
    }

    /** Matérialise l'héritage UML Admin → (Responsable RH + Manager) : superuser sur tout le périmètre RH/Manager. */
    public static boolean isAdmin(AuthenticatedUser user) {
        return "ADMIN".equals(user.getRole());
    }

    public static boolean isRh(AuthenticatedUser user) {
        return "RESPONSABLE_RH".equals(user.getRole());
    }

    public static boolean isManager(AuthenticatedUser user) {
        return "MANAGER".equals(user.getRole());
    }

    public static boolean isAdminOrRh(AuthenticatedUser user) {
        return isAdmin(user) || isRh(user);
    }

    public static void requireManagerAccess(AuthenticatedUser user, Integer managerId) {
        if (isAdmin(user)) {
            return;
        }
        if (!isManager(user) || user.getEmployeeId() == null || !user.getEmployeeId().equals(managerId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Accès refusé à ces données manager.");
        }
    }

    public static void requireUserId(AuthenticatedUser user, Long userId) {
        if (isAdmin(user)) {
            return;
        }
        if (user.getUserId() == null || !user.getUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Accès refusé à ces données utilisateur.");
        }
    }
}
