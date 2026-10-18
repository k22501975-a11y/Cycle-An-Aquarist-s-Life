package tw.cycle.server.save;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tw.cycle.server.auth.AuthInterceptor;
import tw.cycle.server.config.ApiException;
import tw.cycle.server.config.CycleProperties;

/**
 * 雲端存檔：每個帳號一份。上傳時帶上次看到的 revision，
 * 如果另一台裝置在這之間已經上傳過（revision 不同），回 409 讓玩家選要留哪一份。
 */
@RestController
@RequestMapping("/api/save")
public class SaveController {
    private final CloudSaveRepository saves;
    private final CycleProperties props;
    private final ObjectMapper json;
    private final Clock clock;

    public SaveController(CloudSaveRepository saves, CycleProperties props, ObjectMapper json, Clock clock) {
        this.saves = saves;
        this.props = props;
        this.json = json;
        this.clock = clock;
    }

    public record Upload(
            @NotNull(message = "缺少 baseRevision") @PositiveOrZero Long baseRevision,
            boolean force,
            @NotNull(message = "缺少存檔") JsonNode save) {}

    @GetMapping
    public ResponseEntity<?> get(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long accountId) throws Exception {
        var save = saves.findById(accountId);
        if (save.isEmpty()) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("code", "none", "message", "雲端還沒有存檔"));
        CloudSave s = save.get();
        return ResponseEntity.ok(Map.of("revision", s.getRevision(), "savedAt", s.getSavedAt(), "save", json.readTree(s.getData())));
    }

    @PutMapping
    @Transactional
    public Map<String, Object> put(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long accountId, @Valid @RequestBody Upload upload) throws Exception {
        JsonNode file = upload.save();
        if (!file.path("version").isInt() || !file.path("savedAt").isNumber() || !file.path("state").isObject())
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid", "這不是水族人生的存檔");
        String data = json.writeValueAsString(file);
        if (data.getBytes(StandardCharsets.UTF_8).length > props.maxSaveBytes())
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "too_large", "存檔太大了，雲端放不下");
        CloudSave save = saves.findById(accountId).orElseGet(() -> new CloudSave(accountId));
        if (!upload.force() && save.getRevision() != upload.baseRevision()) {
            throw new ConflictException(save.getRevision(), save.getSavedAt());
        }
        save.update(file.path("savedAt").asLong(), file.path("version").asInt(), data, OffsetDateTime.now(clock));
        saves.save(save);
        return Map.of("revision", save.getRevision(), "savedAt", save.getSavedAt());
    }

    /** 雲端的存檔比這台裝置上次看到的新。 */
    public static class ConflictException extends ApiException {
        public final long revision;
        public final long savedAt;

        ConflictException(long revision, long savedAt) {
            super(HttpStatus.CONFLICT, "conflict", "另一台裝置剛上傳過存檔");
            this.revision = revision;
            this.savedAt = savedAt;
        }
    }
}
