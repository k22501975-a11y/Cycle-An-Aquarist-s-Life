package tw.cycle.server.config;

import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * 正式環境（CYCLE_PRODUCTION=true）缺少必要設定就不啟動（#79）：
 * 資料庫不能用預設密碼、一定要接模擬服務（L2 檢查）而且要有共用密碼、不能開儲值測試模式。
 * 沒設 FORWARD_HEADERS 只記警告：直接對外時本來就不用設，但放在反向代理後面時，所有玩家看起來都是代理的 IP，
 * 頻率限制（例如註冊每小時 5 次）會變成全站共用。
 */
@Component
public class ProductionGuard implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(ProductionGuard.class);
    private final CycleProperties props;
    private final String dbPassword;
    private final String forwardHeaders;

    public ProductionGuard(
            CycleProperties props,
            @Value("${spring.datasource.password:}") String dbPassword,
            @Value("${server.forward-headers-strategy:none}") String forwardHeaders) {
        this.props = props;
        this.dbPassword = dbPassword;
        this.forwardHeaders = forwardHeaders;
    }

    @Override
    public void run(ApplicationArguments args) {
        List<String> missing = problems();
        if (!missing.isEmpty()) throw new IllegalStateException("正式環境的設定不完整：" + String.join("；", missing));
        warnings().forEach(log::warn);
    }

    /** 不擋啟動、但要提醒的設定。 */
    public List<String> warnings() {
        List<String> out = new ArrayList<>();
        if (props.production() && "none".equalsIgnoreCase(forwardHeaders.trim()))
            out.add("FORWARD_HEADERS=none：如果伺服器放在反向代理（nginx、Caddy、Cloudflare）後面，所有玩家會被當成同一個 IP，"
                    + "註冊、登入的頻率限制會變成全站共用。放在代理後面請設 FORWARD_HEADERS=native");
        return out;
    }

    public List<String> problems() {
        List<String> out = new ArrayList<>();
        if (!props.production()) return out;
        if (dbPassword == null || dbPassword.isBlank() || dbPassword.equals("cycle")) out.add("DATABASE_PASSWORD 沒設定或是預設值");
        if (props.sim().url() == null || props.sim().url().isBlank()) out.add("SIM_SERVICE_URL 沒設定（不做 L2 檢查）");
        if (props.sim().token() == null || props.sim().token().isBlank()) out.add("SIM_TOKEN 沒設定");
        if (props.paymentsSandbox()) out.add("PAYMENTS_SANDBOX 要關掉");
        if (props.allowedOrigins().stream().anyMatch(o -> o.contains("localhost"))) out.add("ALLOWED_ORIGINS 還有 localhost");
        return out;
    }
}
