package tw.cycle.server.market;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.random.RandomGenerator;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tw.cycle.server.config.ApiException;
import tw.cycle.server.config.CycleProperties;
import tw.cycle.server.push.PushService;

/**
 * 玩家市場（market-and-breeding.md §3）：一口價上架、購買託管、出貨與運輸、到貨收貨、賣家信譽、行情。
 *
 * <p>上架的魚還活在賣家的缸裡（§3.3），由賣家的遊戲在成交後出貨。錢包和魚的模擬目前在遊戲端（伺服器權威模擬是 L2），
 * 所以這裡負責的是「誰買了什麼、錢該給誰」：每筆訂單雙方各自在遊戲裡處理一次（收貨或退款、入帳或取消）。
 * 運輸結果（到貨死亡、緊迫）由伺服器決定。
 */
@Service
public class MarketService {
    private static final Pattern SPECIES = Pattern.compile("^[a-z_]{2,32}$");
    /** 逛市場時不給買家看的欄位：基因型是隱藏的（market-and-breeding.md §2.6）。 */
    private static final List<String> HIDDEN = List.of("genome", "sire", "lineage", "recentDamage", "infections", "ich");

    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final Clock clock;
    private final CycleProperties props;
    private final RandomGenerator random;
    private final PushService push;

    public MarketService(JdbcTemplate db, ObjectMapper json, Clock clock, CycleProperties props, RandomGenerator random, PushService push) {
        this.db = db;
        this.json = json;
        this.clock = clock;
        this.props = props;
        this.random = random;
        this.push = push;
    }

    public record Seller(String username, int deals, double doaRate, boolean warning) {}

    public record Listing(long id, String kind, String species, String title, JsonNode item, double health, int price, Seller seller, long createdAt) {}

    public record Order(long id, String role, String kind, String species, String title, int price, String packaging, String status,
                        boolean arrived, String counterpart, long createdAt, Long arriveAt, JsonNode item, long listingId) {}

    public record Mine(List<Listing> listings, List<Order> sales, List<Order> purchases, int slots, long canListAt) {}

    public record PricePoint(String day, int median, int count) {}

    private OffsetDateTime now() {
        return OffsetDateTime.now(clock);
    }

    // ---- 上架 ----

    @Transactional
    public Map<String, Object> list(long me, String kind, String species, String title, JsonNode item, int price) throws Exception {
        if (!"fish".equals(kind) && !"plant".equals(kind)) throw bad("bad_kind", "不能賣這種東西");
        if (!SPECIES.matcher(species).matches()) throw bad("bad_species", "不認得這個品種");
        if (title.isBlank() || title.length() > 80) throw bad("bad_title", "名稱太長了");
        if (price < MarketRules.MIN_PRICE || price > MarketRules.MAX_PRICE) throw bad("bad_price", "售價要在 1 到 1,000,000 元之間");
        String data = json.writeValueAsString(item);
        if (data.length() > MarketRules.MAX_ITEM_CHARS) throw bad("too_big", "商品資料太大");
        OffsetDateTime created = db.queryForObject("select created_at from account where id = ?", OffsetDateTime.class, me);
        OffsetDateTime allowed = created.plusDays(props.marketMinAccountDays());
        if (now().isBefore(allowed))
            throw new ApiException(HttpStatus.FORBIDDEN, "too_new", "新帳號滿 " + props.marketMinAccountDays() + " 天才能上架");
        if (openListings(me) >= MarketRules.slots(delivered(me)))
            throw new ApiException(HttpStatus.CONFLICT, "no_slot", "上架格子滿了，先賣掉或下架一些");
        int fee = MarketRules.listingFee(price);
        db.update("insert into market_listing(seller_id, kind, species, title, item, health, price, fee, status, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)",
                me, kind, species, title.strip(), data, health(item), price, fee, now(), now());
        long id = db.queryForObject("select max(id) from market_listing where seller_id = ?", Long.class, me);
        return Map.of("id", id, "fee", fee);
    }

    /** 賣家的遊戲更新魚的近況（健康、長大），買家看到的是即時的狀態（§3.3）。 */
    @Transactional
    public void update(long me, long id, JsonNode item) throws Exception {
        String data = json.writeValueAsString(item);
        if (data.length() > MarketRules.MAX_ITEM_CHARS) throw bad("too_big", "商品資料太大");
        int n = db.update("update market_listing set item = ?, health = ?, updated_at = ? where id = ? and seller_id = ? and status = 'open'", data, health(item), now(), id, me);
        if (n == 0) throw new ApiException(HttpStatus.NOT_FOUND, "no_listing", "這件商品已經不在架上");
    }

    @Transactional
    public void cancel(long me, long id) {
        int n = db.update("update market_listing set status = 'cancelled', updated_at = ? where id = ? and seller_id = ? and status = 'open'", now(), id, me);
        if (n == 0) throw new ApiException(HttpStatus.NOT_FOUND, "no_listing", "這件商品已經賣出或下架了");
    }

    // ---- 逛市場、購買 ----

    public List<Listing> browse(long me, String species, String sort) {
        String order = "new".equals(sort) ? "l.created_at desc" : "l.price, l.created_at desc";
        List<Object> args = new ArrayList<>(List.of(me));
        String where = "l.status = 'open' and l.seller_id <> ?";
        if (species != null && !species.isBlank()) {
            where += " and l.species = ?";
            args.add(species);
        }
        Map<Long, Seller> sellers = new HashMap<>();
        return db.query("select l.*, a.username from market_listing l join account a on a.id = l.seller_id where " + where + " order by " + order + " limit 60",
                (rs, i) -> listing(rs, sellers.computeIfAbsent(rs.getLong("seller_id"), s -> seller(s, rs)), true), args.toArray());
    }

    @Transactional
    public Order buy(long me, long listingId, String packaging) {
        MarketRules.Packaging pack = MarketRules.PACKAGING.get(packaging);
        if (pack == null) throw bad("bad_packaging", "沒有這種包裝");
        Map<String, Object> l = db.query("select * from market_listing where id = ?", rs -> rs.next() ? row(rs) : null, listingId);
        if (l == null || !"open".equals(l.get("status"))) throw new ApiException(HttpStatus.CONFLICT, "gone", "晚了一步，這件已經賣出或下架了");
        long seller = ((Number) l.get("seller_id")).longValue();
        if (seller == me) throw bad("own", "不能買自己上架的東西");
        // 同時有兩個人按下購買時，只有一個人買得到
        if (db.update("update market_listing set status = 'sold', updated_at = ? where id = ? and status = 'open'", now(), listingId) == 0)
            throw new ApiException(HttpStatus.CONFLICT, "gone", "晚了一步，這件已經賣出或下架了");
        db.update("insert into market_order(listing_id, buyer_id, seller_id, kind, species, title, item, price, packaging, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?)",
                listingId, me, seller, l.get("kind"), l.get("species"), l.get("title"), l.get("item"), l.get("price"), packaging, now());
        long id = db.queryForObject("select max(id) from market_order where buyer_id = ?", Long.class, me);
        push.notifyAccount(seller, "market", "有人買了你的「" + l.get("title") + "」，打開遊戲就會自動出貨（24 小時內沒出貨會退款給買家）", "sale-" + id, null);
        return order(me, id);
    }

    // ---- 我的上架與訂單 ----

    @Transactional
    public Mine mine(long me) {
        expireUnshipped();
        Seller self = seller(me, null);
        List<Listing> listings = db.query("select l.*, a.username from market_listing l join account a on a.id = l.seller_id where l.seller_id = ? and l.status = 'open' order by l.created_at",
                (rs, i) -> listing(rs, self, false), me);
        List<Order> sales = orders(me, "seller_id = ? and seller_done is null", me);
        List<Order> purchases = orders(me, "buyer_id = ? and buyer_done is null", me);
        OffsetDateTime created = db.queryForObject("select created_at from account where id = ?", OffsetDateTime.class, me);
        return new Mine(listings, sales, purchases, MarketRules.slots(delivered(me)), created.plusDays(props.marketMinAccountDays()).toInstant().toEpochMilli());
    }

    /**
     * 賣家出貨：遊戲把魚從缸裡撈出來，送來出貨當下的樣子和袋子裡的水（對水用）。
     * 伺服器決定運輸時間、會不會死在路上、到貨時多緊迫。
     */
    @Transactional
    public Order ship(long me, long id, JsonNode item, double bagTemp, double bagPh) throws Exception {
        expireUnshipped();
        Map<String, Object> o = db.query("select * from market_order where id = ? and seller_id = ?", rs -> rs.next() ? row(rs) : null, id, me);
        if (o == null) throw new ApiException(HttpStatus.NOT_FOUND, "no_order", "沒有這筆訂單");
        if (!"paid".equals(o.get("status"))) throw new ApiException(HttpStatus.CONFLICT, "not_paid", "這筆訂單不能出貨了");
        String data = json.writeValueAsString(item);
        if (data.length() > MarketRules.MAX_ITEM_CHARS) throw bad("too_big", "商品資料太大");
        String kind = (String) o.get("kind");
        MarketRules.Packaging pack = MarketRules.PACKAGING.get((String) o.get("packaging"));
        int transit = MarketRules.MIN_TRANSIT_HOURS + random.nextInt(MarketRules.MAX_TRANSIT_HOURS - MarketRules.MIN_TRANSIT_HOURS + 1);
        boolean doa = random.nextDouble() < MarketRules.doaChance(kind, (String) o.get("species"), health(item), pack, transit);
        long realMinutes = Math.round(transit * 60.0 / MarketRules.TIME_SCALE);
        if (o.get("buyer_id") != null)
            push.notifyAccount(((Number) o.get("buyer_id")).longValue(), "market", "「" + o.get("title") + "」到貨了，記得對水再放進缸裡", "arrive-" + id, now().plusMinutes(realMinutes));
        db.update("update market_order set status = 'shipped', item = ?, doa = ?, arrival_stress = ?, bag_temp = ?, bag_ph = ?, shipped_at = ?, arrive_at = ? where id = ?",
                data, doa, MarketRules.arrivalStress(pack, transit), clamp(bagTemp, 10, 40), clamp(bagPh, 4, 10), now(), now().plusMinutes(realMinutes), id);
        return order(me, id);
    }

    /** 賣家沒辦法出貨（魚死了、不見了）：取消並退款給買家。 */
    @Transactional
    public void sellerCancel(long me, long id) {
        int n = db.update("update market_order set status = 'cancelled', seller_done = ? where id = ? and seller_id = ? and status = 'paid'", now(), id, me);
        if (n == 0) throw new ApiException(HttpStatus.CONFLICT, "not_paid", "這筆訂單已經出貨或取消了");
    }

    /**
     * 雙方各自在遊戲裡處理一次訂單的結果，只能領一次。
     * 買家：到貨了拿到魚（或退款）；賣家：到貨了拿到貨款（扣成交稅），買家沒收到就沒有錢。
     */
    @Transactional
    public Map<String, Object> collect(long me, long id) throws Exception {
        expireUnshipped();
        Map<String, Object> o = db.query("select * from market_order where id = ?", rs -> rs.next() ? row(rs) : null, id);
        if (o == null) throw new ApiException(HttpStatus.NOT_FOUND, "no_order", "沒有這筆訂單");
        boolean buyer = o.get("buyer_id") != null && ((Number) o.get("buyer_id")).longValue() == me;
        boolean seller = o.get("seller_id") != null && ((Number) o.get("seller_id")).longValue() == me;
        if (!buyer && !seller) throw new ApiException(HttpStatus.NOT_FOUND, "no_order", "沒有這筆訂單");
        String status = (String) o.get("status");
        boolean arrived = "shipped".equals(status) && !now().isBefore(time(o.get("arrive_at")));
        if (!arrived && !"cancelled".equals(status)) throw new ApiException(HttpStatus.CONFLICT, "not_yet", "還在路上");
        String column = buyer ? "buyer_done" : "seller_done";
        if (db.update("update market_order set " + column + " = ? where id = ? and " + column + " is null", now(), id) == 0)
            throw new ApiException(HttpStatus.CONFLICT, "done", "已經處理過了");
        int price = ((Number) o.get("price")).intValue();
        int refund = price + MarketRules.PACKAGING.get((String) o.get("packaging")).cost();
        boolean doa = Boolean.TRUE.equals(o.get("doa"));
        Map<String, Object> out = new LinkedHashMap<>();
        if (buyer) {
            if ("cancelled".equals(status)) {
                out.put("result", "refund");
                out.put("reason", "not_shipped");
                out.put("amount", refund);
            } else if (doa) {
                out.put("result", "refund");
                out.put("reason", "doa");
                out.put("amount", refund);
            } else {
                out.put("result", "item");
                out.put("item", json.readTree((String) o.get("item")));
                out.put("stress", o.get("arrival_stress"));
                out.put("bagTemp", o.get("bag_temp"));
                out.put("bagPh", o.get("bag_ph"));
            }
        } else {
            if ("cancelled".equals(status)) out.put("result", "cancelled");
            else if (doa) out.put("result", "doa");
            else {
                out.put("result", "payout");
                out.put("amount", MarketRules.payout(price));
            }
        }
        out.put("kind", o.get("kind"));
        out.put("title", o.get("title"));
        out.put("listingId", o.get("listing_id") == null ? 0 : ((Number) o.get("listing_id")).longValue());
        return out;
    }

    // ---- 行情 ----

    /** 最近兩週每天的成交中位數（只算真的到貨的成交，不是掛單價，§3.7）。 */
    public List<PricePoint> prices(String species) {
        OffsetDateTime since = now().minusDays(MarketRules.PRICE_DAYS);
        TreeMap<LocalDate, List<Integer>> byDay = new TreeMap<>();
        db.query("select price, arrive_at from market_order where species = ? and status = 'shipped' and doa = false and arrive_at >= ? and arrive_at <= ?",
                (ResultSet rs) -> {
                    LocalDate day = rs.getObject("arrive_at", OffsetDateTime.class).atZoneSameInstant(MarketRules.ZONE).toLocalDate();
                    byDay.computeIfAbsent(day, d -> new ArrayList<>()).add(rs.getInt("price"));
                },
                species, since, now());
        List<PricePoint> out = new ArrayList<>();
        byDay.forEach((day, list) -> {
            list.sort(Integer::compare);
            int n = list.size();
            int median = n % 2 == 1 ? list.get(n / 2) : (list.get(n / 2 - 1) + list.get(n / 2)) / 2;
            out.add(new PricePoint(day.toString(), median, n));
        });
        return out;
    }

    // ---- 內部 ----

    /** 賣家超過期限沒出貨：取消，款項退給買家。 */
    private void expireUnshipped() {
        db.update("update market_order set status = 'cancelled' where status = 'paid' and created_at < ?", now().minusHours(MarketRules.SHIP_DEADLINE_HOURS));
    }

    private int openListings(long me) {
        return db.queryForObject("select count(*) from market_listing where seller_id = ? and status = 'open'", Integer.class, me);
    }

    /** 成功送到的筆數（信譽與上架格數）。 */
    private int delivered(long me) {
        return db.queryForObject("select count(*) from market_order where seller_id = ? and status = 'shipped' and doa = false and arrive_at <= ?", Integer.class, me, now());
    }

    /** 賣家信譽：客觀資料算（§3.6）。目前有成交筆數和到貨死亡率；到貨後的發病和存活要等伺服器權威模擬。 */
    private Seller seller(long id, ResultSet rs) {
        try {
            String name = rs != null ? rs.getString("username") : db.queryForObject("select username from account where id = ?", String.class, id);
            int[] counts = db.query("select count(*) as n, coalesce(sum(case when doa then 1 else 0 end), 0) as d from market_order where seller_id = ? and status = 'shipped' and arrive_at <= ?",
                    r -> {
                        r.next();
                        return new int[] {r.getInt("n"), r.getInt("d")};
                    },
                    id, now());
            double rate = counts[0] == 0 ? 0 : (double) counts[1] / counts[0];
            return new Seller(name, counts[0] - counts[1], rate, counts[0] >= 5 && rate > MarketRules.DOA_WARNING);
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    private Listing listing(ResultSet rs, Seller seller, boolean forBuyer) throws SQLException {
        JsonNode item;
        try {
            item = json.readTree(rs.getString("item"));
        } catch (Exception e) {
            item = json.createObjectNode();
        }
        if (forBuyer && item instanceof ObjectNode obj) obj.remove(HIDDEN);
        return new Listing(rs.getLong("id"), rs.getString("kind"), rs.getString("species"), rs.getString("title"), item, rs.getDouble("health"),
                rs.getInt("price"), seller, rs.getObject("created_at", OffsetDateTime.class).toInstant().toEpochMilli());
    }

    private Order order(long me, long id) {
        List<Order> list = orders(me, "id = ?", id);
        return list.isEmpty() ? null : list.get(0);
    }

    private List<Order> orders(long me, String where, Object arg) {
        OffsetDateTime now = now();
        return db.query("select o.*, b.username as buyer_name, s.username as seller_name from market_order o left join account b on b.id = o.buyer_id left join account s on s.id = o.seller_id where o."
                        + where + " order by o.created_at",
                (rs, i) -> {
                    boolean asSeller = rs.getObject("seller_id") != null && rs.getLong("seller_id") == me;
                    OffsetDateTime arrive = rs.getObject("arrive_at", OffsetDateTime.class);
                    boolean arrived = "shipped".equals(rs.getString("status")) && arrive != null && !now.isBefore(arrive);
                    JsonNode item = null;
                    // 賣家要知道是哪一條魚才能出貨；買家到貨後才看得到
                    if (asSeller) {
                        try {
                            item = json.readTree(rs.getString("item"));
                        } catch (Exception e) {
                            item = null;
                        }
                    }
                    String counterpart = asSeller ? rs.getString("buyer_name") : rs.getString("seller_name");
                    return new Order(rs.getLong("id"), asSeller ? "seller" : "buyer", rs.getString("kind"), rs.getString("species"), rs.getString("title"),
                            rs.getInt("price"), rs.getString("packaging"), rs.getString("status"), arrived, counterpart,
                            rs.getObject("created_at", OffsetDateTime.class).toInstant().toEpochMilli(), arrive == null ? null : arrive.toInstant().toEpochMilli(), item,
                            rs.getLong("listing_id"));
                },
                arg);
    }

    private static Map<String, Object> row(ResultSet rs) throws SQLException {
        Map<String, Object> m = new HashMap<>();
        var meta = rs.getMetaData();
        for (int i = 1; i <= meta.getColumnCount(); i++) {
            String col = meta.getColumnLabel(i).toLowerCase();
            m.put(col, col.endsWith("_at") || col.endsWith("_done") ? rs.getObject(i, OffsetDateTime.class) : rs.getObject(i));
        }
        return m;
    }

    private static OffsetDateTime time(Object o) {
        return (OffsetDateTime) o;
    }

    private static double health(JsonNode item) {
        JsonNode h = item.get("health");
        return h != null && h.isNumber() ? clamp(h.asDouble(), 0, 1) : 1;
    }

    private static double clamp(double v, double lo, double hi) {
        return Double.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;
    }

    private static ApiException bad(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }

}
