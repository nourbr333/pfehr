package com.hranalytics.hrbackend.security;

import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.lang.NonNull;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.Locale;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;

    public JwtAuthenticationFilter(JwtUtil jwtUtil) {
        this.jwtUtil = jwtUtil;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain) throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");

        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7).trim();
            if (!token.isEmpty() && jwtUtil.isValid(token)) {
                Claims claims = jwtUtil.parseToken(token);
                String email = claims.getSubject();
                String role = normalizeRole(claims.get("role"));
                Long userId = readLongClaim(claims, "userId");
                Integer employeeId = readIntegerClaim(claims, "employeeId");

                if (email != null && role != null) {
                    AuthenticatedUser principal = new AuthenticatedUser(email, role, userId, employeeId);
                    var authorities = List.of(new SimpleGrantedAuthority("ROLE_" + role));
                    var authentication = new UsernamePasswordAuthenticationToken(principal, null, authorities);
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                }
            }
        }

        filterChain.doFilter(request, response);
    }

    private Long readLongClaim(Claims claims, String name) {
        Object value = claims.get(name);
        if (value instanceof Number number) {
            return number.longValue();
        }
        return null;
    }

    private Integer readIntegerClaim(Claims claims, String name) {
        Object value = claims.get(name);
        if (value instanceof Number number) {
            return number.intValue();
        }
        return null;
    }

    /** Normalise le rôle JWT : trim, uppercase, retire le préfixe ROLE_ si déjà présent. */
    private String normalizeRole(Object rawRole) {
        if (rawRole == null) {
            return null;
        }
        String role = rawRole.toString().trim();
        if (role.isEmpty()) {
            return null;
        }
        if (role.toUpperCase(Locale.ROOT).startsWith("ROLE_")) {
            role = role.substring(5);
        }
        return role.toUpperCase(Locale.ROOT);
    }
}
