package com.fullstack.ATSJobTracker.service;

import com.fullstack.ATSJobTracker.model.RefreshToken;
import com.fullstack.ATSJobTracker.repository.RefreshTokenRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class RefreshTokenService {

    private final RefreshTokenRepository refreshTokenRepository;

    @Value("${jwt.refresh-expiration:1209600000}")
    private long refreshExpirationMs;

    @Transactional
    public RefreshToken createRefreshToken(Long userId) {
        LocalDateTime now = LocalDateTime.now();
        RefreshToken token = RefreshToken.builder()
                .token(UUID.randomUUID().toString())
                .userId(userId)
                .expiresAt(now.plusSeconds(refreshExpirationMs / 1000))
                .lastUsedAt(now)
                .revoked(false)
                .build();
        return refreshTokenRepository.save(token);
    }

    public Optional<RefreshToken> findByToken(String token) {
        return refreshTokenRepository.findByToken(token);
    }

    @Transactional
    public void revokeAllForUser(Long userId) {
        refreshTokenRepository.revokeAllByUserId(userId);
    }

    @Transactional
    public RefreshToken rotateRefreshToken(RefreshToken oldToken) {
        oldToken.setRevoked(true);
        refreshTokenRepository.save(oldToken);
        RefreshToken newToken = RefreshToken.builder()
                .token(UUID.randomUUID().toString())
                .userId(oldToken.getUserId())
                .expiresAt(LocalDateTime.now().plusSeconds(refreshExpirationMs / 1000))
                .lastUsedAt(LocalDateTime.now())
                .createdAt(LocalDateTime.now())
                .revoked(false)
                .build();
        return refreshTokenRepository.save(newToken);
    }

    /**
     * Purge expired and revoked tokens daily to keep the table lean.
     */
    @Scheduled(cron = "0 0 3 * * *")
    @Transactional
    public void purgeExpiredTokens() {
        refreshTokenRepository.deleteExpiredAndRevoked(
                LocalDateTime.now().minusDays(14),
                LocalDateTime.now().minusDays(60));
        log.info("Purged expired/revoked refresh tokens");
    }
}
