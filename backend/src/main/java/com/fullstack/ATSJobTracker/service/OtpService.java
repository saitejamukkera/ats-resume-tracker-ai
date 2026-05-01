package com.fullstack.ATSJobTracker.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
@Slf4j
public class OtpService {

    private static final int OTP_LENGTH = 6;
    private static final long OTP_EXPIRY_SECONDS = 300; // 5 minutes
    private static final SecureRandom random = new SecureRandom();

    private record OtpEntry(String otp, Instant expiresAt) {}

    private final Map<String, OtpEntry> otpStore = new ConcurrentHashMap<>();

    public String generateOtp(String email) {
        String key = email.toLowerCase().trim();

        OtpEntry existing = otpStore.get(key);
        if (existing != null && Instant.now().isBefore(existing.expiresAt().minusSeconds(OTP_EXPIRY_SECONDS - 60))) {
            log.warn("OTP cooldown active for: {}", key);
            throw new RuntimeException("Please wait 60 seconds before requesting another code");
        }

        String otp = String.format("%06d", random.nextInt(1_000_000));
        Instant expiresAt = Instant.now().plusSeconds(OTP_EXPIRY_SECONDS);
        otpStore.put(key, new OtpEntry(otp, expiresAt));
        log.info("OTP generated for: {}", key);
        return otp;
    }

    public boolean verifyOtp(String email, String otp) {
        String key = email.toLowerCase().trim();
        OtpEntry entry = otpStore.get(key);
        if (entry == null) {
            log.warn("No OTP found for: {}", key);
            return false;
        }
        if (Instant.now().isAfter(entry.expiresAt())) {
            otpStore.remove(key);
            log.warn("OTP expired for: {}", key);
            return false;
        }
        if (!entry.otp().equals(otp.trim())) {
            log.warn("Invalid OTP for: {}", key);
            return false;
        }
        otpStore.remove(key);
        log.info("OTP verified for: {}", key);
        return true;
    }

    public void clearExpired() {
        Instant now = Instant.now();
        otpStore.entrySet().removeIf(e -> now.isAfter(e.getValue().expiresAt()));
    }
}
