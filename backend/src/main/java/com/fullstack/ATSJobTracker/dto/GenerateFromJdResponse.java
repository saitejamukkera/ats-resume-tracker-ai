package com.fullstack.ATSJobTracker.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GenerateFromJdResponse {
    private String position;
    private String company;
    private String jobId;
    private String location;
    private String latexContent;
    private String coverLetterContent;
    private Long applicationId;
}