package com.fullstack.ATSJobTracker.exception;

import org.springframework.security.core.AuthenticationException;

public class NotAuthenticatedException extends AuthenticationException {
    public NotAuthenticatedException(String message) {
        super(message);
    }
}
