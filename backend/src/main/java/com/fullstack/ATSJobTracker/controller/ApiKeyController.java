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
            .connectTimeout(Duration.ofSeconds(5))
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

        try {
            Map<String, String> pipelineBody = Map.of("provider", provider, "apiKey", apiKey);
            String jsonBody = objectMapper.writeValueAsString(pipelineBody);

            HttpRequest httpRequest = HttpRequest.newBuilder()
                    .uri(URI.create(pipelineUrl + "/validate-key"))
                    .timeout(Duration.ofSeconds(5))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                    .build();

            HttpResponse<String> response = httpClient.send(httpRequest, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() == 200) {
                var result = objectMapper.readValue(response.body(), Map.class);
                return ResponseEntity.ok(result);
            } else {
                log.warn("Pipeline validate-key returned status {}", response.statusCode());
                return ResponseEntity.ok(Map.of("valid", false, "message", "Validation service unavailable."));
            }
        } catch (Exception e) {
            log.error("Error calling validate-key: {}", KeySanitizer.sanitize(e.getMessage()));
            return ResponseEntity.ok(Map.of("valid", false, "message", "Validation service unavailable."));
        }
    }
}
