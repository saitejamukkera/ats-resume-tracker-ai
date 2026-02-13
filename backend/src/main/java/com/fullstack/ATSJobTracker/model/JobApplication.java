package com.fullstack.ATSJobTracker.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "job_applications")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class JobApplication {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String position;
    private String jobId;
    private String company;
    private String location;

    @Column(columnDefinition = "TEXT")
    private String jobDescription;

    @Enumerated(EnumType.STRING)
    private ApplicationStatus outcome;

    private LocalDateTime appliedOn;

    @Column(columnDefinition = "TEXT")
    private String generatedResumeContent;

    @Column(columnDefinition = "TEXT")
    private String coverLetterContent;

    @PrePersist
    protected void onCreate() {
        if (appliedOn == null) appliedOn = LocalDateTime.now();
        if (outcome == null) outcome = ApplicationStatus.ACTIVE;
    }
}