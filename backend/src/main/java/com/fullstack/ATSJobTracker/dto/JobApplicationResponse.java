package com.fullstack.ATSJobTracker.dto;

import com.fullstack.ATSJobTracker.model.ApplicationStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class JobApplicationResponse {
    private Long id;
    private String position;
    private String jobId;
    private String company;
    private String location;
    private String jobDescription;
    private ApplicationStatus outcome;
    private LocalDateTime appliedOn;
    private boolean hasGeneratedResume;
    private boolean hasCoverLetter;
    private String generatedResumeContent;
    private String coverLetterContent;
    private String note;
}