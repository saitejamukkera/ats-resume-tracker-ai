package com.fullstack.ATSJobTracker.dto;


import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GenerateFromJdRequest {
    private String jobDescription;
    private boolean useIconResume;
}