package com.fullstack.ATSJobTracker.security;

import com.fullstack.ATSJobTracker.model.AuthProvider;
import com.fullstack.ATSJobTracker.model.AuthUser;
import com.fullstack.ATSJobTracker.model.RefreshToken;
import com.fullstack.ATSJobTracker.repository.AuthUserRepository;
import com.fullstack.ATSJobTracker.service.RefreshTokenService;
import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
@RequiredArgsConstructor
@Slf4j
public class OAuth2SuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    private final AuthUserRepository authUserRepository;
    private final JwtUtil jwtUtil;
    private final RefreshTokenService refreshTokenService;

    @Value("${app.frontend-url:http://localhost:3000}")
    private String frontendUrl;

    @Value("${jwt.refresh-expiration:1209600000}")
    private long refreshExpirationMs;

    @Value("${app.cookie-domain:}")
    private String cookieDomain;

    @Value("${app.cookie-secure:false}")
    private boolean cookieSecure;

    @PostConstruct
    void normalizeCookieDomain() {
        if (cookieDomain != null) {
            cookieDomain = cookieDomain.replaceFirst("^\\.", "");
        }
    }

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                        HttpServletResponse response,
                                        Authentication authentication) throws IOException {
        OAuth2User oAuth2User = (OAuth2User) authentication.getPrincipal();
        String registrationId = ((OAuth2AuthenticationToken) authentication).getAuthorizedClientRegistrationId();

        String email = oAuth2User.getAttribute("email");
        String name = oAuth2User.getAttribute("name");
        AuthProvider provider = "google".equals(registrationId) ? AuthProvider.GOOGLE : AuthProvider.GITHUB;

        String rawProviderId = oAuth2User.getAttribute("sub");
        if (rawProviderId == null) {
            Object idAttr = oAuth2User.getAttribute("id");
            rawProviderId = idAttr != null ? String.valueOf(idAttr) : null;
        }
        final String providerId = rawProviderId;

        if (email == null && provider == AuthProvider.GITHUB) {
            String login = oAuth2User.getAttribute("login");
            email = login != null ? login + "@github.user" : "unknown@github.user";
        }
        if (name == null && provider == AuthProvider.GITHUB) {
            name = oAuth2User.getAttribute("login");
        }

        log.info("OAuth2 login success: provider={}, email={}", provider, email);

        final String finalEmail = email;
        final String finalName = name;
        AuthUser user = authUserRepository.findByEmail(finalEmail).orElseGet(() -> {
            AuthUser newUser = AuthUser.builder()
                    .email(finalEmail)
                    .fullName(finalName)
                    .provider(provider)
                    .providerId(providerId)
                    .build();
            return authUserRepository.save(newUser);
        });

        refreshTokenService.revokeAllForUser(user.getId());

        String token = jwtUtil.generateToken(user.getEmail());
        RefreshToken refreshToken = refreshTokenService.createRefreshToken(user.getId());

        ResponseCookie.ResponseCookieBuilder jwtCookieBuilder = ResponseCookie.from("jwt", token)
                .httpOnly(true)
                .path("/")
                .maxAge(900)
                .sameSite("Lax")
                .secure(cookieSecure);
        if (cookieDomain != null && !cookieDomain.isEmpty()) {
            jwtCookieBuilder.domain(cookieDomain);
        }
        response.addHeader(HttpHeaders.SET_COOKIE, jwtCookieBuilder.build().toString());

        ResponseCookie.ResponseCookieBuilder refreshCookieBuilder = ResponseCookie.from("refreshToken", refreshToken.getToken())
                .httpOnly(true)
                .path("/api/auth/refresh")
                .maxAge(refreshExpirationMs / 1000)
                .sameSite("Lax")
                .secure(cookieSecure);
        if (cookieDomain != null && !cookieDomain.isEmpty()) {
            refreshCookieBuilder.domain(cookieDomain);
        }
        response.addHeader(HttpHeaders.SET_COOKIE, refreshCookieBuilder.build().toString());

        getRedirectStrategy().sendRedirect(request, response,
            frontendUrl + "/oauth2/callback?token=" + token);
    }
}
