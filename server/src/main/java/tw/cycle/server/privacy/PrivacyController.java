package tw.cycle.server.privacy;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tw.cycle.server.auth.AuthInterceptor;

@RestController
@RequestMapping("/api")
public class PrivacyController {
    private final PrivacyService privacy;
    private final AnalyticsService analytics;

    public PrivacyController(PrivacyService privacy, AnalyticsService analytics) {
        this.privacy = privacy;
        this.analytics = analytics;
    }

    public record Confirm(String password) {}

    @GetMapping("/me/export")
    public Map<String, Object> export(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long id) {
        return privacy.export(id);
    }

    @DeleteMapping("/account")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@RequestAttribute(AuthInterceptor.ACCOUNT_ID) Long id, @RequestBody Confirm body) {
        privacy.delete(id, body.password());
    }

    /** 不用登入：數據分析跟帳號分開。 */
    @PostMapping("/events")
    public Map<String, Integer> events(@RequestBody AnalyticsService.Batch batch) {
        return Map.of("accepted", analytics.record(batch));
    }
}
