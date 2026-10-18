package tw.cycle.server.privacy;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tw.cycle.server.config.ApiException;

/** 個資法要求的「查詢、複製」與「刪除」：匯出自己的資料、刪掉整個帳號。 */
@Service
public class PrivacyService {
    private final JdbcTemplate db;
    private final PasswordEncoder encoder;

    public PrivacyService(JdbcTemplate db, PasswordEncoder encoder) {
        this.db = db;
        this.encoder = encoder;
    }

    /** 伺服器上跟這個帳號有關的所有資料。 */
    @Transactional(readOnly = true)
    public Map<String, Object> export(long id) {
        Map<String, Object> out = new LinkedHashMap<>();
        Map<String, Object> account = db.queryForMap("SELECT username, created_at, friend_code, likes FROM account WHERE id = ?", id);
        out.put("account", account);
        List<Map<String, Object>> save = db.queryForList("SELECT revision, saved_at, save_version, updated_at, data FROM cloud_save WHERE account_id = ?", id);
        out.put("cloudSave", save.isEmpty() ? null : save.get(0));
        out.put("friends", db.queryForList(
                "SELECT a.username, f.created_at, f.affinity FROM friendship f JOIN account a ON a.id = f.friend_id WHERE f.owner_id = ? ORDER BY f.created_at", id));
        out.put("friendRequestsSent", db.queryForList(
                "SELECT a.username, r.created_at FROM friend_request r JOIN account a ON a.id = r.to_id WHERE r.from_id = ?", id));
        out.put("friendRequestsReceived", db.queryForList(
                "SELECT a.username, r.created_at FROM friend_request r JOIN account a ON a.id = r.from_id WHERE r.to_id = ?", id));
        out.put("giftsSent", db.queryForList(
                "SELECT a.username AS to_user, g.kind, g.payload, g.created_at, g.claimed_at FROM gift g JOIN account a ON a.id = g.to_id WHERE g.from_id = ? ORDER BY g.id", id));
        out.put("giftsReceived", db.queryForList(
                "SELECT a.username AS from_user, g.kind, g.payload, g.created_at, g.claimed_at FROM gift g JOIN account a ON a.id = g.from_id WHERE g.to_id = ? ORDER BY g.id", id));
        out.put("marketListings", db.queryForList(
                "SELECT kind, species, title, price, fee, status, created_at FROM market_listing WHERE seller_id = ? ORDER BY id", id));
        out.put("marketOrders", db.queryForList(
                "SELECT CASE WHEN o.buyer_id = ? THEN 'buy' ELSE 'sell' END AS side, o.kind, o.species, o.title, o.price, o.packaging, o.status, o.doa, o.created_at, o.arrive_at "
                        + "FROM market_order o WHERE o.buyer_id = ? OR o.seller_id = ? ORDER BY o.id", id, id, id));
        out.put("note", "匿名數據分析不會連到帳號，所以不在這份資料裡；在設定裡關掉就不再送。");
        return out;
    }

    /** 刪除帳號：存檔、好友、禮物、登入狀態一起刪（資料表都設了 ON DELETE CASCADE）。要再輸入一次密碼。 */
    @Transactional
    public void delete(long id, String password) {
        List<String> hash = db.queryForList("SELECT password_hash FROM account WHERE id = ?", String.class, id);
        if (hash.isEmpty()) throw new ApiException(HttpStatus.UNAUTHORIZED, "expired", "登入過期了，請重新登入");
        if (password == null || !encoder.matches(password, hash.get(0)))
            throw new ApiException(HttpStatus.FORBIDDEN, "bad_password", "密碼不對，帳號沒有刪除");
        db.update("DELETE FROM account WHERE id = ?", id);
    }
}
