package com.fullstack.ATSJobTracker.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class InboundEmailDto {
    @JsonProperty("To")
    private String to;
    
    @JsonProperty("From")
    private String from;
    
    @JsonProperty("Subject")
    private String subject;
    
    @JsonProperty("TextBody")
    private String text;
    
    @JsonProperty("HtmlBody")
    private String html;
    
    @JsonProperty("OriginalRecipient")
    private String originalRecipient;
}
