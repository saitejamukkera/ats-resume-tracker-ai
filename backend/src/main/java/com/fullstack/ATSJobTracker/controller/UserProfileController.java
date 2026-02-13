package com.fullstack.ATSJobTracker.controller;


import com.fullstack.ATSJobTracker.model.UserProfile;
import com.fullstack.ATSJobTracker.repository.UserProfileRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/profile")
@CrossOrigin(origins = "*")
@Slf4j
@RequiredArgsConstructor
public class UserProfileController {

    private final UserProfileRepository repository;

    @GetMapping
    public ResponseEntity<UserProfile> getProfile() {
        log.info("GET /api/profile");
        return repository.findAll().stream().findFirst()
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.noContent().build());
    }

    @PostMapping
    public UserProfile saveProfile(@RequestBody UserProfile profile) {
        log.info("POST /api/profile - name: {}", profile.getFullName());
        repository.findAll().stream().findFirst().ifPresent(existing -> {
            profile.setId(existing.getId());
        });
        return repository.save(profile);
    }
}