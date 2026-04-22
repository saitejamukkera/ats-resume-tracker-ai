package com.fullstack.ATSJobTracker.controller;


import com.fullstack.ATSJobTracker.dto.JobApplicationRequest;
import com.fullstack.ATSJobTracker.dto.JobApplicationResponse;
import com.fullstack.ATSJobTracker.service.JobApplicationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/applications")
@Slf4j
@RequiredArgsConstructor
public class JobApplicationController {

    private final JobApplicationService service;

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
}