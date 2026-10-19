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
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tw.cycle.server.config.ApiException;
import tw.cycle.server.config.CycleProperties;
import tw.cycle.server.push.PushService;
import tw.cycle.server.sim.SimClient;

/**
 * 玩家市場（market-and-breeding.md §3）：一口價上架、購買託管、出貨與運輸、到貨收貨、賣家信譽、行情。
 *
 * <p>上架的魚還活在賣家的缸裡（§3.3），由賣家的遊戲在成交後出貨。這裡負責的是「誰買了什麼、錢該給誰」：
 * 每筆訂單雙方各自在遊戲裡處理一次（收貨或退款、入帳或取消）。運輸結果（到貨死亡、緊迫）由伺服器決定。
 *
 * <p>伺服器權威模擬（L2，有設定模擬服務時）：上架的魚要在賣家的雲端存檔裡，商品資料用伺服器那份（遊戲端送來的不算）；
 * 之後更新近況、出貨時，魚的身分（品種、性別、基因）都要跟上架時一樣。
 *
 * <p>一條魚同時只能有一筆上架或成交（market_fish_claim，#75）：下架或訂單沒出貨就取消時放回來，出貨後就永遠是賣掉的。
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
    private final SimClient sim;

    public MarketService(JdbcTemplate db, ObjectMapper json, Clock clock, CycleProperties props, RandomGenerator random, PushService push, SimClient sim) {
        this.db = db;
        this.json = json;
        this.clock = clock;
        this.props = props;
        this.random = random;
        this.push = push;
        this.sim = sim;
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
        if ("fish".equals(kind) && sim.enabled()) item = serverFish(me, species, item);
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
        JsonNode fishId = item.get("id");
        if ("fish".equals(kind) && fishId != null && fishId.canConvertToLong()) {
            releaseIfOtherFish(me, fishId.asLong(), item);
            try {
                db.update("insert into market_fish_claim(seller_id, fish_id, listing_id) values (?, ?, ?)", me, fishId.asLong(), id);
            } catch (DuplicateKeyException e) {
                throw new ApiException(HttpStatus.CONFLICT, "already_listed", "這條魚已經在架上或賣出了");
            }
        }
        return Map.of("id", id, "fee", fee);
    }

    /** 伺服器那份存檔裡的這條魚（上架用）。 */
    private JsonNode serverFish(long me, String species, JsonNode item) throws Exception {
        Map<String, Object> save = db.query("select data, market_locked_until from cloud_save where account_id = ?",
                rs -> rs.next() ? Map.of("data", rs.getString("data"), "locked", java.util.Optional.ofNullable(rs.getObject("market_locked_until", OffsetDateTime.class))) : null, me);
        if (save == null) throw new ApiException(HttpStatus.CONFLICT, "no_cloud_save", "先把存檔同步到雲端才能上架魚");
        @SuppressWarnings("unchecked")
        var locked = (java.util.Optional<OffsetDateTime>) save.get("locked");
        if (locked.isPresent() && now().isBefore(locked.get()))
            throw new ApiException(HttpStatus.FORBIDDEN, "save_replaced", "雲端存檔最近被一份對不上的存檔覆蓋過，暫時不能上架魚");
        JsonNode id = item.get("id");
        if (id == null || !id.canConvertToLong()) throw bad("bad_item", "商品資料不對");
        SimClient.Inspect found = sim.inspect(json.readTree((String) save.get("data")), id.asLong());
        if (!found.found()) throw new ApiException(HttpStatus.CONFLICT, "not_in_save", "雲端存檔裡找不到這條魚，先同步存檔再上架");
        if (!found.alive()) throw new ApiException(HttpStatus.CONFLICT, "dead", "這條魚已經死了");
        if (!species.equals(found.item().path("species").asText())) throw bad("bad_species", "品種跟魚對不上");
        return found.item();
    }

    /**
     * 魚一出生就定下來、之後不會變的欄位：身分與血統（世代、近親係數、體質、老闆送的）。
     * 健康、長大、懷孕這些近況會變，不比（#75：以前只比前 4 個，其他可以改了再賣）。
     * 母魚的父系基因（sire）交配後會變，改由 {@link #serverSire} 用伺服器那份。
     */
    private static final List<String> IDENTITY = List.of("id", "species", "sex", "genome", "lineage", "generation", "inbreeding", "constitution", "gift");

    /** 同一條魚：身分與血統都一樣（植物不檢查）。沒有這個欄位和 null 當成一樣。 */
    private static boolean sameFish(JsonNode a, JsonNode b) {
        for (String key : IDENTITY)
            if (!java.util.Objects.equals(present(a.get(key)), present(b.get(key)))) return false;
        return true;
    }

    private static JsonNode present(JsonNode v) {
        return v == null || v.isNull() ? null : v;
    }

    /**
     * 母魚肚子裡的父系基因（sire）決定買家拿到的小魚，遊戲端送來的不算（#75）：
     * 有伺服器模擬時用賣家雲端存檔裡那條魚的；存檔裡找不到（已經撈出來同步過）就用上架時的。
     */
    private JsonNode serverSire(long me, String listed, JsonNode item) throws Exception {
        if (!sim.enabled() || !(item instanceof ObjectNode obj)) return item;
        JsonNode sire = json.readTree(listed).get("sire");
        String save = db.query("select data from cloud_save where account_id = ?", rs -> rs.next() ? rs.getString("data") : null, me);
        if (save != null) {
            SimClient.Inspect found = sim.inspect(json.readTree(save), item.path("id").asLong());
            if (found.found() && found.item() != null) sire = found.item().get("sire");
        }
        if (present(sire) == null) obj.remove("sire");
        else obj.set("sire", sire);
        return obj;
    }

    private void requireSameFish(String kind, String listed, JsonNode item) throws Exception {
        if ("fish".equals(kind) && listed != null && !sameFish(json.readTree(listed), item))
            throw bad("not_same_fish", "這不是上架的那條魚");
    }

    /** 賣家的遊戲更新魚的近況（健康、長大），買家看到的是即時的狀態（§3.3）。 */
    @Transactional
    public void update(long me, long id, JsonNode item) throws Exception {
        String data = json.writeValueAsString(item);
        if (data.length() > MarketRules.MAX_ITEM_CHARS) throw bad("too_big", "商品資料太大");
        Map<String, Object> l = db.query("select kind, item from market_listing where id = ? and seller_id = ? and status = 'open'",
                rs -> rs.next() ? Map.of("kind", rs.getString("kind"), "item", rs.getString("item")) : null, id, me);
        if (l == null) throw new ApiException(HttpStatus.NOT_FOUND, "no_listing", "這件商品已經不在架上");
        requireSameFish((String) l.get("kind"), (String) l.get("item"), item);
        if ("fish".equals(l.get("kind"))) {
            item = serverSire(me, (String) l.get("item"), item);
            data = json.writeValueAsString(item);
        }
        int n = db.update("update market_listing set item = ?, health = ?, updated_at = ? where id = ? and seller_id = ? and status = 'open'", data, health(item), now(), id, me);
        if (n == 0) throw new ApiException(HttpStatus.NOT_FOUND, "no_listing", "這件商品已經不在架上");
    }

    @Transactional
    public void cancel(long me, long id) {
        int n = db.update("update market_listing set status = 'cancelled', updated_at = ? where id = ? and seller_id = ? and status = 'open'", now(), id, me);
        if (n == 0) throw new ApiException(HttpStatus.NOT_FOUND, "no_listing", "這件商品已經賣出或下架了");
        db.update("delete from market_fish_claim where listing_id = ?", id);
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
        // 出貨的要是上架的那條魚（品種、性別、基因一樣）
        String listed = db.queryForObject("select item from market_listing where id = ?", String.class, o.get("listing_id"));
        requireSameFish(kind, listed, item);
        if ("fish".equals(kind)) {
            item = serverSire(me, listed, item);
            data = json.writeValueAsString(item);
        }
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
        releaseCancelled();
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
        if (db.update("update market_order set status = 'cancelled' where status = 'paid' and created_at < ?", now().minusHours(MarketRules.SHIP_DEADLINE_HOURS)) > 0)
            releaseCancelled();
    }

    /**
     * 這個編號以前賣出的是另一條魚（新遊戲或換裝置從頭玩，編號會重來）：放掉舊的佔用。
     * 舊的那條魚已經出貨，紀錄留在訂單裡，存檔檢查照樣擋得到（{@link #shippedFish}）。
     */
    private void releaseIfOtherFish(long me, long fishId, JsonNode item) throws Exception {
        List<Map<String, Object>> old = db.queryForList(
                "select l.item, o.status from market_fish_claim c join market_listing l on l.id = c.listing_id left join market_order o on o.listing_id = c.listing_id where c.seller_id = ? and c.fish_id = ?",
                me, fishId);
        if (old.isEmpty() || !"shipped".equals(old.get(0).get("status"))) return;
        if (!sameBorn(json.readTree((String) old.get(0).get("item")), item)) db.update("delete from market_fish_claim where seller_id = ? and fish_id = ?", me, fishId);
    }

    /** 魚的身分（存檔檢查也用這幾個）：品種、性別、第幾代、基因。 */
    private static final List<String> BORN = List.of("species", "sex", "generation", "genome");

    private static boolean sameBorn(JsonNode a, JsonNode b) {
        for (String key : BORN)
            if (!java.util.Objects.equals(born(a, key), born(b, key))) return false;
        return true;
    }

    private static JsonNode born(JsonNode fish, String key) {
        JsonNode v = fish.get(key);
        if ("generation".equals(key) && (v == null || v.isNull())) return com.fasterxml.jackson.databind.node.IntNode.valueOf(0);
        return v == null || v.isNull() ? null : v;
    }

    /** 訂單沒出貨就取消了：魚還在賣家缸裡，可以再上架。 */
    private void releaseCancelled() {
        db.update("delete from market_fish_claim where listing_id in (select listing_id from market_order where status = 'cancelled')");
    }

    /**
     * 這個帳號已經在市場出貨的魚：編號＋身分（品種、性別、第幾代、基因），存檔裡不該再出現（#75）。
     * 只看編號不夠：新遊戲或換裝置從頭玩，同編號的是另一條魚。
     */
    public List<JsonNode> shippedFish(long me) throws Exception {
        List<JsonNode> out = new ArrayList<>();
        for (String data : db.queryForList("select item from market_order where seller_id = ? and kind = 'fish' and status = 'shipped' order by id", String.class, me)) {
            JsonNode item = json.readTree(data);
            ObjectNode fish = json.createObjectNode();
            for (String key : List.of("id", "species", "sex", "generation", "genome")) if (item.has(key)) fish.set(key, item.get(key));
            if (fish.path("id").canConvertToLong()) out.add(fish);
        }
        return out;
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
