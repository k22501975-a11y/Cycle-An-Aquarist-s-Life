package tw.cycle.server.save;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tw.cycle.server.auth.AuthInterceptor;
import tw.cycle.server.config.ApiException;
import tw.cycle.server.config.CycleProperties;
import tw.cycle.server.sim.SimClient;

/**
 * 雲端存檔：每個帳號一份。上傳時帶上次看到的 revision，
 * 如果另一台裝置在這之間已經上傳過（revision 不同），回 409 讓玩家選要留哪一份。
 *
 * <p>伺服器權威模擬（L2，有設定模擬服務時）：上傳的存檔先跟上一份比（遊戲時間不能比伺服器時鐘快、
 * 已經存在的魚身分不能被改），不對就回 422；玩家可以改用 {@code POST /api/save/advance}
 * 拿伺服器補算到現在的那份。強制覆蓋（兩台裝置選一份）時對不上也收，但幾天內不能在市場上架魚。
 */
@RestController
@RequestMapping("/api/save")
public class SaveController {
    private final CloudSaveRepository saves;
    private final CycleProperties props;
    private final ObjectMapper json;
    private final Clock clock;
    private final SimClient sim;
    private static final Logger log = LoggerFactory.getLogger(SaveController.class);

    public SaveController(CloudSaveRepository saves, CycleProperties props, ObjectMapper json, Clock clock, SimClient sim) {
        this.saves = saves;
        this.props = props;
        this.json = json;
        this.clock = clock;
        this.sim = sim;
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
        OffsetDateTime now = OffsetDateTime.now(clock);
        Map<String, Object> out = new LinkedHashMap<>();
        List<SimClient.Problem> problems = check(save, file, now);
        if (!problems.isEmpty()) {
            SimClient.Problem first = problems.get(0);
            if (!upload.force()) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, first.code(), first.message());
            // 強制覆蓋：可能是另一台裝置上完全不同的進度，收下，但這幾天的魚不能拿去市場賣
            save.lockMarketUntil(now.plusDays(Math.max(1, props.marketMinAccountDays())));
            out.put("notice", "這份存檔跟雲端上的對不上（" + first.message() + "），覆蓋後 " + Math.max(1, props.marketMinAccountDays()) + " 天內不能在市場上架魚");
        }
        save.update(file.path("savedAt").asLong(), file.path("version").asInt(), data, now);
        saves.save(save);
        out.put("revision", save.getRevision());
        out.put("savedAt", save.getSavedAt());
        return out;
    }

    /** 跟伺服器上一份比對。模擬服務暫時連不上時先收下（不讓玩家存不了檔），記一筆。 */
    private List<SimClient.Problem> check(CloudSave previous, JsonNode next, OffsetDateTime now) throws Exception {
        if (!sim.enabled() || previous.getData() == null) return List.of();
        try {
            return sim.verify(json.readTree(previous.getData()), next, Duration.between(previous.getUpdatedAt(), now).toMillis());
        } catch (SimClient.Unavailable e) {
            log.warn("模擬服務連不上，這次上傳沒有檢查：{}", e.getMessage());
            return List.of();
        }
    }

    /**
     * 伺服器補算：把雲端存檔用伺服器的時鐘補算到現在，存成新的一版並回傳。
     * 玩家改裝置時間被擋下時，遊戲改用這一份。
     */
    @PostMapping("/advance")
    @Transactional
    public Map<String, Object> advance(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long accountId) throws Exception {
        if (!sim.enabled()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "no_sim", "伺服器沒有開模擬");
        CloudSave save = saves.findById(accountId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "none", "雲端還沒有存檔"));
        OffsetDateTime now = OffsetDateTime.now(clock);
        SimClient.Advance result = sim.advance(json.readTree(save.getData()), now.toInstant().toEpochMilli());
        save.update(result.save().path("savedAt").asLong(), result.save().path("version").asInt(), json.writeValueAsString(result.save()), now);
        saves.save(save);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("revision", save.getRevision());
        out.put("savedAt", save.getSavedAt());
        out.put("save", result.save());
        out.put("hours", result.hours());
        out.put("capped", result.capped());
        out.put("deaths", result.deaths());
        out.put("births", result.births());
        return out;
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
