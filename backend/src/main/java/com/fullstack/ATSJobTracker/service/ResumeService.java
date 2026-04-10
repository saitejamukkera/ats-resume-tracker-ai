package com.fullstack.ATSJobTracker.service;


import com.fullstack.ATSJobTracker.dto.GenerateFromJdResponse;
import com.fullstack.ATSJobTracker.model.ApplicationStatus;
import com.fullstack.ATSJobTracker.model.JobApplication;
import com.fullstack.ATSJobTracker.model.ResumeBase;
import com.fullstack.ATSJobTracker.model.UserProfile;
import com.fullstack.ATSJobTracker.repository.JobApplicationRepository;
import com.fullstack.ATSJobTracker.repository.ResumeBaseRepository;
import com.fullstack.ATSJobTracker.repository.UserProfileRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicReference;

@Service
@Slf4j
@RequiredArgsConstructor
public class ResumeService {

    private final ResumeBaseRepository resumeBaseRepository;
    private final JobApplicationRepository jobApplicationRepository;
    private final UserProfileRepository userProfileRepository;
    private final ResumePipelineClient resumePipelineClient;
    private final AuthService authService;

    private static final String LATEX_API_URL = "https://latex.ytotech.com/builds/sync";

    /**
     * Parses the JD, extracts key details, and generates a tailored resume and cover letter.
     */
    public GenerateFromJdResponse generateFromJd(String jobDescription, boolean useIconResume) {
        log.info("Generating from JD via pipeline sidecar, useIconResume={}", useIconResume);

        Long userId = authService.getCurrentUserId();

        String resumeName = useIconResume ? "Base Resume B" : "Base Resume A";
        ResumeBase baseResume = resumeBaseRepository.findByNameAndUserId(resumeName, userId)
                .orElse(resumeBaseRepository.findAllByUserId(userId).stream().findFirst().orElse(null));

        if (baseResume == null) {
            log.error("No base resume found");
            throw new RuntimeException("No base resume found. Please upload base resumes in Settings.");
        }

        String userInfo = "";
        String masterSubjects = "";
        var profileOpt = userProfileRepository.findByUserId(userId);
        if (profileOpt.isPresent()) {
            UserProfile profile = profileOpt.get();
            userInfo = buildUserInfo(profile);
            masterSubjects = profile.getMasterSubjects() != null ? profile.getMasterSubjects() : "";
        }

        // Call the pipeline sidecar — returns structured, validated output
        log.info("Calling pipeline sidecar for JD generation...");
        ResumePipelineClient.PipelineResponse pipelineResult = resumePipelineClient.generate(
                baseResume.getContent(), jobDescription, userInfo, masterSubjects);

        String position = pipelineResult.getPosition() != null ? pipelineResult.getPosition() : "Unknown Position";
        String company = pipelineResult.getCompany() != null ? pipelineResult.getCompany() : "Unknown Company";
        String jobId = pipelineResult.getJobId() != null ? pipelineResult.getJobId() : "";
        String location = pipelineResult.getLocation() != null ? pipelineResult.getLocation() : "";
        String resumeLatex = pipelineResult.getLatex();
        String coverLetter = pipelineResult.getCoverLetter() != null ? pipelineResult.getCoverLetter() : "";

        log.info("Pipeline result: position={}, company={}, atsScore={}",
                position, company, pipelineResult.getAtsScore());

        JobApplication application = new JobApplication();
        application.setPosition(position);
        application.setCompany(company);
        application.setJobId(jobId);
        application.setLocation(location);
        application.setJobDescription(jobDescription);
        application.setGeneratedResumeContent(resumeLatex);
        application.setCoverLetterContent(coverLetter);
        application.setOutcome(ApplicationStatus.DRAFT);
        application.setUserId(userId);
        JobApplication saved = jobApplicationRepository.save(application);
        log.info("Application created with id: {}", saved.getId());

        return GenerateFromJdResponse.builder()
                .applicationId(saved.getId())
                .position(position)
                .company(company)
                .jobId(jobId)
                .location(location)
                .latexContent(resumeLatex)
                .coverLetterContent(coverLetter)
                .build();
    }

    /**
     * Stream SSE events from the pipeline sidecar to the frontend.
     * Creates the DB record when resume-ready fires, updates it when complete fires.
     */
    public void generateFromJdStream(String jobDescription, boolean useIconResume, SseEmitter emitter, Long userId) {

        String resumeName = useIconResume ? "Base Resume B" : "Base Resume A";
        ResumeBase baseResume = resumeBaseRepository.findByNameAndUserId(resumeName, userId)
                .orElse(resumeBaseRepository.findAllByUserId(userId).stream().findFirst().orElse(null));

        if (baseResume == null) {
            try {
                emitter.send(SseEmitter.event().name("error")
                        .data("{\"error\":\"No base resume found. Please upload base resumes in Settings.\"}"));
                emitter.complete();
            } catch (Exception ignored) {}
            return;
        }

        String userInfo = "";
        String masterSubjects = "";
        var profileOpt = userProfileRepository.findByUserId(userId);
        if (profileOpt.isPresent()) {
            UserProfile profile = profileOpt.get();
            userInfo = buildUserInfo(profile);
            masterSubjects = profile.getMasterSubjects() != null ? profile.getMasterSubjects() : "";
        }

        AtomicReference<Long> applicationIdRef = new AtomicReference<>();
        ObjectMapper mapper = new ObjectMapper();

        try {
            resumePipelineClient.generateStream(
                    baseResume.getContent(), jobDescription, userInfo, masterSubjects,
                    (eventType, jsonData) -> {
                        try {
                            if ("resume-ready".equals(eventType)) {
                                // Create the application in DB
                                JsonNode data = mapper.readTree(jsonData);
                                String position = data.has("position") ? data.get("position").asText("Unknown Position") : "Unknown Position";
                                String company = data.has("company") ? data.get("company").asText("Unknown Company") : "Unknown Company";
                                String jobIdVal = data.has("jobId") ? data.get("jobId").asText("") : "";
                                String locationVal = data.has("location") ? data.get("location").asText("") : "";
                                String latex = data.has("latex") ? data.get("latex").asText("") : "";

                                JobApplication application = new JobApplication();
                                application.setPosition(position);
                                application.setCompany(company);
                                application.setJobId(jobIdVal);
                                application.setLocation(locationVal);
                                application.setJobDescription(jobDescription);
                                application.setGeneratedResumeContent(latex);
                                application.setCoverLetterContent(""); // will be updated on complete
                                application.setOutcome(ApplicationStatus.DRAFT);
                                application.setUserId(userId);
                                JobApplication saved = jobApplicationRepository.save(application);
                                applicationIdRef.set(saved.getId());

                                log.info("SSE: Application created with id: {} at resume-ready", saved.getId());

                                // Enrich the event with applicationId for the frontend
                                ObjectNode enriched = (ObjectNode) data;
                                enriched.put("applicationId", saved.getId());
                                emitter.send(SseEmitter.event().name(eventType).data(enriched.toString()));
                            } else if ("complete".equals(eventType)) {
                                // Update application with cover letter
                                Long appId = applicationIdRef.get();
                                if (appId != null) {
                                    JsonNode data = mapper.readTree(jsonData);
                                    String coverLetter = data.has("coverLetter") ? data.get("coverLetter").asText("") : "";
                                    if (!coverLetter.isEmpty()) {
                                        jobApplicationRepository.findById(appId).ifPresent(app -> {
                                            app.setCoverLetterContent(coverLetter);
                                            jobApplicationRepository.save(app);
                                            log.info("SSE: Cover letter saved for application {}", appId);
                                        });
                                    }
                                    // Enrich with applicationId
                                    ObjectNode enriched = (ObjectNode) data;
                                    enriched.put("applicationId", appId);
                                    emitter.send(SseEmitter.event().name(eventType).data(enriched.toString()));
                                } else {
                                    emitter.send(SseEmitter.event().name(eventType).data(jsonData));
                                }
                            } else {
                                // Forward other events as-is (stage-start, jd-parsed, etc.)
                                emitter.send(SseEmitter.event().name(eventType).data(jsonData));
                            }
                        } catch (Exception e) {
                            log.error("Error processing SSE event {}: {}", eventType, e.getMessage());
                        }
                    }
            );
            emitter.complete();
        } catch (Exception e) {
            log.error("SSE stream error: {}", e.getMessage(), e);
            try {
                emitter.send(SseEmitter.event().name("error")
                        .data("{\"error\":\"" + e.getMessage().replace("\"", "'") + "\"}"));
                emitter.complete();
            } catch (Exception ignored) {}
        }
    }

    /**
     * Re-generate for an existing application.
     */
    public String[] generateResumeAndCoverLetter(Long applicationId, String jobDescription) {
        return generateResumeAndCoverLetter(applicationId, jobDescription, null, null);
    }

    public String[] generateResumeAndCoverLetter(Long applicationId, String jobDescription, String customPrompt, Boolean useIconResume) {
        log.info("Re-generating resume via pipeline for application id: {}, useIconResume: {}", applicationId, useIconResume);

        Long userId = authService.getCurrentUserId();

        JobApplication application = jobApplicationRepository.findById(applicationId)
                .orElseThrow(() -> new RuntimeException("Application not found"));

        String resumeName = (useIconResume != null && useIconResume) ? "Base Resume B" : "Base Resume A";

        ResumeBase baseResume = resumeBaseRepository.findByNameAndUserId(resumeName, userId)
                .orElse(resumeBaseRepository.findAllByUserId(userId).stream().findFirst().orElse(null));

        if (baseResume == null) {
            log.error("No base resume found for re-generation");
            return new String[]{"Error: No base resume found.", ""};
        }

        String userInfo = "";
        String masterSubjects = "";
        var profileOpt = userProfileRepository.findByUserId(userId);
        if (profileOpt.isPresent()) {
            UserProfile profile = profileOpt.get();
            userInfo = buildUserInfo(profile);
            masterSubjects = profile.getMasterSubjects() != null ? profile.getMasterSubjects() : "";
        }

        // Call the pipeline sidecar — passes custom prompt if provided
        ResumePipelineClient.PipelineResponse pipelineResult = resumePipelineClient.generate(
                baseResume.getContent(), jobDescription, userInfo, masterSubjects, customPrompt);

        String resumeLatex = pipelineResult.getLatex();
        String coverLetter = pipelineResult.getCoverLetter() != null ? pipelineResult.getCoverLetter() : "";

        application.setGeneratedResumeContent(resumeLatex);
        application.setCoverLetterContent(coverLetter);
        application.setJobDescription(jobDescription);
        jobApplicationRepository.save(application);
        log.info("Resume re-generated via pipeline for application id: {}, atsScore: {}",
                applicationId, pipelineResult.getAtsScore());

        return new String[]{resumeLatex, coverLetter};
    }

    public String generateResume(Long applicationId, String jobDescription) {
        String[] result = generateResumeAndCoverLetter(applicationId, jobDescription);
        return result[0];
    }

    /**
     * Compile LaTeX content to PDF using the YtoTech LaTeX API.
     * No local pdflatex installation required.
     * API docs: https://github.com/YtoTech/latex-on-http
     */
    public byte[] compilePdf(String latexContent) {
        try {
            log.info("Compiling PDF via YtoTech LaTeX API...");

            // Escape the LaTeX content for JSON
            String escapedContent = latexContent
                    .replace("\\", "\\\\")
                    .replace("\"", "\\\"")
                    .replace("\n", "\\n")
                    .replace("\r", "\\r")
                    .replace("\t", "\\t");

            String jsonBody = "{\"compiler\":\"pdflatex\",\"resources\":[{\"main\":true,\"content\":\"" + escapedContent + "\"}]}";

            HttpClient client = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .followRedirects(HttpClient.Redirect.NORMAL)
                    .build();

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(LATEX_API_URL))
                    .timeout(Duration.ofSeconds(120))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<byte[]> response = client.send(request, HttpResponse.BodyHandlers.ofByteArray());

            if (response.statusCode() == 200 || response.statusCode() == 201) {
                byte[] pdfBytes = response.body();
                // Verify it's actually a PDF (starts with %PDF)
                if (pdfBytes.length > 4 && pdfBytes[0] == '%' && pdfBytes[1] == 'P'
                        && pdfBytes[2] == 'D' && pdfBytes[3] == 'F') {
                    log.info("PDF compiled successfully via YtoTech, size: {} bytes", pdfBytes.length);
                    return pdfBytes;
                } else {
                    String responseText = new String(pdfBytes, StandardCharsets.UTF_8);
                    log.error("YtoTech returned non-PDF content (likely a compilation error): {}",
                            responseText.substring(0, Math.min(responseText.length(), 1000)));
                    return new byte[0];
                }
            } else {
                String errorBody = new String(response.body(), StandardCharsets.UTF_8);
                log.error("YtoTech LaTeX API returned status {}: {}", response.statusCode(),
                        errorBody.substring(0, Math.min(errorBody.length(), 500)));
                return new byte[0];
            }
        } catch (Exception e) {
            log.error("Error compiling PDF via YtoTech: {}", e.getMessage(), e);
            return new byte[0];
        }
    }

    private String buildUserInfo(UserProfile profile) {
        StringBuilder info = new StringBuilder();
        if (profile.getFullName() != null && !profile.getFullName().isEmpty())
            info.append("Name: ").append(profile.getFullName()).append("\n");
        if (profile.getAddress() != null && !profile.getAddress().isEmpty())
            info.append("Address: ").append(profile.getAddress()).append("\n");
        if (profile.getPhone() != null && !profile.getPhone().isEmpty())
            info.append("Phone: ").append(profile.getPhone()).append("\n");
        if (profile.getEmail() != null && !profile.getEmail().isEmpty())
            info.append("Email: ").append(profile.getEmail()).append("\n");
        if (profile.getLinkedinUrl() != null && !profile.getLinkedinUrl().isEmpty())
            info.append("LinkedIn: ").append(profile.getLinkedinUrl()).append("\n");
        if (profile.getPortfolioUrl() != null && !profile.getPortfolioUrl().isEmpty())
            info.append("Portfolio: ").append(profile.getPortfolioUrl()).append("\n");
        if (profile.getGithubUrl() != null && !profile.getGithubUrl().isEmpty())
            info.append("GitHub: ").append(profile.getGithubUrl()).append("\n");
        if (profile.getMastersDegree() != null && !profile.getMastersDegree().isEmpty())
            info.append("Degree: ").append(profile.getMastersDegree()).append("\n");
        if (profile.getMastersGpa() != null && !profile.getMastersGpa().isEmpty())
            info.append("GPA: ").append(profile.getMastersGpa()).append("\n");
        return info.toString();
    }
    public byte[] generateCoverLetterPdf(Long applicationId) {
        log.info("Generating Cover Letter PDF for application id: {}", applicationId);

        JobApplication application = jobApplicationRepository.findById(applicationId)
                .orElseThrow(() -> new RuntimeException("Application not found"));

        String content = application.getCoverLetterContent();
        if (content == null) content = "";

        // Normalize line endings first
        content = content.replace("\r\n", "\n").replace("\r", "\n");

        // Escape special LaTeX characters FIRST
        content = escapeLatex(content);

        // Format paragraphs and line breaks for LaTeX
        content = content.replace("\n\n", "\\par\\vspace{0.6em}\n");
        content = content.replace("\n", " \\\\\n");

        StringBuilder latex = new StringBuilder();
        latex.append("\\documentclass[11pt,a4paper]{article}\n");
        latex.append("\\usepackage[utf8]{inputenc}\n");
        latex.append("\\usepackage[margin=0.75in]{geometry}\n");
        latex.append("\\usepackage{hyperref}\n");
        latex.append("\\usepackage{parskip}\n");
        latex.append("\\setlength{\\parindent}{0pt}\n");
        latex.append("\\pagestyle{empty}\n");
        latex.append("\\begin{document}\n\n");

        // Directly append the cover letter content as the body —
        // the cover letter text already contains the name/address/date header
        // as generated by Gemini, so we don't need a separate LaTeX header.
        latex.append(content).append("\n\n");

        latex.append("\\end{document}\n");

        return compilePdf(latex.toString());
    }

    private String escapeLatex(String input) {
        if (input == null) return "";
        return input
            .replace("\\", "\\textbackslash{}")
            .replace("{", "\\{")
            .replace("}", "\\}")
            .replace("$", "\\$")
            .replace("&", "\\&")
            .replace("#", "\\#")
            .replace("^", "\\textasciicircum{}")
            .replace("_", "\\_")
            .replace("~", "\\textasciitilde{}")
            .replace("%", "\\%");
    }
}