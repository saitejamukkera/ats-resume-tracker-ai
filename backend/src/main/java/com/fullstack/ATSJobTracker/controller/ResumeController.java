package com.fullstack.ATSJobTracker.controller;


import com.fullstack.ATSJobTracker.dto.GenerateFromJdRequest;
import com.fullstack.ATSJobTracker.dto.GenerateFromJdResponse;
import com.fullstack.ATSJobTracker.dto.PdfSyncResponse;
import com.fullstack.ATSJobTracker.dto.ResumeGenerationRequest;
import com.fullstack.ATSJobTracker.dto.ResumeGenerationResponse;
import com.fullstack.ATSJobTracker.dto.UpdateContentRequest;
import com.fullstack.ATSJobTracker.exception.LatexCompilationException;
import com.fullstack.ATSJobTracker.exception.LatexCompilerUnavailableException;
import com.fullstack.ATSJobTracker.model.ResumeBase;
import com.fullstack.ATSJobTracker.repository.ResumeBaseRepository;
import com.fullstack.ATSJobTracker.service.AuthService;
import com.fullstack.ATSJobTracker.service.JobApplicationService;
import com.fullstack.ATSJobTracker.service.ResumeService;
import com.fullstack.ATSJobTracker.service.WordDocumentService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

@RestController
@RequestMapping("/api/resumes")
@Slf4j
@RequiredArgsConstructor
public class ResumeController {

    private final ResumeService resumeService;
    private final ResumeBaseRepository resumeBaseRepository;
    private final JobApplicationService jobApplicationService;
    private final WordDocumentService wordDocumentService;
    private final AuthService authService;


    @PostMapping("/base")
    public ResumeBase uploadBaseResume(@RequestBody ResumeBase base) {
        log.info("POST /api/resumes/base - name: {}", base.getName());
        Long userId = authService.getCurrentUserId();
        base.setUserId(userId);
        resumeBaseRepository.findByNameAndUserId(base.getName(), userId).ifPresent(existing -> {
            base.setId(existing.getId());
        });
        return resumeBaseRepository.save(base);
    }

    @GetMapping("/base")
    public List<ResumeBase> getAllBaseResumes() {
        log.info("GET /api/resumes/base");
        return resumeBaseRepository.findAllByUserId(authService.getCurrentUserId());
    }

    @GetMapping("/base/count")
    public long getBaseResumeCount() {
        log.info("GET /api/resumes/base/count");
        return resumeBaseRepository.countByUserId(authService.getCurrentUserId());
    }


    @PostMapping("/generate-from-jd")
    public ResponseEntity<?> generateFromJd(@RequestBody GenerateFromJdRequest request) {
        log.info("POST /api/resumes/generate-from-jd");
        try {
            GenerateFromJdResponse response = resumeService.generateFromJd(
                    request.getJobDescription(), request.isUseIconResume(),
                    request.getApiKeys(), request.getLlmProvider());
            return ResponseEntity.ok(response);
        } catch (com.fullstack.ATSJobTracker.exception.GeminiApiException e) {
            log.warn("Gemini API busy/failed: {}", e.getMessage());
            java.util.Map<String, String> errorResponse = new java.util.HashMap<>();
            errorResponse.put("status", "retry");
            errorResponse.put("message", "AI service temporarily busy. Please try again.");
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(errorResponse);
        } catch (Exception e) {
            log.error("Error generating from JD: {}", e.getMessage(), e);
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/generate-from-jd/stream")
    public SseEmitter generateFromJdStream(@RequestBody GenerateFromJdRequest request) {
        log.info("POST /api/resumes/generate-from-jd/stream (SSE)");
        SseEmitter emitter = new SseEmitter(180_000L); // 3 min timeout
        Long userId = authService.getCurrentUserId(); // capture on request thread

        Thread.startVirtualThread(() -> {
            try {
                resumeService.generateFromJdStream(
                        request.getJobDescription(), request.isUseIconResume(), emitter, userId,
                        request.getApiKeys(), request.getLlmProvider());
            } catch (Exception e) {
                log.error("SSE stream thread error: {}", e.getMessage(), e);
                try {
                    emitter.send(SseEmitter.event().name("error")
                            .data("{\"error\":\"" + e.getMessage().replace("\"", "'") + "\"}"));
                    emitter.complete();
                } catch (Exception ignored) {}
            }
        });

        return emitter;
    }


    @PostMapping("/generate/{applicationId}")
    public ResponseEntity<?> generateResume(
            @PathVariable Long applicationId,
            @RequestBody ResumeGenerationRequest request) {
        log.info("POST /api/resumes/generate/{}", applicationId);
        try {
            String[] result = resumeService.generateResumeAndCoverLetter(
                    applicationId, request.getJobDescription(), request.getCustomPrompt(),
                    request.getUseIconResume(), request.getApiKeys(), request.getLlmProvider());

            var app = jobApplicationService.getApplication(applicationId);

            ResumeGenerationResponse response = ResumeGenerationResponse.builder()
                    .latexContent(result[0])
                    .coverLetterContent(result[1])
                    .atsScore(app.map(a -> a.getAtsScore()).orElse(null))
                    .impactScore(app.map(a -> a.getImpactScore()).orElse(null))
                    .scoreBreakdown(app.map(a -> a.getScoreBreakdown()).orElse(null))
                    .build();

            return ResponseEntity.ok(response);
        } catch (com.fullstack.ATSJobTracker.exception.GeminiApiException e) {
            log.warn("Gemini API busy/failed: {}", e.getMessage());
            java.util.Map<String, String> errorResponse = new java.util.HashMap<>();
            errorResponse.put("status", "retry");
            errorResponse.put("message", "AI service temporarily busy. Please try again.");
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(errorResponse);
        } catch (Exception e) {
            log.error("Error generating resume for application {}: {}", applicationId, e.getMessage(), e);
            return ResponseEntity.badRequest().build();
        }
    }


    @PutMapping("/{applicationId}/content")
    public ResponseEntity<Void> updateContent(
            @PathVariable Long applicationId,
            @RequestBody UpdateContentRequest request) {
        log.info("PUT /api/resumes/{}/content", applicationId);
        return jobApplicationService.getApplication(applicationId)
                .map(app -> {
                    if (request.getResumeContent() != null) {
                        app.setGeneratedResumeContent(request.getResumeContent());
                        app.setGeneratedResumeDocx(null);
                    }
                    if (request.getCoverLetterContent() != null) {
                        app.setCoverLetterContent(request.getCoverLetterContent());
                    }
                    jobApplicationService.saveEntity(app);
                    return ResponseEntity.ok().<Void>build();
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{applicationId}/pdf-sync")
    public ResponseEntity<?> getPdfSync(@PathVariable Long applicationId) {
        log.info("GET /api/resumes/{}/pdf-sync", applicationId);
        return jobApplicationService.getApplication(applicationId)
                .map(app -> {
                    String content = app.getGeneratedResumeContent();
                    if (content == null || content.isEmpty()) {
                        return ResponseEntity.noContent().build();
                    }
                    try {
                        PdfSyncResponse response = resumeService.compilePdfWithSync(content);
                        return ResponseEntity.ok(response);
                    } catch (LatexCompilationException e) {
                        return ResponseEntity.unprocessableEntity().body(PdfSyncResponse.builder()
                                .pdfBase64("")
                                .syncMap(List.of())
                                .compileDiagnostics(e.getDiagnostics())
                                .build());
                    } catch (LatexCompilerUnavailableException e) {
                        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(PdfSyncResponse.builder()
                                .pdfBase64("")
                                .syncMap(List.of())
                                .compileDiagnostics(List.of(com.fullstack.ATSJobTracker.dto.PdfSyncDiagnostic.builder()
                                        .level("error")
                                        .message(e.getMessage())
                                        .build()))
                                .build());
                    }
                })
                .orElse(ResponseEntity.notFound().build());
    }


    @GetMapping("/{applicationId}/pdf")
    public ResponseEntity<byte[]> getPdf(@PathVariable Long applicationId) {
        log.info("GET /api/resumes/{}/pdf", applicationId);
        return jobApplicationService.getApplication(applicationId)
                .map(app -> {
                    String content = app.getGeneratedResumeContent();
                    if (content == null || content.isEmpty()) {
                        return new ResponseEntity<byte[]>(HttpStatus.NO_CONTENT);
                    }
                    byte[] pdfContent = resumeService.compilePdf(content);

                    if (pdfContent == null || pdfContent.length == 0) {
                        log.error("PDF compilation failed for application {}", applicationId);
                        return new ResponseEntity<byte[]>(HttpStatus.INTERNAL_SERVER_ERROR);
                    }

                    HttpHeaders headers = new HttpHeaders();
                    headers.setContentType(MediaType.APPLICATION_PDF);
                    headers.setContentDispositionFormData("attachment", "resume_" + applicationId + ".pdf");
                    headers.setContentLength(pdfContent.length);

                    return new ResponseEntity<>(pdfContent, headers, HttpStatus.OK);
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{applicationId}/cover-letter/pdf")
    public ResponseEntity<byte[]> getCoverLetterPdf(@PathVariable Long applicationId) {
        log.info("GET /api/resumes/{}/cover-letter/pdf", applicationId);
        try {
            byte[] pdfContent = resumeService.generateCoverLetterPdf(applicationId);

            if (pdfContent == null || pdfContent.length == 0) {
                log.error("Cover Letter PDF compilation failed for application {}", applicationId);
                return new ResponseEntity<byte[]>(HttpStatus.INTERNAL_SERVER_ERROR);
            }

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_PDF);
            headers.setContentDispositionFormData("attachment", "cover_letter_" + applicationId + ".pdf");
            headers.setContentLength(pdfContent.length);

            return new ResponseEntity<>(pdfContent, headers, HttpStatus.OK);
        } catch (Exception e) {
            log.error("Error generating cover letter PDF: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/{applicationId}/cover-letter")
    public ResponseEntity<String> getCoverLetter(@PathVariable Long applicationId) {
        log.info("GET /api/resumes/{}/cover-letter", applicationId);
        return jobApplicationService.getApplication(applicationId)
                .map(app -> {
                    String content = app.getCoverLetterContent();
                    if (content == null || content.isEmpty()) {
                        return ResponseEntity.noContent().<String>build();
                    }
                    return ResponseEntity.ok(content);
                })
                .orElse(ResponseEntity.notFound().build());
    }


    @GetMapping("/{applicationId}/docx")
    public ResponseEntity<byte[]> getResumeDocx(@PathVariable Long applicationId) {
        log.info("GET /api/resumes/{}/docx", applicationId);
        try {
            byte[] docxContent = wordDocumentService.generateResumeDocx(applicationId);

            if (docxContent == null || docxContent.length == 0) {
                log.error("Resume DOCX generation failed for application {}", applicationId);
                return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
            }

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
            headers.setContentDispositionFormData("attachment", "resume_" + applicationId + ".docx");
            headers.setContentLength(docxContent.length);

            return new ResponseEntity<>(docxContent, headers, HttpStatus.OK);
        } catch (Exception e) {
            log.error("Error generating resume DOCX: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        }
    }

    @GetMapping("/{applicationId}/cover-letter/docx")
    public ResponseEntity<byte[]> getCoverLetterDocx(@PathVariable Long applicationId) {
        log.info("GET /api/resumes/{}/cover-letter/docx", applicationId);
        try {
            byte[] docxContent = wordDocumentService.generateCoverLetterDocx(applicationId);

            if (docxContent == null || docxContent.length == 0) {
                log.error("Cover Letter DOCX generation failed for application {}", applicationId);
                return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
            }

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
            headers.setContentDispositionFormData("attachment", "cover_letter_" + applicationId + ".docx");
            headers.setContentLength(docxContent.length);

            return new ResponseEntity<>(docxContent, headers, HttpStatus.OK);
        } catch (Exception e) {
            log.error("Error generating cover letter DOCX: {}", e.getMessage(), e);
            return ResponseEntity.internalServerError().build();
        }
    }
}
