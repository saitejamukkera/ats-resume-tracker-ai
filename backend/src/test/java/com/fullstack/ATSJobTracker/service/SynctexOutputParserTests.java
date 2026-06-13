package com.fullstack.ATSJobTracker.service;

import com.fullstack.ATSJobTracker.dto.PdfSyncMapEntry;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class SynctexOutputParserTests {

    private final SynctexOutputParser parser = new SynctexOutputParser();

    @Test
    void parsesSynctexViewOutput() {
        String output = """
                SyncTeX result begin
                Output:main.pdf
                Page:1
                x:72.12
                y:144.50
                h:9.20
                v:12.10
                W:260.00
                H:13.00
                SyncTeX result end
                """;

        Optional<PdfSyncMapEntry> entry = parser.parseViewOutput(output, 42);

        assertThat(entry).isPresent();
        assertThat(entry.get().getPage()).isEqualTo(1);
        assertThat(entry.get().getX()).isEqualTo(72.12);
        assertThat(entry.get().getY()).isEqualTo(144.50);
        assertThat(entry.get().getWidth()).isEqualTo(260.00);
        assertThat(entry.get().getHeight()).isEqualTo(13.00);
        assertThat(entry.get().getSourceLine()).isEqualTo(42);
        assertThat(entry.get().getConfidence()).isEqualTo("exact");
    }

    @Test
    void returnsEmptyWhenRequiredCoordinatesAreMissing() {
        String output = """
                SyncTeX result begin
                Page:1
                y:144.50
                SyncTeX result end
                """;

        assertThat(parser.parseViewOutput(output, 7)).isEmpty();
    }
}
