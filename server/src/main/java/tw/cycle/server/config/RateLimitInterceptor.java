package tw.cycle.server.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 不用登入的 API 依來源 IP 限制次數（#79）：註冊（擋開小號）、登入（擋密碼噴灑）、
 * 匿名數據分析和推播裝置（擋灌爆資料庫）。次數在 application.yml 的 cycle.rate-limit。
 */
@Component
public class RateLimitInterceptor implements HandlerInterceptor {
    private final RateLimiter limiter;
    private final CycleProperties.RateLimit limits;

    public RateLimitInterceptor(RateLimiter limiter, CycleProperties props) {
        this.limiter = limiter;
        this.limits = props.rateLimit();
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if ("OPTIONS".equals(request.getMethod())) return true;
        String path = request.getRequestURI();
        String ip = request.getRemoteAddr();
        if (path.equals("/api/auth/register")) check("register", ip, limits.registerPerHour(), Duration.ofHours(1));
        else if (path.equals("/api/auth/login")) check("login", ip, limits.loginPerTenMinutes(), Duration.ofMinutes(10));
        else if (path.equals("/api/events")) check("events", ip, limits.eventsPerMinute(), Duration.ofMinutes(1));
        else if (path.startsWith("/api/push/")) check("push", ip, limits.pushPerMinute(), Duration.ofMinutes(1));
        return true;
    }

    private void check(String what, String ip, int limit, Duration window) {
        if (!limiter.tryAcquire(what + "|" + ip, limit, window))
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "too_many", "太頻繁了，請稍後再試");
    }
}
