package com.fullstack.ATSJobTracker.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;

@Component
@RequiredArgsConstructor
public class RateLimitFilter extends OncePerRequestFilter {

    private final RateLimitStore store;

    private record Limit(long capacity, long refillTokens, Duration refillPeriod) {}

    private static final Map<String, Limit> LIMITS = Map.ofEntries(
            Map.entry("/api/auth/login",           new Limit(5,  1, Duration.ofMinutes(15))),
            Map.entry("/api/auth/send-otp",        new Limit(1,  1, Duration.ofMinutes(1))),
            Map.entry("/api/auth/forgot-password", new Limit(1,  1, Duration.ofMinutes(1))),
            Map.entry("/api/auth/register",        new Limit(3,  1, Duration.ofHours(1))),
            Map.entry("/api/auth/refresh",         new Limit(30, 5, Duration.ofMinutes(1))),
            Map.entry("/api/auth/verify-otp-register", new Limit(5, 1, Duration.ofMinutes(15))),
            Map.entry("/api/auth/reset-password",  new Limit(5,  1, Duration.ofMinutes(15)))
    );

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String path = findMatchingPath(request.getServletPath());
        if (path == null) {
            filterChain.doFilter(request, response);
            return;
        }

        Limit limit = LIMITS.get(path);
        String ip = request.getRemoteAddr();
        String key = ip + ":" + path;

        if (store.tryConsume(key, limit.capacity, limit.refillTokens, limit.refillPeriod)) {
            filterChain.doFilter(request, response);
        } else {
            response.setStatus(429);
            response.setContentType("application/json");
            response.setHeader("Retry-After", String.valueOf(limit.refillPeriod.toSeconds()));
            response.getWriter().write("{\"error\":\"Too many requests. Please try again later.\"}");
        }
    }

    private String findMatchingPath(String servletPath) {
        if (servletPath == null) return null;
        if (LIMITS.containsKey(servletPath)) return servletPath;
        for (String pattern : LIMITS.keySet()) {
            if (servletPath.startsWith(pattern) && !servletPath.substring(pattern.length()).contains("/")) {
                return pattern;
            }
        }
        return null;
    }
}
