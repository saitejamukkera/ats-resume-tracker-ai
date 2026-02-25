package com.fullstack.ATSJobTracker.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class InboundEmailDto {
    private String to;
    private String from;
    private String subject;
    private String text;
    private String html;
}
