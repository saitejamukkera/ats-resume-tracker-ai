package com.fullstack.ATSJobTracker.dto;


import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ResumeGenerationRequest {
    private String jobDescription;
    private Long baseResumeId;
    private String customPrompt;
    private Boolean useIconResume;
}