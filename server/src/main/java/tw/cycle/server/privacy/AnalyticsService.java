package tw.cycle.server.privacy;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Date;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tw.cycle.server.config.ApiException;

/**
 * 匿名數據分析：只記「發生了什麼」（例如魚死於氨中毒、完成教學第 3 步），不記帳號、不記 IP。
 * 用來找出新手卡在哪、哪裡太難（commercial-gap L8）。
 */
@Service
public class AnalyticsService {
    static final int MAX_BATCH = 50;
    static final int MAX_PER_DAY = 500;
    static final int KEEP_DAYS = 180;
    private static final Pattern CLIENT = Pattern.compile("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");
    private static final Pattern NAME = Pattern.compile("^[a-z][a-z0-9_]{1,39}$");
    private static final ZoneId TAIPEI = ZoneId.of("Asia/Taipei");

    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final Clock clock;

    public AnalyticsService(JdbcTemplate db, ObjectMapper json, Clock clock) {
        this.db = db;
        this.json = json;
        this.clock = clock;
    }

    public record Event(String name, Map<String, Object> props) {}

    public record Batch(String clientId, List<Event> events) {}

    /** 收下一批事件，回傳收了幾筆；格式不對的事件直接略過，超過每日上限的也略過。 */
    @Transactional
    public int record(Batch batch) {
        if (batch == null || batch.clientId() == null || !CLIENT.matcher(batch.clientId()).matches())
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid", "格式不對");
        List<Event> events = batch.events() == null ? List.of() : batch.events();
        if (events.size() > MAX_BATCH) throw new ApiException(HttpStatus.BAD_REQUEST, "too_many", "一次最多 " + MAX_BATCH + " 筆");
        LocalDate today = LocalDate.now(clock.withZone(TAIPEI));
        Integer used = db.queryForObject(
                "SELECT COUNT(*) FROM analytics_event WHERE client_id = ? AND event_day = ?", Integer.class, batch.clientId(), Date.valueOf(today));
        int room = MAX_PER_DAY - (used == null ? 0 : used);
        int accepted = 0;
        for (Event e : events) {
            if (accepted >= room) break;
            if (e == null || e.name() == null || !NAME.matcher(e.name()).matches()) continue;
            String props = props(e.props());
            if (props != null && props.length() > 500) continue;
            db.update("INSERT INTO analytics_event (client_id, name, props, event_day, created_at) VALUES (?, ?, ?, ?, ?)",
                    batch.clientId(), e.name(), props, Date.valueOf(today), OffsetDateTime.now(clock));
            accepted++;
        }
        return accepted;
    }

    /** 每天清掉 180 天前的事件。 */
    @Scheduled(cron = "0 30 4 * * *", zone = "Asia/Taipei")
    @Transactional
    public int purge() {
        LocalDate cutoff = LocalDate.now(clock.withZone(TAIPEI)).minusDays(KEEP_DAYS);
        return db.update("DELETE FROM analytics_event WHERE event_day < ?", Date.valueOf(cutoff));
    }

    private String props(Map<String, Object> props) {
        if (props == null || props.isEmpty()) return null;
        try {
            return json.writeValueAsString(props);
        } catch (JsonProcessingException e) {
            return null;
        }
    }
}
