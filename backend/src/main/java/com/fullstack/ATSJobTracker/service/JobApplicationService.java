package com.fullstack.ATSJobTracker.service;


import com.fullstack.ATSJobTracker.dto.JobApplicationRequest;
import com.fullstack.ATSJobTracker.dto.JobApplicationResponse;
import com.fullstack.ATSJobTracker.model.JobApplication;
import com.fullstack.ATSJobTracker.repository.JobApplicationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@Slf4j
@RequiredArgsConstructor
public class JobApplicationService {

    private final JobApplicationRepository repository;
    private final AuthService authService;

    public List<JobApplicationResponse> getAllApplications() {
        log.info("Fetching all job applications");
        Long userId = authService.getCurrentUserId();
        return repository.findAllByUserIdOrderByAppliedOnDesc(userId).stream()
                .filter(app -> app.getOutcome() != com.fullstack.ATSJobTracker.model.ApplicationStatus.DRAFT)
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    public JobApplicationResponse saveApplication(JobApplicationRequest request) {
        log.info("Saving new application for position: {} at {}", request.getPosition(), request.getCompany());
        JobApplication app = new JobApplication();
        app.setPosition(request.getPosition());
        app.setJobId(request.getJobId());
        app.setCompany(request.getCompany());
        app.setLocation(request.getLocation());
        app.setJobDescription(request.getJobDescription());
        app.setNote(request.getNote());
        app.setUserId(authService.getCurrentUserId());

        JobApplication saved = repository.save(app);
        log.info("Application saved with id: {}", saved.getId());
        return mapToResponse(saved);
    }

    public JobApplicationResponse updateApplication(Long id, JobApplicationRequest request) {
        log.info("Updating application id: {}", id);
        JobApplication app = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Application not found with id: " + id));
        app.setPosition(request.getPosition());
        app.setJobId(request.getJobId());
        app.setCompany(request.getCompany());
        app.setLocation(request.getLocation());
        app.setJobDescription(request.getJobDescription());
        app.setNote(request.getNote());
        if (request.getOutcome() != null) {
            app.setOutcome(request.getOutcome());
        }

        JobApplication saved = repository.save(app);
        log.info("Application updated: {}", saved.getId());
        return mapToResponse(saved);
    }

    public Optional<JobApplicationResponse> getApplicationById(Long id) {
        log.debug("Fetching application by id: {}", id);
        return repository.findById(id).map(this::mapToResponse);
    }

    public Optional<JobApplication> getApplication(Long id) {
        return repository.findById(id);
    }

    public void deleteApplication(Long id) {
        log.info("Deleting application id: {}", id);
        repository.deleteById(id);
    }

    public JobApplication saveEntity(JobApplication app) {
        return repository.save(app);
    }

    private JobApplicationResponse mapToResponse(JobApplication app) {
        return JobApplicationResponse.builder()
                .id(app.getId())
                .position(app.getPosition())
                .jobId(app.getJobId())
                .company(app.getCompany())
                .location(app.getLocation())
                .jobDescription(app.getJobDescription())
                .outcome(app.getOutcome())
                .appliedOn(app.getAppliedOn())
                .hasGeneratedResume(app.getGeneratedResumeContent() != null && !app.getGeneratedResumeContent().isEmpty())
                .hasCoverLetter(app.getCoverLetterContent() != null && !app.getCoverLetterContent().isEmpty())
                .generatedResumeContent(app.getGeneratedResumeContent())
                .coverLetterContent(app.getCoverLetterContent())
                .note(app.getNote())
                .build();
    }
}