package tw.cycle.server.social;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.security.SecureRandom;
import java.sql.Date;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tw.cycle.server.config.ApiException;
import tw.cycle.server.push.PushService;

/**
 * 好友、參觀、按讚、互贈（friends.md §1、§2.1、§2.2）。
 * 贈禮的內容由遊戲端決定（伺服器權威模擬是 L2），這裡負責好友關係、每日額度與交情。
 */
@Service
public class SocialService {
    /** 好友碼不用容易看錯的 0/O、1/I。 */
    private static final String CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final Clock clock;
    private final PushService push;
    private final SecureRandom random = new SecureRandom();

    public SocialService(JdbcTemplate db, ObjectMapper json, Clock clock, PushService push) {
        this.db = db;
        this.json = json;
        this.clock = clock;
        this.push = push;
    }

    public record Friend(String username, int affinity, int level, boolean visitedToday, boolean likedToday) {}

    public record Overview(String code, int likes, List<Friend> friends, List<String> incoming, List<String> outgoing, int sendLeft, int receiveLeft) {}

    public record Gift(long id, String from, String kind, JsonNode payload, long createdAt) {}

    private LocalDate today() {
        return LocalDate.now(clock.withZone(SocialRules.ZONE));
    }

    private OffsetDateTime now() {
        return OffsetDateTime.now(clock);
    }

    /** 自己的好友碼；第一次用到時產生。 */
    @Transactional
    public String friendCode(long me) {
        String code = db.queryForObject("select friend_code from account where id = ?", String.class, me);
        while (code == null) {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 8; i++) sb.append(CODE_CHARS.charAt(random.nextInt(CODE_CHARS.length())));
            try {
                db.update("update account set friend_code = ? where id = ? and friend_code is null", sb.toString(), me);
                code = db.queryForObject("select friend_code from account where id = ?", String.class, me);
            } catch (DuplicateKeyException e) {
                // 撞號就再抽一次
            }
        }
        return code;
    }

    @Transactional
    public Overview overview(long me) {
        LocalDate day = today();
        List<Friend> friends = db.query(
                "select a.username, f.affinity, f.last_visit_day, f.last_like_day from friendship f join account a on a.id = f.friend_id where f.owner_id = ? order by f.affinity desc, a.username",
                (rs, i) -> {
                    int affinity = rs.getInt("affinity");
                    Date visit = rs.getDate("last_visit_day");
                    Date like = rs.getDate("last_like_day");
                    return new Friend(rs.getString("username"), affinity, SocialRules.level(affinity),
                            visit != null && visit.toLocalDate().equals(day), like != null && like.toLocalDate().equals(day));
                },
                me);
        List<String> incoming = db.queryForList("select a.username from friend_request r join account a on a.id = r.from_id where r.to_id = ? order by r.created_at", String.class, me);
        List<String> outgoing = db.queryForList("select a.username from friend_request r join account a on a.id = r.to_id where r.from_id = ? order by r.created_at", String.class, me);
        int likes = db.queryForObject("select likes from account where id = ?", Integer.class, me);
        return new Overview(friendCode(me), likes, friends, incoming, outgoing,
                SocialRules.DAILY_SEND_POINTS - sentPoints(me, day), SocialRules.DAILY_RECEIVE_POINTS - receivedPoints(me, day));
    }

    /** 用好友碼送出邀請；對方也邀請過我就直接成為好友。回傳對方名字。 */
    @Transactional
    public Map<String, Object> request(long me, String code) {
        Long other = db.query("select id from account where friend_code = ?", rs -> rs.next() ? rs.getLong(1) : null, code.trim().toUpperCase());
        if (other == null) throw new ApiException(HttpStatus.NOT_FOUND, "no_code", "找不到這個好友碼");
        if (other == me) throw new ApiException(HttpStatus.BAD_REQUEST, "self", "這是你自己的好友碼");
        String name = username(other);
        if (areFriends(me, other)) throw new ApiException(HttpStatus.CONFLICT, "already", "你們已經是好友了");
        if (countFriends(me) >= SocialRules.MAX_FRIENDS) throw new ApiException(HttpStatus.CONFLICT, "full", "好友已經滿了（最多 " + SocialRules.MAX_FRIENDS + " 人）");
        if (exists("select count(*) from friend_request where from_id = ? and to_id = ?", other, me)) {
            befriend(me, other);
            return Map.of("username", name, "status", "friends");
        }
        if (!exists("select count(*) from friend_request where from_id = ? and to_id = ?", me, other)) {
            db.update("insert into friend_request(from_id, to_id, created_at) values (?, ?, ?)", me, other, now());
            push.notifyAccount(other, "friends", username(me) + " 想加你好友", "friend-request", null);
        }
        return Map.of("username", name, "status", "requested");
    }

    @Transactional
    public void accept(long me, String username) {
        long other = idOf(username);
        if (!exists("select count(*) from friend_request where from_id = ? and to_id = ?", other, me))
            throw new ApiException(HttpStatus.NOT_FOUND, "no_request", "沒有這個好友邀請");
        if (countFriends(me) >= SocialRules.MAX_FRIENDS || countFriends(other) >= SocialRules.MAX_FRIENDS)
            throw new ApiException(HttpStatus.CONFLICT, "full", "好友已經滿了");
        befriend(me, other);
    }

    @Transactional
    public void decline(long me, String username) {
        long other = idOf(username);
        db.update("delete from friend_request where (from_id = ? and to_id = ?) or (from_id = ? and to_id = ?)", other, me, me, other);
    }

    @Transactional
    public void unfriend(long me, String username) {
        long other = idOf(username);
        db.update("delete from friendship where (owner_id = ? and friend_id = ?) or (owner_id = ? and friend_id = ?)", me, other, other, me);
    }

    /** 參觀好友的缸：回傳他的雲端存檔。每天第一次參觀加交情。 */
    @Transactional
    public Map<String, Object> visit(long me, String username) throws Exception {
        long other = requireFriend(me, username);
        LocalDate day = today();
        Date last = db.queryForObject("select last_visit_day from friendship where owner_id = ? and friend_id = ?", Date.class, me, other);
        if (last == null || !last.toLocalDate().equals(day)) {
            db.update("update friendship set last_visit_day = ? where owner_id = ? and friend_id = ?", day, me, other);
            addAffinity(me, other, 1);
        }
        Optional<Map<String, Object>> save = db.query("select saved_at, data from cloud_save where account_id = ?",
                rs -> rs.next() ? Optional.of(Map.<String, Object>of("savedAt", rs.getLong(1), "data", rs.getString(2))) : Optional.empty(), other);
        int likes = db.queryForObject("select likes from account where id = ?", Integer.class, other);
        if (save.isEmpty()) return Map.of("username", username(other), "likes", likes);
        return Map.of("username", username(other), "likes", likes, "savedAt", save.get().get("savedAt"), "save", json.readTree((String) save.get().get("data")));
    }

    /** 幫好友的缸按讚，每天一次。 */
    @Transactional
    public int like(long me, String username) {
        long other = requireFriend(me, username);
        LocalDate day = today();
        Date last = db.queryForObject("select last_like_day from friendship where owner_id = ? and friend_id = ?", Date.class, me, other);
        if (last != null && last.toLocalDate().equals(day)) throw new ApiException(HttpStatus.CONFLICT, "liked", "今天已經按過讚了");
        db.update("update friendship set last_like_day = ? where owner_id = ? and friend_id = ?", day, me, other);
        db.update("update account set likes = likes + 1 where id = ?", other);
        addAffinity(me, other, 1);
        return db.queryForObject("select likes from account where id = ?", Integer.class, other);
    }

    /** 送禮：檢查好友關係、內容格式與雙方的每日點數。 */
    @Transactional
    public Map<String, Object> send(long me, String username, String kind, JsonNode payload) throws Exception {
        long other = requireFriend(me, username);
        int points = switch (kind) {
            case "cuttings" -> {
                String species = payload.path("species").asText("");
                int count = payload.path("count").asInt(0);
                if (!species.matches("^[a-z_]{1,32}$") || count < 1 || count > SocialRules.MAX_CUTTINGS)
                    throw new ApiException(HttpStatus.BAD_REQUEST, "invalid", "插枝一次可以送 1～" + SocialRules.MAX_CUTTINGS + " 株");
                yield count;
            }
            case "media" -> {
                if (!payload.path("bacteria").isNumber() || payload.path("bacteria").asDouble() <= 0)
                    throw new ApiException(HttpStatus.BAD_REQUEST, "invalid", "濾材的資料不對");
                yield 2;
            }
            default -> throw new ApiException(HttpStatus.BAD_REQUEST, "invalid", "不能送這種東西");
        };
        LocalDate day = today();
        if (sentPoints(me, day) + points > SocialRules.DAILY_SEND_POINTS)
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "send_limit", "今天送的禮物已經到上限了，明天再送");
        if (receivedPoints(other, day) + points > SocialRules.DAILY_RECEIVE_POINTS)
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "receive_limit", username + " 今天收的禮物已經到上限了");
        db.update("insert into gift(from_id, to_id, kind, payload, points, gift_day, created_at) values (?, ?, ?, ?, ?, ?, ?)",
                me, other, kind, json.writeValueAsString(payload), points, day, now());
        addAffinity(me, other, 1);
        push.notifyAccount(other, "friends", username(me) + " 送你" + ("cuttings".equals(kind) ? payload.path("count").asInt() + " 株水草插枝" : "一份成熟濾材") + "，打開遊戲收下吧", "gift", null);
        return Map.of("sendLeft", SocialRules.DAILY_SEND_POINTS - sentPoints(me, day));
    }

    public List<Gift> inbox(long me) {
        return db.query(
                "select g.id, a.username, g.kind, g.payload, g.created_at from gift g join account a on a.id = g.from_id where g.to_id = ? and g.claimed_at is null order by g.created_at",
                (rs, i) -> {
                    try {
                        return new Gift(rs.getLong(1), rs.getString(2), rs.getString(3), json.readTree(rs.getString(4)), rs.getObject(5, OffsetDateTime.class).toInstant().toEpochMilli());
                    } catch (Exception e) {
                        throw new IllegalStateException(e);
                    }
                },
                me);
    }

    /** 收下禮物（只能收一次）。 */
    @Transactional
    public Gift claim(long me, long giftId) {
        Gift gift = inbox(me).stream().filter(g -> g.id() == giftId).findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "no_gift", "這份禮物已經收過了"));
        int n = db.update("update gift set claimed_at = ? where id = ? and to_id = ? and claimed_at is null", now(), giftId, me);
        if (n == 0) throw new ApiException(HttpStatus.NOT_FOUND, "no_gift", "這份禮物已經收過了");
        return gift;
    }

    private void befriend(long a, long b) {
        db.update("delete from friend_request where (from_id = ? and to_id = ?) or (from_id = ? and to_id = ?)", a, b, b, a);
        OffsetDateTime now = now();
        db.update("insert into friendship(owner_id, friend_id, created_at) values (?, ?, ?)", a, b, now);
        db.update("insert into friendship(owner_id, friend_id, created_at) values (?, ?, ?)", b, a, now);
    }

    /** 交情雙方一起加，每天有上限。 */
    private void addAffinity(long a, long b, int amount) {
        LocalDate day = today();
        Map<String, Object> row = db.queryForMap("select affinity_day, affinity_today from friendship where owner_id = ? and friend_id = ?", a, b);
        Object d = row.get("affinity_day");
        LocalDate rowDay = d instanceof Date sd ? sd.toLocalDate() : d instanceof LocalDate ld ? ld : null;
        int todayGain = day.equals(rowDay) ? ((Number) row.get("affinity_today")).intValue() : 0;
        int gain = Math.max(0, Math.min(amount, SocialRules.DAILY_AFFINITY - todayGain));
        String sql = "update friendship set affinity = affinity + ?, affinity_day = ?, affinity_today = ? where (owner_id = ? and friend_id = ?) or (owner_id = ? and friend_id = ?)";
        db.update(sql, gain, day, todayGain + gain, a, b, b, a);
    }

    private int sentPoints(long me, LocalDate day) {
        return db.queryForObject("select coalesce(sum(points), 0) from gift where from_id = ? and gift_day = ?", Integer.class, me, day);
    }

    private int receivedPoints(long me, LocalDate day) {
        return db.queryForObject("select coalesce(sum(points), 0) from gift where to_id = ? and gift_day = ?", Integer.class, me, day);
    }

    private boolean areFriends(long a, long b) {
        return exists("select count(*) from friendship where owner_id = ? and friend_id = ?", a, b);
    }

    private int countFriends(long me) {
        return db.queryForObject("select count(*) from friendship where owner_id = ?", Integer.class, me);
    }

    private boolean exists(String sql, Object... args) {
        Integer n = db.queryForObject(sql, Integer.class, args);
        return n != null && n > 0;
    }

    private long requireFriend(long me, String username) {
        long other = idOf(username);
        if (!areFriends(me, other)) throw new ApiException(HttpStatus.FORBIDDEN, "not_friend", "你們還不是好友");
        return other;
    }

    private long idOf(String username) {
        Long id = db.query("select id from account where lower(username) = lower(?)", rs -> rs.next() ? rs.getLong(1) : null, username);
        if (id == null) throw new ApiException(HttpStatus.NOT_FOUND, "no_user", "找不到這個玩家");
        return id;
    }

    private String username(long id) {
        return db.queryForObject("select username from account where id = ?", String.class, id);
    }
}
