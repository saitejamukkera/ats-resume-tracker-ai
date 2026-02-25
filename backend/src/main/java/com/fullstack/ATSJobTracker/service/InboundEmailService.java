package com.fullstack.ATSJobTracker.service;

import com.fullstack.ATSJobTracker.model.AuthUser;
import com.fullstack.ATSJobTracker.repository.AuthUserRepository;
import com.fullstack.ATSJobTracker.dto.InboundEmailDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class InboundEmailService {

    private final AuthUserRepository userRepository;
    private final EmailParserService emailParserService;

    public void processInboundEmail(InboundEmailDto emailData) {
        log.info("Received inbound email from Postmark addressed to: {}", emailData.getOriginalRecipient());
        
        String recipient = extractEmailAddress(emailData.getOriginalRecipient());
        
        Optional<AuthUser> userOpt = userRepository.findByForwardingEmail(recipient);
        
        if (userOpt.isEmpty()) {
            log.warn("No user found for forwarding email: {}", recipient);
            return;
        }
        
        AuthUser user = userOpt.get();
        log.info("Processing email for user: {}", user.getEmail());

        // Check if it's a Gmail confirmation email
        if (isGmailConfirmationEmail(emailData.getFrom(), emailData.getSubject())) {
            handleGmailConfirmation(user, emailData.getText());
            return;
        }

        // Delegate to Gemini to parse the email for a status update
        emailParserService.parseAndUpdateApplication(user, emailData.getText(), emailData.getSubject());
    }

    private String extractEmailAddress(String toField) {
        if (toField == null) return "";
        if (toField.contains("<") && toField.contains(">")) {
            return toField.substring(toField.indexOf("<") + 1, toField.indexOf(">")).trim();
        }
        return toField.trim();
    }

    private boolean isGmailConfirmationEmail(String from, String subject) {
        return from != null && from.toLowerCase().contains("forwarding-noreply@google.com")
               && subject != null && subject.toLowerCase().contains("forwarding confirmation");
    }

    private void handleGmailConfirmation(AuthUser user, String bodyText) {
        log.info("Received Gmail forwarding confirmation for user: {}", user.getEmail());
        user.setForwardingVerified(true);
        userRepository.save(user);
        log.info("Gmail Forwarding confirmation email content: \n{}", bodyText);
    }
}
