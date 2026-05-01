package com.fullstack.ATSJobTracker.controller;

import com.fullstack.ATSJobTracker.dto.AuthResponse;
import com.fullstack.ATSJobTracker.dto.ForgotPasswordRequest;
import com.fullstack.ATSJobTracker.dto.LoginRequest;
import com.fullstack.ATSJobTracker.dto.RegisterRequest;
import com.fullstack.ATSJobTracker.dto.ResetPasswordRequest;
import com.fullstack.ATSJobTracker.dto.SendOtpRequest;
import com.fullstack.ATSJobTracker.dto.VerifyOtpRegisterRequest;
import com.fullstack.ATSJobTracker.model.AuthProvider;
import com.fullstack.ATSJobTracker.model.AuthUser;
import com.fullstack.ATSJobTracker.model.RefreshToken;
import com.fullstack.ATSJobTracker.exception.NotAuthenticatedException;
import com.fullstack.ATSJobTracker.exception.UserNotFoundException;
import com.fullstack.ATSJobTracker.repository.AuthUserRepository;
import com.fullstack.ATSJobTracker.security.JwtUtil;
import com.fullstack.ATSJobTracker.service.AuthService;
import com.fullstack.ATSJobTracker.service.EmailService;
import com.fullstack.ATSJobTracker.service.OtpService;
import com.fullstack.ATSJobTracker.service.RefreshTokenService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    private final AuthUserRepository authUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final AuthenticationManager authenticationManager;
    private final AuthService authService;
    private final OtpService otpService;
    private final EmailService emailService;
    private final RefreshTokenService refreshTokenService;

    @Value("${jwt.refresh-expiration:1209600000}")
    private long refreshExpirationMs;

    @Value("${app.cookie-domain:}")
    private String cookieDomain;

    @Value("${app.cookie-secure:false}")
    private boolean cookieSecure;

    @GetMapping("/csrf")
    public ResponseEntity<Map<String, String>> csrf(CsrfToken token) {
        return ResponseEntity.ok(Map.of(
            "token", token.getToken(),
            "headerName", token.getHeaderName()
        ));
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@RequestBody @Valid RegisterRequest request,
                                                  HttpServletResponse httpResponse) {
        log.info("POST /api/auth/register - email: {}", request.getEmail());

        if (authUserRepository.existsByEmail(request.getEmail())) {
            return ResponseEntity.badRequest().body(AuthResponse.builder()
                    .message("Email already registered").build());
        }

        AuthUser user = AuthUser.builder()
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .fullName(request.getFullName())
                .provider(AuthProvider.LOCAL)
                .build();
        authUserRepository.save(user);
        log.info("User registered: {}", user.getEmail());

        return buildAuthResponse(user, httpResponse, "Registration successful");
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@RequestBody @Valid LoginRequest request,
                                               HttpServletResponse httpResponse) {
        log.info("POST /api/auth/login - email: {}", request.getEmail());
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.getEmail(), request.getPassword()));
        } catch (Exception e) {
            log.warn("Login failed for: {}", request.getEmail());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(AuthResponse.builder().message("Invalid email or password").build());
        }

        AuthUser user = authUserRepository.findByEmail(request.getEmail())
                .orElseThrow();

        log.info("User logged in: {}", user.getEmail());
        return buildAuthResponse(user, httpResponse, "Login successful");
    }

    @PostMapping("/refresh")
    public ResponseEntity<?> refreshToken(HttpServletRequest request, HttpServletResponse httpResponse) {
        String refreshTokenValue = extractRefreshTokenFromCookie(request);

        if (refreshTokenValue == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "No refresh token provided"));
        }

        return refreshTokenService.findByToken(refreshTokenValue)
                .filter(RefreshToken::isUsable)
                .map(existingToken -> {
                    AuthUser user = authUserRepository.findById(existingToken.getUserId()).orElse(null);
                    if (user == null) {
                        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                                .body((Object) Map.of("message", "User not found"));
                    }

                    RefreshToken newRefreshToken = refreshTokenService.rotateRefreshToken(existingToken);

                    String accessToken = jwtUtil.generateToken(user.getEmail());
                    addRefreshTokenCookie(httpResponse, newRefreshToken.getToken());

                    return ResponseEntity.ok((Object) Map.of(
                            "token", accessToken,
                            "email", user.getEmail(),
                            "fullName", user.getFullName() != null ? user.getFullName() : "",
                            "provider", user.getProvider().name()
                    ));
                })
                .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("message", "Refresh token expired or revoked. Please login again.")));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse httpResponse) {
        log.info("POST /api/auth/logout");

        try {
            AuthUser user = authService.getCurrentUser();
            refreshTokenService.revokeAllForUser(user.getId());
        } catch (NotAuthenticatedException | UserNotFoundException ex) {
            log.debug("Skipping token revocation on logout: {}", ex.getMessage());
        }

        if (request.getSession(false) != null) {
            request.getSession(false).invalidate();
        }

        ResponseCookie.ResponseCookieBuilder jwtBuilder = ResponseCookie.from("jwt", "")
                .httpOnly(true).path("/").maxAge(0).sameSite("Lax").secure(cookieSecure);
        ResponseCookie.ResponseCookieBuilder refreshBuilder = ResponseCookie.from("refreshToken", "")
                .httpOnly(true).path("/api/auth/refresh").maxAge(0).sameSite("Lax").secure(cookieSecure);
        ResponseCookie.ResponseCookieBuilder sessionBuilder = ResponseCookie.from("JSESSIONID", "")
                .httpOnly(true).path("/").maxAge(0).sameSite("Lax").secure(cookieSecure);

        if (cookieDomain != null && !cookieDomain.isEmpty()) {
            jwtBuilder.domain(cookieDomain);
            refreshBuilder.domain(cookieDomain);
            sessionBuilder.domain(cookieDomain);
        }

        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, jwtBuilder.build().toString())
                .header(HttpHeaders.SET_COOKIE, refreshBuilder.build().toString())
                .header(HttpHeaders.SET_COOKIE, sessionBuilder.build().toString())
                .build();
    }

    @GetMapping("/me")
    public ResponseEntity<AuthResponse> getCurrentUser() {
        try {
            AuthUser user = authService.getCurrentUser();
            return ResponseEntity.ok(AuthResponse.builder()
                    .email(user.getEmail())
                    .fullName(user.getFullName())
                    .provider(user.getProvider().name())
                    .build());
        } catch (NotAuthenticatedException | UserNotFoundException ex) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
    }

    @PostMapping("/send-otp")
    public ResponseEntity<AuthResponse> sendOtp(@RequestBody @Valid SendOtpRequest request) {
        log.info("POST /api/auth/send-otp - email: {}", request.getEmail());

        if (authUserRepository.existsByEmail(request.getEmail())) {
            return ResponseEntity.badRequest().body(AuthResponse.builder()
                    .message("Email already registered").build());
        }

        String otp = otpService.generateOtp(request.getEmail());
        emailService.sendOtpEmail(request.getEmail(), otp, "account registration");

        return ResponseEntity.ok(AuthResponse.builder()
                .message("Verification code sent to your email").build());
    }

    @PostMapping("/verify-otp-register")
    public ResponseEntity<AuthResponse> verifyOtpAndRegister(@RequestBody @Valid VerifyOtpRegisterRequest request,
                                                              HttpServletResponse httpResponse) {
        log.info("POST /api/auth/verify-otp-register - email: {}", request.getEmail());

        if (authUserRepository.existsByEmail(request.getEmail())) {
            return ResponseEntity.badRequest().body(AuthResponse.builder()
                    .message("Email already registered").build());
        }

        if (!otpService.verifyOtp(request.getEmail(), request.getOtp())) {
            return ResponseEntity.badRequest().body(AuthResponse.builder()
                    .message("Invalid or expired verification code").build());
        }

        AuthUser user = AuthUser.builder()
                .email(request.getEmail())
                .password(passwordEncoder.encode(request.getPassword()))
                .fullName(request.getFullName())
                .provider(AuthProvider.LOCAL)
                .build();
        authUserRepository.save(user);
        log.info("User registered via OTP: {}", user.getEmail());

        return buildAuthResponse(user, httpResponse, "Registration successful");
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<AuthResponse> forgotPassword(@RequestBody @Valid ForgotPasswordRequest request) {
        log.info("POST /api/auth/forgot-password - email: {}", request.getEmail());

        authUserRepository.findByEmail(request.getEmail()).ifPresent(user -> {
            if (user.getProvider() != AuthProvider.LOCAL) {
                return;
            }
            String otp = otpService.generateOtp(request.getEmail());
            emailService.sendOtpEmail(request.getEmail(), otp, "password reset");
        });

        return ResponseEntity.ok(AuthResponse.builder()
                .message("If an account exists with that email, a verification code has been sent").build());
    }

    @PostMapping("/reset-password")
    public ResponseEntity<AuthResponse> resetPassword(@RequestBody @Valid ResetPasswordRequest request) {
        log.info("POST /api/auth/reset-password - email: {}", request.getEmail());

        if (!otpService.verifyOtp(request.getEmail(), request.getOtp())) {
            return ResponseEntity.badRequest().body(AuthResponse.builder()
                    .message("Invalid or expired verification code").build());
        }

        AuthUser user = authUserRepository.findByEmail(request.getEmail())
                .orElse(null);
        if (user == null || user.getProvider() != AuthProvider.LOCAL) {
            return ResponseEntity.badRequest().body(AuthResponse.builder()
                    .message("Cannot reset password for this account").build());
        }

        user.setPassword(passwordEncoder.encode(request.getNewPassword()));
        authUserRepository.save(user);
        log.info("Password reset for: {}", user.getEmail());

        return ResponseEntity.ok(AuthResponse.builder()
                .message("Password reset successful. You can now sign in.").build());
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private ResponseEntity<AuthResponse> buildAuthResponse(AuthUser user,
                                                            HttpServletResponse httpResponse,
                                                            String message) {
        refreshTokenService.revokeAllForUser(user.getId());

        String accessToken = jwtUtil.generateToken(user.getEmail());
        RefreshToken refreshToken = refreshTokenService.createRefreshToken(user.getId());

        ResponseCookie jwtCookie = createJwtCookie(accessToken);
        httpResponse.addHeader(HttpHeaders.SET_COOKIE, jwtCookie.toString());
        addRefreshTokenCookie(httpResponse, refreshToken.getToken());

        return ResponseEntity.ok(AuthResponse.builder()
                .email(user.getEmail())
                .fullName(user.getFullName())
                .provider(user.getProvider().name())
                .token(accessToken)
                .message(message)
                .build());
    }

    private ResponseCookie createJwtCookie(String token) {
        ResponseCookie.ResponseCookieBuilder builder = ResponseCookie.from("jwt", token)
                .httpOnly(true)
                .path("/")
                .maxAge(900)
                .sameSite("Lax")
                .secure(cookieSecure);
        if (cookieDomain != null && !cookieDomain.isEmpty()) {
            builder.domain(cookieDomain);
        }
        return builder.build();
    }

    private void addRefreshTokenCookie(HttpServletResponse response, String refreshToken) {
        ResponseCookie.ResponseCookieBuilder builder = ResponseCookie.from("refreshToken", refreshToken)
                .httpOnly(true)
                .path("/api/auth/refresh")
                .maxAge(refreshExpirationMs / 1000)
                .sameSite("Lax")
                .secure(cookieSecure);
        if (cookieDomain != null && !cookieDomain.isEmpty()) {
            builder.domain(cookieDomain);
        }
        response.addHeader(HttpHeaders.SET_COOKIE, builder.build().toString());
    }

    private String extractRefreshTokenFromCookie(HttpServletRequest request) {
        if (request.getCookies() != null) {
            for (Cookie cookie : request.getCookies()) {
                if ("refreshToken".equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }
        return null;
    }
}
