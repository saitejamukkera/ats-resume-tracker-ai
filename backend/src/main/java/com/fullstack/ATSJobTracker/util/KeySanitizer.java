package com.fullstack.ATSJobTracker.util;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Redacts API keys from log output and validates key formats.
 * Used across the backend to ensure BYOK keys never leak into logs.
 */
public class KeySanitizer {

    private static final Pattern[] KEY_PATTERNS = {
        Pattern.compile("sk-(?:proj-)?[A-Za-z0-9_-]{20,}"),
        Pattern.compile("AIza[A-Za-z0-9_-]{30,}"),
        Pattern.compile("sk-ant-[A-Za-z0-9_-]{20,}"),
    };

    private static final String REDACTED = "***REDACTED***";

    private static final Map<String, Pattern> PROVIDER_PATTERNS = Map.of(
        "openai", Pattern.compile("^sk-(?:proj-)?[A-Za-z0-9_-]{20,}$"),
        "google", Pattern.compile("^AIza[A-Za-z0-9_-]{30,}$"),
        "anthropic", Pattern.compile("^sk-ant-[A-Za-z0-9_-]{20,}$")
    );

    private static final Map<String, String> PROVIDER_PREFIXES = Map.of(
        "openai", "sk-...",
        "google", "AIza...",
        "anthropic", "sk-ant-..."
    );

    public static String sanitize(String input) {
        if (input == null) return null;
        String out = input;
        for (Pattern p : KEY_PATTERNS) {
            out = p.matcher(out).replaceAll(REDACTED);
        }
        return out;
    }

    public static Map<String, String> sanitizeKeys(Map<String, String> apiKeys) {
        if (apiKeys == null) return null;
        Map<String, String> sanitized = new HashMap<>();
        for (var entry : apiKeys.entrySet()) {
            sanitized.put(entry.getKey(),
                    entry.getValue() != null && !entry.getValue().isEmpty()
                            ? "***PRESENT***" : null);
        }
        return sanitized;
    }

    public static String sanitizeForLog(String provider, boolean hasKey) {
        return "provider=" + provider + ", key=" + (hasKey ? "***PRESENT***" : "none");
    }

    public static Map<String, Object> validateKeyFormat(String provider, String key) {
        if (key == null || key.trim().isEmpty()) {
            return Map.of("valid", false, "message", "Key is empty.");
        }
        Pattern pattern = PROVIDER_PATTERNS.get(provider);
        if (pattern == null) {
            return Map.of("valid", false, "message", "Invalid provider: " + sanitize(provider));
        }
        if (!pattern.matcher(key.trim()).matches()) {
            return Map.of("valid", false, "message",
                "Invalid " + provider.toUpperCase() + " API key format. Keys should start with "
                + PROVIDER_PREFIXES.getOrDefault(provider, "unknown prefix"));
        }
        return Map.of("valid", true);
    }
}
