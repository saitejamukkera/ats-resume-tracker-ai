package com.fullstack.ATSJobTracker.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Slf4j
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtUtil jwtUtil;
    private final CustomUserDetailsService userDetailsService;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String token = extractToken(request);

        if (token != null && jwtUtil.isTokenValid(token)) {
            String email = jwtUtil.extractEmail(token);
            Authentication currentAuth = SecurityContextHolder.getContext().getAuthentication();
            if (shouldReplaceAuthentication(currentAuth, email)) {
                if (currentAuth != null && currentAuth.isAuthenticated()) {
                    log.debug("Replacing stale {} principal with JWT identity for {}",
                            currentAuth.getClass().getSimpleName(), email);
                }
                UserDetails userDetails = userDetailsService.loadUserByUsername(email);
                UsernamePasswordAuthenticationToken authToken =
                        new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());
                authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authToken);
            }
        }

        filterChain.doFilter(request, response);
    }

    private boolean shouldReplaceAuthentication(Authentication currentAuth, String email) {
        if (currentAuth == null || !currentAuth.isAuthenticated()) {
            return true;
        }

        Object principal = currentAuth.getPrincipal();
        if (principal instanceof UserDetails userDetails) {
            return !email.equalsIgnoreCase(userDetails.getUsername());
        }

        return true;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        return path.startsWith("/api/auth/login") ||
               path.startsWith("/api/auth/register") ||
               path.startsWith("/api/auth/refresh") ||
               path.startsWith("/oauth2/") ||
               path.startsWith("/login/oauth2/");
    }

    private String extractToken(HttpServletRequest request) {
        if (request.getCookies() != null) {
            for (Cookie cookie : request.getCookies()) {
                if ("jwt".equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;
    }
}
