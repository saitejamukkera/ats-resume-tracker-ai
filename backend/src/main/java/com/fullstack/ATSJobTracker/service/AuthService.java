package com.fullstack.ATSJobTracker.service;

import com.fullstack.ATSJobTracker.exception.NotAuthenticatedException;
import com.fullstack.ATSJobTracker.exception.UserNotFoundException;
import com.fullstack.ATSJobTracker.model.AuthUser;
import com.fullstack.ATSJobTracker.repository.AuthUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final AuthUserRepository authUserRepository;

    public AuthUser getCurrentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String email = resolveAuthenticatedEmail(auth);
        return authUserRepository.findByEmail(email)
                .orElseThrow(() -> new UserNotFoundException(email));
    }

    private String resolveAuthenticatedEmail(Authentication auth) {
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) {
            throw new NotAuthenticatedException("No authenticated principal in SecurityContext");
        }

        Object principal = auth.getPrincipal();
        if (principal instanceof UserDetails userDetails) {
            return userDetails.getUsername();
        }

        if (principal instanceof OAuth2User oauth2User) {
            String email = oauth2User.getAttribute("email");
            if (email != null && !email.isBlank()) {
                return email;
            }

            String login = oauth2User.getAttribute("login");
            if (login != null && !login.isBlank()) {
                return login + "@github.user";
            }
        }

        String name = auth.getName();
        if (name == null || name.isBlank() || "anonymousUser".equals(name)) {
            throw new NotAuthenticatedException("Could not resolve email from principal: " + auth.getClass().getSimpleName());
        }

        return name;
    }

    public Long getCurrentUserId() {
        return getCurrentUser().getId();
    }
}
