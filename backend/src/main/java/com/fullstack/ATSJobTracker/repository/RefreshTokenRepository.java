package com.fullstack.ATSJobTracker.repository;

import com.fullstack.ATSJobTracker.model.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;

@Repository
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    Optional<RefreshToken> findByToken(String token);

    @Modifying
    @Query("UPDATE RefreshToken rt SET rt.revoked = true WHERE rt.userId = :userId AND rt.revoked = false")
    void revokeAllByUserId(Long userId);

    @Modifying
    @Query("DELETE FROM RefreshToken rt WHERE rt.lastUsedAt < :inactivityCutoff OR rt.revoked = true OR rt.createdAt < :maxCutoff")
    void deleteExpiredAndRevoked(LocalDateTime inactivityCutoff, LocalDateTime maxCutoff);
}
