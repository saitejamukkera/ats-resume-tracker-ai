package com.fullstack.ATSJobTracker.service;

import com.fullstack.ATSJobTracker.dto.PdfSyncMapEntry;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class SynctexOutputParser {
    private static final Pattern PAGE_PATTERN = Pattern.compile("(?m)^Page:(\\d+)\\s*$");
    private static final Pattern X_PATTERN = Pattern.compile("(?m)^x:([+-]?\\d+(?:\\.\\d+)?)\\s*$");
    private static final Pattern Y_PATTERN = Pattern.compile("(?m)^y:([+-]?\\d+(?:\\.\\d+)?)\\s*$");
    private static final Pattern H_PATTERN = Pattern.compile("(?m)^h:([+-]?\\d+(?:\\.\\d+)?)\\s*$");
    private static final Pattern V_PATTERN = Pattern.compile("(?m)^v:([+-]?\\d+(?:\\.\\d+)?)\\s*$");
    private static final Pattern W_PATTERN = Pattern.compile("(?m)^W:([+-]?\\d+(?:\\.\\d+)?)\\s*$");
    private static final Pattern HEIGHT_PATTERN = Pattern.compile("(?m)^H:([+-]?\\d+(?:\\.\\d+)?)\\s*$");

    public Optional<PdfSyncMapEntry> parseViewOutput(String output, int sourceLine) {
        Integer page = findInt(PAGE_PATTERN, output);
        Double x = findDouble(X_PATTERN, output);
        Double y = findDouble(Y_PATTERN, output);

        if (page == null || x == null || y == null) {
            return Optional.empty();
        }

        double width = firstPositive(findDouble(W_PATTERN, output), findDouble(H_PATTERN, output), 240.0);
        double height = firstPositive(findDouble(HEIGHT_PATTERN, output), findDouble(V_PATTERN, output), 14.0);

        return Optional.of(PdfSyncMapEntry.builder()
                .page(page)
                .x(Math.max(0.0, x))
                .y(Math.max(0.0, y))
                .width(Math.max(8.0, Math.abs(width)))
                .height(Math.max(8.0, Math.abs(height)))
                .sourceLine(sourceLine)
                .sourceColumn(1)
                .sourceEndLine(sourceLine)
                .confidence("exact")
                .build());
    }

    private Integer findInt(Pattern pattern, String output) {
        Matcher matcher = pattern.matcher(output);
        return matcher.find() ? Integer.parseInt(matcher.group(1)) : null;
    }

    private Double findDouble(Pattern pattern, String output) {
        Matcher matcher = pattern.matcher(output);
        return matcher.find() ? Double.parseDouble(matcher.group(1)) : null;
    }

    private double firstPositive(Double first, Double second, double fallback) {
        if (first != null && Math.abs(first) > 0.01) return first;
        if (second != null && Math.abs(second) > 0.01) return second;
        return fallback;
    }
}
