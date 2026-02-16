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
import com.fullstack.ATSJobTracker.repository.AuthUserRepository;
import com.fullstack.ATSJobTracker.security.JwtUtil;
import com.fullstack.ATSJobTracker.service.EmailService;
import com.fullstack.ATSJobTracker.service.OtpService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Slf4j
public class AuthController {

    private final AuthUserRepository authUserRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;
    private final AuthenticationManager authenticationManager;
    private final OtpService otpService;
    private final EmailService emailService;

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@RequestBody @Valid RegisterRequest request) {
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

        String token = jwtUtil.generateToken(user.getEmail());
        ResponseCookie cookie = createJwtCookie(token);

        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(AuthResponse.builder()
                        .email(user.getEmail())
                        .fullName(user.getFullName())
                        .provider(user.getProvider().name())
                        .token(token)
                        .message("Registration successful")
                        .build());
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@RequestBody @Valid LoginRequest request) {
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

        String token = jwtUtil.generateToken(user.getEmail());
        ResponseCookie cookie = createJwtCookie(token);

        log.info("User logged in: {}", user.getEmail());
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(AuthResponse.builder()
                        .email(user.getEmail())
                        .fullName(user.getFullName())
                        .provider(user.getProvider().name())
                        .token(token)
                        .message("Login successful")
                        .build());
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout() {
        log.info("POST /api/auth/logout");
        ResponseCookie cookie = ResponseCookie.from("jwt", "")
                .httpOnly(true)
                .path("/")
                .maxAge(0)
                .sameSite("Lax")
                .build();
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .build();
    }

    @GetMapping("/me")
    public ResponseEntity<AuthResponse> getCurrentUser(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        AuthUser user = authUserRepository.findByEmail(authentication.getName())
                .orElse(null);
        if (user == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        return ResponseEntity.ok(AuthResponse.builder()
                .email(user.getEmail())
                .fullName(user.getFullName())
                .provider(user.getProvider().name())
                .build());
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
    public ResponseEntity<AuthResponse> verifyOtpAndRegister(@RequestBody @Valid VerifyOtpRegisterRequest request) {
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

        String token = jwtUtil.generateToken(user.getEmail());
        ResponseCookie cookie = createJwtCookie(token);

        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(AuthResponse.builder()
                        .email(user.getEmail())
                        .fullName(user.getFullName())
                        .provider(user.getProvider().name())
                        .token(token)
                        .message("Registration successful")
                        .build());
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<AuthResponse> forgotPassword(@RequestBody @Valid ForgotPasswordRequest request) {
        log.info("POST /api/auth/forgot-password - email: {}", request.getEmail());

        // Always return success to avoid email enumeration
        authUserRepository.findByEmail(request.getEmail()).ifPresent(user -> {
            if (user.getProvider() != AuthProvider.LOCAL) {
                return; // Don't send OTP for OAuth users
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

    private ResponseCookie createJwtCookie(String token) {
        return ResponseCookie.from("jwt", token)
                .httpOnly(true)
                .path("/")
                .maxAge(86400)
                .sameSite("Lax")
                .secure(false)
                .build();
    }
}
