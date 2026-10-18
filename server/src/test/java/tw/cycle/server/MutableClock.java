package tw.cycle.server;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/** 測試用：可以快轉的時鐘（測每日額度跨日）。 */
public class MutableClock extends Clock {
    private Instant now = Instant.parse("2026-10-18T04:00:00Z");

    public void advance(Duration d) {
        now = now.plus(d);
    }

    @Override
    public ZoneId getZone() {
        return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        MutableClock self = this;
        return new Clock() {
            @Override
            public ZoneId getZone() {
                return zone;
            }

            @Override
            public Clock withZone(ZoneId z) {
                return self.withZone(z);
            }

            @Override
            public Instant instant() {
                return self.instant();
            }
        };
    }

    @Override
    public Instant instant() {
        return now;
    }
}
