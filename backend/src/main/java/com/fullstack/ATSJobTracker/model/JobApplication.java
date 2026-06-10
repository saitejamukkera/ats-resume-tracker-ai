package com.fullstack.ATSJobTracker.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

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

    @Column(name = "user_id")
    private Long userId;

    @Column(columnDefinition = "TEXT")
    private String note;

    @Column(name = "ats_score")
    private Integer atsScore;

    @Column(name = "impact_score")
    private Integer impactScore;

    @Column(name = "score_version")
    private Integer scoreVersion;

    @Column(name = "score_breakdown")
    @JdbcTypeCode(SqlTypes.JSON)
    private String scoreBreakdown;

    @Column(name = "generated_resume_docx", columnDefinition = "TEXT")
    private String generatedResumeDocx;

    @PrePersist
    protected void onCreate() {
        if (appliedOn == null) appliedOn = LocalDateTime.now();
        if (outcome == null) outcome = ApplicationStatus.ACTIVE;
    }
}