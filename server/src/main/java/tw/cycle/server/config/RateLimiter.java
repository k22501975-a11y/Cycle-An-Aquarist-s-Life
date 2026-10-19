package tw.cycle.server.config;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * 記憶體裡的固定時間窗計數（#79）：同一個來源在一段時間內最多幾次。
 * 只有一台伺服器時夠用；之後要多台再換成共用的（例如 Redis）。
 */
@Component
public class RateLimiter {
    /** 計數超過這麼多筆就清掉過期的，不讓記憶體一直長。 */
    private static final int PURGE_AT = 10_000;

    private final Clock clock;
    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    private record Window(Instant start, Duration length, int count) {}

    public RateLimiter(Clock clock) {
        this.clock = clock;
    }

    /** 記一次；這段時間內已經滿 limit 次就回傳 false（不記）。 */
    public boolean tryAcquire(String key, int limit, Duration window) {
        Instant now = clock.instant();
        if (windows.size() > PURGE_AT) windows.values().removeIf(w -> !now.isBefore(w.start().plus(w.length())));
        boolean[] ok = {true};
        windows.compute(key, (k, w) -> {
            if (w == null || !now.isBefore(w.start().plus(w.length()))) return new Window(now, window, 1);
            if (w.count() >= limit) {
                ok[0] = false;
                return w;
            }
            return new Window(w.start(), w.length(), w.count() + 1);
        });
        return ok[0];
    }
}
