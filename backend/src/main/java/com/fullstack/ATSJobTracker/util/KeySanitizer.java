package com.fullstack.ATSJobTracker.util;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Redacts API keys from log output and error messages.
 * Used across the backend to ensure BYOK keys never leak into logs.
 */
public class KeySanitizer {

    private static final Pattern[] KEY_PATTERNS = {
        Pattern.compile("sk-(?:proj-)?[A-Za-z0-9_-]{20,}"),
        Pattern.compile("AIza[A-Za-z0-9_-]{30,}"),
        Pattern.compile("sk-ant-[A-Za-z0-9_-]{20,}"),
    };

    private static final String REDACTED = "***REDACTED***";

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
}
