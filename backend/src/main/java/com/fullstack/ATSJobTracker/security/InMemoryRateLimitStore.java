package com.fullstack.ATSJobTracker.security;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.Refill;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

@Component
@ConditionalOnMissingBean(value = RateLimitStore.class, ignored = InMemoryRateLimitStore.class)
public class InMemoryRateLimitStore implements RateLimitStore {

    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    @Override
    public boolean tryConsume(String key, long capacity, long refillTokens, Duration refillPeriod) {
        Bucket bucket = buckets.computeIfAbsent(key, k ->
                Bucket.builder()
                        .addLimit(Bandwidth.classic(capacity,
                                Refill.greedy(refillTokens, refillPeriod)))
                        .build());
        return bucket.tryConsume(1);
    }
}
