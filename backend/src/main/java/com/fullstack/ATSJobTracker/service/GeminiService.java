package com.fullstack.ATSJobTracker.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fullstack.ATSJobTracker.exception.GeminiApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

@Service
@Slf4j
@RequiredArgsConstructor
public class GeminiService {

    @Value("${gemini.api-key}")
    private String apiKey;

    private final RestTemplate restTemplate;
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private static final String BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s";
    private static final String PRIMARY_MODEL = "gemini-3-flash-preview";
    private static final String FALLBACK_MODEL = "gemini-2.5-flash";

    public String getCompletion(String prompt) {
        try {
            return getCompletionWithModel(prompt, PRIMARY_MODEL);
        } catch (GeminiApiException e) {
            log.warn("Primary model {} failed. Attempting fallback model {}. Error: {}", PRIMARY_MODEL, FALLBACK_MODEL, e.getMessage());
            try {
                return getCompletionWithModel(prompt, FALLBACK_MODEL);
            } catch (GeminiApiException ex) {
                log.error("Fallback model {} also failed.", FALLBACK_MODEL);
                throw ex; // Re-throw the last exception
            }
        }
    }

    private String getCompletionWithModel(String prompt, String modelName) {
        int maxRetries = 3;
        int attempt = 0;
        String url = String.format(BASE_URL, modelName, apiKey);

        String requestJson = String.format(
                "{\"contents\": [{\"parts\": [{\"text\": \"%s\"}]}]}",
                escapeJson(prompt)
        );

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        HttpEntity<String> entity = new HttpEntity<>(requestJson, headers);

        while (attempt < maxRetries) {
            try {
                log.info("Calling Gemini API ({})...", modelName);
                ResponseEntity<String> response = restTemplate.postForEntity(url, entity, String.class);
                log.info("Gemini API response received ({})", modelName);

                if (response.getStatusCode().isError()) {
                    throw new GeminiApiException("Gemini API Error: " + response.getStatusCode());
                }

                return extractTextFromResponse(response.getBody());

            } catch (HttpServerErrorException | ResourceAccessException ex) {
                attempt++;
                log.warn("Attempt {} failed for model {}: {}", attempt, modelName, ex.getMessage());
                
                if (attempt >= maxRetries) {
                    throw new GeminiApiException("Gemini model " + modelName + " unavailable after retries", ex);
                }

                try {
                    long waitTime = (long) Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                    log.info("Waiting {}ms before retry...", waitTime);
                    Thread.sleep(waitTime);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new GeminiApiException("Thread interrupted during backoff", ie);
                }
            } catch (Exception e) {
                log.error("Error calling Gemini API ({}): {}", modelName, e.getMessage(), e);
                // Non-retryable error, fail fast for this model
                throw new GeminiApiException("Error calling Gemini API (" + modelName + "): " + e.getMessage(), e);
            }
        }
        
        throw new GeminiApiException("Unexpected Gemini failure (" + modelName + ")");
    }

    private String escapeJson(String input) {
        if (input == null) return "";
        return input.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    private String extractTextFromResponse(String jsonResponse) {
        try {
            JsonNode root = objectMapper.readTree(jsonResponse);
            return root.path("candidates").get(0).path("content").path("parts").get(0).path("text").asText();
        } catch (Exception e) {
            log.error("Error parsing Gemini response: {}", e.getMessage());
            throw new GeminiApiException("Error parsing Gemini response: " + e.getMessage(), e);
        }
    }
}