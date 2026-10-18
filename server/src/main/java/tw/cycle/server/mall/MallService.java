package tw.cycle.server.mall;

import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
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
 * 道具的效果在遊戲端套用（伺服器權威模擬是 L2）；伺服器管的是點數扣得對、每日限購。
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

    public record Catalog(int balance, boolean sandbox, int monthlyLimit, int toppedUpThisMonth, List<MallRules.Pack> packs, List<ItemView> items) {}

    public record Grant(long id, String item, long createdAt) {}

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
        return new Catalog(balance(me), props.paymentsSandbox(), MallRules.MONTHLY_TOPUP_LIMIT_TWD, toppedUpThisMonth(me), List.copyOf(MallRules.PACKS.values()), items);
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

    /** 用點數買一個道具；道具先放著，等遊戲來領。 */
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
        db.update("insert into point_grant (account_id, item, points, status, created_at) values (?, ?, ?, 'pending', ?)", me, item.id(), item.points(), at);
        long id = db.queryForObject("select max(id) from point_grant where account_id = ?", Long.class, me);
        return new Grant(id, item.id(), at.toInstant().toEpochMilli());
    }

    public List<Grant> pending(long me) {
        return db.query("select id, item, created_at from point_grant where account_id = ? and status = 'pending' order by id",
                (rs, n) -> new Grant(rs.getLong("id"), rs.getString("item"), rs.getObject("created_at", OffsetDateTime.class).toInstant().toEpochMilli()), me);
    }

    /** 遊戲已經把道具放進背包。重複領同一個不會出錯（遊戲記得自己領過哪些）。 */
    public void claim(long me, long id) {
        Integer found = db.queryForObject("select count(*) from point_grant where id = ? and account_id = ?", Integer.class, id, me);
        if (found == 0) throw new ApiException(HttpStatus.NOT_FOUND, "no_grant", "沒有這個道具");
        db.update("update point_grant set status = 'claimed', claimed_at = ? where id = ? and status = 'pending'", now(), id);
    }

    public List<Entry> history(long me) {
        return db.query("select delta, balance, reason, note, created_at from point_ledger where account_id = ? order by id desc limit 50",
                (rs, n) -> new Entry(rs.getInt("delta"), rs.getInt("balance"), rs.getString("reason"), rs.getString("note"), rs.getObject("created_at", OffsetDateTime.class).toInstant().toEpochMilli()), me);
    }
}
