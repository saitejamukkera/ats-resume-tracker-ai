package com.fullstack.ATSJobTracker.service;

import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import com.fullstack.ATSJobTracker.util.PromptConstants;

@Component
public class PromptBuilder {



    public String buildPrompt(String baseResumeLatex, String jobDescription,
                              String userInfo, String masterSubjects) {
        // Inject today's date into cover letter instructions
        String todaysDate = LocalDate.now().format(
                DateTimeFormatter.ofPattern("MMMM d, yyyy", Locale.ENGLISH));
        String coverLetterWithDate = String.format(PromptConstants.COVER_LETTER_INSTRUCTIONS, todaysDate);

        StringBuilder prompt = new StringBuilder();
        prompt.append(PromptConstants.ROLE).append("\n\n");
        prompt.append(PromptConstants.CORE_INSTRUCTIONS).append("\n\n");
        prompt.append(coverLetterWithDate).append("\n\n");
        prompt.append(PromptConstants.OUTPUT_FORMAT).append("\n\n");

        prompt.append("Base Resume:\n").append(baseResumeLatex).append("\n\n");
        prompt.append("Job Description:\n").append(jobDescription).append("\n\n");

        if (userInfo != null && !userInfo.isEmpty()) {
            prompt.append("Candidate Personal Information (use for cover letter header):\n")
                    .append(userInfo).append("\n\n");
        }

        if (masterSubjects != null && !masterSubjects.isEmpty()) {
            prompt.append("Master's Subjects Taken (use relevant ones to strengthen cover letter):\n")
                    .append(masterSubjects).append("\n\n");
        }

        return prompt.toString();
    }

    public String buildPrompt(String baseResumeLatex, String jobDescription) {
        return buildPrompt(baseResumeLatex, jobDescription, null, null);
    }

    public String buildPrompt(String baseResumeLatex, String jobDescription,
                              String userInfo, String masterSubjects, String customPrompt) {
        String base = buildPrompt(baseResumeLatex, jobDescription, userInfo, masterSubjects);
        if (customPrompt != null && !customPrompt.isBlank()) {
            return base + "Additional instructions from the user:\n" + customPrompt + "\n\n";
        }
        return base;
    }
}