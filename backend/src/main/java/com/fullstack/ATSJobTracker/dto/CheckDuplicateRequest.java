package com.fullstack.ATSJobTracker.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CheckDuplicateRequest {
    private String jobDescription;
    private Map<String, String> apiKeys;
    private String llmProvider;
}
