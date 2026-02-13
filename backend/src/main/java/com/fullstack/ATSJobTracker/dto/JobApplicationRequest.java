package com.fullstack.ATSJobTracker.dto;


import com.fullstack.ATSJobTracker.model.ApplicationStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class JobApplicationRequest {
    private String position;
    private String jobId;
    private String company;
    private String location;
    private String jobDescription;
    private ApplicationStatus outcome;
}
