package com.fullstack.ATSJobTracker.controller;


import com.fullstack.ATSJobTracker.dto.CheckDuplicateRequest;
import com.fullstack.ATSJobTracker.dto.CheckDuplicateResponse;
import com.fullstack.ATSJobTracker.dto.JobApplicationRequest;
import com.fullstack.ATSJobTracker.dto.JobApplicationResponse;
import com.fullstack.ATSJobTracker.model.ApplicationStatus;
import com.fullstack.ATSJobTracker.model.JobApplication;
import com.fullstack.ATSJobTracker.repository.JobApplicationRepository;
import com.fullstack.ATSJobTracker.service.AuthService;
import com.fullstack.ATSJobTracker.service.JobApplicationService;
import com.fullstack.ATSJobTracker.service.ResumePipelineClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/applications")
@Slf4j
@RequiredArgsConstructor
public class JobApplicationController {

    private final JobApplicationService service;
    private final ResumePipelineClient resumePipelineClient;
    private final AuthService authService;
    private final JobApplicationRepository jobApplicationRepository;

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("MMMM d, yyyy");

    @GetMapping
    public List<JobApplicationResponse> getAll() {
        log.info("GET /api/applications");
        return service.getAllApplications();
    }

    @PostMapping
    public JobApplicationResponse create(@RequestBody JobApplicationRequest request) {
        log.info("POST /api/applications - position: {}, company: {}", request.getPosition(), request.getCompany());
        return service.saveApplication(request);
    }

    @GetMapping("/{id}")
    public ResponseEntity<JobApplicationResponse> get(@PathVariable Long id) {
        log.info("GET /api/applications/{}", id);
        return service.getApplicationById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/{id}")
    public ResponseEntity<JobApplicationResponse> update(@PathVariable Long id, @RequestBody JobApplicationRequest request) {
        log.info("PUT /api/applications/{}", id);
        try {
            return ResponseEntity.ok(service.updateApplication(id, request));
        } catch (RuntimeException e) {
            log.warn("Application not found for update: {}", id);
            return ResponseEntity.notFound().build();
        }
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        log.info("DELETE /api/applications/{}", id);
        service.deleteApplication(id);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/check-duplicate")
    public ResponseEntity<CheckDuplicateResponse> checkDuplicate(@RequestBody CheckDuplicateRequest request) {
        log.info("POST /api/applications/check-duplicate");

        Long userId = authService.getCurrentUserId();

        ResumePipelineClient.JDParseResult parsed;
        try {
            parsed = resumePipelineClient.parseJD(request.getJobDescription());
        } catch (Exception e) {
            log.warn("Failed to parse JD for duplicate check (pipeline unavailable or API key missing): {}", e.getMessage());
            return ResponseEntity.ok(CheckDuplicateResponse.builder()
                    .duplicate(false)
                    .existingApplication(null)
                    .build());
        }

        String parsedCompany = parsed.getCompany() != null ? parsed.getCompany().trim() : "";
        String parsedJobId = parsed.getJobId() != null ? parsed.getJobId().trim() : "";

        // Fetch user's ACTIVE applications
        List<JobApplication> activeApps = jobApplicationRepository.findAllByUserIdOrderByAppliedOnDesc(userId)
                .stream()
                .filter(app -> app.getOutcome() == ApplicationStatus.ACTIVE)
                .toList();

        Optional<JobApplication> duplicate = Optional.empty();

        if (!parsedJobId.isEmpty()) {
            // Match by company + jobId (case-insensitive)
            duplicate = activeApps.stream()
                    .filter(app -> parsedCompany.equalsIgnoreCase(app.getCompany() != null ? app.getCompany() : "")
                            && parsedJobId.equalsIgnoreCase(app.getJobId() != null ? app.getJobId() : ""))
                    .findFirst();
        }

        if (duplicate.isEmpty()) {
            // Match by company + normalized job description
            String normalizedInput = normalizeText(request.getJobDescription());
            duplicate = activeApps.stream()
                    .filter(app -> parsedCompany.equalsIgnoreCase(app.getCompany() != null ? app.getCompany() : "")
                            && normalizeText(app.getJobDescription()).equals(normalizedInput))
                    .findFirst();
        }

        if (duplicate.isPresent()) {
            JobApplication app = duplicate.get();
            return ResponseEntity.ok(CheckDuplicateResponse.builder()
                    .duplicate(true)
                    .existingApplication(CheckDuplicateResponse.ExistingApplicationInfo.builder()
                            .id(app.getId())
                            .position(app.getPosition())
                            .company(app.getCompany())
                            .appliedOn(app.getAppliedOn() != null ? app.getAppliedOn().format(DATE_FORMATTER) : "")
                            .build())
                    .build());
        }

        return ResponseEntity.ok(CheckDuplicateResponse.builder()
                .duplicate(false)
                .existingApplication(null)
                .build());
    }

    private String normalizeText(String text) {
        if (text == null) return "";
        return text.trim().toLowerCase().replaceAll("\\s+", " ");
    }
}