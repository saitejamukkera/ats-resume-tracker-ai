package com.fullstack.ATSJobTracker.model;

import jakarta.persistence.*;
import lombok.*;


@Entity
@Table(name = "resume_bases", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"name", "user_id"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ResumeBase {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String content;

    private boolean hasIcons;

    @Column(name = "user_id")
    private Long userId;
}