package com.fullstack.ATSJobTracker.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PdfSyncMapEntry {
    private int page;
    private double x;
    private double y;
    private double width;
    private double height;
    private int sourceLine;
    private Integer sourceColumn;
    private Integer sourceEndLine;
    private String confidence;
}
