package tw.cycle.server.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** application.yml 裡 cycle.* 的設定。 */
@ConfigurationProperties(prefix = "cycle")
public record CycleProperties(List<String> allowedOrigins, int sessionDays, int maxSaveBytes, int marketMinAccountDays, boolean paymentsSandbox, Push push) {
    /** 推播：VAPID 金鑰（沒設定就自動產生並存在資料庫）和聯絡方式（推播服務出問題時找得到人）。 */
    public record Push(String subject, String publicKey, String privateKey) {}

    public Push push() {
        return push != null ? push : new Push(null, null, null);
    }
}
