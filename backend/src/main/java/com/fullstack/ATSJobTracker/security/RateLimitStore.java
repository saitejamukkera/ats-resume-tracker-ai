package com.fullstack.ATSJobTracker.security;

import java.time.Duration;

public interface RateLimitStore {
    boolean tryConsume(String key, long capacity, long refillTokens, Duration refillPeriod);
}
