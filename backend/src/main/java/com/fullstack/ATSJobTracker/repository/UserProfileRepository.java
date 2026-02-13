package com.fullstack.ATSJobTracker.repository;


import com.fullstack.ATSJobTracker.model.UserProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface UserProfileRepository extends JpaRepository<UserProfile, Long> {
}