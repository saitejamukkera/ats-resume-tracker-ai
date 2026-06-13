package com.fullstack.ATSJobTracker.exception;

import com.fullstack.ATSJobTracker.dto.PdfSyncDiagnostic;
import lombok.Getter;

import java.util.List;

@Getter
public class LatexCompilationException extends RuntimeException {
    private final List<PdfSyncDiagnostic> diagnostics;

    public LatexCompilationException(String message, List<PdfSyncDiagnostic> diagnostics) {
        super(message);
        this.diagnostics = diagnostics;
    }
}
