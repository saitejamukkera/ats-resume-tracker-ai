package com.fullstack.ATSJobTracker.controller;

import com.fullstack.ATSJobTracker.dto.InboundEmailDto;
import com.fullstack.ATSJobTracker.service.InboundEmailService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/webhooks")
@RequiredArgsConstructor
@Slf4j
public class WebhookController {

    private final InboundEmailService inboundEmailService;

    // The endpoint must accept Unauthenticated requests (publicly accessible)
    @PostMapping("/inbound-email")
    public ResponseEntity<String> receiveInboundEmail(@RequestBody InboundEmailDto emailData) {
        log.info("Received inbound email webhook request");
        try {
            inboundEmailService.processInboundEmail(emailData);
            return ResponseEntity.ok("Received");
        } catch (Exception e) {
            log.error("Error processing inbound email webhook", e);
            // Return 200 even on error so the email provider doesn't keep retrying
            return ResponseEntity.ok("Processed with errors: " + e.getMessage());
        }
    }
}
