package com.fullstack.ATSJobTracker.controller;

import com.fullstack.ATSJobTracker.model.UserProfile;
import com.fullstack.ATSJobTracker.repository.AuthUserRepository;
import com.fullstack.ATSJobTracker.repository.UserProfileRepository;
import com.fullstack.ATSJobTracker.service.AuthService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/profile")
@Slf4j
@RequiredArgsConstructor
public class UserProfileController {

    private final UserProfileRepository repository;
    private final AuthUserRepository authUserRepository;
    private final AuthService authService;

    @GetMapping
    public ResponseEntity<UserProfile> getProfile() {
        log.info("GET /api/profile");
        Long userId = authService.getCurrentUserId();
        return repository.findByUserId(userId).map(profile -> {
            authUserRepository.findById(userId).ifPresent(user -> {
                if (user.getForwardingEmail() == null) {
                    user.setForwardingEmail("track-" + java.util.UUID.randomUUID().toString().substring(0, 8) + "@inbound.postmarkapp.com");
                    authUserRepository.save(user);
                }
                profile.setForwardingEmail(user.getForwardingEmail());
                profile.setForwardingVerified(user.isForwardingVerified());
            });
            return ResponseEntity.ok(profile);
        }).orElseGet(() -> {
            UserProfile empty = new UserProfile();
            empty.setUserId(userId);
            authUserRepository.findById(userId).ifPresent(user -> {
                if (user.getForwardingEmail() == null) {
                    user.setForwardingEmail("track-" + java.util.UUID.randomUUID().toString().substring(0, 8) + "@inbound.postmarkapp.com");
                    authUserRepository.save(user);
                }
                empty.setForwardingEmail(user.getForwardingEmail());
                empty.setForwardingVerified(user.isForwardingVerified());
            });
            return ResponseEntity.ok(empty);
        });
    }

    @PostMapping
    public UserProfile saveProfile(@RequestBody UserProfile profile) {
        log.info("POST /api/profile - name: {}", profile.getFullName());
        Long userId = authService.getCurrentUserId();
        profile.setUserId(userId);
        repository.findByUserId(userId).ifPresent(existing -> {
            profile.setId(existing.getId());
        });
        return repository.save(profile);
    }
}