package com.fullstack.ATSJobTracker.service;

import com.fullstack.ATSJobTracker.dto.PdfSyncDiagnostic;
import com.fullstack.ATSJobTracker.dto.PdfSyncMapEntry;
import lombok.Builder;
import lombok.Value;

import java.util.List;

@Value
@Builder
public class LatexCompilationResult {
    byte[] pdfBytes;
    List<PdfSyncMapEntry> syncMap;
    List<PdfSyncDiagnostic> diagnostics;
}
