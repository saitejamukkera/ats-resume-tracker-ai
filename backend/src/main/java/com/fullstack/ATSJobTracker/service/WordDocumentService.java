package com.fullstack.ATSJobTracker.service;

import com.fullstack.ATSJobTracker.model.JobApplication;
import com.fullstack.ATSJobTracker.repository.JobApplicationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.xwpf.usermodel.*;
import org.openxmlformats.schemas.wordprocessingml.x2006.main.*;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigInteger;

@Service
@Slf4j
@RequiredArgsConstructor
public class WordDocumentService {

    private final JobApplicationRepository jobApplicationRepository;

    /**
     * Generates a simple DOCX cover letter from the stored plain text.
     */
    public byte[] generateCoverLetterDocx(Long applicationId) {
        log.info("Generating Cover Letter DOCX for application id: {}", applicationId);

        JobApplication application = jobApplicationRepository.findById(applicationId)
                .orElseThrow(() -> new RuntimeException("Application not found"));

        String content = application.getCoverLetterContent();
        if (content == null || content.isEmpty()) {
            throw new RuntimeException("No cover letter content found");
        }

        try (XWPFDocument document = new XWPFDocument();
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            
            setPageMargins(document, 1440); // 1 inch margins

            // Normalize line endings
            content = content.replace("\r\n", "\n").replace("\r", "\n");
            String[] paragraphs = content.split("\n\n");

            for (String paraText : paragraphs) {
                paraText = paraText.trim();
                if (paraText.isEmpty()) continue;

                XWPFParagraph paragraph = document.createParagraph();
                paragraph.setSpacingAfter(120); // Default spacing

                String[] lines = paraText.split("\n");
                boolean isHeaderOrSignature = paraText.startsWith("Sincerely") || paraText.startsWith("Best regards");
                boolean isSubjectLine = paraText.startsWith("Re:") || paraText.startsWith("RE:");

                if (isSubjectLine) {
                    paragraph.setSpacingBefore(200);
                    paragraph.setSpacingAfter(200);
                } else if (isHeaderOrSignature) {
                    paragraph.setSpacingAfter(60);
                }

                for (int j = 0; j < lines.length; j++) {
                    XWPFRun run = paragraph.createRun();
                    run.setText(lines[j].trim());
                    run.setFontFamily("Calibri");
                    run.setFontSize(11);
                    if (isSubjectLine) {
                        run.setBold(true);
                    }
                    if (j < lines.length - 1) {
                        run.addBreak();
                    }
                }
            }

            document.write(out);
            return out.toByteArray();

        } catch (IOException e) {
            log.error("Failed to generate DOCX", e);
            throw new RuntimeException("Error generating DOCX file", e);
        }
    }

    public byte[] generateResumeDocx(Long applicationId) {
        throw new UnsupportedOperationException("DOCX generation is not supported for resumes. Use PDF instead.");
    }

    private void setPageMargins(XWPFDocument document, long twips) {
        CTSectPr sectPr = document.getDocument().getBody().addNewSectPr();
        CTPageMar pageMar = sectPr.addNewPgMar();
        pageMar.setTop(BigInteger.valueOf(twips));
        pageMar.setBottom(BigInteger.valueOf(twips));
        pageMar.setLeft(BigInteger.valueOf(twips));
        pageMar.setRight(BigInteger.valueOf(twips));
    }
}