package tw.cycle.server.save;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
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
import tw.cycle.server.ledger.CoinLedger;
import tw.cycle.server.market.MarketService;
import tw.cycle.server.sim.HttpSimClient;
import tw.cycle.server.sim.SimClient;

/**
 * 雲端存檔：每個帳號一份。上傳時帶上次看到的 revision，
 * 如果另一台裝置在這之間已經上傳過（revision 不同），回 409 讓玩家選要留哪一份。
 *
 * <p>伺服器權威模擬（L2，有設定模擬服務時）：上傳的存檔先跟上一份比（遊戲時間不能比伺服器時鐘快、
 * 已經存在的魚身分不能被改），不對就回 422；玩家可以改用 {@code POST /api/save/advance}
 * 拿伺服器補算到現在的那份。強制覆蓋（兩台裝置選一份）時對不上也收，但幾天內不能在市場上架魚。
 * 模擬服務檢查不了（連不上回 503、存檔讀不出或太大回 422）時不收，強制覆蓋則照對不上處理（#74）。
 * 已經在市場出貨的魚又出現（拿出貨前的舊存檔上傳）強制覆蓋也不收，不然魚就被複製了（#75）。
 */
@RestController
@RequestMapping("/api/save")
public class SaveController {
    private final CloudSaveRepository saves;
    private final CycleProperties props;
    private final ObjectMapper json;
    private final Clock clock;
    private final SimClient sim;
    private final MarketService market;
    private final CoinLedger ledger;
    /** 存檔收下之後的附帶工作（查到貨存活）用的獨立交易。 */
    private final TransactionTemplate afterSave;
    /** 已經在市場出貨的魚又出現在存檔裡。 */
    private static final String SHIPPED = "shipped_fish";
    /** 存檔最上層的欄位（src/game/save.ts 的 SaveFile）。 */
    private static final java.util.Set<String> SAVE_FIELDS = java.util.Set.of("version", "savedAt", "timeScale", "state", "backedUpAt", "tanks", "active");
    /** 補算的最短間隔（#73）。 */
    static final Duration ADVANCE_EVERY = Duration.ofMinutes(1);
    private static final Logger log = LoggerFactory.getLogger(SaveController.class);

    public SaveController(CloudSaveRepository saves, CycleProperties props, ObjectMapper json, Clock clock, SimClient sim, MarketService market, CoinLedger ledger,
                          PlatformTransactionManager tx) {
        this.saves = saves;
        this.props = props;
        this.json = json;
        this.clock = clock;
        this.sim = sim;
        this.market = market;
        this.ledger = ledger;
        this.afterSave = new TransactionTemplate(tx);
        this.afterSave.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
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
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid", "這不是 Cycle: An Aquarist's Life 的存檔");
        // 不認得的最上層欄位不收（塞垃圾欄位撐大存檔，#79）
        for (var names = file.fieldNames(); names.hasNext(); )
            if (!SAVE_FIELDS.contains(names.next())) throw new ApiException(HttpStatus.BAD_REQUEST, "invalid", "這不是 Cycle: An Aquarist's Life 的存檔");
        String data = json.writeValueAsString(file);
        if (data.getBytes(StandardCharsets.UTF_8).length > props.maxSaveBytes())
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "too_large", "存檔太大了，雲端放不下");
        CloudSave save = saves.findForUpdate(accountId).orElseGet(() -> new CloudSave(accountId));
        if (!upload.force() && save.getRevision() != upload.baseRevision()) {
            throw new ConflictException(save.getRevision(), save.getSavedAt());
        }
        requireLedger(accountId, file);
        OffsetDateTime now = OffsetDateTime.now(clock);
        Map<String, Object> out = new LinkedHashMap<>();
        List<SimClient.Problem> problems = check(accountId, save, file, now, upload.force());
        if (!problems.isEmpty()) {
            SimClient.Problem first = problems.stream().filter(p -> SHIPPED.equals(p.code())).findFirst().orElse(problems.get(0));
            if (!upload.force() || SHIPPED.equals(first.code())) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, first.code(), first.message());
            // 強制覆蓋：可能是另一台裝置上完全不同的進度，收下，但這幾天的魚不能拿去市場賣
            save.lockMarketUntil(now.plusDays(Math.max(1, props.marketMinAccountDays())));
            out.put("notice", "這份存檔跟雲端上的對不上（" + first.message() + "），覆蓋後 " + Math.max(1, props.marketMinAccountDays()) + " 天內不能在市場上架魚");
        }
        save.update(file.path("savedAt").asLong(), file.path("version").asInt(), data, now);
        saves.save(save);
        // 對得上的存檔才拿來查市場買來的魚活得怎樣（賣家的 30 天存活率）：等存檔交易 commit 之後另開一個交易查，
        // 查失敗（模擬服務掛了、SQL 出錯）只記 log，不能拖垮已經收下的上傳
        if (problems.isEmpty()) afterCommit(() -> market.recordArrivals(accountId, file));
        out.put("revision", save.getRevision());
        out.put("savedAt", save.getSavedAt());
        return out;
    }

    /** 存檔交易 commit 之後，另開一個交易跑（失敗只記 log）。 */
    private void afterCommit(Work work) {
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try {
                    afterSave.executeWithoutResult(status -> {
                        try {
                            work.run();
                        } catch (Exception e) {
                            throw new IllegalStateException(e);
                        }
                    });
                } catch (RuntimeException e) {
                    log.warn("查不了到貨存活：{}", e.getMessage());
                }
            }
        });
    }

    @FunctionalInterface
    private interface Work {
        void run() throws Exception;
    }

    /**
     * 存檔要套用到帳本最新一筆（docs/ledger.md §3.4）：落後表示沒扣款或是扣款前的舊存檔，超前只可能是改過的存檔。
     * 強制覆蓋也不收，不然選舊的那份就能把市場的扣款洗掉。
     */
    private void requireLedger(long accountId, JsonNode file) {
        int seq = file.path("state").path("economy").path("ledgerSeq").asInt(0);
        int latest = ledger.latestSeq(accountId);
        if (seq < latest)
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "ledger_behind", "這份存檔少了市場的收支紀錄，請改用雲端那份");
        if (seq > latest) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "ledger_ahead", "這份存檔的市場收支對不上");
    }

    /**
     * 跟伺服器上一份比對。檢查不了就不收（fail-closed，#74）：一般上傳把錯誤丟回去讓遊戲稍後再傳；
     * 強制覆蓋當成對不上，收下但鎖市場，跟身分對不上的處理一樣。
     */
    private List<SimClient.Problem> check(long accountId, CloudSave previous, JsonNode next, OffsetDateTime now, boolean force) throws Exception {
        if (!sim.enabled() || previous.getData() == null) return List.of();
        try {
            return sim.verify(json.readTree(previous.getData()), next, Duration.between(previous.getUpdatedAt(), now).toMillis(), market.shippedFish(accountId), market.receivedFish(accountId));
        } catch (SimClient.Unavailable | HttpSimClient.BadSave e) {
            log.warn("模擬服務檢查不了這次上傳（{}）：{}", force ? "強制覆蓋，鎖市場" : "不收", e.getMessage());
            if (!force) throw e;
            return List.of(new SimClient.Problem("unverified", "伺服器這次檢查不了"));
        }
    }

    /**
     * 伺服器補算：把雲端存檔用伺服器的時鐘補算到現在，存成新的一版並回傳。
     * 玩家改裝置時間被擋下時，遊戲改用這一份。
     * 起點是伺服器收下雲端那份的時間（{@code updated_at}），不是存檔裡的 savedAt；
     * 距離上次寫入不到一分鐘就不補算，直接回雲端那份（#73）。
     */
    @PostMapping("/advance")
    @Transactional
    public Map<String, Object> advance(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long accountId) throws Exception {
        if (!sim.enabled()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "no_sim", "伺服器沒有開模擬");
        CloudSave save = saves.findForUpdate(accountId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "none", "雲端還沒有存檔"));
        OffsetDateTime now = OffsetDateTime.now(clock);
        JsonNode stored = json.readTree(save.getData());
        Map<String, Object> out = new LinkedHashMap<>();
        if (Duration.between(save.getUpdatedAt(), now).compareTo(ADVANCE_EVERY) < 0) {
            // 一分鐘內又來補算：直接回雲端那份，不再跑模擬
            out.put("revision", save.getRevision());
            out.put("savedAt", save.getSavedAt());
            out.put("save", stored);
            out.put("hours", 0);
            out.put("capped", false);
            out.put("deaths", 0);
            out.put("births", 0);
            return out;
        }
        // 從伺服器收下這份的時間開始補算，不看存檔裡遊戲端寫的 savedAt（改成很久以前就能無限快轉，#73）
        ObjectNode from = stored.deepCopy();
        from.put("savedAt", save.getUpdatedAt().toInstant().toEpochMilli());
        SimClient.Advance result = sim.advance(from, now.toInstant().toEpochMilli());
        save.update(result.save().path("savedAt").asLong(), result.save().path("version").asInt(), json.writeValueAsString(result.save()), now);
        saves.save(save);
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

        public ConflictException(long revision, long savedAt) {
            super(HttpStatus.CONFLICT, "conflict", "另一台裝置剛上傳過存檔");
            this.revision = revision;
            this.savedAt = savedAt;
        }
    }
}
