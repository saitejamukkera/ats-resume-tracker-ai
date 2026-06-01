package com.fullstack.ATSJobTracker.service;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fullstack.ATSJobTracker.util.KeySanitizer;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.function.BiConsumer;

/**
 * Client for the Node.js resume-pipeline sidecar.
 * Replaces direct GeminiService calls for resume generation.
 * 
 * The sidecar runs the full pipeline:
 * JD Parser → Section Generators → Validator + Repair → ATS Scorer → LaTeX Assembler
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class ResumePipelineClient {

    @Value("${resume-pipeline.url:http://localhost:3001}")
    private String pipelineUrl;

    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    /**
     * Generate a tailored resume + cover letter via the pipeline sidecar.
     *
     * @param baseResumeLatex  The user's base resume in LaTeX
     * @param jobDescription   The job description text
     * @param userInfo         Optional user profile info (name, phone, etc.)
     * @param masterSubjects   Optional master's subjects for cover letter enrichment
     * @param customPrompt     Optional custom instructions from user
     * @return Structured pipeline response with LaTeX, cover letter, scores, and trace
     */
    public PipelineResponse generate(
            String baseResumeLatex,
            String jobDescription,
            String userInfo,
            String masterSubjects,
            String customPrompt
    ) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("baseResumeLatex", baseResumeLatex);
            body.put("jobDescription", jobDescription);
            if (userInfo != null && !userInfo.isEmpty()) body.put("userInfo", userInfo);
            if (masterSubjects != null && !masterSubjects.isEmpty()) body.put("masterSubjects", masterSubjects);
            if (customPrompt != null && !customPrompt.isBlank()) body.put("customPrompt", customPrompt);

            String jsonBody = objectMapper.writeValueAsString(body);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(pipelineUrl + "/generate"))
                    .timeout(Duration.ofSeconds(180)) // pipeline can take up to 3 min
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                    .build();

            log.info("Calling resume pipeline at {}/generate...", pipelineUrl);
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                PipelineResponse result = objectMapper.readValue(response.body(), PipelineResponse.class);
                log.info("Pipeline response: position={}, company={}, atsScore={}, status={}",
                        result.getPosition(), result.getCompany(), result.getAtsScore(),
                        result.getTrace() != null ? result.getTrace().get("status") : "unknown");
                return result;
            } else {
                String errorBody = response.body();
                log.error("Pipeline returned status {}: {}", response.statusCode(),
                        errorBody.substring(0, Math.min(errorBody.length(), 500)));
                throw new RuntimeException("Resume pipeline failed with status " + response.statusCode()
                        + ": " + errorBody.substring(0, Math.min(errorBody.length(), 200)));
            }
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            log.error("Error calling resume pipeline: {}", e.getMessage(), e);
            throw new RuntimeException("Resume pipeline unavailable: " + e.getMessage(), e);
        }
    }

    /**
     * Convenience overload without custom prompt.
     */
    public PipelineResponse generate(
            String baseResumeLatex,
            String jobDescription,
            String userInfo,
            String masterSubjects
    ) {
        return generate(baseResumeLatex, jobDescription, userInfo, masterSubjects, null);
    }

    /**
     * BYOK overload — forwards user API keys to the pipeline sidecar.
     * Keys are held in local variables only and garbage-collected after the call.
     */
    public PipelineResponse generate(
            String baseResumeLatex,
            String jobDescription,
            String userInfo,
            String masterSubjects,
            String customPrompt,
            Map<String, String> apiKeys,
            String llmProvider
    ) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("baseResumeLatex", baseResumeLatex);
            body.put("jobDescription", jobDescription);
            if (userInfo != null && !userInfo.isEmpty()) body.put("userInfo", userInfo);
            if (masterSubjects != null && !masterSubjects.isEmpty()) body.put("masterSubjects", masterSubjects);
            if (customPrompt != null && !customPrompt.isBlank()) body.put("customPrompt", customPrompt);
            if (apiKeys != null && !apiKeys.isEmpty()) body.put("apiKeys", apiKeys);
            if (llmProvider != null && !llmProvider.isBlank()) body.put("llmProvider", llmProvider);

            String jsonBody = objectMapper.writeValueAsString(body);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(pipelineUrl + "/generate"))
                    .timeout(Duration.ofSeconds(180))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                    .build();

            log.info("Calling resume pipeline at {}/generate [{}]",
                    pipelineUrl, KeySanitizer.sanitizeForLog(
                            llmProvider != null ? llmProvider : "server",
                            apiKeys != null && !apiKeys.isEmpty()));

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                PipelineResponse result = objectMapper.readValue(response.body(), PipelineResponse.class);
                log.info("Pipeline response: position={}, company={}, atsScore={}, status={}",
                        result.getPosition(), result.getCompany(), result.getAtsScore(),
                        result.getTrace() != null ? result.getTrace().get("status") : "unknown");
                return result;
            } else {
                String errorBody = KeySanitizer.sanitize(response.body());
                log.error("Pipeline returned status {}: {}", response.statusCode(),
                        errorBody.substring(0, Math.min(errorBody.length(), 500)));
                throw new RuntimeException("Resume pipeline failed with status " + response.statusCode()
                        + ": " + errorBody.substring(0, Math.min(errorBody.length(), 200)));
            }
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            log.error("Error calling resume pipeline: {}", KeySanitizer.sanitize(e.getMessage()), e);
            throw new RuntimeException("Resume pipeline unavailable: " + e.getMessage(), e);
        }
    }

    /**
     * Stream pipeline events via SSE from the sidecar.
     * @param onEvent callback receiving (eventType, jsonData) for each SSE event
     */
    public void generateStream(
            String baseResumeLatex,
            String jobDescription,
            String userInfo,
            String masterSubjects,
            BiConsumer<String, String> onEvent
    ) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("baseResumeLatex", baseResumeLatex);
            body.put("jobDescription", jobDescription);
            if (userInfo != null && !userInfo.isEmpty()) body.put("userInfo", userInfo);
            if (masterSubjects != null && !masterSubjects.isEmpty()) body.put("masterSubjects", masterSubjects);

            String jsonBody = objectMapper.writeValueAsString(body);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(pipelineUrl + "/generate-stream"))
                    .timeout(Duration.ofSeconds(180))
                    .header("Content-Type", "application/json")
                    .header("Accept", "text/event-stream")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                    .build();

            log.info("Calling resume pipeline SSE at {}/generate-stream...", pipelineUrl);

            HttpResponse<java.io.InputStream> response = httpClient.send(
                    request, HttpResponse.BodyHandlers.ofInputStream());

            if (response.statusCode() != 200) {
                String errorBody = new String(response.body().readAllBytes(), StandardCharsets.UTF_8);
                log.error("Pipeline SSE returned status {}: {}", response.statusCode(), errorBody);
                throw new RuntimeException("Resume pipeline SSE failed with status " + response.statusCode());
            }

            // Parse SSE stream line by line
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
                String currentEvent = "message";
                StringBuilder dataBuffer = new StringBuilder();
                String line;

                while ((line = reader.readLine()) != null) {
                    if (line.startsWith("event: ")) {
                        currentEvent = line.substring(7).trim();
                    } else if (line.startsWith("data: ")) {
                        dataBuffer.append(line.substring(6));
                    } else if (line.isEmpty() && dataBuffer.length() > 0) {
                        // End of event — dispatch
                        onEvent.accept(currentEvent, dataBuffer.toString());
                        currentEvent = "message";
                        dataBuffer.setLength(0);
                    }
                }
                // Handle any remaining buffered data
                if (dataBuffer.length() > 0) {
                    onEvent.accept(currentEvent, dataBuffer.toString());
                }
            }

            log.info("Pipeline SSE stream completed");
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            log.error("Error in pipeline SSE stream: {}", e.getMessage(), e);
            throw new RuntimeException("Resume pipeline SSE unavailable: " + e.getMessage(), e);
        }
    }

    /**
     * BYOK overload for SSE streaming — forwards user API keys.
     */
    public void generateStream(
            String baseResumeLatex,
            String jobDescription,
            String userInfo,
            String masterSubjects,
            BiConsumer<String, String> onEvent,
            Map<String, String> apiKeys,
            String llmProvider
    ) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("baseResumeLatex", baseResumeLatex);
            body.put("jobDescription", jobDescription);
            if (userInfo != null && !userInfo.isEmpty()) body.put("userInfo", userInfo);
            if (masterSubjects != null && !masterSubjects.isEmpty()) body.put("masterSubjects", masterSubjects);
            if (apiKeys != null && !apiKeys.isEmpty()) body.put("apiKeys", apiKeys);
            if (llmProvider != null && !llmProvider.isBlank()) body.put("llmProvider", llmProvider);

            String jsonBody = objectMapper.writeValueAsString(body);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(pipelineUrl + "/generate-stream"))
                    .timeout(Duration.ofSeconds(180))
                    .header("Content-Type", "application/json")
                    .header("Accept", "text/event-stream")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                    .build();

            log.info("Calling resume pipeline SSE at {}/generate-stream [{}]",
                    pipelineUrl, KeySanitizer.sanitizeForLog(
                            llmProvider != null ? llmProvider : "server",
                            apiKeys != null && !apiKeys.isEmpty()));

            HttpResponse<java.io.InputStream> response = httpClient.send(
                    request, HttpResponse.BodyHandlers.ofInputStream());

            if (response.statusCode() != 200) {
                String errorBody = new String(response.body().readAllBytes(), StandardCharsets.UTF_8);
                log.error("Pipeline SSE returned status {}: {}", response.statusCode(),
                        KeySanitizer.sanitize(errorBody));
                throw new RuntimeException("Resume pipeline SSE failed with status " + response.statusCode());
            }

            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
                String currentEvent = "message";
                StringBuilder dataBuffer = new StringBuilder();
                String line;

                while ((line = reader.readLine()) != null) {
                    if (line.startsWith("event: ")) {
                        currentEvent = line.substring(7).trim();
                    } else if (line.startsWith("data: ")) {
                        dataBuffer.append(line.substring(6));
                    } else if (line.isEmpty() && dataBuffer.length() > 0) {
                        onEvent.accept(currentEvent, dataBuffer.toString());
                        currentEvent = "message";
                        dataBuffer.setLength(0);
                    }
                }
                if (dataBuffer.length() > 0) {
                    onEvent.accept(currentEvent, dataBuffer.toString());
                }
            }

            log.info("Pipeline SSE stream completed [BYOK]");
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            log.error("Error in pipeline SSE stream: {}", KeySanitizer.sanitize(e.getMessage()), e);
            throw new RuntimeException("Resume pipeline SSE unavailable: " + e.getMessage(), e);
        }
    }

    /**
     * Check if the pipeline sidecar is healthy.
     */
    public boolean isHealthy() {
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(pipelineUrl + "/health"))
                    .timeout(Duration.ofSeconds(5))
                    .GET()
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            return response.statusCode() == 200;
        } catch (Exception e) {
            log.warn("Pipeline health check failed: {}", e.getMessage());
            return false;
        }
    }

    /**
     * Parse a raw job description via the pipeline sidecar.
     *
     * @param jobDescription The raw job description text
     * @return Structured JD metadata (position, company, jobId, location, etc.)
     */
    public JDParseResult parseJD(String jobDescription) {
        return parseJD(jobDescription, null, null);
    }

    /**
     * Parse a raw job description via the pipeline sidecar with BYOK support.
     *
     * @param jobDescription The raw job description text
     * @param apiKeys Optional user-provided API keys
     * @param llmProvider Optional LLM provider preference
     * @return Structured JD metadata (position, company, jobId, location, etc.)
     */
    public JDParseResult parseJD(String jobDescription, Map<String, String> apiKeys, String llmProvider) {
        try {
            Map<String, Object> body = new HashMap<>();
            body.put("jobDescription", jobDescription);
            if (apiKeys != null && !apiKeys.isEmpty()) body.put("apiKeys", apiKeys);
            if (llmProvider != null && !llmProvider.isBlank()) body.put("llmProvider", llmProvider);

            String jsonBody = objectMapper.writeValueAsString(body);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(pipelineUrl + "/parse-jd"))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                    .build();

            log.info("Calling resume pipeline at {}/parse-jd...", pipelineUrl);
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                JDParseResult result = objectMapper.readValue(response.body(), JDParseResult.class);
                log.info("JD parsed: position={}, company={}, jobId={}",
                        result.getPosition(), result.getCompany(), result.getJobId());
                return result;
            } else {
                String errorBody = response.body();
                log.error("Pipeline /parse-jd returned status {}: {}", response.statusCode(),
                        errorBody.substring(0, Math.min(errorBody.length(), 500)));
                throw new RuntimeException("JD parse failed with status " + response.statusCode()
                        + ": " + errorBody.substring(0, Math.min(errorBody.length(), 200)));
            }
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            log.error("Error calling JD parse: {}", e.getMessage(), e);
            throw new RuntimeException("JD parser unavailable: " + e.getMessage(), e);
        }
    }

    /**
     * Response from the resume pipeline sidecar.
     */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class PipelineResponse {
        private String latex;
        private String coverLetter;
        private String position;
        private String company;
        private String jobId;
        private String location;
        private int atsScore;
        private int impactScore;
        private JsonNode scoreBreakdown;
        private JsonNode atsScoreDetails;
        private JsonNode jdAnalysis;
        private JsonNode trace;
    }

    /**
     * Lightweight JD parse result from the resume pipeline sidecar.
     */
    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class JDParseResult {
        private String position;
        private String company;
        private String jobId;
        private String location;
    }
}
