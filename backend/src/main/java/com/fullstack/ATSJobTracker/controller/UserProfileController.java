package com.fullstack.ATSJobTracker.controller;


import com.fullstack.ATSJobTracker.model.UserProfile;
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
    private final AuthService authService;

    @GetMapping
    public ResponseEntity<UserProfile> getProfile() {
        log.info("GET /api/profile");
        Long userId = authService.getCurrentUserId();
        return repository.findByUserId(userId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.noContent().build());
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