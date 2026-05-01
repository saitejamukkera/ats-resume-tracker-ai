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

        if (provider == null || apiKey == null) {
            return ResponseEntity.badRequest().body(
                    Map.of("valid", false, "message", "Missing provider or apiKey."));
        }

        // Always validate format locally — no pipeline dependency
        Map<String, Object> formatResult = KeySanitizer.validateKeyFormat(provider, apiKey);
        if (Boolean.FALSE.equals(formatResult.get("valid"))) {
            return ResponseEntity.ok(formatResult);
        }

        // Optional: forward to pipeline for deeper validation (graceful fallback)
        try {
            Map<String, String> pipelineBody = Map.of("provider", provider, "apiKey", apiKey);
            String jsonBody = objectMapper.writeValueAsString(pipelineBody);

            HttpRequest httpRequest = HttpRequest.newBuilder()
                    .uri(URI.create(pipelineUrl + "/validate-key"))
                    .timeout(Duration.ofSeconds(30))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                    .build();

            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                var pipelineResult = objectMapper.readValue(response.body(), Map.class);
                return ResponseEntity.ok(pipelineResult);
            }
        } catch (Exception e) {
            log.debug("Pipeline validate-key unavailable (format check passed): {}", KeySanitizer.sanitize(e.getMessage()));
        }

        // Pipeline unreachable — format validation already passed above
        return ResponseEntity.ok(Map.of("valid", true));
    }
}
