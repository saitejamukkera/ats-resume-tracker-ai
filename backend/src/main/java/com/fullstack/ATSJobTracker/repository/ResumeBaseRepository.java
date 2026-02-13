package com.fullstack.ATSJobTracker.repository;


import com.fullstack.ATSJobTracker.model.ResumeBase;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ResumeBaseRepository extends JpaRepository<ResumeBase, Long> {
    Optional<ResumeBase> findByName(String name);
}