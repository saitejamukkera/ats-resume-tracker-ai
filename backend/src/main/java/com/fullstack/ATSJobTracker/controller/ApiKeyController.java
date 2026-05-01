package com.fullstack.ATSJobTracker.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fullstack.ATSJobTracker.util.KeySanitizer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;

@RestController
@RequestMapping("/api/settings")
@Slf4j
public class ApiKeyController {

    @Value("${resume-pipeline.url:http://localhost:3001}")
    private String pipelineUrl;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(30))
            .build();

    private final ObjectMapper objectMapper = new ObjectMapper();

    @PostMapping("/validate-key")
    public ResponseEntity<?> validateKey(@RequestBody Map<String, String> request) {
        String provider = request.get("provider");
        String apiKey = request.get("apiKey");

        log.info("POST /api/settings/validate-key for provider={}", KeySanitizer.sanitize(provider));

        if (provider == null || apiKey == null || apiKey.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(
                    Map.of("valid", false, "message", "Missing provider or apiKey."));
        }

        apiKey = apiKey.trim();

        // 1. Local format validation
        Map<String, Object> formatResult = KeySanitizer.validateKeyFormat(provider, apiKey);
        if (Boolean.FALSE.equals(formatResult.get("valid"))) {
            return ResponseEntity.ok(formatResult);
        }

        // 2. Direct ultra-fast auth ping (bypasses Node pipeline)
        try {
            HttpRequest.Builder reqBuilder;
            
            if ("openai".equals(provider)) {
                reqBuilder = HttpRequest.newBuilder(URI.create("https://api.openai.com/v1/models"))
                        .header("Authorization", "Bearer " + apiKey)
                        .GET();
            } else if ("google".equals(provider)) {
                reqBuilder = HttpRequest.newBuilder(URI.create("https://generativelanguage.googleapis.com/v1beta/models?key=" + apiKey))
                        .GET();
            } else if ("anthropic".equals(provider)) {
                reqBuilder = HttpRequest.newBuilder(URI.create("https://api.anthropic.com/v1/models"))
                        .header("x-api-key", apiKey)
                        .header("anthropic-version", "2023-06-01")
                        .GET();
            } else {
                return ResponseEntity.ok(Map.of("valid", false, "message", "Unsupported provider."));
            }

            HttpRequest httpRequest = reqBuilder.timeout(Duration.ofSeconds(10)).build();
            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());

            int status = response.statusCode();
            
            if (status == 200) {
                return ResponseEntity.ok(Map.of("valid", true));
            } else if (status == 401 || status == 403 || status == 400) {
                return ResponseEntity.ok(Map.of("valid", false, "message", "Invalid API key provided. Authentication failed."));
            } else if (status == 429) {
                return ResponseEntity.ok(Map.of("valid", false, "message", "Key is valid, but currently you have insufficient credits. Please add balance."));
            } else {
                log.warn("Direct validation for {} returned status {}", provider, status);
                return ResponseEntity.ok(Map.of("valid", false, "message", "Validation service unavailable (Status " + status + ")."));
            }
        } catch (Exception e) {
            log.error("Error pinging provider directly: {}", KeySanitizer.sanitize(e.getMessage()));
            return ResponseEntity.ok(Map.of("valid", false, "message", "Network error while validating key."));
        }
    }
}
