package tw.cycle.server.push;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tw.cycle.server.config.ApiException;
import tw.cycle.server.config.CycleProperties;

/**
 * 推播通知（GAME_DESIGN 第 11 節）。兩種來源：
 * <ul>
 *   <li>forecast：遊戲關掉前預測接下來會發生的事（氨升高、加熱棒壞、生仔魚），排好時間交給伺服器送；</li>
 *   <li>event：伺服器上發生、遊戲沒開也要知道的事（有人買了你的魚、貨到了、朋友送禮）。</li>
 * </ul>
 * 每台裝置自己選要收哪些類別：危機預設開啟，繁殖、市場、好友可以各自開關。
 */
@Service
public class PushService {
    private static final Logger log = LoggerFactory.getLogger(PushService.class);
    public static final Set<String> CATEGORIES = Set.of("crisis", "breeding", "market", "friends");
    private static final Pattern DEVICE_ID = Pattern.compile("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");
    /** 只送給已知的推播服務，避免伺服器被拿來對任意網址發請求。 */
    private static final List<String> PUSH_HOSTS = List.of("fcm.googleapis.com", "push.services.mozilla.com", "notify.windows.com", "push.apple.com");
    /** 一台裝置最多排幾則預測。 */
    public static final int MAX_SCHEDULED = 20;
    /** 最多排到幾天後。 */
    public static final int MAX_DAYS_AHEAD = 7;

    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final Clock clock;
    private final PushTransport transport;
    private final CycleProperties props;
    private volatile ECPublicKey vapidPublic;
    private volatile ECPrivateKey vapidPrivate;

    public PushService(JdbcTemplate db, ObjectMapper json, Clock clock, PushTransport transport, CycleProperties props) {
        this.db = db;
        this.json = json;
        this.clock = clock;
        this.transport = transport;
        this.props = props;
    }

    public record Planned(long at, String category, String title, String body, String tag) {}

    private OffsetDateTime now() {
        return OffsetDateTime.now(clock);
    }

    // ---- VAPID 金鑰 ----

    /** 給瀏覽器訂閱用的公鑰（base64url）。 */
    public String publicKey() {
        loadKeys();
        return WebPushCrypto.b64(WebPushCrypto.rawPublic(vapidPublic));
    }

    private synchronized void loadKeys() {
        if (vapidPublic != null) return;
        try {
            CycleProperties.Push cfg = props.push();
            String pub = cfg.publicKey();
            String priv = cfg.privateKey();
            if (pub == null || pub.isBlank() || priv == null || priv.isBlank()) {
                List<Map<String, Object>> rows = db.queryForList("select public_key, private_key from push_key where id = 1");
                if (rows.isEmpty()) {
                    var pair = WebPushCrypto.generateKeyPair();
                    pub = WebPushCrypto.b64(WebPushCrypto.rawPublic((ECPublicKey) pair.getPublic()));
                    priv = WebPushCrypto.b64(WebPushCrypto.rawPrivate((ECPrivateKey) pair.getPrivate()));
                    db.update("insert into push_key(id, public_key, private_key, created_at) values (1, ?, ?, ?)", pub, priv, now());
                    log.info("產生了新的 VAPID 金鑰");
                } else {
                    pub = (String) rows.get(0).get("public_key");
                    priv = (String) rows.get(0).get("private_key");
                }
            }
            vapidPublic = WebPushCrypto.publicKey(WebPushCrypto.unb64(pub));
            vapidPrivate = WebPushCrypto.privateKey(WebPushCrypto.unb64(priv));
        } catch (Exception e) {
            throw new IllegalStateException("VAPID 金鑰有問題", e);
        }
    }

    // ---- 裝置 ----

    /** 登記或更新一台裝置的訂閱；accountId 是目前登入的帳號（沒登入是 null）。 */
    @Transactional
    public void register(String id, String secret, String endpoint, String p256dh, String auth, List<String> categories, Long accountId) {
        if (id == null || !DEVICE_ID.matcher(id).matches()) throw bad("bad_device", "裝置代號格式不對");
        if (secret == null || secret.length() < 16 || secret.length() > 100) throw bad("bad_secret", "裝置密碼格式不對");
        checkEndpoint(endpoint);
        try {
            if (WebPushCrypto.unb64(p256dh).length != 65 || WebPushCrypto.unb64(auth).length != 16) throw bad("bad_keys", "訂閱金鑰格式不對");
        } catch (IllegalArgumentException e) {
            throw bad("bad_keys", "訂閱金鑰格式不對");
        }
        String cats = String.join(",", categories.stream().filter(CATEGORIES::contains).distinct().sorted().toList());
        List<String> existing = db.queryForList("select secret_hash from push_device where id = ?", String.class, id);
        if (existing.isEmpty()) {
            db.update("insert into push_device(id, secret_hash, account_id, endpoint, p256dh, auth, categories, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    id, hash(secret), accountId, endpoint, p256dh, auth, cats, now(), now());
        } else {
            if (!MessageDigest.isEqual(existing.get(0).getBytes(StandardCharsets.US_ASCII), hash(secret).getBytes(StandardCharsets.US_ASCII)))
                throw new ApiException(HttpStatus.FORBIDDEN, "bad_secret", "裝置密碼不對");
            db.update("update push_device set account_id = ?, endpoint = ?, p256dh = ?, auth = ?, categories = ?, updated_at = ? where id = ?",
                    accountId, endpoint, p256dh, auth, cats, now(), id);
            // 關掉的類別，已經排好的預測也一起取消
            for (String c : CATEGORIES)
                if (!Arrays.asList(cats.split(",")).contains(c)) db.update("delete from push_message where device_id = ? and sent_at is null and category = ?", id, c);
        }
    }

    @Transactional
    public void unregister(String id, String secret) {
        verify(id, secret);
        db.update("delete from push_device where id = ?", id);
    }

    /** 換掉這台裝置排好的預測（打開遊戲時傳空的就是全部取消）。 */
    @Transactional
    public int schedule(String id, String secret, List<Planned> items) {
        String cats = verify(id, secret);
        db.update("delete from push_message where device_id = ? and source = 'forecast' and sent_at is null", id);
        if (items == null) return 0;
        OffsetDateTime limit = now().plusDays(MAX_DAYS_AHEAD);
        int n = 0;
        for (Planned s : items) {
            if (n >= MAX_SCHEDULED) break;
            if (s == null || s.category() == null || !CATEGORIES.contains(s.category()) || !Arrays.asList(cats.split(",")).contains(s.category())) continue;
            OffsetDateTime at = OffsetDateTime.ofInstant(Instant.ofEpochMilli(s.at()), ZoneOffset.UTC);
            if (at.isAfter(limit)) continue;
            if (at.isBefore(now())) at = now();
            db.update("insert into push_message(device_id, source, category, title, body, tag, send_at) values (?, 'forecast', ?, ?, ?, ?, ?)",
                    id, s.category(), cut(s.title(), 60, "Aquarist's Life"), cut(s.body(), 300, ""), cut(s.tag(), 60, s.category()), at);
            n++;
        }
        return n;
    }

    /** 伺服器上發生的事：送給這個帳號登入中、有開這個類別的每台裝置。 */
    public void notifyAccount(long accountId, String category, String body, String tag, OffsetDateTime at) {
        List<Map<String, Object>> devices = db.queryForList("select id, categories from push_device where account_id = ?", accountId);
        for (Map<String, Object> d : devices) {
            if (!Arrays.asList(((String) d.get("categories")).split(",")).contains(category)) continue;
            db.update("insert into push_message(device_id, source, category, title, body, tag, send_at) values (?, 'event', ?, 'Aquarist''s Life', ?, ?, ?)",
                    d.get("id"), category, cut(body, 300, ""), cut(tag, 60, category), at == null ? now() : at);
        }
    }

    // ---- 送出 ----

    /** 每 15 秒把到時間的通知送出去。 */
    @Scheduled(fixedDelay = 15_000, initialDelay = 15_000)
    public void sendDue() {
        List<Map<String, Object>> due = db.queryForList(
                "select m.id, m.category, m.title, m.body, m.tag, d.id as device_id, d.endpoint, d.p256dh, d.auth from push_message m join push_device d on d.id = m.device_id "
                        + "where m.sent_at is null and m.send_at <= ? order by m.send_at limit 200",
                now());
        if (due.isEmpty()) return;
        loadKeys();
        for (Map<String, Object> m : due) {
            long id = ((Number) m.get("id")).longValue();
            db.update("update push_message set sent_at = ? where id = ?", now(), id);
            try {
                int status = send(m);
                if (status == 404 || status == 410) {
                    // 訂閱失效（解除安裝、清掉資料）：裝置一起刪
                    db.update("delete from push_device where id = ?", m.get("device_id"));
                } else if (status >= 400) log.warn("推播失敗 {} {}", status, URI.create((String) m.get("endpoint")).getHost());
            } catch (Exception e) {
                log.warn("推播失敗：{}", e.toString());
            }
        }
    }

    private int send(Map<String, Object> m) throws Exception {
        Map<String, String> payload = new LinkedHashMap<>();
        payload.put("title", (String) m.get("title"));
        payload.put("body", (String) m.get("body"));
        payload.put("tag", (String) m.get("tag"));
        payload.put("category", (String) m.get("category"));
        byte[] body = WebPushCrypto.encrypt(json.writeValueAsBytes(payload), WebPushCrypto.unb64((String) m.get("p256dh")), WebPushCrypto.unb64((String) m.get("auth")));
        URI endpoint = URI.create((String) m.get("endpoint"));
        String audience = endpoint.getScheme() + "://" + endpoint.getHost();
        String jwt = WebPushCrypto.vapidJwt(audience, subject(), clock.instant().getEpochSecond() + 12 * 3600, vapidPrivate);
        Map<String, String> headers = new LinkedHashMap<>();
        headers.put("TTL", "86400");
        headers.put("Content-Encoding", "aes128gcm");
        headers.put("Content-Type", "application/octet-stream");
        headers.put("Urgency", "crisis".equals(m.get("category")) ? "high" : "normal");
        headers.put("Authorization", "vapid t=" + jwt + ", k=" + WebPushCrypto.b64(WebPushCrypto.rawPublic(vapidPublic)));
        return transport.post(endpoint, headers, body);
    }

    /** 每天清掉三天前送出的通知。 */
    @Scheduled(cron = "0 40 4 * * *", zone = "Asia/Taipei")
    public void purge() {
        db.update("delete from push_message where sent_at is not null and sent_at < ?", now().minusDays(3));
    }

    // ---- 內部 ----

    private String subject() {
        String s = props.push().subject();
        return s == null || s.isBlank() ? "mailto:admin@localhost" : s;
    }

    private String verify(String id, String secret) {
        List<Map<String, Object>> rows = db.queryForList("select secret_hash, categories from push_device where id = ?", id);
        if (rows.isEmpty()) throw new ApiException(HttpStatus.NOT_FOUND, "no_device", "這台裝置還沒開啟通知");
        String expected = (String) rows.get(0).get("secret_hash");
        if (secret == null || !MessageDigest.isEqual(expected.getBytes(StandardCharsets.US_ASCII), hash(secret).getBytes(StandardCharsets.US_ASCII)))
            throw new ApiException(HttpStatus.FORBIDDEN, "bad_secret", "裝置密碼不對");
        return (String) rows.get(0).get("categories");
    }

    static void checkEndpoint(String endpoint) {
        URI uri;
        try {
            uri = URI.create(endpoint == null ? "" : endpoint);
        } catch (IllegalArgumentException e) {
            throw bad("bad_endpoint", "推播網址格式不對");
        }
        String host = uri.getHost();
        if (!"https".equals(uri.getScheme()) || host == null || uri.getPort() != -1 || endpoint.length() > 1000
                || PUSH_HOSTS.stream().noneMatch(h -> host.equals(h) || host.endsWith("." + h)))
            throw bad("bad_endpoint", "不支援這個推播服務");
    }

    private static String hash(String secret) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static String cut(String s, int max, String fallback) {
        if (s == null || s.isBlank()) return fallback;
        String t = s.strip();
        return t.length() > max ? t.substring(0, max) : t;
    }

    private static ApiException bad(String code, String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, code, message);
    }
}
