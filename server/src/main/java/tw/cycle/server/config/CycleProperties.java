package tw.cycle.server.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** application.yml 裡 cycle.* 的設定。 */
@ConfigurationProperties(prefix = "cycle")
public record CycleProperties(
        List<String> allowedOrigins,
        int sessionDays,
        int maxSaveBytes,
        int marketMinAccountDays,
        boolean paymentsSandbox,
        Push push,
        Sim sim,
        boolean production,
        RateLimit rateLimit) {
    /** 推播：VAPID 金鑰（沒設定就自動產生並存在資料庫）和聯絡方式（推播服務出問題時找得到人）。 */
    public record Push(String subject, String publicKey, String privateKey) {}

    public Push push() {
        return push != null ? push : new Push(null, null, null);
    }

    /** 伺服器權威模擬（L2）：Node 模擬小服務的網址（留空代表不用）、共用密碼、逾時秒數。 */
    public record Sim(String url, String token, int timeoutSeconds) {
        public Sim {
            if (timeoutSeconds <= 0) timeoutSeconds = 20;
        }
    }

    public Sim sim() {
        return sim != null ? sim : new Sim(null, null, 20);
    }

    /** 不用登入的 API 每個 IP 的次數上限（#79）。 */
    public record RateLimit(int registerPerHour, int loginPerTenMinutes, int eventsPerMinute, int pushPerMinute) {}

    public RateLimit rateLimit() {
        return rateLimit != null ? rateLimit : new RateLimit(5, 30, 120, 20);
    }
}
