package tw.cycle.server.ledger;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.time.OffsetDateTime;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import tw.cycle.server.config.ApiException;
import tw.cycle.server.save.SaveController;

/**
 * 遊戲幣帳本（docs/ledger.md §3，#77）：跟別的帳號有關的錢（市場）只在伺服器加減。
 * 每一筆都記進 coin_ledger，並在同一個交易裡直接改雲端存檔的 economy.coins 和 economy.ledgerSeq；
 * 遊戲端只照回傳的 delta 加減（不直接用回傳的 coins 覆蓋，見 §3.3）。
 */
@Service
public class CoinLedger {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final Clock clock;

    public CoinLedger(JdbcTemplate db, ObjectMapper json, Clock clock) {
        this.db = db;
        this.json = json;
        this.clock = clock;
    }

    /** 一筆款項套用後的結果：遊戲端照 delta 加減、記下 ledgerSeq 和新的 revision。 */
    public record Wallet(long revision, int coins, int ledgerSeq, int delta) {}

    /**
     * 記一筆帳並改雲端存檔。要在呼叫端的交易裡（掛單、訂單跟錢一起成功或一起回滾）。
     * 同一筆（reason, refId）已經記過就回上次的結果，revision 用現在的（不退回）。
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public Wallet apply(long account, Long baseRevision, int delta, String reason, long refId) throws Exception {
        if (baseRevision == null) throw new ApiException(HttpStatus.BAD_REQUEST, "need_revision", "缺少雲端存檔的版本");
        Map<String, Object> save = db.query("select revision, saved_at, data from cloud_save where account_id = ? for update",
                rs -> rs.next() ? Map.of("revision", rs.getLong("revision"), "savedAt", rs.getLong("saved_at"), "data", rs.getString("data")) : null, account);
        if (save == null) throw new ApiException(HttpStatus.CONFLICT, "need_upload", "先把存檔同步到雲端才能用市場");
        long revision = (Long) save.get("revision");
        Wallet done = db.query("select seq, balance, delta from coin_ledger where account_id = ? and reason = ? and ref_id = ?",
                rs -> rs.next() ? new Wallet(revision, rs.getInt("balance"), rs.getInt("seq"), rs.getInt("delta")) : null, account, reason, refId);
        if (done != null) return done;
        if (revision != baseRevision) throw new SaveController.ConflictException(revision, (Long) save.get("savedAt"));

        ObjectNode file = (ObjectNode) json.readTree((String) save.get("data"));
        JsonNode state = file.path("state");
        if (!state.isObject()) throw new ApiException(HttpStatus.CONFLICT, "need_upload", "先把存檔同步到雲端才能用市場");
        int coins = state.path("economy").path("coins").asInt(0);
        if (delta < 0 && coins + delta < 0) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "not_enough_coins", "錢不夠");
        int seq = latestSeq(account) + 1;
        int balance = coins + delta;
        setWallet(state, balance, seq);
        // 讀檔時 linkTanks 以第一缸為準，其他缸的 economy 只是副本，也寫一樣的值
        for (JsonNode tank : file.path("tanks")) setWallet(tank, balance, seq);
        // updated_at 不改：L2 補算的起點是伺服器收下存檔的時間（SaveController.advance）
        db.update("update cloud_save set data = ?, revision = revision + 1 where account_id = ?", json.writeValueAsString(file), account);
        db.update("insert into coin_ledger(account_id, seq, delta, balance, reason, ref_id, created_at) values (?, ?, ?, ?, ?, ?, ?)",
                account, seq, delta, balance, reason, refId, OffsetDateTime.now(clock));
        return new Wallet(revision + 1, balance, seq, delta);
    }

    /** 這個帳號帳本最新一筆（沒有就是 0）。 */
    public int latestSeq(long account) {
        Integer seq = db.queryForObject("select max(seq) from coin_ledger where account_id = ?", Integer.class, account);
        return seq == null ? 0 : seq;
    }

    private static void setWallet(JsonNode tank, int coins, int seq) {
        if (!(tank instanceof ObjectNode t)) return;
        JsonNode e = t.get("economy");
        ObjectNode economy = e instanceof ObjectNode o ? o : t.putObject("economy");
        economy.put("coins", coins);
        economy.put("ledgerSeq", seq);
    }
}
