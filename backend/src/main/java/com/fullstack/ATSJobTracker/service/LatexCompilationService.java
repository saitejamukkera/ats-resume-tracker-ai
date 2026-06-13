package com.fullstack.ATSJobTracker.service;

import com.fullstack.ATSJobTracker.dto.PdfSyncDiagnostic;
import com.fullstack.ATSJobTracker.dto.PdfSyncMapEntry;
import com.fullstack.ATSJobTracker.exception.LatexCompilationException;
import com.fullstack.ATSJobTracker.exception.LatexCompilerUnavailableException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Slf4j
@RequiredArgsConstructor
public class LatexCompilationService {
    private static final Duration COMPILE_TIMEOUT = Duration.ofSeconds(90);
    private static final Duration SYNCTEX_TIMEOUT = Duration.ofSeconds(8);
    private static final long MAX_PDF_BYTES = 10L * 1024L * 1024L;
    private static final Pattern LATEX_ERROR_PATTERN = Pattern.compile("(?m)^!\\s+(.+)$");
    private static final Pattern LINE_PATTERN = Pattern.compile("(?m)^l\\.(\\d+)\\s");

    private final SynctexOutputParser synctexOutputParser;

    @Value("${latex.compiler:pdflatex}")
    private String latexCompiler;

    @Value("${latex.synctex-command:synctex}")
    private String synctexCommand;

    public byte[] compilePdf(String latexContent) {
        return compile(latexContent, false).getPdfBytes();
    }

    public LatexCompilationResult compilePdfWithSync(String latexContent) {
        return compile(latexContent, true);
    }

    private LatexCompilationResult compile(String latexContent, boolean includeSyncMap) {
        Path workDir = null;
        try {
            workDir = Files.createTempDirectory("ats-latex-");
            Path texFile = workDir.resolve("main.tex");
            Path pdfFile = workDir.resolve("main.pdf");
            Files.writeString(texFile, latexContent, StandardCharsets.UTF_8);

            ProcessResult result = runProcess(workDir, COMPILE_TIMEOUT, latexCompiler,
                    "-interaction=nonstopmode",
                    "-halt-on-error",
                    "-synctex=1",
                    "main.tex");

            if (result.exitCode() != 0 || !Files.exists(pdfFile)) {
                throw new LatexCompilationException("LaTeX compilation failed", parseDiagnostics(result.output()));
            }

            byte[] pdfBytes = Files.readAllBytes(pdfFile);
            if (pdfBytes.length == 0 || pdfBytes.length > MAX_PDF_BYTES) {
                throw new LatexCompilationException("Compiled PDF size is invalid", List.of(
                        PdfSyncDiagnostic.builder()
                                .level("error")
                                .message("Compiled PDF is empty or exceeds the preview size limit.")
                                .build()));
            }

            List<PdfSyncMapEntry> syncMap = includeSyncMap
                    ? buildSyncMap(workDir, latexContent)
                    : List.of();

            return LatexCompilationResult.builder()
                    .pdfBytes(pdfBytes)
                    .syncMap(syncMap)
                    .diagnostics(List.of())
                    .build();
        } catch (LatexCompilationException | LatexCompilerUnavailableException e) {
            throw e;
        } catch (IOException e) {
            throw new LatexCompilerUnavailableException("Local LaTeX compiler workspace is unavailable: " + e.getMessage());
        } finally {
            cleanup(workDir);
        }
    }

    private List<PdfSyncMapEntry> buildSyncMap(Path workDir, String latexContent) {
        List<PdfSyncMapEntry> entries = new ArrayList<>();
        String[] lines = latexContent.split("\\R", -1);

        for (int index = 0; index < lines.length; index++) {
            int lineNumber = index + 1;
            if (!isUsefulSourceLine(lines[index])) continue;

            try {
                ProcessResult view = runProcess(workDir, SYNCTEX_TIMEOUT, synctexCommand,
                        "view",
                        "-i", lineNumber + ":1:main.tex",
                        "-o", "main.pdf");
                synctexOutputParser.parseViewOutput(view.output(), lineNumber)
                        .ifPresent(entries::add);
            } catch (LatexCompilerUnavailableException e) {
                throw e;
            } catch (Exception e) {
                log.debug("No SyncTeX mapping for line {}: {}", lineNumber, e.getMessage());
            }
        }

        return entries;
    }

    private boolean isUsefulSourceLine(String line) {
        String trimmed = line.trim();
        return !trimmed.isEmpty()
                && !trimmed.startsWith("%")
                && !trimmed.matches("^\\\\(?:resumeSubHeadingList|resumeItemList)(?:Start|End)\\s*$")
                && !trimmed.matches("^\\\\(?:begin|end)\\{[^}]+}\\s*$")
                && !trimmed.matches("^\\\\(?:vspace|small|normalsize|footnotesize)\\b.*")
                && !trimmed.matches("^\\\\(?:setlength|renewcommand|newcommand|usepackage|documentclass)\\b.*")
                && !trimmed.equals("\\begin{document}")
                && !trimmed.equals("\\end{document}");
    }

    private ProcessResult runProcess(Path workDir, Duration timeout, String... command) {
        try {
            Process process = new ProcessBuilder(command)
                    .directory(workDir.toFile())
                    .redirectErrorStream(true)
                    .start();
            boolean finished = process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (!finished) {
                process.destroyForcibly();
                throw new LatexCompilationException("LaTeX process timed out", List.of(
                        PdfSyncDiagnostic.builder()
                                .level("error")
                                .message("LaTeX compilation timed out.")
                                .build()));
            }
            String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            return new ProcessResult(process.exitValue(), output);
        } catch (IOException e) {
            throw new LatexCompilerUnavailableException("Required LaTeX command is unavailable: " + command[0]);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new LatexCompilerUnavailableException("LaTeX process was interrupted.");
        }
    }

    private List<PdfSyncDiagnostic> parseDiagnostics(String output) {
        List<PdfSyncDiagnostic> diagnostics = new ArrayList<>();
        Matcher errorMatcher = LATEX_ERROR_PATTERN.matcher(output);
        Matcher lineMatcher = LINE_PATTERN.matcher(output);
        Integer line = lineMatcher.find() ? Integer.parseInt(lineMatcher.group(1)) : null;

        while (errorMatcher.find() && diagnostics.size() < 8) {
            diagnostics.add(PdfSyncDiagnostic.builder()
                    .level("error")
                    .message(errorMatcher.group(1).trim())
                    .line(line)
                    .build());
        }

        if (diagnostics.isEmpty()) {
            String message = output == null || output.isBlank()
                    ? "LaTeX compilation failed."
                    : output.substring(0, Math.min(output.length(), 800)).replaceAll("\\s+", " ").trim();
            diagnostics.add(PdfSyncDiagnostic.builder()
                    .level("error")
                    .message(message)
                    .line(line)
                    .build());
        }

        return diagnostics;
    }

    private void cleanup(Path workDir) {
        if (workDir == null) return;
        try {
            Files.walk(workDir)
                    .sorted(Comparator.reverseOrder())
                    .forEach(path -> {
                        try {
                            Files.deleteIfExists(path);
                        } catch (IOException e) {
                            log.debug("Failed to delete temporary LaTeX file {}: {}", path, e.getMessage());
                        }
                    });
        } catch (IOException e) {
            log.debug("Failed to clean temporary LaTeX directory {}: {}", workDir, e.getMessage());
        }
    }

    private record ProcessResult(int exitCode, String output) {}
}
