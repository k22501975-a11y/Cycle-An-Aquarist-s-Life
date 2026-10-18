package tw.cycle.server.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** application.yml 裡 cycle.* 的設定。 */
@ConfigurationProperties(prefix = "cycle")
public record CycleProperties(List<String> allowedOrigins, int sessionDays, int maxSaveBytes) {}
