package com.fullstack.ATSJobTracker.exception;

import org.springframework.security.core.AuthenticationException;

public class UserNotFoundException extends AuthenticationException {
    public UserNotFoundException(String email) {
        super("User not found: " + email);
    }
}
