package com.fullstack.ATSJobTracker.repository;


import com.fullstack.ATSJobTracker.model.JobApplication;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface JobApplicationRepository extends JpaRepository<JobApplication, Long> {
    List<JobApplication> findAllByOrderByAppliedOnDesc();
    List<JobApplication> findAllByUserIdOrderByAppliedOnDesc(Long userId);
}