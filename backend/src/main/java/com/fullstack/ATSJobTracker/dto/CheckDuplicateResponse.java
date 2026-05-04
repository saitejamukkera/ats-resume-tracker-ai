package com.fullstack.ATSJobTracker.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CheckDuplicateResponse {
    private boolean duplicate;
    private ExistingApplicationInfo existingApplication;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ExistingApplicationInfo {
        private Long id;
        private String position;
        private String company;
        private String appliedOn;
    }
}
