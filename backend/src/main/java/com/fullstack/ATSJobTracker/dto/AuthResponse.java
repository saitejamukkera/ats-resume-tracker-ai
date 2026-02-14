package com.fullstack.ATSJobTracker.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuthResponse {
    private String email;
    private String fullName;
    private String provider;
    private String message;
    private String token;
}
