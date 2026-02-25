package com.fullstack.ATSJobTracker.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "auth_users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuthUser {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String email;

    private String password;

    private String fullName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AuthProvider provider;

    private String providerId;

    private LocalDateTime createdAt;

    @Column(unique = true)
    private String forwardingEmail;

    private boolean isForwardingVerified = false;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) createdAt = LocalDateTime.now();
        if (provider == null) provider = AuthProvider.LOCAL;
        if (forwardingEmail == null) {
            forwardingEmail = "track-" + java.util.UUID.randomUUID().toString().substring(0, 8) + "@inbound.postmarkapp.com";
        }
    }
}
