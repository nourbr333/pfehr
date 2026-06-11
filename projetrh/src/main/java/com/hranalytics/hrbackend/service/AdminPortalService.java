package com.hranalytics.hrbackend.service;

import com.hranalytics.hrbackend.dto.AdminDashboardStatsDTO;
import com.hranalytics.hrbackend.dto.AdminLogDTO;
import com.hranalytics.hrbackend.dto.AdminRoleDTO;
import com.hranalytics.hrbackend.dto.AdminUserUpsertRequest;
import com.hranalytics.hrbackend.dto.AdminUserDTO;
import com.hranalytics.hrbackend.dto.PageResponse;
import com.hranalytics.hrbackend.entity.AdminAuditLog;
import com.hranalytics.hrbackend.entity.AppUser;
import com.hranalytics.hrbackend.repository.AdminAuditLogRepository;
import com.hranalytics.hrbackend.repository.AppUserRepository;
import com.hranalytics.hrbackend.util.PaginationSupport;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AdminPortalService {

    private static final String DEFAULT_ADMIN_NAME = "Admin";
    private static final String LOGIN_ACTION = "CONNEXION";

    private static final List<String> TAB_CONNEXIONS = List.of("CONNEXION");
    private static final List<String> TAB_COMPTES = List.of(
            "CREATION_UTILISATEUR",
            "MODIFICATION_UTILISATEUR",
            "VALIDATION_COMPTE",
            "ACTIVATION_COMPTE",
            "DESACTIVATION_COMPTE"
    );
    private static final List<String> TAB_SECURITE = List.of(
            "MODIFICATION_ROLE",
            "REINITIALISATION_MDP",
            "SUPPRESSION"
    );

    private final AppUserRepository appUserRepository;
    private final AdminAuditLogRepository adminAuditLogRepository;
    private final PasswordEncoder passwordEncoder;

    public AdminPortalService(AppUserRepository appUserRepository,
                              AdminAuditLogRepository adminAuditLogRepository,
                              PasswordEncoder passwordEncoder) {
        this.appUserRepository = appUserRepository;
        this.adminAuditLogRepository = adminAuditLogRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public List<AdminUserDTO> getUsers() {
        return appUserRepository.findAllByOrderByUserIdDesc()
                .stream()
                .map(this::toAdminUserDto)
                .toList();
    }

    public List<AdminRoleDTO> getRoles() {
        List<String> roles = appUserRepository.findAllByOrderByUserIdDesc()
                .stream()
                .map(AppUser::getRole)
                .filter(role -> role != null && !role.isBlank())
                .map(this::normalizeRole)
                .distinct()
                .sorted()
                .toList();

        return roles.stream()
                .map(role -> new AdminRoleDTO(
                        "ROLE_" + role,
                        role,
                        roleColor(role),
                        List.of()))
                .toList();
    }

    public List<AdminLogDTO> getLogs() {
        return adminAuditLogRepository.findAllByOrderByCreatedAtDesc()
                .stream()
                .map(this::toAdminLogDto)
                .toList();
    }

    public PageResponse<AdminLogDTO> getLogsPage(
            int page,
            int size,
            String search,
            String tab,
            String targetName,
            String dateFrom,
            String dateTo,
            String sortDir,
            boolean unpaged
    ) {
        if (unpaged) {
            return PageResponse.unpaged(getLogs());
        }

        LocalDateTime from = parseDateStart(dateFrom);
        LocalDateTime toExclusive = parseDateEndExclusive(dateTo);
        String normalizedSearch = search == null ? "" : search.trim();
        String normalizedTarget = targetName == null ? "" : targetName.trim();
        List<String> tabActions = actionsForTab(tab);
        boolean actionsEmpty = tabActions.isEmpty();

        Sort sort = "asc".equalsIgnoreCase(sortDir)
                ? Sort.by("createdAt").ascending()
                : Sort.by("createdAt").descending();

        Page<AdminAuditLog> result = adminAuditLogRepository.findFiltered(
                normalizedSearch,
                normalizedTarget,
                from,
                toExclusive,
                tabActions,
                actionsEmpty,
                PaginationSupport.pageable(page, size, sort)
        );

        PageResponse<AdminLogDTO> response = PageResponse.from(result.map(this::toAdminLogDto));
        response.setTabCounts(computeTabCounts(normalizedSearch, normalizedTarget, from, toExclusive));
        return response;
    }

    public List<String> getLogTargetNames() {
        return adminAuditLogRepository.findDistinctTargetNames();
    }

    public AdminDashboardStatsDTO getDashboardStats() {
        List<AppUser> users = appUserRepository.findAllByOrderByUserIdDesc();
        long actifs = users.stream().filter(u -> Boolean.TRUE.equals(u.getIsActive())).count();
        long inactifs = users.size() - actifs;
        long pendingValidation = users.stream().filter(u -> !Boolean.TRUE.equals(u.getValidated())).count();

        LocalDateTime sevenDaysAgo = LocalDateTime.now().minusDays(7);
        long recentConnections = adminAuditLogRepository.findAllByOrderByCreatedAtDesc()
                .stream()
                .filter(log -> LOGIN_ACTION.equals(log.getAction()))
                .filter(log -> log.getCreatedAt() != null && log.getCreatedAt().isAfter(sevenDaysAgo))
                .count();

        List<String> roles = users.stream()
                .map(AppUser::getRole)
                .filter(role -> role != null && !role.isBlank())
                .map(this::normalizeRole)
                .distinct()
                .sorted()
                .toList();

        return new AdminDashboardStatsDTO(
                users.size(),
                actifs,
                inactifs,
                recentConnections,
                roles.size(),
                String.join(" · ", roles),
                pendingValidation);
    }

    public AdminUserDTO addUser(AdminUserUpsertRequest request) {
        String normalizedEmail = request.email().trim().toLowerCase(Locale.ROOT);
        boolean emailExists = appUserRepository.findAllByOrderByUserIdDesc()
                .stream()
                .anyMatch(user -> normalizedEmail.equalsIgnoreCase(user.getEmail()));
        if (emailExists) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Un utilisateur avec cet email existe déjà.");
        }

        AppUser user = new AppUser();
        user.setFirstName(request.prenom().trim());
        user.setLastName(request.nom().trim());
        user.setEmail(normalizedEmail);
        user.setRole(normalizeRole(request.role()));
        user.setPortalRoute(defaultRouteForRole(user.getRole()));
        user.setIsActive("actif".equalsIgnoreCase(request.statut()));
        user.setValidated(request.validated());
        user.setPasswordHash(passwordEncoder.encode(resolvePasswordOrRandom(request.password())));

        AppUser saved = appUserRepository.save(user);
        addLog("CREATION_UTILISATEUR", saved, "Compte créé avec rôle " + saved.getRole());
        return toAdminUserDto(saved);
    }

    public AdminUserDTO updateUser(Long userId, AdminUserUpsertRequest request) {
        AppUser user = getUserOrThrow(userId);
        user.setFirstName(request.prenom().trim());
        user.setLastName(request.nom().trim());
        user.setEmail(request.email().trim().toLowerCase(Locale.ROOT));
        user.setRole(normalizeRole(request.role()));
        user.setPortalRoute(defaultRouteForRole(user.getRole()));
        user.setIsActive("actif".equalsIgnoreCase(request.statut()));
        user.setValidated(request.validated());

        if (request.password() != null && !request.password().isBlank()) {
            user.setPasswordHash(passwordEncoder.encode(request.password()));
        }

        AppUser saved = appUserRepository.save(user);
        addLog("MODIFICATION_UTILISATEUR", saved, "Données utilisateur modifiées");
        return toAdminUserDto(saved);
    }

    @SuppressWarnings("null")
    public void deleteUser(Long userId) {
        AppUser user = getUserOrThrow(userId);
        addLog("SUPPRESSION", user, "Compte supprimé définitivement");
        @SuppressWarnings("null")
        AppUser toDelete = user;
        appUserRepository.delete(toDelete);
    }

    public AdminUserDTO assignRole(Long userId, String newRole) {
        AppUser user = getUserOrThrow(userId);
        String oldRole = user.getRole();
        user.setRole(normalizeRole(newRole));
        user.setPortalRoute(defaultRouteForRole(user.getRole()));
        AppUser saved = appUserRepository.save(user);
        addLog("MODIFICATION_ROLE", saved,
                "Rôle modifié → " + saved.getRole() + " (ancien: " + oldRole + ")");
        return toAdminUserDto(saved);
    }

    public AdminUserDTO toggleUserStatus(Long userId) {
        AppUser user = getUserOrThrow(userId);
        boolean nextActive = !Boolean.TRUE.equals(user.getIsActive());
        user.setIsActive(nextActive);
        AppUser saved = appUserRepository.save(user);

        if (nextActive) {
            addLog("ACTIVATION_COMPTE", saved, "Compte activé");
        } else {
            addLog("DESACTIVATION_COMPTE", saved, "Compte désactivé par l'administrateur");
        }
        return toAdminUserDto(saved);
    }

    public AdminUserDTO validateAccount(Long userId) {
        AppUser user = getUserOrThrow(userId);
        user.setValidated(Boolean.TRUE);
        user.setIsActive(Boolean.TRUE);
        AppUser saved = appUserRepository.save(user);
        addLog("VALIDATION_COMPTE", saved, "Compte validé et activé");
        return toAdminUserDto(saved);
    }

    public void resetPassword(Long userId, String newPassword) {
        AppUser user = getUserOrThrow(userId);
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        appUserRepository.save(user);
        addLog("REINITIALISATION_MDP", user, "Mot de passe réinitialisé");
    }

    public Optional<Long> getUserIdByEmployeeId(Long employeeId) {
        return appUserRepository.findByEmployee_EmployeeIdAndIsActiveTrue(employeeId)
                .map(AppUser::getUserId);
    }

    public void registerConnection(AppUser user, String performedBy) {
        String details = switch (normalizeRole(user.getRole())) {
            case "RESPONSABLE_RH" -> "Connexion réussie au portail RH";
            case "MANAGER"        -> "Connexion réussie au portail manager";
            default               -> "Connexion réussie au portail admin";
        };
        addLog(LOGIN_ACTION, user, details, performedBy);
    }

    private AppUser getUserOrThrow(Long userId) {
        return appUserRepository.findByUserId(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Utilisateur introuvable."));
    }

    private void addLog(String action, AppUser targetUser, String details) {
        addLog(action, targetUser, details, DEFAULT_ADMIN_NAME);
    }

    private void addLog(String action, AppUser targetUser, String details, String performedBy) {
        AdminAuditLog log = new AdminAuditLog();
        log.setAction(action);
        log.setUser(targetUser);
        log.setTargetName(userFullName(targetUser));
        log.setPerformedBy((performedBy == null || performedBy.isBlank()) ? DEFAULT_ADMIN_NAME : performedBy);
        log.setDetails(details);
        adminAuditLogRepository.save(log);
    }

    private AdminUserDTO toAdminUserDto(AppUser user) {
        return new AdminUserDTO(
                String.valueOf(user.getUserId()),
                safeTrim(user.getLastName()),
                safeTrim(user.getFirstName()),
                safeTrim(user.getEmail()),
                normalizeRole(user.getRole()),
                Boolean.TRUE.equals(user.getIsActive()) ? "actif" : "inactif",
                user.getCreatedAt() == null ? null : user.getCreatedAt().toString(),
                formatLastConnection(user),
                Boolean.TRUE.equals(user.getValidated()));
    }

    private String formatLastConnection(AppUser user) {
        if (user.getLastLoginAt() != null) {
            return user.getLastLoginAt().toString();
        }
        Optional<AdminAuditLog> latestConnection = adminAuditLogRepository
                .findTopByUserUserIdAndActionOrderByCreatedAtDesc(user.getUserId(), LOGIN_ACTION);
        return latestConnection.map(log -> log.getCreatedAt().toString()).orElse("");
    }

    private AdminLogDTO toAdminLogDto(AdminAuditLog log) {
        return new AdminLogDTO(
                "LOG" + log.getLogId(),
                safeTrim(log.getAction()),
                safeTrim(log.getTargetName()),
                safeTrim(log.getPerformedBy()),
                log.getCreatedAt() == null ? "" : log.getCreatedAt().toString(),
                safeTrim(log.getDetails()));
    }

    private String resolvePasswordOrRandom(String requestedPassword) {
        if (requestedPassword != null && !requestedPassword.isBlank()) {
            return requestedPassword;
        }
        return "Tmp@" + UUID.randomUUID().toString().replace("-", "").substring(0, 12) + "!";
    }

    private String defaultRouteForRole(String role) {
        return switch (normalizeRole(role)) {
            case "ADMIN" -> "/admin/dashboard";
            case "MANAGER" -> "/accueil-manager";
            default -> "/accueil-resp";
        };
    }

    private String normalizeRole(String rawRole) {
        return rawRole == null ? "" : rawRole.trim().toUpperCase(Locale.ROOT);
    }

    private String roleColor(String role) {
        return switch (normalizeRole(role)) {
            case "ADMIN" -> "#e74c3c";
            case "MANAGER" -> "#3498db";
            case "RESPONSABLE_RH" -> "#27ae60";
            default -> "#6b7280";
        };
    }

    private String userFullName(AppUser user) {
        String first = safeTrim(user.getFirstName());
        String last = safeTrim(user.getLastName());
        String full = (first + " " + last).trim();
        return full.isBlank() ? safeTrim(user.getEmail()) : full;
    }

    private String safeTrim(String value) {
        return value == null ? "" : value.trim();
    }

    private List<String> actionsForTab(String tab) {
        if (tab == null || tab.isBlank() || "TOUS".equalsIgnoreCase(tab.trim())) {
            return List.of();
        }
        return switch (tab.trim().toUpperCase(Locale.ROOT)) {
            case "CONNEXIONS" -> TAB_CONNEXIONS;
            case "COMPTES" -> TAB_COMPTES;
            case "SECURITE" -> TAB_SECURITE;
            default -> List.of();
        };
    }

    private Map<String, Long> computeTabCounts(
            String search,
            String targetName,
            LocalDateTime dateFrom,
            LocalDateTime dateToExclusive
    ) {
        Map<String, Long> byAction = new HashMap<>();
        for (Object[] row : adminAuditLogRepository.countByActionFiltered(search, targetName, dateFrom, dateToExclusive)) {
            String action = String.valueOf(row[0]);
            long count = row[1] instanceof Number number ? number.longValue() : 0L;
            byAction.put(action, count);
        }

        Map<String, Long> tabCounts = new LinkedHashMap<>();
        tabCounts.put("TOUS", byAction.values().stream().mapToLong(Long::longValue).sum());
        tabCounts.put("CONNEXIONS", sumActions(byAction, TAB_CONNEXIONS));
        tabCounts.put("COMPTES", sumActions(byAction, TAB_COMPTES));
        tabCounts.put("SECURITE", sumActions(byAction, TAB_SECURITE));
        return tabCounts;
    }

    private long sumActions(Map<String, Long> byAction, List<String> actions) {
        return actions.stream().mapToLong(action -> byAction.getOrDefault(action, 0L)).sum();
    }

    private LocalDateTime parseDateStart(String ymd) {
        if (ymd == null || ymd.isBlank()) {
            return null;
        }
        return LocalDate.parse(ymd.trim()).atStartOfDay();
    }

    private LocalDateTime parseDateEndExclusive(String ymd) {
        if (ymd == null || ymd.isBlank()) {
            return null;
        }
        return LocalDate.parse(ymd.trim()).plusDays(1).atStartOfDay();
    }
}
