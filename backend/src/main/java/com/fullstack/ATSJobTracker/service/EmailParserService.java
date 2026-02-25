package com.fullstack.ATSJobTracker.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fullstack.ATSJobTracker.model.ApplicationStatus;
import com.fullstack.ATSJobTracker.model.AuthUser;
import com.fullstack.ATSJobTracker.model.JobApplication;
import com.fullstack.ATSJobTracker.repository.JobApplicationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class EmailParserService {

    private final GeminiService geminiService;
    private final JobApplicationRepository jobApplicationRepository;
    private final ObjectMapper objectMapper;

    private static final String PARSE_PROMPT = """
        You are an AI assistant that extracts job application updates from emails.
        Analyze the following email and determine:
        1. The company name if this is a job-related email.
        2. The application outcome. Choose from: REJECTED, IN_PROCESS, OFFER_RECEIVED, or ACTIVE (if it's just a generic update).
        Respond ONLY with a valid JSON object in exactly this format:
        {
          "is_job_related": boolean,
          "company_name": "string",
          "outcome": "REJECTED | IN_PROCESS | OFFER_RECEIVED | ACTIVE"
        }
        
        Email Subject: %s
        Email Body: 
        %s
        """;

    public void parseAndUpdateApplication(AuthUser user, String emailText, String emailSubject) {
        String prompt = String.format(PARSE_PROMPT, escapeString(emailSubject), escapeString(emailText));
        try {
            String jsonResponse = geminiService.getCompletion(prompt);
            
            if (jsonResponse.startsWith("```json")) {
                jsonResponse = jsonResponse.substring(7);
            }
            if (jsonResponse.endsWith("```")) {
                jsonResponse = jsonResponse.substring(0, jsonResponse.length() - 3);
            }
            
            JsonNode result = objectMapper.readTree(jsonResponse.trim());
            
            if (result.has("is_job_related") && result.get("is_job_related").asBoolean()) {
                String companyName = result.hasNonNull("company_name") ? result.get("company_name").asText() : "";
                String outcomeStr = result.hasNonNull("outcome") ? result.get("outcome").asText() : "ACTIVE";
                
                log.info("Parsed job email. Company: {}, Outcome: {}", companyName, outcomeStr);
                
                if (companyName.isBlank() || companyName.equalsIgnoreCase("null")) {
                    log.warn("Job related email but no company name found.");
                    return;
                }
                
                ApplicationStatus newStatus;
                try {
                    newStatus = ApplicationStatus.valueOf(outcomeStr);
                } catch (IllegalArgumentException e) {
                    newStatus = ApplicationStatus.ACTIVE;
                }
                
                updateApplicationStatus(user.getId(), companyName, newStatus);
            } else {
                log.info("Email is not job related.");
            }
        } catch (Exception e) {
            log.error("Failed to parse and update application from email", e);
        }
    }
    
    private void updateApplicationStatus(Long userId, String companyName, ApplicationStatus newStatus) {
        List<JobApplication> applications = jobApplicationRepository.findAllByUserIdOrderByAppliedOnDesc(userId);
        
        Optional<JobApplication> targetAppOpt = applications.stream()
                .filter(app -> app.getCompany() != null && app.getCompany().toLowerCase().contains(companyName.toLowerCase()))
                .findFirst();
                
        if (targetAppOpt.isPresent()) {
            JobApplication app = targetAppOpt.get();
            if (app.getOutcome() != newStatus) {
                app.setOutcome(newStatus);
                jobApplicationRepository.save(app);
                log.info("Updated application status for {} to {} via email parsing", companyName, newStatus);
            } else {
                log.info("Status for {} is already {}, no update needed.", companyName, newStatus);
            }
        } else {
            log.warn("Could not find matching active application for company: {} for user ID: {}", companyName, userId);
        }
    }

    private String escapeString(String input) {
        if (input == null) return "";
        return input.replace("\"", "\\\"").replace("\n", " ").replace("\r", "");
    }
}
