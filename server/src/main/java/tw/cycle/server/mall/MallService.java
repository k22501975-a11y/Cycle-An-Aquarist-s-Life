package tw.cycle.server.mall;

import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tw.cycle.server.config.ApiException;
import tw.cycle.server.config.CycleProperties;

/**
 * 儲值點數與商城：餘額、儲值、買道具、遊戲領道具。
 *
 * <p>金流還沒接（要用營運者自己的特約商店帳號），所以儲值只有測試模式（cycle.payments-sandbox）能用，不會收錢。
 * 道具的效果在遊戲端套用（伺服器權威模擬是 L2）；伺服器管的是點數扣得對、每日限購、道具庫存（用一個扣一個，docs/ledger.md §4）。
 */
@Service
public class MallService {
    private final JdbcTemplate db;
    private final Clock clock;
    private final CycleProperties props;

    public MallService(JdbcTemplate db, Clock clock, CycleProperties props) {
        this.db = db;
        this.clock = clock;
        this.props = props;
    }

    public record ItemView(String id, String name, String note, int points, int daily, int boughtToday) {}

    /** bag：庫存（每種道具還有幾個）。 */
    public record Catalog(int balance, boolean sandbox, int monthlyLimit, int toppedUpThisMonth, List<MallRules.Pack> packs, List<ItemView> items, Map<String, Integer> bag) {}

    public record Grant(long id, String item, long createdAt) {}

    public record Used(String item, int remaining) {}

    public record Entry(int delta, int balance, String reason, String note, long at) {}

    private OffsetDateTime now() {
        return OffsetDateTime.now(clock);
    }

    private OffsetDateTime startOfDay() {
        return LocalDate.now(clock.withZone(MallRules.ZONE)).atStartOfDay(MallRules.ZONE).toOffsetDateTime();
    }

    private OffsetDateTime startOfMonth() {
        return LocalDate.now(clock.withZone(MallRules.ZONE)).withDayOfMonth(1).atStartOfDay(MallRules.ZONE).toOffsetDateTime();
    }

    public int balance(long me) {
        return db.queryForObject("select points from account where id = ?", Integer.class, me);
    }

    private int boughtToday(long me, String item) {
        return db.queryForObject("select count(*) from point_grant where account_id = ? and item = ? and created_at >= ?", Integer.class, me, item, startOfDay());
    }

    private int toppedUpThisMonth(long me) {
        return db.queryForObject("select coalesce(sum(amount_twd), 0) from payment_order where account_id = ? and status = 'paid' and created_at >= ?", Integer.class, me, startOfMonth());
    }

    public Catalog catalog(long me) {
        List<ItemView> items = MallRules.ITEMS.values().stream()
                .map(i -> new ItemView(i.id(), i.name(), i.note(), i.points(), i.daily(), boughtToday(me, i.id())))
                .toList();
        return new Catalog(balance(me), props.paymentsSandbox(), MallRules.MONTHLY_TOPUP_LIMIT_TWD, toppedUpThisMonth(me), List.copyOf(MallRules.PACKS.values()), items, bag(me));
    }

    private int credit(long me, int delta, String reason, String note) {
        db.update("update account set points = points + ? where id = ?", delta, me);
        int balance = balance(me);
        db.update("insert into point_ledger (account_id, delta, balance, reason, note, created_at) values (?, ?, ?, ?, ?, ?)", me, delta, balance, reason, note, now());
        return balance;
    }

    /** 測試模式的儲值：直接入帳，不收錢。 */
    @Transactional
    public int topup(long me, String packId) {
        if (!props.paymentsSandbox()) throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "no_payments", "儲值還沒開放");
        MallRules.Pack pack = MallRules.PACKS.get(packId);
        if (pack == null) throw new ApiException(HttpStatus.BAD_REQUEST, "bad_pack", "沒有這個儲值方案");
        db.queryForObject("select points from account where id = ? for update", Integer.class, me);
        if (toppedUpThisMonth(me) + pack.twd() > MallRules.MONTHLY_TOPUP_LIMIT_TWD)
            throw new ApiException(HttpStatus.CONFLICT, "monthly_limit", "這個月的儲值已經到上限（NT$" + MallRules.MONTHLY_TOPUP_LIMIT_TWD + "）");
        db.update("insert into payment_order (account_id, pack, amount_twd, points, provider, status, created_at) values (?, ?, ?, ?, 'sandbox', 'paid', ?)",
                me, pack.id(), pack.twd(), pack.points(), now());
        return credit(me, pack.points(), "topup", "儲值 NT$" + pack.twd());
    }

    /** 用點數買一個道具，放進庫存。 */
    @Transactional
    public Grant buy(long me, String itemId) {
        MallRules.Item item = MallRules.ITEMS.get(itemId);
        if (item == null) throw new ApiException(HttpStatus.BAD_REQUEST, "bad_item", "沒有這個道具");
        // 先鎖住帳號那一列，同時按兩次也不會超買
        db.queryForObject("select points from account where id = ? for update", Integer.class, me);
        if (item.daily() > 0 && boughtToday(me, item.id()) >= item.daily())
            throw new ApiException(HttpStatus.CONFLICT, "daily_limit", item.name() + "今天已經買了 " + item.daily() + " 個，明天再來");
        if (db.update("update account set points = points - ? where id = ? and points >= ?", item.points(), me, item.points()) == 0)
            throw new ApiException(HttpStatus.CONFLICT, "not_enough", "點數不夠");
        int balance = balance(me);
        db.update("insert into point_ledger (account_id, delta, balance, reason, note, created_at) values (?, ?, ?, 'buy', ?, ?)", me, -item.points(), balance, item.name(), now());
        OffsetDateTime at = now();
        // point_grant 只當購買紀錄；道具直接進庫存（帳號那一列鎖著，不會兩個請求同時插入）
        db.update("insert into point_grant (account_id, item, points, status, created_at, claimed_at) values (?, ?, ?, 'claimed', ?, ?)", me, item.id(), item.points(), at, at);
        if (db.update("update mall_inventory set count = count + 1 where account_id = ? and item = ?", me, item.id()) == 0)
            db.update("insert into mall_inventory (account_id, item, count) values (?, ?, 1)", me, item.id());
        long id = db.queryForObject("select max(id) from point_grant where account_id = ?", Long.class, me);
        return new Grant(id, item.id(), at.toInstant().toEpochMilli());
    }

    /** 每種道具還有幾個（沒買過的是 0）。 */
    public Map<String, Integer> bag(long me) {
        Map<String, Integer> bag = new LinkedHashMap<>();
        for (String id : MallRules.ITEMS.keySet()) bag.put(id, 0);
        db.query("select item, count from mall_inventory where account_id = ?", rs -> {
            if (bag.containsKey(rs.getString("item"))) bag.put(rs.getString("item"), rs.getInt("count"));
        }, me);
        return bag;
    }

    /**
     * 用掉一個道具（docs/ledger.md §4.2）。同一個 requestId 再送一次直接回上次的結果，不會扣兩個；
     * 遊戲端拿到成功才套用效果。
     */
    @Transactional
    public Used use(long me, String itemId, UUID requestId) {
        if (!MallRules.ITEMS.containsKey(itemId)) throw new ApiException(HttpStatus.BAD_REQUEST, "bad_item", "沒有這個道具");
        // 跟買道具同一把鎖：同一個 requestId 同時送兩次也只會扣一個
        db.queryForObject("select points from account where id = ? for update", Integer.class, me);
        List<Used> done = db.query("select item, remaining from mall_use where account_id = ? and request_id = ?",
                (rs, n) -> new Used(rs.getString("item"), rs.getInt("remaining")), me, requestId);
        if (!done.isEmpty()) {
            if (!done.get(0).item().equals(itemId)) throw new ApiException(HttpStatus.CONFLICT, "request_reused", "這個請求編號用過了");
            return done.get(0);
        }
        if (db.update("update mall_inventory set count = count - 1 where account_id = ? and item = ? and count > 0", me, itemId) == 0)
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "no_item", "背包裡沒有" + MallRules.ITEMS.get(itemId).name());
        int remaining = db.queryForObject("select count from mall_inventory where account_id = ? and item = ?", Integer.class, me, itemId);
        db.update("insert into mall_use (account_id, request_id, item, remaining, created_at) values (?, ?, ?, ?, ?)", me, requestId, itemId, remaining, now());
        return new Used(itemId, remaining);
    }

    public List<Entry> history(long me) {
        return db.query("select delta, balance, reason, note, created_at from point_ledger where account_id = ? order by id desc limit 50",
                (rs, n) -> new Entry(rs.getInt("delta"), rs.getInt("balance"), rs.getString("reason"), rs.getString("note"), rs.getObject("created_at", OffsetDateTime.class).toInstant().toEpochMilli()), me);
    }
}
