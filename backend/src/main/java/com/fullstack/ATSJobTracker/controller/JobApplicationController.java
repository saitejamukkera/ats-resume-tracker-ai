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
        log.info("=== DUPE-CHECK START === userId={}, jdLength={}", authService.getCurrentUserId(), request.getJobDescription().length());

        Long userId = authService.getCurrentUserId();

        ResumePipelineClient.JDParseResult parsed;
        try {
            parsed = resumePipelineClient.parseJD(request.getJobDescription());
        } catch (Exception e) {
            log.warn("=== DUPE-CHECK === JD parse failed: {}", e.getMessage());
            return ResponseEntity.ok(CheckDuplicateResponse.builder()
                    .duplicate(false)
                    .existingApplication(null)
                    .build());
        }

        String parsedCompany = parsed.getCompany() != null ? parsed.getCompany().trim() : "";
        String parsedJobId = parsed.getJobId() != null ? parsed.getJobId().trim() : "";
        String parsedPosition = parsed.getPosition() != null ? parsed.getPosition().trim() : "";

        log.info("=== DUPE-CHECK === Parsed: company='{}', jobId='{}', position='{}'", parsedCompany, parsedJobId, parsedPosition);

        // Fetch user's ACTIVE and DRAFT applications
        List<JobApplication> activeApps = jobApplicationRepository.findAllByUserIdOrderByAppliedOnDesc(userId)
                .stream()
                .filter(app -> app.getOutcome() == ApplicationStatus.ACTIVE
                        || app.getOutcome() == ApplicationStatus.DRAFT)
                .toList();

        log.info("=== DUPE-CHECK === Found {} ACTIVE/DRAFT apps for user {}", activeApps.size(), userId);
        for (JobApplication app : activeApps) {
            log.info("=== DUPE-CHECK === Existing App id={}, company='{}', jobId='{}', position='{}', outcome={}, jdLength={}",
                    app.getId(), app.getCompany(), app.getJobId(), app.getPosition(),
                    app.getOutcome(), app.getJobDescription() != null ? app.getJobDescription().length() : 0);
        }

        String normalizedInput = normalizeText(request.getJobDescription());

        Optional<JobApplication> duplicate = Optional.empty();

        if (!parsedJobId.isEmpty()) {
            // Match by company + jobId (case-insensitive)
            log.info("=== DUPE-CHECK === Strategy: company+jobId match (jobId not empty)");
            duplicate = activeApps.stream()
                    .filter(app -> {
                        boolean companyMatch = parsedCompany.equalsIgnoreCase(app.getCompany() != null ? app.getCompany() : "");
                        boolean jobIdMatch = parsedJobId.equalsIgnoreCase(app.getJobId() != null ? app.getJobId() : "");
                        log.info("=== DUPE-CHECK === company+jobId: parsedCompany='{}' vs appCompany='{}' match={}, parsedJobId='{}' vs appJobId='{}' match={}",
                                parsedCompany, app.getCompany(), companyMatch, parsedJobId, app.getJobId(), jobIdMatch);
                        return companyMatch && jobIdMatch;
                    })
                    .findFirst();
        }

        if (duplicate.isEmpty()) {
            // Match by company + normalized job description
            log.info("=== DUPE-CHECK === Strategy: company+content match (inputLen={})", normalizedInput.length());
            duplicate = activeApps.stream()
                    .filter(app -> {
                        boolean companyMatch = parsedCompany.equalsIgnoreCase(app.getCompany() != null ? app.getCompany() : "");
                        String appContent = normalizeText(app.getJobDescription());
                        boolean contentMatch = appContent.equals(normalizedInput);
                        log.info("=== DUPE-CHECK === company+content: company='{}' vs '{}' match={}, inputLen={} vs appLen={} match={}",
                                parsedCompany, app.getCompany(), companyMatch,
                                normalizedInput.length(), appContent.length(), contentMatch);
                        return companyMatch && contentMatch;
                    })
                    .findFirst();
        }

        if (duplicate.isPresent()) {
            JobApplication app = duplicate.get();
            log.info("=== DUPE-CHECK END === DUPLICATE FOUND: appId={}, position={}, company={}", app.getId(), app.getPosition(), app.getCompany());
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

        log.info("=== DUPE-CHECK END === NO DUPLICATE");
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