package com.fullstack.ATSJobTracker.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class EmailService {

    private final JavaMailSender mailSender;

    @Value("${spring.mail.username}")
    private String fromEmail;

    public void sendOtpEmail(String toEmail, String otp, String purpose) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(toEmail);
            message.setSubject("TrackHire AI - Your Verification Code");
            message.setText(
                "Your verification code for " + purpose + " is:\n\n"
                + "    " + otp + "\n\n"
                + "This code expires in 5 minutes.\n\n"
                + "If you did not request this, please ignore this email.\n\n"
                + "— TrackHire AI"
            );
            mailSender.send(message);
            log.info("OTP email sent to: {}", toEmail);
        } catch (Exception e) {
            log.error("Failed to send OTP email to: {}", toEmail, e);
            throw new RuntimeException("Failed to send verification email. Please try again.");
        }
    }
}
