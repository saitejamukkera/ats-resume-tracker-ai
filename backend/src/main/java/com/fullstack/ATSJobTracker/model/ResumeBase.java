package com.fullstack.ATSJobTracker.model;

import jakarta.persistence.*;
import lombok.*;


@Entity
@Table(name = "resume_bases")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ResumeBase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String name;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String content;

    private boolean hasIcons;
}