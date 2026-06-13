package com.fullstack.ATSJobTracker.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PdfSyncResponse {
    private String pdfBase64;
    private List<PdfSyncMapEntry> syncMap;
    private List<PdfSyncDiagnostic> compileDiagnostics;
}
