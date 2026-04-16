package com.fullstack.ATSJobTracker.model;

import jakarta.persistence.*;
import lombok.*;


@Entity
@Table(name = "user_profile")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String fullName;
    private String address;
    private String phone;
    private String email;
    private String linkedinUrl;
    private String portfolioUrl;
    private String githubUrl;

    @Column(columnDefinition = "TEXT")
    private String masterSubjects;

    private String mastersDegree;
    private String mastersGpa;

    /**
     * Optional manual override for total years of experience.
     * When set (non-null and >= 0), it wins over date-range derivation in
     * the resume pipeline's candidate profile. Useful when auto-derivation
     * is wrong (gaps, internships, concurrent roles, contract work).
     */
    @Column(name = "years_of_experience_override")
    private Double yearsOfExperienceOverride;

    @Column(name = "user_id", unique = true)
    private Long userId;
}